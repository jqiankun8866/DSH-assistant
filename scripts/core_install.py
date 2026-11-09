"""Core installer helpers. No file writes on import."""
import re
from pathlib import Path

def deployment_path(profile, stamp):
    # pnpm moves unmanaged directories in node_modules to .ignored.
    # Keep our complete, versioned plugin outside its managed dependency tree.
    if not re.fullmatch(r'\d{8}-\d{6}-\d{6}', stamp):
        raise ValueError('Invalid deployment timestamp')
    return profile/'assistant-plugins'/('dsh-wechat-capabilities-'+stamp)

def wechat_preset(resources, node):
    import subprocess
    return subprocess.run([str(node),str(Path(__file__).with_name('wechat-preset.cjs')),str(resources)],check=True,capture_output=True,text=True,encoding='utf-8').stdout

def prune_legacy(content, resources, node):
    if not re.search(r'\bid: wechat-meme-adapter(?:-v\d+)?\b',content):return content
    import subprocess
    return subprocess.run([str(node),str(Path(__file__).with_name('wechat-preset.cjs')),str(resources),'--prune-legacy'],input=content,check=True,capture_output=True,text=True,encoding='utf-8').stdout

def prune_managed(content, resources, node):
    import subprocess
    return subprocess.run([str(node),str(Path(__file__).with_name('wechat-preset.cjs')),str(resources),'--prune-managed'],input=content,check=True,capture_output=True,text=True,encoding='utf-8').stdout

def install_runtime_dependencies(stage, node):
    """Install required media packages before publishing the live configuration."""
    import json, shutil, subprocess
    candidates=npm_candidates(node)
    npm=next((x for x in candidates if x.is_file()),None)
    if not npm: raise RuntimeError('npm CLI missing; cannot install required SILK audio decoder')
    deps=stage/'runtime-dependencies';deps.mkdir(parents=True,exist_ok=True)
    (deps/'package.json').write_text(json.dumps({'name':'dsh-wechat-runtime-dependencies','private':True,'dependencies':{'silk-wasm':'3.7.1','qrcode-terminal':'0.12.0'}}),encoding='utf-8')
    subprocess.run([str(node),str(npm),'install','--prefix',str(deps),'--ignore-scripts','--no-audit','--no-fund'],check=True)
    shutil.copytree(deps/'node_modules',stage/'node_modules',dirs_exist_ok=True)
    subprocess.run([str(node),'-e',"const r=require('module').createRequire(require('path').resolve(process.argv[1],'package.json'));const s=r('silk-wasm');(async()=>{const x=await s.encode(Buffer.alloc(4800),24000);const y=await s.decode(x.data,24000);if(!y.data.length)throw Error('SILK codec verification failed')})().catch(e=>{console.error(e);process.exitCode=1});",str(stage)],check=True)
    # The copied runtime is verified; the temporary npm tree is not loaded.
    shutil.rmtree(deps)

def npm_candidates(node):
    # DSH ships a standalone Node binary, which need not bundle npm.
    import shutil, os
    candidates=[node.parent/'node_modules/npm/bin/npm-cli.js',node.parent.parent/'lib/node_modules/npm/bin/npm-cli.js']
    for command in ['npm.cmd','npm','node.exe','node']:
        executable=shutil.which(command)
        if executable:
            base=Path(executable).parent
            candidates.extend([base/'node_modules/npm/bin/npm-cli.js',base.parent/'lib/node_modules/npm/bin/npm-cli.js'])
    if os.environ.get('NPM_CLI'):candidates.insert(0,Path(os.environ['NPM_CLI']))
    return list(dict.fromkeys(candidates))

def plan_config(content, stage, stamp, resources, node):
    entry=(stage/'lib/index.js').as_posix()
    # DSH may fold quoted paths across physical lines. Replace the whole scalar.
    name_value = r"""[ \t]*(?:"(?:[^"\\]|\\[\s\S])*"|'(?:[^']|'')*'|[^ \t'"\r\n][^\r\n]*)[ \t]*(?:#[^\r\n]*)?"""
    pattern=r'(?m)(    - id: assistant-weixin-runtime(?:-[a-z]+)?(?:-\d{8}-\d{6})?\r?\n(?:[ \t]*\r?\n)*[ \t]+name:)'+name_value
    matches=list(re.finditer(pattern,content))
    if len(matches)>1: raise ValueError('Ambiguous assistant entries')
    if matches:
        content=re.sub(pattern,lambda m:m.group(1)+' "'+entry+'"',content)
        content=re.sub(r'assistant-weixin-runtime(?:-[a-z]+)?(?:-\d{8}-\d{6})?','assistant-weixin-runtime-'+stamp,content)
    else:
        blocks=list(re.finditer(r'(?ms)^- id: im-weixin\r?\n.*?(?=^- |\Z)',content))
        if len(blocks)!=1: raise ValueError('Initialize and log into the DSH WeChat profile first; expected one im-weixin entry')
        match=blocks[0];block=match.group(0).rstrip()
        if not re.search(r'(?m)^  name:',block): raise ValueError('Upstream WeChat entry has no module name')
        if re.search(r'(?m)^  disabled:\s*true',block): raise ValueError('Upstream WeChat disabled without assistant; repair profile first')
        block=re.sub(r'^- id: im-weixin','- id: assistant-weixin-runtime-'+stamp,block)
        block=re.sub(r'(?m)^  name:'+name_value,lambda m:'  name: "'+entry+'"',block)
        replacement='- id: im-weixin\n  disabled: true\n\n- insert:\n'+'\n'.join('    '+line for line in block.splitlines())+'\n\n'
        content=content[:match.start()]+replacement+content[match.end():]
    # Rewrite only our managed providers; unrelated configuration is preserved.
    # Parse entries rather than removing entire insert blocks: another plugin
    # may share a block with our old skills provider.
    content=prune_managed(content,resources,node)
    # Only desktop is supported; its native dsh-office provider is reused.
    content+='\n- insert:\n    - id: assistant-personal-skills-'+stamp+'\n      name: "'+(stage/'lib/assistant/skills-plugin.mjs').as_posix()+'"\n      config:\n        root: "'+(stage/'skills').as_posix()+'"\n'
    content+='\n'+wechat_preset(resources,node)
    return prune_legacy(content,resources,node)
