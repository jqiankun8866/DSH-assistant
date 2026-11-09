const assert=require('node:assert/strict');
const {yamlParser}=require('./validate-overlay.cjs');
const {pruneLegacy}=require('./wechat-preset.cjs');
const resources=process.argv[2],yaml=yamlParser(resources);
const rows=[{insert:[
 {id:'assistant-personal-skills-20261104-120000',name:'old'},
 {id:'user-plugin',name:'keep',config:{value:'unchanged'}},
 {id:'assistant-office-skills',name:'duplicate-office'},
 {id:'wechat-meme-adapter-v2',name:'old-meme'}
]},{id:'assistant-wechat-preset',name:'old-preset'},
{id:'unrelated',config:{text:'assistant-office-skills is just text'}}];
const clean=yaml.load(pruneLegacy(resources,yaml.dump(rows),true));
assert.deepEqual(JSON.parse(JSON.stringify(clean)),[{insert:[rows[0].insert[1]]},rows[2]]);
assert.equal(pruneLegacy(resources,yaml.dump(clean),true),yaml.dump(clean));
console.log('Managed overlay: unrelated siblings retained; known legacy entries removed; idempotent.');
const {inspect}=require('./deployment-audit.cjs');
const audit=inspect([{insert:[{id:'assistant-weixin-runtime-old',name:'/missing',disabled:true},{id:'assistant-weixin-runtime-new',name:'/profile/assistant-plugins/current/lib/index.js'},{id:'assistant-personal-skills-new',name:'/missing-skills'}]},{id:'other'},{id:'other'}],p=>p.includes('/current/'));
assert.equal(audit.runtimeCount,1);assert.equal(audit.entryPresent,true);assert.equal(audit.protectedFromPnpm,true);
assert.deepEqual(audit.missingModules,['assistant-personal-skills-new']);assert.deepEqual(audit.duplicateIds,['other']);
console.log('Deployment audit: disabled entries ignored; missing modules and duplicates detected.');
