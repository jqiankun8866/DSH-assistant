import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { silkToWav } from '../wechat/media/silk-transcode.js';
import { join } from 'node:path';
const exec = promisify(execFile);
export async function transcribeMedia(path, root, service, config) {
    if (!service) throw new Error('本地语音识别服务未启用');
    if (/\.silk$/i.test(path)) {
        const wav = await silkToWav(await readFile(path));
        if (!wav) throw new Error('微信语音解码失败，请检查已安装的 silk-wasm 依赖或音频是否损坏；本地识别服务尚未处理该音频');
        const decoded = await mkdtemp(join(root, 'silk-'));
        try {
            const wavPath = join(decoded, 'voice.wav');
            await writeFile(wavPath, wav);
            return await transcribeMedia(wavPath, root, service, config);
        } finally{
            await rm(decoded, {
                recursive: true,
                force: true
            });
        }
    }
    const settings = {
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 1024 * 1024
    };
    const probe = await exec(config.ffprobePath ?? 'ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type',
        '-of',
        'json',
        path
    ], settings);
    const info = JSON.parse(probe.stdout);
    if (!info.streams?.some((s)=>s.codec_type === 'audio')) return '该媒体没有音轨。';
    const seconds = Number(info.format?.duration);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > (config.audioMaxSeconds ?? 1800)) throw new Error('音频时长无法读取或超过处理上限（默认 30 分钟）');
    const folder = await mkdtemp(join(root, 'audio-'));
    try {
        await exec(config.ffmpegPath ?? 'ffmpeg', [
            '-nostdin',
            '-v',
            'error',
            '-i',
            path,
            '-map',
            '0:a:0',
            '-vn',
            '-ac',
            '1',
            '-ar',
            '16000',
            '-c:a',
            'pcm_s16le',
            '-fflags',
            '+bitexact',
            '-map_metadata',
            '-1',
            '-f',
            'segment',
            '-segment_format_options',
            'fflags=+bitexact',
            '-segment_time',
            '60',
            '-reset_timestamps',
            '1',
            join(folder, '%04d.wav')
        ], settings);
        const chunks = (await readdir(folder)).filter((p)=>p.endsWith('.wav')).sort();
        if (!chunks.length || chunks.length > 31) throw new Error('音频分段异常');
        const output = [];
        for (const [index, chunk] of chunks.entries()){
            const audio = await readFile(join(folder, chunk));
            if (audio.length > 4 * 1024 * 1024) throw new Error('音频分段超过识别大小限制');
            const spec = service.resolve({
                audio,
                providerId: 'sensevoice-local',
                language: 'auto'
            });
            const result = await service.transcribe(spec, AbortSignal.timeout(180000));
            if (typeof result.text !== 'string') throw new Error('转写服务返回无效结果');
            if (result.text.trim()) output.push(`[${index * 60}秒起] ${result.text.trim()}`);
        }
        return output.join('\n') || '未识别到清晰语音。';
    } finally{
        await rm(folder, {
            recursive: true,
            force: true
        });
    }
}


//# sourceURL=dsh-wechat/src/bridge/audio-processing.ts