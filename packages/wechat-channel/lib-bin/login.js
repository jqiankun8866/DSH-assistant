import { displayQRCode, startWeixinLoginWithQr, waitForWeixinLogin } from '../lib/wechat/auth/login-qr.js';
import { registerWeixinAccountId, saveWeixinAccount } from '../lib/wechat/auth/accounts.js';
import { resolveWeixinStateDir } from '../lib/wechat/storage/state-dir.js';
import { logger } from '../lib/wechat/util/logger.js';
const FIXED_BASE_URL = 'https://ilinkai.weixin.qq.com';
async function main() {
    const start = await startWeixinLoginWithQr({
        apiBaseUrl: FIXED_BASE_URL
    });
    if (!start.qrcodeUrl) {
        logger.error(start.message);
        process.exitCode = 1;
        return;
    }
    process.stdout.write(start.message + '\n');
    await displayQRCode(start.qrcodeUrl);
    const result = await waitForWeixinLogin({
        sessionKey: start.sessionKey,
        apiBaseUrl: FIXED_BASE_URL,
        verbose: true
    });
    if (result.alreadyConnected) {
        process.stdout.write(result.message + '\n');
        return;
    }
    if (!result.connected) {
        logger.error(result.message);
        process.exitCode = 1;
        return;
    }
    const accountId = result.accountId;
    const botToken = result.botToken;
    if (!accountId || !botToken) {
        logger.error('登录成功但服务器未返回 accountId/botToken');
        process.exitCode = 1;
        return;
    }
    saveWeixinAccount(accountId, {
        token: botToken,
        baseUrl: result.baseUrl,
        userId: result.userId
    });
    registerWeixinAccountId(accountId);
    process.stdout.write(`✅ 登录成功：accountId=${accountId}\n`);
    process.stdout.write(`状态目录：${resolveWeixinStateDir()}\n`);
}
main().catch((error)=>{
    logger.error(`login failed: ${String(error)}`);
    process.exitCode = 1;
});


//# sourceURL=dsh-wechat/bin/login.ts