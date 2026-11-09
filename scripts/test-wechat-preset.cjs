const assert=require('node:assert/strict');
const {buildPreset,pruneLegacy}=require('./wechat-preset.cjs');
const {yamlParser,readAsset}=require('./validate-overlay.cjs');
const resources=process.argv[2],yaml=yamlParser(resources);
for(const platform of ['win32','darwin']) {
 const row=yaml.load(buildPreset(resources,platform))[0].insert[0];
 assert.equal(row.config.id,'wechat-assistant');assert.equal(row.id,'assistant-wechat-preset');
 const plugins=row.config.plugins;
 assert.match(plugins.find(p=>p.id==='persona').config.prefix,/私人助理/);
 assert.equal(plugins.find(p=>p.id==='tool-bash').disabled,platform==='win32');
 assert.equal(plugins.find(p=>p.id==='tool-pwsh').disabled,platform!=='win32');
 const basic=plugins.find(p=>p.id==='compaction').config.find(p=>p.id==='compaction-basic');
 assert.equal(basic.config.modelPolicies[0].thresholdRatio,0.12);
 assert.equal(basic.config.auto,true);
 for(const id of ['skill-filesystem','tool-skill','tool-fs','tool-web','tool-jobs']) assert(plugins.some(p=>p.id===id),id);
 for(const id of ['tool-schedule','delegation','planning','tool-goal','tool-todo']) assert(!plugins.some(p=>p.id===id),id);
}
assert.match(readAsset(resources,'dsh/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml'),/coding agent/);
console.log('Native preset: private role, native tools, Windows/Mac selectors, original unchanged');
const legacy='- insert:\n    - id: wechat-meme-adapter-v3\n      name: old\n    - id: unrelated\n      name: keep\n      config:\n        value: preserved\n- id: other\n  name: keep-too\n';
const clean=yaml.load(pruneLegacy(resources,legacy));
assert.equal(clean[0].insert.length,1);assert.equal(clean[0].insert[0].config.value,'preserved');assert.equal(clean[1].id,'other');
assert.equal(pruneLegacy(resources,pruneLegacy(resources,legacy)),pruneLegacy(resources,legacy));
console.log('Legacy meme adapter removed structurally; neighboring entries preserved; idempotent');
