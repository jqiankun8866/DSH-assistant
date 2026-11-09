import { shouldForwardUserMessage } from './dsh/message-forwarding.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { AgentRuntime } from './dsh/agent-runtime.js';
import { contextMaintenance } from './dsh/context-maintenance.mjs';
import { WechatInteraction } from './dsh/interaction.js';
import { startWeixinBridge } from './bridge/weixin-bridge.js';
import { resolveStateDir } from './wechat/storage/state-dir.js';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { nativeMemeAnalyzer } from './assistant/meme-vision.mjs';
import { nativeTextRequest, nativeMemeSelector } from './assistant/meme-selector.mjs';
import { UsageMeter } from './assistant/usage-meter.mjs';
import { AssistantService } from './assistant/service.mjs';
import { startNativeTaskBridge } from './assistant/native-tasks.mjs';
import { NativeScheduleDelivery } from './dsh/native-delivery.mjs';
import { logger } from './wechat/util/logger.js';
export { Config } from './config.js';
export const name = 'im-weixin';
export const inject = [
    'agents'
];
export function apply(ctx, config) {
    if (config.stateDir) {
        process.env.DSH_WECHAT_STATE_DIR = config.stateDir;
    }
    const cwd = config.cwd ?? join(resolveStateDir(), 'workspace');
    mkdirSync(cwd, {
        recursive: true
    });
    const locationRoot = join(homedir(), '.dsh-plugin-wechat', 'workspace', '.assistant');
    mkdirSync(locationRoot, {
        recursive: true
    });
    writeFileSync(join(locationRoot, 'location.json'), JSON.stringify({
        root: join(cwd, '.assistant')
    }));
    const interaction = new WechatInteraction();
    let usageMeter;
    const observeUsage = (value)=>usageMeter?.record(value);
    const memeTextRequest = nativeTextRequest(ctx, ()=>({
            provider: config.provider,
            model: config.model
        }), (content)=>createUserMessage({
            content,
            source: {
                kind: 'meme-selection'
            }
        }), observeUsage);
    const assistant = new AssistantService({
        root: join(cwd, '.assistant'),
        memeSelector: nativeMemeSelector(memeTextRequest),
        memeAnalyzer: nativeMemeAnalyzer(ctx, ()=>({
                provider: config.provider,
                model: config.model
            }), (content)=>createUserMessage({
                content,
                source: {
                    kind: 'meme-index'
                }
            }), observeUsage),
        sendFile: (sessionId, path)=>interaction.sendFile(sessionId, path),
        onError: (error)=>logger.error(`assistant scheduler: ${String(error)}`)
    });
    assistant.memeTextRequest = memeTextRequest;
    assistant.usageMeter = usageMeter = new UsageMeter(assistant.engine.db);
    const runtime = new AgentRuntime(ctx, {
        provider: config.provider,
        model: config.model,
        maxTokens: config.maxTokens
    }, cwd, config.sessionTitle ?? '微信', (sessionId, path)=>interaction.sendFile(sessionId, path), assistant);
    const nativeDelivery = new NativeScheduleDelivery(assistant);
    ctx.on('agent/created', async ({ agent })=>{
        if (runtime.owns(agent.id)) await runtime.prepareAgent(agent);
    });
    ctx.on('approval/request', (req, next)=>{
        if (!runtime.owns(req.agent.id)) return next();
        return interaction.askApproval(req);
    }, {
        prepend: true
    });
    ctx.on('session/event', (session, event)=>{
        if (!runtime.owns(session.id)) return;
        if (event.type === 'user/message' && event.data.source?.kind === 'schedule') runtime.prepareLive(session.id);
        const nativeTurn = nativeDelivery.active(String(session.id)) || event.type === 'user/message' && event.data.source?.kind === 'schedule';
        nativeDelivery.event(String(session.id), event);
        if (event.type === 'user/message') {
            const fromWechat = runtime.isWechatMessage(String(event.data.id));
            if (shouldForwardUserMessage(event.data, {
                fromWechat,
                scheduled: runtime.isScheduled(String(session.id))
            })) {
                interaction.forwardToWechat(String(session.id), event.data);
            }
        }
        if (!nativeTurn && !runtime.isScheduled(String(session.id))) interaction.onSessionEvent(String(session.id), event);
    });
    ctx.effect(()=>{
        const stop = startWeixinBridge(ctx, config, runtime, interaction);
        const nativeBridge = startNativeTaskBridge(assistant, ()=>ctx.get('schedule'), contextMaintenance(ctx, runtime));
        nativeBridge.catch((error)=>logger.error(`native task bridge: ${String(error)}`));
        assistant.start();
        return async ()=>{
            stop();
            await nativeBridge.then((close)=>close()).catch(()=>{});
            await nativeDelivery.close();
            await assistant.stop();
            interaction.dispose();
            await runtime.dispose();
            await assistant.close();
        };
    }, 'im-weixin: weixin bridge');
}


//# sourceURL=dsh-wechat/src/index.ts