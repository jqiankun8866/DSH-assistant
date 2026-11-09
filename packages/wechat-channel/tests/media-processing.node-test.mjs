import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveAttachment, imageExtension, extractFrames, mediaPrompt } from '../src/bridge/media-processing.ts'

test('rejects invalid images and size limits', async () => {
  assert.throws(() => imageExtension(Buffer.from('not an image')))
  await assert.rejects(saveAttachment(tmpdir(), Buffer.alloc(0)))
  await assert.rejects(saveAttachment(tmpdir(), Buffer.alloc(20), true, 10))
})
test('saves unique images without trusting sender filenames', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wechat-media-'))
  try {
    const bytes = Buffer.from([137,80,78,71,13,10,26,10])
    const a = await saveAttachment(root, bytes)
    const b = await saveAttachment(root, bytes)
    assert.notEqual(a, b)
    assert.deepEqual(await readFile(a), bytes)
    assert.ok(a.endsWith('.png'))
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('frame limit and missing executable fail explicitly', async () => {
  await assert.rejects(extractFrames('absent.mp4', tmpdir(), { count: 99 }))
  await assert.rejects(extractFrames('absent.mp4', tmpdir(), { ffprobe: 'no-such-ffprobe-command' }))
})
test('prompt preserves user request and explains visual/audio limits', () => {
  const prompt = mediaPrompt('比较这两张图', ['C:/a.png', 'C:/b.png'], ['视频时长 30 秒'])
  assert.ok(prompt.includes('比较这两张图'))
  assert.ok(prompt.includes('C:/b.png'))
  assert.ok(prompt.includes('未提供转写时不要声称听懂了音轨'))
})
