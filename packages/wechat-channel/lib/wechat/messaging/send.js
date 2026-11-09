import { sendMessage as sendMessageApi } from "../api/api.js";
import { logger } from "../util/logger.js";
import { generateId } from "../util/random.js";
import { compactXhsLinks } from './source-links.mjs';
import { MessageItemType, MessageState, MessageType } from "../api/types.js";
export { StreamingMarkdownFilter } from "./markdown-filter.js";
function generateClientId() {
    return generateId("weixin");
}
function buildTextMessageReq(params) {
    const { to, text, contextToken, runId, clientId } = params;
    const item_list = text ? [
        {
            type: MessageItemType.TEXT,
            text_item: {
                text: compactXhsLinks(text)
            }
        }
    ] : [];
    return {
        msg: {
            from_user_id: "",
            to_user_id: to,
            client_id: clientId,
            message_type: MessageType.BOT,
            message_state: MessageState.FINISH,
            item_list: item_list.length ? item_list : undefined,
            context_token: contextToken ?? undefined,
            run_id: runId ?? undefined
        }
    };
}
function buildSendMessageReq(params) {
    const { to, contextToken, runId, payload, clientId } = params;
    return buildTextMessageReq({
        to,
        text: payload.text ?? "",
        contextToken,
        runId,
        clientId
    });
}
export async function sendMessageWeixin(params) {
    const { to, text, opts } = params;
    if (!opts.contextToken) {
        logger.warn(`sendMessageWeixin: contextToken missing for to=${to}, sending without context`);
    }
    const clientId = generateClientId();
    const req = buildSendMessageReq({
        to,
        contextToken: opts.contextToken,
        runId: opts.runId,
        payload: {
            text
        },
        clientId
    });
    try {
        await sendMessageApi({
            baseUrl: opts.baseUrl,
            token: opts.token,
            timeoutMs: opts.timeoutMs,
            body: req
        });
    } catch (err) {
        logger.error(`sendMessageWeixin: failed to=${to} clientId=${clientId} err=${String(err)}`);
        throw err;
    }
    return {
        messageId: clientId
    };
}
export async function sendMessageItemWeixin(params) {
    const { to, item, opts } = params;
    if (!opts.contextToken) {
        logger.warn(`sendMessageItemWeixin: contextToken missing for to=${to}, sending without context`);
    }
    const clientId = params.clientId ?? generateClientId();
    const req = {
        msg: {
            from_user_id: "",
            to_user_id: to,
            client_id: clientId,
            message_type: MessageType.BOT,
            message_state: MessageState.FINISH,
            item_list: [
                item
            ],
            context_token: opts.contextToken ?? undefined,
            run_id: opts.runId
        }
    };
    try {
        await sendMessageApi({
            baseUrl: opts.baseUrl,
            token: opts.token,
            timeoutMs: opts.timeoutMs,
            body: req
        });
    } catch (err) {
        logger.error(`${params.label ?? "sendMessageItemWeixin"}: failed to=${to} clientId=${clientId} err=${String(err)}`);
        throw err;
    }
    return {
        messageId: clientId
    };
}
async function sendMediaItems(params) {
    const { to, text, mediaItem, opts, label } = params;
    const runId = opts.runId;
    const items = [];
    if (text) {
        items.push({
            type: MessageItemType.TEXT,
            text_item: {
                text: compactXhsLinks(text)
            }
        });
    }
    items.push(mediaItem);
    let lastClientId = "";
    for (const item of items){
        lastClientId = generateClientId();
        const req = {
            msg: {
                from_user_id: "",
                to_user_id: to,
                client_id: lastClientId,
                message_type: MessageType.BOT,
                message_state: MessageState.FINISH,
                item_list: [
                    item
                ],
                context_token: opts.contextToken ?? undefined,
                run_id: runId
            }
        };
        try {
            await sendMessageApi({
                baseUrl: opts.baseUrl,
                token: opts.token,
                timeoutMs: opts.timeoutMs,
                body: req
            });
        } catch (err) {
            logger.error(`${label}: failed to=${to} clientId=${lastClientId} err=${String(err)}`);
            throw err;
        }
    }
    logger.info(`${label}: success to=${to} clientId=${lastClientId}`);
    return {
        messageId: lastClientId
    };
}
export async function sendImageMessageWeixin(params) {
    const { to, text, uploaded, opts } = params;
    if (!opts.contextToken) {
        logger.warn(`sendImageMessageWeixin: contextToken missing for to=${to}, sending without context`);
    }
    logger.info(`sendImageMessageWeixin: to=${to} filekey=${uploaded.filekey} fileSize=${uploaded.fileSize} aeskey=present`);
    const imageItem = {
        type: MessageItemType.IMAGE,
        image_item: {
            media: {
                encrypt_query_param: uploaded.downloadEncryptedQueryParam,
                aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
                encrypt_type: 1
            },
            mid_size: uploaded.fileSizeCiphertext
        }
    };
    return sendMediaItems({
        to,
        text,
        mediaItem: imageItem,
        opts,
        label: "sendImageMessageWeixin"
    });
}
export async function sendVideoMessageWeixin(params) {
    const { to, text, uploaded, opts } = params;
    if (!opts.contextToken) {
        logger.warn(`sendVideoMessageWeixin: contextToken missing for to=${to}, sending without context`);
    }
    const videoItem = {
        type: MessageItemType.VIDEO,
        video_item: {
            media: {
                encrypt_query_param: uploaded.downloadEncryptedQueryParam,
                aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
                encrypt_type: 1
            },
            video_size: uploaded.fileSizeCiphertext
        }
    };
    return sendMediaItems({
        to,
        text,
        mediaItem: videoItem,
        opts,
        label: "sendVideoMessageWeixin"
    });
}
export async function sendFileMessageWeixin(params) {
    const { to, text, fileName, uploaded, opts } = params;
    if (!opts.contextToken) {
        logger.warn(`sendFileMessageWeixin: contextToken missing for to=${to}, sending without context`);
    }
    const fileItem = {
        type: MessageItemType.FILE,
        file_item: {
            media: {
                encrypt_query_param: uploaded.downloadEncryptedQueryParam,
                aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
                encrypt_type: 1
            },
            file_name: fileName,
            len: String(uploaded.fileSize)
        }
    };
    return sendMediaItems({
        to,
        text,
        mediaItem: fileItem,
        opts,
        label: "sendFileMessageWeixin"
    });
}


//# sourceURL=dsh-wechat/src/wechat/messaging/send.ts