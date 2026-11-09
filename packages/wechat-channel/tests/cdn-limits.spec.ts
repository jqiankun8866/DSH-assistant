import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../src/wechat/util/logger.js', () => ({ logger: { debug() {}, error() {}, warn() {} } }))
import { downloadPlainCdnBuffer } from '../src/wechat/cdn/pic-decrypt.js'

describe('bounded CDN downloads', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('streams valid bytes and supplies a timeout signal', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([1,2,3])))
    vi.stubGlobal('fetch', fetch)
    expect(await downloadPlainCdnBuffer('fixture', 'https://example.invalid', 'test')).toEqual(Buffer.from([1,2,3]))
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
  it('rejects declared oversized responses before buffering', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('small', { headers: { 'content-length': String(101 * 1024 * 1024) } })))
    await expect(downloadPlainCdnBuffer('fixture', 'https://example.invalid', 'test')).rejects.toThrow('100 MiB')
  })
})
