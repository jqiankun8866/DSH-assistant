import fs from "node:fs";
import path from "node:path";
import { logger } from "../util/logger.js";
import { generateId } from "../util/random.js";
import { MessageItemType } from "../api/types.js";
import { resolveWeixinStateDir } from "../storage/state-dir.js";
export const CHANNEL_ID = "weixin";
const contextTokenStore = new Map();
function contextTokenKey(accountId, userId) {
    return `${accountId}:${userId}`;
}
function resolveContextTokenFilePath(accountId) {
    return path.join(resolveWeixinStateDir(), "accounts", `${accountId}.context-tokens.json`);
}
function persistContextTokens(accountId) {
    const prefix = `${accountId}:`;
    const tokens = {};
    for (const [k, v] of contextTokenStore){
        if (k.startsWith(prefix)) {
            tokens[k.slice(prefix.length)] = v;
        }
    }
    const filePath = resolveContextTokenFilePath(accountId);
    try {
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, {
            recursive: true
        });
        fs.writeFileSync(filePath, JSON.stringify(tokens, null, 0), "utf-8");
    } catch (err) {
        logger.warn(`persistContextTokens: failed to write ${filePath}: ${String(err)}`);
    }
}
export function restoreContextTokens(accountId) {
    const filePath = resolveContextTokenFilePath(accountId);
    try {
        if (!fs.existsSync(filePath)) return;
        const raw = fs.readFileSync(filePath, "utf-8");
        const tokens = JSON.parse(raw);
        let count = 0;
        for (const [userId, token] of Object.entries(tokens)){
            if (typeof token === "string" && token) {
                contextTokenStore.set(contextTokenKey(accountId, userId), token);
                count++;
            }
        }
        logger.info(`restoreContextTokens: restored ${count} tokens for account=${accountId}`);
    } catch (err) {
        logger.warn(`restoreContextTokens: failed to read ${filePath}: ${String(err)}`);
    }
}
export function clearContextTokensForAccount(accountId) {
    const prefix = `${accountId}:`;
    for (const k of [
        ...contextTokenStore.keys()
    ]){
        if (k.startsWith(prefix)) {
            contextTokenStore.delete(k);
        }
    }
    const filePath = resolveContextTokenFilePath(accountId);
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
        logger.warn(`clearContextTokensForAccount: failed to remove ${filePath}: ${String(err)}`);
    }
    logger.info(`clearContextTokensForAccount: cleared tokens for account=${accountId}`);
}
export function setContextToken(accountId, userId, token) {
    const k = contextTokenKey(accountId, userId);
    logger.debug(`setContextToken: key=${k}`);
    contextTokenStore.set(k, token);
    persistContextTokens(accountId);
}
export function getContextToken(accountId, userId) {
    const k = contextTokenKey(accountId, userId);
    const val = contextTokenStore.get(k);
    logger.debug(`getContextToken: key=${k} found=${val !== undefined} storeSize=${contextTokenStore.size}`);
    return val;
}
export function findAccountIdsByContextToken(accountIds, userId) {
    return accountIds.filter((id)=>contextTokenStore.has(contextTokenKey(id, userId)));
}
function generateMessageSid() {
    return generateId(CHANNEL_ID);
}
export function isMediaItem(item) {
    return item.type === MessageItemType.IMAGE || item.type === MessageItemType.VIDEO || item.type === MessageItemType.FILE || item.type === MessageItemType.VOICE;
}
function bodyFromItemList(itemList) {
    if (!itemList?.length) return "";
    for (const item of itemList){
        if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
            const text = String(item.text_item.text);
            const ref = item.ref_msg;
            if (!ref) return text;
            if (ref.message_item && isMediaItem(ref.message_item)) return text;
            const parts = [];
            if (ref.title) parts.push(ref.title);
            if (ref.message_item) {
                const refBody = bodyFromItemList([
                    ref.message_item
                ]);
                if (refBody) parts.push(refBody);
            }
            if (!parts.length) return text;
            return `[引用: ${parts.join(" | ")}]\n${text}`;
        }
        if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
            return item.voice_item.text;
        }
    }
    return "";
}
export function weixinMessageToMsgContext(msg, accountId, opts) {
    const from_user_id = msg.from_user_id ?? "";
    const ctx = {
        Body: bodyFromItemList(msg.item_list),
        From: from_user_id,
        To: from_user_id,
        AccountId: accountId,
        OriginatingChannel: CHANNEL_ID,
        OriginatingTo: from_user_id,
        MessageSid: generateMessageSid(),
        Timestamp: msg.create_time_ms,
        Provider: CHANNEL_ID,
        ChatType: "direct"
    };
    if (msg.context_token) {
        ctx.context_token = msg.context_token;
    }
    if (opts?.decryptedPicPath) {
        ctx.MediaPath = opts.decryptedPicPath;
        ctx.MediaType = "image/*";
    } else if (opts?.decryptedVideoPath) {
        ctx.MediaPath = opts.decryptedVideoPath;
        ctx.MediaType = "video/mp4";
    } else if (opts?.decryptedFilePath) {
        ctx.MediaPath = opts.decryptedFilePath;
        ctx.MediaType = opts.fileMediaType ?? "application/octet-stream";
    } else if (opts?.decryptedVoicePath) {
        ctx.MediaPath = opts.decryptedVoicePath;
        ctx.MediaType = opts.voiceMediaType ?? "audio/wav";
    }
    return ctx;
}
export function getContextTokenFromMsgContext(ctx) {
    return ctx.context_token;
}


//# sourceURL=dsh-wechat/src/wechat/messaging/inbound.ts