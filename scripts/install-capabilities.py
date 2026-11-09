"""Install or upgrade the core pack in an initialized DSH WeChat profile. Default: read-only prerequisite check."""
import argparse, datetime, json, os, re, shutil, subprocess, sys
from core_install import plan_config, install_runtime_dependencies, deployment_path
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--apply',action='store_true')
desktop_profile=Path.home()/'.dsh/profiles/desktop'
desktop_patch=desktop_profile/'cordis.patch.yml'
unified=desktop_patch.exists() and '# WeChat and desktop share one agent owner.' in desktop_patch.read_text(encoding='utf-8-sig')
p.add_argument('--profile',type=Path,default=desktop_profile)
p.add_argument('--resources',type=Path,default=next((x for x in [Path(os.environ.get('LOCALAPPDATA',''))/'Programs/DeepSeek Harness/resources',Path.home()/'AppData/Local/Programs/DeepSeek Harness/resources'] if x.exists()),Path.home()/'AppData/Local/Programs/DeepSeek Harness/resources'))
p.add_argument('--node',type=Path)
p.add_argument('--python',type=Path)
p.add_argument('--initial-patch',type=Path,help='Prepared first-install config; live patch remains unchanged until checks pass')
a=p.parse_args(); root=Path(__file__).resolve().parents[1]
if a.profile.resolve()==(Path.home()/'.dsh/profiles/wechat').resolve(): raise SystemExit('Native reminders require the desktop host. Install WeChat in the desktop profile; standalone wechat is no longer supported.')
patch=a.profile/'cordis.patch.yml'
runtime=Path.home()/'.dsh/dsh-runtimes/dsh-primary-runtime/dependencies'
node=a.node or (runtime/('node/bin/node.exe' if sys.platform=='win32' else 'node/bin/node'))
python=a.python or (runtime/('python/python.exe' if sys.platform=='win32' else 'python/bin/python3'))
if sys.platform=='darwin' and not a.resources.exists():
 for candidate in [Path('/Applications/DeepSeek Harness.app/Contents/Resources'),Path.home()/'Applications/DeepSeek Harness.app/Contents/Resources']:
  if candidate.exists(): a.resources=candidate;break
required=[patch,node,python,a.resources/'runtime/office-skills/office-docx/SKILL.md',a.resources/'runtime/office-skills/office-pptx/SKILL.md',a.resources/'runtime/office-skills/office-xlsx/SKILL.md',a.resources/'app.asar.unpacked/dsh/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js']
missing=[str(x) for x in required if not x.exists()]
if missing: raise SystemExit('Missing prerequisites (install DSH, its runtimes and WeChat profile first): '+json.dumps(missing))
live_content=patch.read_text(encoding='utf-8-sig')
input_patch=a.initial_patch or patch
subprocess.run([str(node),str(root/'scripts/validate-overlay.cjs'),str(a.resources),str(input_patch)],check=True)
subprocess.run([str(node),str(root/'scripts/test-managed-overlay.cjs'),str(a.resources)],check=True)
content=input_patch.read_text(encoding='utf-8-sig')
# Validate first-install or upgrade shape before tests or writes.
plan_config(content,a.profile/'node_modules/preflight-only','20000101-000000',a.resources,node)
version=subprocess.check_output([str(node),'-p','process.versions.node'],text=True).strip()
if int(version.split('.')[0])<24: raise SystemExit('Node 24 or newer is required')
subprocess.run([str(python),'-c','import docx,pptx,openpyxl'],check=True)
print('Prerequisites OK. Office, health and preferences available. Reminders use the desktop native schedule service; no personal data or reminders created.')
if not a.apply: raise SystemExit(0)
# All checks and build precede the single live configuration switch.
subprocess.run([str(node),str(root/'scripts/build-channel.mjs')],check=True)
tests=sorted((root/'packages/wechat-channel/tests').glob('*.node-test.mjs'))
subprocess.run([str(node),'--test','--test-concurrency=1',*[str(x) for x in tests]],check=True)
subprocess.run([str(python),'-m','unittest','discover','-s',str(root/'scripts'),'-p','test_core_install.py'],check=True)
subprocess.run([str(python),'-m','unittest','discover','-s',str(root/'scripts'),'-p','test_xhs_setup.py'],check=True)
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
stage=deployment_path(a.profile,stamp)
backup=root/('runtime/capabilities-'+stamp);backup.mkdir(parents=True)
shutil.copy2(patch,backup/'cordis.patch.yml')
# Publish a complete coherent build; never mix an old scheduler/entry with new tools.
shutil.copytree(root/'packages/wechat-channel/lib',stage/'lib')
for name in ['package.json','LICENSE']:
 shutil.copy2(root/'packages/wechat-channel'/name,stage/name)
shutil.copytree(root/'skills',stage/'skills')
shutil.copytree(root/'packages/wechat-channel/assets',stage/'assets')
panel_script=(root/'scripts/control-panel.mjs').read_text(encoding='utf-8').replace('../packages/wechat-channel/src/assistant/','../lib/assistant/')
(stage/'scripts').mkdir()
(stage/'scripts/control-panel.mjs').write_text(panel_script,encoding='utf-8')
install_runtime_dependencies(stage,node)
for file in (stage/'lib').rglob('*'):
 if file.suffix in ['.js','.mjs']: subprocess.run([str(node),'--check',str(file)],check=True)
idstamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
updated=plan_config(content,stage,idstamp,a.resources,node)
# Never overwrite a concurrent edit to the profile.
if patch.read_text(encoding='utf-8-sig')!=live_content: raise SystemExit('Configuration changed concurrently; staged files retained, live config unchanged.')
tmp=patch.with_suffix('.yml.next');tmp.write_text(updated,encoding='utf-8')
try:
 subprocess.run([str(node),str(root/'scripts/validate-overlay.cjs'),str(a.resources),str(tmp)],check=True)
 if patch.read_text(encoding='utf-8-sig')!=live_content:raise SystemExit('Configuration changed during validation; live config unchanged.')
 os.replace(tmp,patch)
finally:
 tmp.unlink(missing_ok=True)
meta={'stage':str(stage),'backup':str(backup),'patch':str(patch),'restartRequired':True,'scope':'office-health-preferences; no simulator activation'}
pointer=a.profile/'assistant-deployment.json'
pointer_tmp=pointer.with_suffix('.json.next')
pointer_tmp.write_text(json.dumps({'stage':str(stage),'version':json.loads((root/'package.json').read_text(encoding='utf-8'))['version']}),encoding='utf-8')
os.replace(pointer_tmp,pointer)
(backup/'deployment.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
if a.profile.resolve() in [(Path.home()/'.dsh/profiles/wechat').resolve(),desktop_profile.resolve()]:
 (root/'runtime/capabilities-deployment.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
print(json.dumps(meta));print('Restart/reload the WeChat profile to activate. Restore backup/cordis.patch.yml to roll back. User database unchanged.')
