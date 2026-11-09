import { describe, expect, it, vi } from 'vitest'
vi.mock('@deepseek-ai/dsh-llm', () => ({ createUserMessage: (input: any) => ({ ...input, id: 'fixture-message' }) }))
vi.mock('@deepseek-ai/dsh-session', () => ({ SessionId: (id: string) => id }))
vi.mock('@deepseek-ai/dsh-tools', () => ({ defineTool: (tool: any) => tool }))
vi.mock('../src/wechat/util/logger.js', () => ({ logger: { warn() {}, info() {}, error() {} } }))
import { AgentRuntime } from '../src/dsh/agent-runtime.js'

describe('native media content and file-delivery tool', () => {
  it('keeps native image/file blocks when constructing the model message', async () => {
    const content: any = [{ type: 'text', text: 'read' }, { type: 'image', attachment: { attachmentId: 'image-ref' } }, { type: 'file', attachment: { attachmentId: 'file-ref' } }]
    const followup = vi.fn()
    const agent: any = { id: 'weixin:a:p', session: { seq: 0, events: [] }, followup, whenIdle: async () => {
      agent.session.events.push({ seq: 1, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'read result' }] } } })
    } }
    const runtime = new AgentRuntime({} as any, {}, '/workspace', 'wechat')
    expect(await runtime.run(agent, content)).toBe('read result')
    expect(followup.mock.calls[0][0].content).toEqual(content)
  })
  it('reads replies from the installed DSH snapshotEvents API', async () => {
    const events: any[] = []
    const agent: any = { id: 'weixin:a:p', session: { seq: 0, snapshotEvents: () => events }, followup() {}, whenIdle: async () => {
      events.push({ seq: 1, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'ok' }] } } })
    } }
    expect(await new AgentRuntime({} as any, {}, '/workspace', 'wechat').run(agent, 'hello')).toBe('ok')
  })
  it('resumes persisted sessions even when the plugin cannot see persistence', async () => {
    const agent = { id: 'weixin:a:p' }
    const create = vi.fn()
    const resume = vi.fn(async () => ({ agent }))
    const runtime = new AgentRuntime({ get: () => undefined, agents: { get: () => undefined, resume, create } } as any, {}, '/workspace', 'wechat')
    expect(await runtime.agentFor('weixin:a:p' as any)).toBe(agent)
    expect(resume).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
  })
  it('does not create over an existing session when resume fails', async () => {
    const create = vi.fn()
    const runtime = new AgentRuntime({ get: () => undefined, agents: { get: () => undefined, resume: async () => { throw new Error('storage unavailable') }, create } } as any, {}, '/workspace', 'wechat')
    await expect(runtime.agentFor('weixin:a:p' as any)).rejects.toThrow('storage unavailable')
    expect(create).not.toHaveBeenCalled()
  })
  it('registers a scoped file tool, returns message ID and rejects non-WeChat callers', async () => {
    const register = vi.fn(), send = vi.fn(async () => 'sent-id')
    const agent: any = { id: 'weixin:a:p', session: {} }
    const ctx: any = { get: () => undefined, agents: { get: () => undefined, resume: async () => { throw Object.assign(new Error('missing'), { name: 'SessionPersistenceNotFoundError' }) }, create: async ({ setup }: any) => {
      setup({ get: (name: string) => name === 'tools' ? { register } : undefined })
      return { agent, dispose: async () => {} }
    } } }
    const runtime = new AgentRuntime(ctx, {}, '/workspace', 'wechat', send)
    await runtime.agentFor('weixin:a:p' as any)
    const tool = register.mock.calls[0][0]
    expect(tool.name).toBe('wechat_send_file')
    const execution = { agent, signal: new AbortController().signal }
    expect(await tool.execute({ path: 'report.pdf' }, execution)).toEqual({ messageId: 'sent-id' })
    expect(send).toHaveBeenCalledWith('weixin:a:p', 'report.pdf')
    await expect(tool.execute({ path: 'report.pdf' }, { ...execution, agent: { id: 'other' } })).rejects.toThrow('微信会话')
  })
})
