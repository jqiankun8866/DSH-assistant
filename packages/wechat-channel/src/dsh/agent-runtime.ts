import { finalReply, sentMeme } from './final-reply.mjs'
import { ensureNativeCapabilities } from './native-capabilities.mjs'
import { assertTurnSucceeded } from './turn-failure.mjs'
/**
 * DSH agent 驱动层：把「一条微信文本」映射成「一个 DSH agent 的一轮对话」，
 * 并把该轮产生的 assistant 文本收集回来。
 *
 * 只依赖 DSH 的公共接口（`ctx.agents` / `Agent` / session 日志），不依赖任何
 * 微信协议细节；微信收发由 bridge 层负责。
 *
 * @module dsh-plugin-wechat/dsh/agent-runtime
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentOptions } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
// 仅加载声明合并，让 `ctx.get('sessionPersistence')` 有类型（服务可选）。
import type {} from '@deepseek-ai/dsh-session-persistence'
import { rename } from 'node:fs/promises'
import { logger } from '../wechat/util/logger.js'
import type { UserContent } from '../bridge/attachment-content.js'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import { installAssistantTools } from '../assistant/service.mjs'
import { channelFormatting } from '../assistant/conversation-policy.mjs'
import { conversationStyle } from '../assistant/conversation-style.mjs'
import { reactToThanks } from '../assistant/meme-reaction.mjs'
import { join } from 'node:path'
import { registerPersonalPrompt } from '../assistant/personal-prompt.mjs'
import { publishWechatSession } from './desktop-entry.mjs'

/** 会话隔离维度：多账户时按「账户 + 好友」隔离，单账户可退化为按「好友」。 */
export type DmScope = 'per-peer' | 'per-account-channel-peer'

/** 把「微信账号 + 好友」稳定映射成一个 DSH sessionId（多轮连续的关键）。 */
export function weixinSessionId(accountId: string, peerId: string, scope: DmScope): SessionId {
  const key = scope === 'per-account-channel-peer' ? `${accountId}:${peerId}` : peerId
  return SessionId(`weixin:${key}`)
}

/** 从会话日志里收集 `afterSeq` 之后产生的 assistant 纯文本。 */
function sessionEventsOf(session: unknown): readonly SessionEvent[] {
  const candidate = session as { snapshotEvents?: () => readonly SessionEvent[]; events?: readonly SessionEvent[] }
  if (typeof candidate.snapshotEvents === 'function') return candidate.snapshotEvents.call(session)
  return Array.isArray(candidate.events) ? candidate.events : []
}


/**
 * 管理「sessionId → AgentHandle」的存活映射，并驱动单轮对话。
 *
 * 同一 sessionId 的请求由调用方串行化（见 bridge 层的 per-session 队列）；
 * 这里只保证：复用已有 agent、空闲时取回本轮回复、dispose 时统一回收。
 */
export class AgentRuntime {
  private readonly handles = new Map<string, AgentHandle>()
  /** 每个 session 的串行队列尾：同一 session 的消息严格按序执行，避免交错。 */
  private readonly queues = new Map<string, Promise<unknown>>()
  /** 本运行时注入的微信消息 id（source 为 user，但来自微信 App，页面转发时需排除）。 */
  private readonly wechatMessageIds = new Set<string>()

  constructor(
    private readonly ctx: Context,
    private readonly agentOptions: AgentOptions,
    private readonly cwd: string,
    private readonly title: string,
    private readonly sendFile?: (sessionId: string, path: string) => Promise<string>,
    readonly assistant?: any,
  ) {}

  /**
   * 取（或首次创建/恢复）一个 sessionId 对应的 live agent。
   *
   * 稳定 sessionId + 持久化后端并存时，跨进程重启会撞到磁盘上已存在的同 id
   * 日志（`create` 是「新建」语义）。这里遵循 DSH 的 restore-or-create 模式：
   * 有持久化时先 `resume` 加载历史，resume 对「该 id 无 artifact」会失败，此时
   * 仅明确缺失时才回退 `create`；其余失败保留原始错误，不覆盖历史。
   */
  async agentFor(sessionId: SessionId): Promise<Agent> {
    const key = String(sessionId)
    const pending = this.acquiring.get(key)
    if (pending) return pending
    const next = this.resolveAgent(sessionId).finally(() => this.acquiring.delete(key))
    this.acquiring.set(key, next)
    return next
  }

  private readonly acquiring = new Map<string, Promise<Agent>>()
  modelSelection(): {provider?:string,model?:string} { return {provider:this.agentOptions.provider,model:this.agentOptions.model} }

