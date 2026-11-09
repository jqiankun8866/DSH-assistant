import { finalReply, sentMeme } from './final-reply.mjs';
import { ensureNativeCapabilities } from './native-capabilities.mjs';
import { assertTurnSucceeded } from './turn-failure.mjs';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { rename } from 'node:fs/promises';
import { logger } from '../wechat/util/logger.js';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { installAssistantTools } from '../assistant/service.mjs';
import { channelFormatting } from '../assistant/conversation-policy.mjs';
import { conversationStyle } from '../assistant/conversation-style.mjs';
import { reactToThanks } from '../assistant/meme-reaction.mjs';
import { join } from 'node:path';
import { registerPersonalPrompt } from '../assistant/personal-prompt.mjs';
import { publishWechatSession } from './desktop-entry.mjs';
export function weixinSessionId(accountId, peerId, scope) {
    const key = scope === 'per-account-channel-peer' ? `${accountId}:${peerId}` : peerId;
    return SessionId(`weixin:${key}`);
}
function sessionEventsOf(session) {
    const candidate = session;
    if (typeof candidate.snapshotEvents === 'function') return candidate.snapshotEvents.call(session);
    return Array.isArray(candidate.events) ? candidate.events : [];
}
export class AgentRuntime {
    ctx;
    agentOptions;
    cwd;
    title;
    sendFile;
    assistant;
    handles = new Map();
    queues = new Map();
    wechatMessageIds = new Set();
    constructor(ctx, agentOptions, cwd, title, sendFile, assistant){
        this.ctx = ctx;
        this.agentOptions = agentOptions;
        this.cwd = cwd;
        this.title = title;
        this.sendFile = sendFile;
        this.assistant = assistant;
    }
    async agentFor(sessionId) {
        const key = String(sessionId);
        const pending = this.acquiring.get(key);
        if (pending) return pending;
        const next = this.resolveAgent(sessionId).finally(()=>this.acquiring.delete(key));
        this.acquiring.set(key, next);
        return next;
    }
    acquiring = new Map();
    modelSelection() {
        return {
            provider: this.agentOptions.provider,
            model: this.agentOptions.model
        };
    }
    async resolveAgent(sessionId) {
        const key = String(sessionId);
        const held = this.handles.get(key);
        if (held) return held.agent;
        const live = this.ctx.agents.get(sessionId);
        if (live) {
            await this.prepareAgent(live);
            return live;
        }
        const setup = async (agentCtx, agent)=>{
            await ensureNativeCapabilities(agentCtx, agent, {
                unpublished: true
            });
            this.installAgentScope(agentCtx, key);
        };
        try {
            const handle = await this.ctx.agents.resume({
                resumeSessionId: sessionId,
                agentOptions: this.agentOptions,
                setup
            });
            this.handles.set(key, handle);
            await publishWechatSession(this.ctx, handle.agent, this.cwd);
            return handle.agent;
        } catch (error) {
            const missing = error instanceof Error && error.name === 'SessionPersistenceNotFoundError';
            const noBackend = error instanceof Error && error.message.startsWith('cannot resume: session persistence is not configured');
            if (!missing && !noBackend) throw error;
        }
        const handle = await this.ctx.agents.create({
            sessionId,
            agentOptions: this.agentOptions,
            meta: {
                cwd: this.cwd
            },
            setup
        });
        this.handles.set(key, handle);
        this.ensureTitle(handle.agent);
        await publishWechatSession(this.ctx, handle.agent, this.cwd);
        return handle.agent;
    }
    preferenceScopes = new Map();
    preferenceSections = new Map();
    installedScopes = new WeakSet();
    async prepareAgent(agent) {
        await ensureNativeCapabilities(agent.ctx, agent);
        this.installAgentScope(agent.ctx, String(agent.id));
    }
    prepareLive(sessionId) {
        const live = this.ctx.agents.get(sessionId);
        if (live) this.installAgentScope(live.ctx, String(sessionId));
    }
    installAgentScope(agentCtx, key) {
        if (this.installedScopes.has(agentCtx)) return;
        const systemPrompt = agentCtx.get('systemPrompt');
        if (!systemPrompt) throw new Error('微信助理模型提示服务尚未就绪，未发送本轮请求');
        this.installedScopes.add(agentCtx);
        if (this.assistant) installAssistantTools(agentCtx, this.assistant, defineTool);
        const tools = agentCtx.get('tools');
        if (tools && this.sendFile) tools.register(defineTool({
            name: 'wechat_send_file',
            description: 'Send an existing file in this WeChat workspace back to the current user as an actual WeChat attachment. Use for requested documents, images, videos and other deliverables; do not merely print a local path. Never send credentials or unrelated private files.',
            parameters: {
                path: {
                    type: 'string',
                    required: true,
                    description: 'Existing file path within the WeChat workspace.'
                }
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        messageId: {
                            type: 'string',
                            required: true
                        }
                    }
                },
                render: (_args, result)=>[
                        {
                            type: 'text',
                            text: `微信文件已发送，消息 ID：${result.messageId}`
                        }
                    ]
            },
            execute: async (args, execution)=>{
                if (!execution.agent || !this.owns(execution.agent.id)) throw new Error('需要当前微信会话');
                execution.signal.throwIfAborted();
                this.assistant?.memeSemantics?.guardFile(args.path);
                return {
                    messageId: await this.sendFile(String(execution.agent.id), args.path)
                };
            }
        }));
        this.preferenceScopes.set(key, systemPrompt);
        if (this.assistant) this.preferenceSections.set(key, registerPersonalPrompt(systemPrompt, this.assistant, key));
        else systemPrompt.section({
            name: 'im-weixin:conversation-style',
            order: 10250,
            text: conversationStyle
        });
        systemPrompt.section({
            name: 'im-weixin:plain-text',
            order: 50,
            text: channelFormatting
        });
    }
    ensureTitle(agent) {
        const sessionTitle = this.ctx.get('sessionTitle');
        if (sessionTitle === undefined) return;
        try {
            sessionTitle.rename(agent.session, this.title);
        } catch (error) {
            logger.warn(`weixin: failed to set session title for ${String(agent.id)}: ${String(error)}`);
        }
    }
    owns(sessionId) {
        const id = String(sessionId);
        return id.startsWith('weixin:') || this.handles.has(id);
    }
    isWechatMessage(messageId) {
        return this.wechatMessageIds.has(messageId);
    }
    run(agent, text) {
        const key = String(agent.id);
        const prev = this.queues.get(key) ?? Promise.resolve();
        const next = prev.then(()=>this.runOnce(agent, text));
        this.queues.set(key, next.catch(()=>{}));
        return next;
    }
    scheduled = new Set();
    isScheduled(sessionId) {
        return this.scheduled.has(sessionId);
    }
    runScheduled(agent, text, expires) {
        const key = String(agent.id);
        const prev = this.queues.get(key) ?? Promise.resolve();
        const next = prev.then(async ()=>{
            if (Date.now() >= expires) throw new Error('晨报已过期');
            this.scheduled.add(key);
            const afterSeq = agent.session.seq;
            try {
                const reply = await this.runOnce(agent, text);
                const searched = sessionEventsOf(agent.session).some((e)=>e.seq > afterSeq && e.type === 'tool/call' && /search|browse|fetch|web/i.test(e.data.name));
                if (!searched) throw new Error('晨报未执行联网查询，不发送');
                return reply;
            } finally{
                this.scheduled.delete(key);
            }
        });
        this.queues.set(key, next.catch(()=>{}));
        return next;
    }
    pendingReactions = new Map();
    async afterReply(sessionId) {
        const send = this.pendingReactions.get(sessionId);
        this.pendingReactions.delete(sessionId);
        if (send) await send();
    }
    async runOnce(agent, text) {
        const key = String(agent.id);
        const afterSeq = agent.session.seq;
        const message = createUserMessage({
            content: typeof text === 'string' ? [
                {
                    type: 'text',
                    text
                }
            ] : text,
            source: {
                kind: 'user'
            }
        });
        this.wechatMessageIds.add(String(message.id));
        agent.followup(message);
        await agent.whenIdle();
        assertTurnSucceeded(sessionEventsOf(agent.session), afterSeq);
        let reply = finalReply(sessionEventsOf(agent.session), afterSeq, text);
        let completion;
        if (this.assistant?.memeCompletion && this.sendFile) {
            try {
                completion = await this.assistant.memeCompletion.ensure({
                    peer: key,
                    seq: afterSeq,
                    input: text,
                    reply,
                    events: sessionEventsOf(agent.session)
                });
            } catch (error) {
                completion = {
                    sent: false,
                    status: 'error'
                };
                logger.warn(`weixin: meme completion error: ${String(error)}`);
            }
            logger.info(`weixin: meme completion ${completion.status}${completion.id ? ' id=' + completion.id : ''}`);
            if (completion.sent && completion.stickerOnly) reply = '';
        }
        if (this.assistant?.engine && this.sendFile && !completion?.sent) this.pendingReactions.set(key, async ()=>{
            try {
                const reaction = await reactToThanks({
                    db: this.assistant.engine.db,
                    root: this.assistant.memeRoot ?? join(this.cwd, 'memes', 'dafeiyu-001'),
                    peer: String(agent.id),
                    input: text,
                    reply,
                    events: sessionEventsOf(agent.session),
                    afterSeq,
                    send: this.sendFile,
                    semanticSelection: true,
                    candidates: []
                });
                logger.info(`weixin: meme reaction ${reaction.status}${reaction.source ? ` source=${reaction.source} candidates=${reaction.candidateCount}` : ''}`);
            } catch (error) {
                logger.warn(`weixin: meme reaction failed: ${String(error)}`);
            }
        });
        if (!reply && !completion?.sent && !sentMeme(sessionEventsOf(agent.session), afterSeq)) {
            const detail = sessionEventsOf(agent.session).filter((event)=>event.seq > afterSeq).map((event)=>{
                if (event.type === 'turn/end') {
                    const reason = event.data.reason;
                    return reason.kind === 'error' ? `turn/end(error:${JSON.stringify(reason.error)})` : `turn/end(${reason.kind})`;
                }
                return event.type;
            });
            logger.warn(`weixin: no assistant text after seq ${afterSeq}; events=[${detail.join(', ')}]`);
        }
        return reply;
    }
    async dispose() {
        const pending = [
            ...this.handles.values()
        ].map((handle)=>handle.dispose());
        this.handles.clear();
        for (const dispose of this.preferenceSections.values())dispose();
        this.preferenceSections.clear();
        this.preferenceScopes.clear();
        await Promise.all(pending);
    }
}


//# sourceURL=dsh-wechat/src/dsh/agent-runtime.ts