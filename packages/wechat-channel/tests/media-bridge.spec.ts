import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({ download: vi.fn(), send: vi.fn(), sendFile: vi.fn(), frames: vi.fn(), transcribe: vi.fn(), setContext: vi.fn(), getContext: vi.fn(() => 'latest-context') }))
vi.mock('../src/wechat/messaging/inbound.js', () => ({ setContextToken: mocks.setContext, getContextToken: mocks.getContext, restoreContextTokens: vi.fn() }))
vi.mock('../src/dsh/agent-runtime.js', () => ({ weixinSessionId: (a: string, p: string) => `weixin:${a}:${p}` }))
vi.mock('../src/wechat/media/media-download.js', () => ({ downloadMediaFromItem: mocks.download }))
vi.mock('../src/wechat/messaging/send.js', () => ({ sendMessageWeixin: mocks.send }))
vi.mock('../src/wechat/messaging/send-media.js', () => ({ sendWeixinMediaFile: mocks.sendFile }))
vi.mock('../src/wechat/util/logger.js', () => ({ logger: { info() {}, warn() {}, error() {} } }))
vi.mock('../src/bridge/media-processing.js', async importOriginal => ({ ...await importOriginal<object>(), extractFrames: mocks.frames }))
vi.mock('../src/bridge/audio-processing.js', () => ({ transcribeMedia: mocks.transcribe }))
import { handleMessage } from '../src/bridge/weixin-bridge.js'
import { MessageType, MessageItemType } from '../src/wechat/api/types.js'

