import fs from "node:fs";
import path from "node:path";
import { deriveRawAccountId } from "../auth/accounts.js";
import { resolveWeixinStateDir } from "./state-dir.js";
function resolveAccountsDir() {
    return path.join(resolveWeixinStateDir(), "accounts");
}
export function getSyncBufFilePath(accountId) {
    return path.join(resolveAccountsDir(), `${accountId}.sync.json`);
}
function readSyncBufFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw);
        if (typeof data.get_updates_buf === "string") {
            return data.get_updates_buf;
        }
    } catch  {}
    return undefined;
}
export function loadGetUpdatesBuf(filePath) {
    const value = readSyncBufFile(filePath);
    if (value !== undefined) return value;
    const accountId = path.basename(filePath, ".sync.json");
    const rawId = deriveRawAccountId(accountId);
    if (rawId) {
        const compatPath = path.join(resolveAccountsDir(), `${rawId}.sync.json`);
        const compatValue = readSyncBufFile(compatPath);
        if (compatValue !== undefined) return compatValue;
    }
    return undefined;
}
export function saveGetUpdatesBuf(filePath, getUpdatesBuf) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, {
        recursive: true
    });
    fs.writeFileSync(filePath, JSON.stringify({
        get_updates_buf: getUpdatesBuf
    }, null, 0), "utf-8");
}


//# sourceURL=dsh-wechat/src/wechat/storage/sync-buf.ts