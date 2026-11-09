import { logger } from "../util/logger.js";
import { sendMessageWeixin } from "./send.js";
export async function sendWeixinErrorNotice(params) {
    if (!params.contextToken) {
        logger.warn(`sendWeixinErrorNotice: no contextToken for to=${params.to}, sending without context`);
    }
    try {
        await sendMessageWeixin({
            to: params.to,
            text: params.message,
            opts: {
                baseUrl: params.baseUrl,
                token: params.token,
                contextToken: params.contextToken,
                ...params.runId ? {
                    runId: params.runId
                } : {}
            }
        });
        logger.debug(`sendWeixinErrorNotice: sent to=${params.to}`);
    } catch (err) {
        params.errLog(`[weixin] sendWeixinErrorNotice failed to=${params.to}: ${String(err)}`);
    }
}


//# sourceURL=dsh-wechat/src/wechat/messaging/error-notice.ts