  private async resolveAgent(sessionId: SessionId): Promise<Agent> {
    const key = String(sessionId)
    const held = this.handles.get(key)
    if (held) return held.agent
    const live = this.ctx.agents.get(sessionId)
    if (live) { await this.prepareAgent(live); return live }

    // agent scope 内注册：persona 等只对微信 agent 生效，不影响同进程的 Web agent。
    const setup = async (agentCtx: Context, agent: Agent): Promise<void> => {
      await ensureNativeCapabilities(agentCtx, agent, {unpublished:true})
      this.installAgentScope(agentCtx, key)
    }

    // Resolve persistence through the agent factory: it can see a backend that
    // is not visible from this plugin's scoped context. Only missing sessions
    // justify create; never mask ownership, setup or storage failures.
    try {
      const handle = await this.ctx.agents.resume({
        resumeSessionId: sessionId,
        agentOptions: this.agentOptions,
        setup,
      })
      this.handles.set(key, handle)
      await publishWechatSession(this.ctx, handle.agent, this.cwd)
      return handle.agent
    } catch (error) {
      const missing = error instanceof Error && error.name === 'SessionPersistenceNotFoundError'
      const noBackend = error instanceof Error && error.message.startsWith('cannot resume: session persistence is not configured')
      if (!missing && !noBackend) throw error
    }

    const handle = await this.ctx.agents.create({
      sessionId,
      agentOptions: this.agentOptions,
      meta: { cwd: this.cwd },
      setup,
    })
    this.handles.set(key, handle)
    this.ensureTitle(handle.agent)
    await publishWechatSession(this.ctx, handle.agent, this.cwd)
    return handle.agent
  }

  /** 在微信 agent 的 scope 内注册「纯文本回复」的 persona section（微信 App 不渲染 Markdown）。 */
  private readonly preferenceScopes = new Map<string, any>()
  private readonly preferenceSections = new Map<string, () => void>()

  private readonly installedScopes = new WeakSet<object>()
  async prepareAgent(agent: Agent): Promise<void> {
    await ensureNativeCapabilities(agent.ctx, agent)
    this.installAgentScope(agent.ctx, String(agent.id))
  }
  prepareLive(sessionId: SessionId): void {
    const live = this.ctx.agents.get(sessionId)
    if (live) this.installAgentScope(live.ctx, String(sessionId))
  }

  private installAgentScope(agentCtx: Context, key: string): void {
    if (this.installedScopes.has(agentCtx)) return
    // Do not mark a partially prepared scope as installed; retry when ready.
    const systemPrompt = agentCtx.get('systemPrompt') as any
    if (!systemPrompt) throw new Error('微信助理模型提示服务尚未就绪，未发送本轮请求')
    this.installedScopes.add(agentCtx)
    if (this.assistant) installAssistantTools(agentCtx, this.assistant, defineTool)
    const tools = agentCtx.get('tools')
    if (tools && this.sendFile) tools.register(defineTool({
      name: 'wechat_send_file',
      description: 'Send an existing file in this WeChat workspace back to the current user as an actual WeChat attachment. Use for requested documents, images, videos and other deliverables; do not merely print a local path. Never send credentials or unrelated private files.',
      parameters: { path: { type: 'string', required: true, description: 'Existing file path within the WeChat workspace.' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { messageId: { type: 'string', required: true } } },
        render: (_args, result) => [{ type: 'text', text: `微信文件已发送，消息 ID：${result.messageId}` }],
      },
      execute: async (args, execution) => {
        if (!execution.agent || !this.owns(execution.agent.id)) throw new Error('需要当前微信会话')
        execution.signal.throwIfAborted()
        this.assistant?.memeSemantics?.guardFile(args.path)
        return { messageId: await this.sendFile!(String(execution.agent.id), args.path) }
      },
    }))
    this.preferenceScopes.set(key, systemPrompt)
    if (this.assistant) this.preferenceSections.set(key, registerPersonalPrompt(systemPrompt, this.assistant, key))
    else systemPrompt.section({ name: 'im-weixin:conversation-style', order: 10250, text: conversationStyle })
    systemPrompt.section({
      name: 'im-weixin:plain-text',
      order: 50,
      text: channelFormatting,
    })
  }

  /** 新建会话时写入标题（通过 sessionTitle.rename，在同一进程内，无并发写风险）。 */
  private ensureTitle(agent: Agent): void {
    const sessionTitle = this.ctx.get('sessionTitle') as
      | { rename(session: unknown, title: string): unknown }
      | undefined
    if (sessionTitle === undefined) return
    try {
      sessionTitle.rename(agent.session, this.title)
    } catch (error) {
      // 标题失败不阻断对话。
      logger.warn(`weixin: failed to set session title for ${String(agent.id)}: ${String(error)}`)
    }
  }

  /**
   * 判断一个 sessionId 是否属于微信通道（answerer / 工具反馈 / 转发的归属过滤）。
   * 合并进程（web + wechat 同进程）时不能只看 live agent（Web agent 也 live），
   * 用稳定的 `weixin:` 前缀区分。
   */
  owns(sessionId: SessionId): boolean {
    const id = String(sessionId)
    return id.startsWith('weixin:') || this.handles.has(id)
  }

  /** 该消息 id 是否由本运行时从微信 App 注入（页面转发时需排除）。 */
  isWechatMessage(messageId: string): boolean {
    return this.wechatMessageIds.has(messageId)
  }

