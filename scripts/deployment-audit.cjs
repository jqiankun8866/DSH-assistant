const fs=require('node:fs'),path=require('node:path');
const {yamlParser}=require('./validate-overlay.cjs');
function inspect(rows,exists=fs.existsSync){
 const active=rows.flatMap(r=>r.disabled?[]:r.insert??[r]).filter(r=>!r.disabled);
 const managed=active.filter(r=>/^assistant-|^wechat-meme-adapter/.test(r.id??''));
 const runtimes=managed.filter(r=>r.id.startsWith('assistant-weixin-runtime'));
 const skills=managed.filter(r=>r.id.startsWith('assistant-personal-skills'));
 return {configured:runtimes.length===1,entryPresent:runtimes.length===1&&exists(runtimes[0].name),
  protectedFromPnpm:runtimes.length===1&&runtimes[0].name.replaceAll('\\','/').includes('/assistant-plugins/'),
  runtimeCount:runtimes.length,personalSkillsCount:skills.length,
  duplicateIds:active.map(r=>r.id).filter((id,i,a)=>id&&a.indexOf(id)!==i),
  obsoleteRegistrations:managed.filter(r=>r.id==='assistant-office-skills'||r.id.startsWith('wechat-meme-adapter')).map(r=>r.id),
  missingModules:managed.filter(r=>/^[A-Za-z]:[\\/]|^\//.test(r.name??'')&&!exists(r.name)).map(r=>r.id),
  runtimeEntry:runtimes.length===1?runtimes[0].name:null};
}
function audit(profile,resources){
 const rows=yamlParser(resources).load(fs.readFileSync(path.join(profile,'cordis.patch.yml'),'utf8'));
 const result=inspect(rows);
 const pointer=path.join(profile,'assistant-deployment.json');
 const state=fs.existsSync(pointer)?JSON.parse(fs.readFileSync(pointer,'utf8')):null;
 result.pointerMatches=!!state&&!!result.runtimeEntry&&path.resolve(result.runtimeEntry)===path.resolve(state.stage,'lib/index.js');
 result.version=state?.version??null;
 delete result.runtimeEntry;
 return result;
}
module.exports={inspect,audit};
