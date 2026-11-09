const DEFAULT_BODY_MAX_LEN = 200;
const DEFAULT_TOKEN_PREFIX_LEN = 6;
export function truncate(s, max) {
    if (!s) return "";
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…(len=${s.length})`;
}
export function redactToken(token, prefixLen = DEFAULT_TOKEN_PREFIX_LEN) {
    if (!token) return "(none)";
    if (token.length <= prefixLen) return `****(len=${token.length})`;
    return `${token.slice(0, prefixLen)}…(len=${token.length})`;
}
export function redactBody(body, maxLen = DEFAULT_BODY_MAX_LEN) {
    if (!body) return "(empty)";
    const redacted = body.replace(/"(context_token|bot_token|token|authorization|Authorization)"\s*:\s*"[^"]*"/g, '"$1":"<redacted>"');
    if (redacted.length <= maxLen) return redacted;
    return `${redacted.slice(0, maxLen)}…(truncated, totalLen=${redacted.length})`;
}
export function redactUrl(rawUrl) {
    try {
        const u = new URL(rawUrl);
        const base = `${u.origin}${u.pathname}`;
        return u.search ? `${base}?<redacted>` : base;
    } catch  {
        return truncate(rawUrl, 80);
    }
}


//# sourceURL=dsh-wechat/src/wechat/util/redact.ts