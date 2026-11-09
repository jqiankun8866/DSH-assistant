import fs from "node:fs";
import path from "node:path";
import { resolveWeixinStateDir } from "../storage/state-dir.js";
export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
export function deriveRawAccountId(normalizedId) {
    if (normalizedId.endsWith("-im-bot")) {
        return `${normalizedId.slice(0, -7)}@im.bot`;
    }
    if (normalizedId.endsWith("-im-wechat")) {
        return `${normalizedId.slice(0, -10)}@im.wechat`;
    }
    return undefined;
}
function resolveAccountIndexPath() {
    return path.join(resolveWeixinStateDir(), "accounts.json");
}
export function listIndexedWeixinAccountIds() {
    const filePath = resolveAccountIndexPath();
    try {
        if (!fs.existsSync(filePath)) return [];
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((id)=>typeof id === "string" && id.trim() !== "");
    } catch  {
        return [];
    }
}
export function registerWeixinAccountId(accountId) {
    const dir = resolveWeixinStateDir();
    fs.mkdirSync(dir, {
        recursive: true
    });
    const existing = listIndexedWeixinAccountIds();
    if (existing.includes(accountId)) return;
    const updated = [
        ...existing,
        accountId
    ];
    fs.writeFileSync(resolveAccountIndexPath(), JSON.stringify(updated, null, 2), "utf-8");
}
export function unregisterWeixinAccountId(accountId) {
    const existing = listIndexedWeixinAccountIds();
    const updated = existing.filter((id)=>id !== accountId);
    if (updated.length !== existing.length) {
        fs.writeFileSync(resolveAccountIndexPath(), JSON.stringify(updated, null, 2), "utf-8");
    }
}
function resolveAccountsDir() {
    return path.join(resolveWeixinStateDir(), "accounts");
}
function resolveAccountPath(accountId) {
    return path.join(resolveAccountsDir(), `${accountId}.json`);
}
function readAccountFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, "utf-8"));
        }
    } catch  {}
    return null;
}
export function loadWeixinAccount(accountId) {
    const primary = readAccountFile(resolveAccountPath(accountId));
    if (primary) return primary;
    const rawId = deriveRawAccountId(accountId);
    if (rawId) {
        const compat = readAccountFile(resolveAccountPath(rawId));
        if (compat) return compat;
    }
    return null;
}
export function saveWeixinAccount(accountId, update) {
    const dir = resolveAccountsDir();
    fs.mkdirSync(dir, {
        recursive: true
    });
    const existing = loadWeixinAccount(accountId) ?? {};
    const token = update.token?.trim() || existing.token;
    const baseUrl = update.baseUrl?.trim() || existing.baseUrl;
    const userId = update.userId !== undefined ? update.userId.trim() || undefined : existing.userId?.trim() || undefined;
    const data = {
        ...token ? {
            token,
            savedAt: new Date().toISOString()
        } : {},
        ...baseUrl ? {
            baseUrl
        } : {},
        ...userId ? {
            userId
        } : {}
    };
    const filePath = resolveAccountPath(accountId);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    try {
        fs.chmodSync(filePath, 0o600);
    } catch  {}
}
export function clearWeixinAccount(accountId) {
    const dir = resolveAccountsDir();
    const accountFiles = [
        `${accountId}.json`,
        `${accountId}.sync.json`,
        `${accountId}.context-tokens.json`
    ];
    for (const file of accountFiles){
        try {
            fs.unlinkSync(path.join(dir, file));
        } catch  {}
    }
}
export function loadConfigRouteTag(_accountId) {
    return undefined;
}
export function loadConfigBotAgent() {
    const value = process.env.DSH_WECHAT_BOT_AGENT?.trim();
    return value || undefined;
}


//# sourceURL=dsh-wechat/src/wechat/auth/accounts.ts