describe('WeChat attachment receive/send bridge', () => {
  let root: string
  let runtime: any
  let interaction: any
  let ctx: any
  beforeEach(async () => {
    vi.clearAllMocks()
    root = await mkdtemp(join(tmpdir(), 'wechat-bridge-'))
    runtime = { agentFor: vi.fn(async () => ({ id: 'weixin:a:p' })), run: vi.fn(async () => '已读取') }
    interaction = { setSender: vi.fn(), setFileSender: vi.fn(), routeInbound: vi.fn(() => false) }
    ctx = { get: () => ({ saveFile: async (input: any) => ({ name: input.name, bytes: input.data.length, attachmentId: 'fixture' }), admitPromptContent: async (parts: any) => parts }) }
    mocks.transcribe.mockResolvedValue('识别出的语音内容')
    mocks.send.mockResolvedValue({ messageId: 'text-id' })
    mocks.sendFile.mockResolvedValue({ messageId: 'file-id' })
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })
  const msg = (items: any[]) => ({ message_type: MessageType.USER, from_user_id: 'p', context_token: 'fixture-context', item_list: items })
  const image = { type: MessageItemType.IMAGE }
  const file = { type: MessageItemType.FILE }
  const video = { type: MessageItemType.VIDEO }
  const run = (items: any[], queues?: Map<string, Promise<void>>) => handleMessage(ctx, 'a', 'https://example.invalid', 'fixture-token', 'per-account-channel-peer', { cwd: root }, runtime, interaction, msg(items), queues)

  it('accepts WeChat-provided voice text without downloading', async () => {
    await run([{ type: MessageItemType.VOICE, voice_item: { text: '明天下午提醒我开会' } }])
    expect(runtime.run.mock.calls[0][1][0].text).toContain('明天下午提醒我开会')
    expect(mocks.download).not.toHaveBeenCalled()
  })
  it('persists inbound context and scheduled sender propagates delivery failures', async () => {
    const registerSender = vi.fn(), inbound = vi.fn()
    runtime.assistant = { registerSender, inbound }
    await run([{ type: MessageItemType.TEXT, text_item: { text: '测试提醒' } }])
    expect(mocks.setContext).toHaveBeenCalledWith('a', 'p', 'fixture-context')
    expect(inbound).toHaveBeenCalledWith('weixin:a:p')
    const sender = registerSender.mock.calls[0][1]
    expect(await sender({ text: '提醒' })).toEqual({ accepted: true, messageId: 'text-id' })
    expect(mocks.send.mock.calls.at(-1)[0].opts.contextToken).toBe('latest-context')
    mocks.send.mockRejectedValueOnce(new Error('gateway rejected'))
    await expect(sender({ text: '提醒' })).rejects.toThrow('gateway rejected')
  })
  it('downloads raw voice as audio and injects its transcript', async () => {
    mocks.download.mockImplementation(async (_item, deps) => {
      const saved = await deps.saveMedia(Buffer.from('wav'), 'audio/wav')
      expect(saved.path.endsWith('.wav')).toBe(true)
      return { decryptedVoicePath: saved.path, voiceMediaType: 'audio/wav' }
    })
    await run([{ type: MessageItemType.VOICE, voice_item: {} }])
    expect(mocks.transcribe).toHaveBeenCalledOnce()
    expect(runtime.run.mock.calls[0][1][0].text).toContain('识别出的语音内容')
  })
  it('transcribes uploaded audio files', async () => {
    const path = join(root, 'recording.m4a'); await writeFile(path, 'audio')
    mocks.download.mockResolvedValue({ decryptedFilePath: path, fileMediaType: 'application/octet-stream' })
    await run([file])
    expect(mocks.transcribe).toHaveBeenCalledOnce()
    expect(runtime.run.mock.calls[0][1][0].text).toContain('识别出的语音内容')
  })
  it('reports transcription failure without claiming to hear audio', async () => {
    const path = join(root, 'recording.wav'); await writeFile(path, 'audio')
    mocks.download.mockResolvedValue({ decryptedVoicePath: path })
    mocks.transcribe.mockRejectedValue(new Error('not ready'))
    await run([{ type: MessageItemType.VOICE }])
    expect(runtime.run.mock.calls[0][1][0].text).toContain('语音转写失败')
  })
  it('image-only messages reach the agent as native image content', async () => {
    mocks.download.mockImplementation(async (_item, deps) => {
      const saved = await deps.saveMedia(Buffer.from([137,80,78,71,13,10,26,10]))
      return { decryptedPicPath: saved.path }
    })
    await run([image])
    expect(runtime.run).toHaveBeenCalledOnce()
    expect(runtime.run.mock.calls[0][1].some((part: any) => part.type === 'image')).toBe(true)
    expect(mocks.send.mock.calls.at(-1)[0].text).toBe('已读取')
  })
  it('documents are preserved and admitted as files', async () => {
    mocks.download.mockImplementation(async (_item, deps) => {
      const saved = await deps.saveMedia(Buffer.from('%PDF fixture'), 'application/pdf', 'inbound', 1024, '../../report.pdf')
      expect(await readFile(saved.path, 'utf8')).toBe('%PDF fixture')
      return { decryptedFilePath: saved.path, fileMediaType: 'application/pdf' }
    })
    await run([file])
    expect(runtime.run.mock.calls[0][1].find((part: any) => part.type === 'file').attachment.name).toBe('report.pdf')
  })
  it('videos attach both source and sampled images', async () => {
    const source = join(root, 'video.mp4'), frame = join(root, 'frame.jpg')
    await writeFile(source, 'video fixture')
    await writeFile(frame, Buffer.from([255,216,255,1]))
    mocks.download.mockResolvedValue({ decryptedVideoPath: source })
    mocks.frames.mockResolvedValue({ paths: [frame], times: [0], duration: 1 })
    await run([video])
    expect(runtime.run.mock.calls[0][1].map((part: any) => part.type)).toEqual(['text', 'file', 'image'])
    expect(mocks.transcribe).toHaveBeenCalledWith(source, expect.any(String), expect.anything(), expect.anything())
    expect(runtime.run.mock.calls[0][1][0].text).toContain('识别出的语音内容')
  })
  it('failed download produces an explicit reply, never an imagined model answer', async () => {
    mocks.download.mockResolvedValue({})
    await run([image])
    expect(runtime.run).not.toHaveBeenCalled()
    expect(mocks.send.mock.calls[0][0].text).toContain('失败')
  })
  it('missing ffmpeg preserves video and tells the model frames are unavailable', async () => {
    const source = join(root, 'video.mp4')
    await writeFile(source, 'video fixture')
    mocks.download.mockResolvedValue({ decryptedVideoPath: source })
    mocks.frames.mockRejectedValue(new Error('ENOENT'))
    await run([video])
    expect(runtime.run.mock.calls[0][1][0].text).toContain('抽帧失败')
    expect(runtime.run.mock.calls[0][1].map((part: any) => part.type)).toEqual(['text', 'file'])
  })
  it('sends a real file to the bound peer and propagates upload failures', async () => {
    await run([{ type: MessageItemType.TEXT, text_item: { text: '发我文件' } }])
    const path = join(root, 'result.docx')
    await writeFile(path, 'document fixture')
    const send = interaction.setFileSender.mock.calls[0][1]
    expect(await send(path)).toBe('file-id')
    expect(mocks.sendFile.mock.calls[0][0]).toMatchObject({ filePath: path, to: 'p', opts: { contextToken: 'fixture-context' } })
    mocks.sendFile.mockRejectedValue(new Error('upload failed'))
    await expect(send(path)).rejects.toThrow('upload failed')
  })
  it('later text waits for earlier media preparation', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    mocks.download.mockImplementation(async () => { await gate; return {} })
    const queues = new Map<string, Promise<void>>()
    const first = run([image], queues)
    const second = run([{ type: MessageItemType.TEXT, text_item: { text: '后续指令' } }], queues)
    await Promise.resolve()
    expect(runtime.run).not.toHaveBeenCalled()
    release()
    await Promise.all([first, second])
    expect(runtime.run.mock.calls[0][1][0].text).toBe('后续指令')
    expect(queues.size).toBe(0)
  })
})
