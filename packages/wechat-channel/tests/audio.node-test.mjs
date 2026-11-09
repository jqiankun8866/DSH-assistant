import { test } from 'node:test'; import assert from 'node:assert/strict'; import { mkdtemp, rm, readdir } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const validateWave = process.env.DSH_WAVE_VALIDATOR ? (await import(pathToFileURL(process.env.DSH_WAVE_VALIDATOR).href)).validateWave : (audio) => {
 assert.equal(audio.toString('ascii', 12, 16), 'fmt '); assert.equal(audio.readUInt32LE(16), 16);
 assert.equal(audio.readUInt16LE(20), 1); assert.equal(audio.readUInt16LE(22), 1);
 assert.equal(audio.readUInt32LE(24), 16000); assert.equal(audio.readUInt32LE(28), 32000);
 assert.equal(audio.readUInt16LE(32), 2); assert.equal(audio.readUInt16LE(34), 16);
 assert.equal(audio.toString('ascii', 36, 40), 'data'); assert.equal(audio.readUInt32LE(40), audio.length - 44);
 assert.equal(audio.readUInt32LE(4), audio.length - 8);
};
import { transcribeMedia } from '../lib/bridge/audio-processing.js';
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'; const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
test('actual ffmpeg audio extraction, limits, transcription and cleanup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'speech-test-'));try {
 const file=join(root,'sample.m4a');execFileSync(ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','sine=frequency=440:duration=2','-c:a','aac',file],{windowsHide:true});
 const config={ffmpegPath:ffmpeg,ffprobePath:ffprobe};
 const service={resolve:(spec)=>{validateWave(spec.audio, 120);assert.equal(spec.providerId,'sensevoice-local');assert.equal(Buffer.from(spec.audio).toString('ascii',0,4),'RIFF');return spec},transcribe:async()=>({text:'test transcript'})};
 assert.match(await transcribeMedia(file,root,service,config),/test transcript/);
 await assert.rejects(transcribeMedia(file,root,service,{...config,audioMaxSeconds:1}),/时长/);
 await assert.rejects(transcribeMedia(file,root,undefined,config),/未启用/);
 await assert.rejects(transcribeMedia(file,root,{...service,transcribe:async()=>{throw new Error('inference failed')}},config),/inference failed/);
 assert.deepEqual(await readdir(root),['sample.m4a']);
 }finally{await rm(root,{recursive:true,force:true})}
});
