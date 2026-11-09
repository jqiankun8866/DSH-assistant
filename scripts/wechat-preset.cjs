// Derive the installed host's capabilities; never replace the user's desktop preset.
const {readAsset,yamlParser}=require('./validate-overlay.cjs');
function buildPreset(resources, platform=process.platform) {
 const yaml=yamlParser(resources);
 const source=readAsset(resources,'dsh/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml')
  .replace(/!!js process\.platform === 'win32'/g,String(platform==='win32'))
  .replace(/!!js process\.platform !== 'win32'/g,String(platform!=='win32'));
 const original=yaml.load(source).flatMap(row=>row.insert??[]).find(row=>row.config?.id==='standard');
 if(!original)throw Error('Installed DSH standard preset is unavailable');
 const row=structuredClone(original);
 row.id='assistant-wechat-preset';row.config.id='wechat-assistant';
 row.config.name='微信私人助理';row.config.order=50;
 // Keep native execution/office/web services; expose one task entry to WeChat.
 // These coding orchestration tools add schemas and overlapping task semantics.
 const desktopOnly=new Set(['delegation','planning','tool-goal','command-goal','tool-todo','tool-schedule']);
 row.config.plugins=row.config.plugins.filter(p=>!desktopOnly.has(p.id));
 const persona=row.config.plugins.find(p=>p.id==='persona');
 const compact=row.config.plugins.find(p=>p.id==='compaction')?.config?.find(p=>p.id==='compaction-basic');
 if(!persona||!compact)throw Error('Installed DSH preset layout changed; no configuration written');
 persona.config={...persona.config,prefix:'你是大肥鱼，用户的私人助理。根据当前请求与持久偏好办事、接话；表达风格由下方微信人设决定。'};
 compact.config={auto:true,thresholdRatio:0.5,retainRatio:0.08,headroomTokens:8192,maxTokens:8192,compactionRetries:0,
  modelPolicies:[{provider:'deepseek-account',model:'deepseek-flash',thresholdRatio:0.12,retainRatio:0.02}]};
 return yaml.dump([{insert:[row]}],{lineWidth:-1,noRefs:true});
}
function pruneLegacy(resources,content,managed=false){
 const legacy=id=>/^wechat-meme-adapter(?:-v\d+)?$/.test(id??'') || managed && /^(?:assistant-personal-skills(?:-\d{8}-\d{6})?|assistant-office-skills|assistant-wechat-preset)$/.test(id??'');
 const yaml=yamlParser(resources),rows=yaml.load(content);
 if(!Array.isArray(rows))throw Error('Overlay must be a list');
 let changed=false;
 const out=rows.flatMap(row=>{
  if(legacy(row.id)){changed=true;return []}
  if(!Array.isArray(row.insert))return [row];
  const insert=row.insert.filter(entry=>!legacy(entry.id));
  if(insert.length===row.insert.length)return [row];
  changed=true;return insert.length?[{...row,insert}]:[];
 });
 return changed?yaml.dump(out,{lineWidth:-1,noRefs:true}):content;
}
module.exports={buildPreset,pruneLegacy};
if(require.main===module)process.stdout.write(['--prune-legacy','--prune-managed'].includes(process.argv[3])?pruneLegacy(process.argv[2],require('node:fs').readFileSync(0,'utf8'),process.argv[3]==='--prune-managed'):buildPreset(process.argv[2]));
