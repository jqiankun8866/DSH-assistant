export const ENABLE_CDN_URL_FALLBACK = true;
export function buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl) {
    return `${cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`;
}
export function buildCdnUploadUrl(params) {
    return `${params.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(params.uploadParam)}&filekey=${encodeURIComponent(params.filekey)}`;
}


//# sourceURL=dsh-wechat/src/wechat/cdn/cdn-url.ts