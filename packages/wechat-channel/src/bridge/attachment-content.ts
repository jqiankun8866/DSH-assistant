import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { imageExtension } from './media-processing.js'

export type UserContent = Parameters<typeof createUserMessage>[0]['content']
type PromptPart = Parameters<AttachmentStore['admitPromptContent']>[0][number]

/** Structural seam verified against the installed DSH AttachmentStore public API. */
export type AttachmentService = Pick<AttachmentStore, 'saveFile' | 'admitPromptContent'>

export async function buildAttachmentContent(store: AttachmentService | undefined, text: string, images: string[], files: string[]): Promise<UserContent> {
  if (!images.length && !files.length) return [{ type: 'text', text }]
  if (!store) throw new Error('附件已保存，但 DSH 未启用 attachments 服务；请加载 @deepseek-ai/dsh-attachment-local 后重试')
  const parts: PromptPart[] = [{ type: 'text', text }]
  for (const path of files) {
    parts.push({ type: 'file', attachment: await store.saveFile({ data: await readFile(path), name: basename(path) }) })
  }
  const mime = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' } as const
  for (const path of images) {
    const data = await readFile(path)
    parts.push({ type: 'image', data: data.toString('base64'), mediaType: mime[imageExtension(data) as keyof typeof mime], name: basename(path) })
  }
  return store.admitPromptContent(parts)
}
