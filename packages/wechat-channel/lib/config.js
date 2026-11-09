import z from '@deepseek-ai/schemastery';
export const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
export const Config = z.object({
    prepareLocalSpeech: z.boolean().default(false),
    audioMaxSeconds: z.number().min(1).max(1800).default(1800),
    cdnBaseUrl: z.string().default('https://novac2c.cdn.weixin.qq.com/c2c'),
    ffmpegPath: z.string().default('ffmpeg'),
    ffprobePath: z.string().default('ffprobe'),
    videoFrameCount: z.number().step(1).min(1).max(12).default(6),
    stateDir: z.string(),
    baseUrl: z.string().default(DEFAULT_BASE_URL),
    provider: z.string(),
    model: z.string(),
    maxTokens: z.number().step(1).min(1),
    dmScope: z.union([
        'per-peer',
        'per-account-channel-peer'
    ]).default('per-account-channel-peer'),
    replyErrorAsText: z.boolean().default(true),
    cwd: z.string(),
    sessionTitle: z.string().default('微信')
});


//# sourceURL=dsh-wechat/src/config.ts