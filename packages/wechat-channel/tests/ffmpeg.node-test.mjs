import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { extractFrames, imageExtension } from '../lib/bridge/media-processing.js'

test('real FFmpeg samples a generated video across its duration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wechat-ffmpeg-'))
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
  const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'
  try {
    const video = join(root, 'fixture.mp4')
    await promisify(execFile)(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=5', '-t', '2', '-pix_fmt', 'yuv420p', video], { timeout: 15000, windowsHide: true })
    const frames = await extractFrames(video, root, { ffmpeg, ffprobe, count: 3 })
    assert.equal(frames.paths.length, 3)
    assert.ok(frames.duration >= 1.9)
    assert.equal(frames.times[0], 0)
    assert.ok(frames.times[2] > 1)
    for (const path of frames.paths) assert.equal(imageExtension(await readFile(path)), '.jpg')
  } finally { await rm(root, { recursive: true, force: true }) }
})