  /**
   * 把一条文本送入 agent 作为一轮 follow-up，等待其空闲后收集本轮 assistant 文本。
   * 同一 session 的调用按到达顺序串行执行（DSH 无 per-prompt 结果/取消语义）。
   * 返回空串表示这一轮没有产生可见文本（例如被拒绝/中止）。
   */
  run(agent: Agent, text: string | UserContent): Promise<string> {
    const key = String(agent.id)
    const prev = this.queues.get(key) ?? Promise.resolve()
    const next = prev.then(() => this.runOnce(agent, text))
    // 吞掉前序错误，保证队列不断链；调用方拿到的 `next` 仍携带本轮的失败。
    this.queues.set(key, next.catch(() => {}))
    return next
  }

  private readonly scheduled = new Set<string>()
  isScheduled(sessionId: string): boolean { return this.scheduled.has(sessionId) }
  runScheduled(agent: Agent, text: string, expires: number): Promise<string> {
    const key = String(agent.id)
    const prev = this.queues.get(key) ?? Promise.resolve()
    const next = prev.then(async () => {
      if (Date.now() >= expires) throw new Error('晨报已过期')
      this.scheduled.add(key)
      const afterSeq = agent.session.seq
      try {
        const reply = await this.runOnce(agent, text)
        const searched = sessionEventsOf(agent.session).some(e => e.seq > afterSeq && e.type === 'tool/call' && /search|browse|fetch|web/i.test(e.data.name))
        if (!searched) throw new Error('晨报未执行联网查询，不发送')
        return reply
      } finally { this.scheduled.delete(key) }
    })
    this.queues.set(key, next.catch(() => {}))
    return next
  }

  private readonly pendingReactions = new Map<string, () => Promise<void>>()
  async afterReply(sessionId: string): Promise<void> {
    const send = this.pendingReactions.get(sessionId)
    this.pendingReactions.delete(sessionId)
    if (send) await send()
  }

  private async runOnce(agent: Agent, text: string | UserContent): Promise<string> {
    const key = String(agent.id)
    const afterSeq = agent.session.seq
    // source 用 { kind: 'user' }：让 Web 页面把微信消息渲染成普通用户气泡（plugin source 会被前端当 context）。
    const message = createUserMessage({
      content: typeof text === 'string' ? [{ type: 'text', text }] : text,
      source: { kind: 'user' },
    })
    this.wechatMessageIds.add(String(message.id))
    agent.followup(message)
    await agent.whenIdle()
    assertTurnSucceeded(sessionEventsOf(agent.session), afterSeq)
    let reply = finalReply(sessionEventsOf(agent.session), afterSeq, text)
    let completion:any
    if(this.assistant?.memeCompletion && this.sendFile){
      try { completion=await this.assistant.memeCompletion.ensure({peer:key,seq:afterSeq,input:text,reply,events:sessionEventsOf(agent.session)}) }
      catch(error) { completion={sent:false,status:'error'};logger.warn(`weixin: meme completion error: ${String(error)}`) }
      logger.info(`weixin: meme completion ${completion.status}${completion.id?' id='+completion.id:''}`)
      if(completion.sent&&completion.stickerOnly)reply=''
    }
    if (this.assistant?.engine && this.sendFile && !completion?.sent) this.pendingReactions.set(key, async () => {
      try {
        const reaction = await reactToThanks({ db: this.assistant.engine.db,
          root: this.assistant.memeRoot ?? join(this.cwd, 'memes', 'dafeiyu-001'), peer: String(agent.id), input: text,
          reply, events: sessionEventsOf(agent.session), afterSeq, send: this.sendFile,
          semanticSelection: true, candidates: [] })
        logger.info(`weixin: meme reaction ${reaction.status}${reaction.source ? ` source=${reaction.source} candidates=${reaction.candidateCount}` : ''}`)
      } catch (error) { logger.warn(`weixin: meme reaction failed: ${String(error)}`) }
    })
    if (!reply && !completion?.sent && !sentMeme(sessionEventsOf(agent.session), afterSeq)) {
      // 诊断：打出这一轮的事件（含 turn/end 结束原因），定位「没跑/路由失败/回复为空」。
      const detail = sessionEventsOf(agent.session)
        .filter((event) => event.seq > afterSeq)
        .map((event) => {
          if (event.type === 'turn/end') {
            const reason = event.data.reason
            return reason.kind === 'error'
              ? `turn/end(error:${JSON.stringify(reason.error)})`
              : `turn/end(${reason.kind})`
          }
          return event.type
        })
      logger.warn(`weixin: no assistant text after seq ${afterSeq}; events=[${detail.join(', ')}]`)
    }
    return reply
  }

  /** 释放所有由本运行时持有的 agent（进程卸载时调用）。 */
  async dispose(): Promise<void> {
    const pending = [...this.handles.values()].map((handle) => handle.dispose())
    this.handles.clear()
    for (const dispose of this.preferenceSections.values()) dispose()
    this.preferenceSections.clear()
    this.preferenceScopes.clear()
    await Promise.all(pending)
  }
}


