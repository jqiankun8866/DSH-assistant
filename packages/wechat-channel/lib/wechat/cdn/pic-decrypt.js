import { decryptAesEcb } from "./aes-ecb.js";
import { buildCdnDownloadUrl, ENABLE_CDN_URL_FALLBACK } from "./cdn-url.js";
import { logger } from "../util/logger.js";
async function fetchCdnBytes(url, label) {
    let res;
    try {
        res = await fetch(url, {
            signal: AbortSignal.timeout(60_000)
        });
    } catch (err) {
        const cause = err.cause ?? err.code ?? "(no cause)";
        logger.error(`${label}: fetch network error url=${url} err=${String(err)} cause=${String(cause)}`);
        throw err;
    }
    logger.debug(`${label}: response status=${res.status} ok=${res.ok}`);
    if (!res.ok) {
        const body = await res.text().catch(()=>"(unreadable)");
        const msg = `${label}: CDN download ${res.status} ${res.statusText} body=${body}`;
        logger.error(msg);
        throw new Error(msg);
    }
    const maxBytes = 100 * 1024 * 1024 + 32;
    const declared = Number(res.headers.get('content-length'));
    if (declared > maxBytes) {
        await res.body?.cancel();
        throw new Error('CDN attachment exceeds 100 MiB');
    }
    if (!res.body) throw new Error('CDN response has no body');
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while(true){
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) {
                await reader.cancel();
                throw new Error('CDN attachment exceeds 100 MiB');
            }
            chunks.push(value);
        }
    } finally{
        reader.releaseLock();
    }
    return Buffer.concat(chunks, size);
}
function parseAesKey(aesKeyBase64, label) {
    const decoded = Buffer.from(aesKeyBase64, "base64");
    if (decoded.length === 16) {
        return decoded;
    }
    if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString("ascii"))) {
        return Buffer.from(decoded.toString("ascii"), "hex");
    }
    const msg = `${label}: aes_key must decode to 16 raw bytes or 32-char hex string, got ${decoded.length} bytes (base64="${aesKeyBase64}")`;
    logger.error(msg);
    throw new Error(msg);
}
export async function downloadAndDecryptBuffer(encryptedQueryParam, aesKeyBase64, cdnBaseUrl, label, fullUrl) {
    const key = parseAesKey(aesKeyBase64, label);
    let url;
    if (fullUrl) {
        url = fullUrl;
    } else if (ENABLE_CDN_URL_FALLBACK) {
        url = buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl);
    } else {
        throw new Error(`${label}: fullUrl is required (CDN URL fallback is disabled)`);
    }
    logger.debug(`${label}: fetching url=${url}`);
    const encrypted = await fetchCdnBytes(url, label);
    logger.debug(`${label}: downloaded ${encrypted.byteLength} bytes, decrypting`);
    const decrypted = decryptAesEcb(encrypted, key);
    logger.debug(`${label}: decrypted ${decrypted.length} bytes`);
    return decrypted;
}
export async function downloadPlainCdnBuffer(encryptedQueryParam, cdnBaseUrl, label, fullUrl) {
    let url;
    if (fullUrl) {
        url = fullUrl;
    } else if (ENABLE_CDN_URL_FALLBACK) {
        url = buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl);
    } else {
        throw new Error(`${label}: fullUrl is required (CDN URL fallback is disabled)`);
    }
    logger.debug(`${label}: fetching url=${url}`);
    return fetchCdnBytes(url, label);
}


//# sourceURL=dsh-wechat/src/wechat/cdn/pic-decrypt.ts