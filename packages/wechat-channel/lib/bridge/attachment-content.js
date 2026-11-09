import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { imageExtension } from './media-processing.js';
export async function buildAttachmentContent(store, text, images, files) {
    if (!images.length && !files.length) return [
        {
            type: 'text',
            text
        }
    ];
    if (!store) throw new Error('附件已保存，但 DSH 未启用 attachments 服务；请加载 @deepseek-ai/dsh-attachment-local 后重试');
    const parts = [
        {
            type: 'text',
            text
        }
    ];
    for (const path of files){
        parts.push({
            type: 'file',
            attachment: await store.saveFile({
                data: await readFile(path),
                name: basename(path)
            })
        });
    }
    const mime = {
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
    };
    for (const path of images){
        const data = await readFile(path);
        parts.push({
            type: 'image',
            data: data.toString('base64'),
            mediaType: mime[imageExtension(data)],
            name: basename(path)
        });
    }
    return store.admitPromptContent(parts);
}


//# sourceURL=dsh-wechat/src/bridge/attachment-content.ts