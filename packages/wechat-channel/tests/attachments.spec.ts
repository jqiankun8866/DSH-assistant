import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveDocument, safeFilename, validateOutboundFile } from '../src/bridge/media-processing.js'
import { buildAttachmentContent } from '../src/bridge/attachment-content.js'

describe('documents and native attachment admission', () => {
  it('sanitizes platform filenames and keeps documents separate', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wechat-doc-'))
    try {
      const data = Buffer.from('document contents')
      const path = await saveDocument(root, data, '../../report.docx')
      expect(path.startsWith(root)).toBe(true)
      expect(await readFile(path)).toEqual(data)
      expect(safeFilename('C:\\secrets\\report.pdf')).toBe('report.pdf')
      expect(safeFilename('CON')).toBe('attachment.bin')
      expect(await validateOutboundFile(root, path)).toBe(path)
      await expect(validateOutboundFile(root, root)).rejects.toThrow()
      await expect(validateOutboundFile(root, '../missing.pdf')).rejects.toThrow()
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('rejects existing files outside workspace, empty files and directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wechat-scope-'))
    try {
      const workspace = join(root, 'workspace')
      await mkdir(workspace)
      await writeFile(join(root, 'secret.txt'), 'secret')
      await writeFile(join(workspace, 'empty.txt'), '')
      await expect(validateOutboundFile(workspace, '../secret.txt')).rejects.toThrow('工作目录')
      await expect(validateOutboundFile(workspace, 'empty.txt')).rejects.toThrow('非空')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('passes image bytes and durable file references to native admission', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wechat-native-'))
    try {
      const image = join(root, 'image.png')
      const document = join(root, 'report.pdf')
      const bytes = Buffer.from([137,80,78,71,13,10,26,10])
      await writeFile(image, bytes)
      await writeFile(document, 'pdf bytes')
      let captured: any
      const store = {
        saveFile: async (input: any) => { expect(input.name).toBe('report.pdf'); return { attachmentId: 'test', name: input.name, bytes: input.data.length } },
        admitPromptContent: async (parts: any) => { captured = parts; return parts },
      }
      await buildAttachmentContent(store as any, '请查看', [image], [document])
      expect(captured.map((p: any) => p.type)).toEqual(['text', 'file', 'image'])
      expect(captured[2].data).toBe(bytes.toString('base64'))
      expect(captured[2].mediaType).toBe('image/png')
      await expect(buildAttachmentContent(undefined, '', [image], [])).rejects.toThrow('attachments')
      expect(await buildAttachmentContent(undefined, 'text only', [], [])).toEqual([{ type: 'text', text: 'text only' }])
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
