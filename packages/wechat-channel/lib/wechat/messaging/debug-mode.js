import fs from "node:fs";
import path from "node:path";
import { resolveWeixinStateDir } from "../storage/state-dir.js";
import { logger } from "../util/logger.js";
function resolveDebugModePath() {
    return path.join(resolveWeixinStateDir(), "debug-mode.json");
}
function loadState() {
    try {
        const raw = fs.readFileSync(resolveDebugModePath(), "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.accounts === "object") return parsed;
    } catch  {}
    return {
        accounts: {}
    };
}
function saveState(state) {
    const filePath = resolveDebugModePath();
    fs.mkdirSync(path.dirname(filePath), {
        recursive: true
    });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}
export function toggleDebugMode(accountId) {
    const state = loadState();
    const next = !state.accounts[accountId];
    state.accounts[accountId] = next;
    try {
        saveState(state);
    } catch (err) {
        logger.error(`debug-mode: failed to persist state: ${String(err)}`);
    }
    return next;
}
export function isDebugMode(accountId) {
    return loadState().accounts[accountId] === true;
}
export function _resetForTest() {
    try {
        fs.unlinkSync(resolveDebugModePath());
    } catch  {}
}


//# sourceURL=dsh-wechat/src/wechat/messaging/debug-mode.ts