import crypto from "node:crypto";
export function generateId(prefix) {
    return `${prefix}:${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}
export function tempFileName(prefix, ext) {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
}


//# sourceURL=dsh-wechat/src/wechat/util/random.ts