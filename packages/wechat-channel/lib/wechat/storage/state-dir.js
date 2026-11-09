import os from "node:os";
import path from "node:path";
export function resolveStateDir() {
    return process.env.DSH_WECHAT_STATE_DIR?.trim() || path.join(os.homedir(), ".dsh-plugin-wechat");
}
export function resolveWeixinStateDir() {
    return path.join(resolveStateDir(), "weixin");
}


//# sourceURL=dsh-wechat/src/wechat/storage/state-dir.ts