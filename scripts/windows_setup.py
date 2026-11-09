"""Windows setup adapter; shares account-isolated core setup operations."""
import argparse,json,os,platform,shutil,subprocess,sys,tempfile
from pathlib import Path
from contextlib import closing
import mac_setup as core
from runtime_paths import assistant_root
core.PROFILE=core.HOME/'.dsh/profiles/desktop'

def env():
 local=Path(os.environ.get('LOCALAPPDATA',str(core.HOME/'AppData/Local')))
 resources=next((p for p in [Path(os.environ.get('DSH_RESOURCES','')) if os.environ.get('DSH_RESOURCES') else local/'Programs/DeepSeek Harness/resources',core.HOME/'AppData/Local/Programs/DeepSeek Harness/resources',Path(os.environ.get('ProgramFiles','C:/Program Files'))/'DeepSeek Harness/resources'] if (p/'app.asar.unpacked').exists()),None)
 node=core.choose([os.environ.get('DSH_NODE'),core.RUNTIME/'node/bin/node.exe',Path(os.environ.get('ProgramFiles','C:/Program Files'))/'nodejs/node.exe'],'node')
 python=core.choose([os.environ.get('DSH_PYTHON'),core.RUNTIME/'python/python.exe',sys.executable],'python')
 return resources,node,python

def chrome_exe():
 return core.choose([os.environ.get('CHROME_PATH'),Path(os.environ.get('ProgramFiles','C:/Program Files'))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('ProgramFiles(x86)','C:/Program Files (x86)'))/'Google/Chrome/Application/chrome.exe',core.HOME/'AppData/Local/Google/Chrome/Application/chrome.exe'],'chrome')

def npm_command():
 _,node,_=env()
 if not node:raise RuntimeError('缺少 Node 24')
 base=Path(node).parent
 system_npm=shutil.which('npm.cmd') or shutil.which('npm')
 cli=core.choose([base/'node_modules/npm/bin/npm-cli.js',base.parent/'node_modules/npm/bin/npm-cli.js',Path(system_npm).parent/'node_modules/npm/bin/npm-cli.js' if system_npm else None,Path(os.environ['NPM_CLI']) if os.environ.get('NPM_CLI') else None],None)
 if not cli:raise RuntimeError('缺少 npm-cli.js，请安装包含 npm 的 Node 24，或设置 NPM_CLI')
 return [node,cli]

def install_node_dependencies(folder):
 core.run(npm_command()+['install','--prefix',folder,'--omit=dev','--legacy-peer-deps','--ignore-scripts','--no-audit','--no-fund'])
 # npm treats these as optional; verify actual availability instead of reporting success blindly.
 _,node,_=env()
 core.run([node,'--input-type=module','-e',"await import('qrcode-terminal'); await import('silk-wasm'); console.log('QR/SILK dependencies ready')"],cwd=folder)

def doctor():
 app,node,python=env();checks={'system':platform.system(),'architecture':platform.machine(),'DSH':bool(app),'node24':False,'python':bool(python),'desktop_profile':(core.PROFILE/'cordis.patch.yml').exists(),'ffmpeg':bool(shutil.which('ffmpeg')),'ffprobe':bool(shutil.which('ffprobe')),'Chrome':bool(chrome_exe())}
 if node:
  try:checks['node24']=int(subprocess.check_output([node,'-p','process.versions.node'],text=True).strip().split('.')[0])>=24
  except Exception:pass
 if python:checks['office_python']=subprocess.run([python,'-c','import docx,pptx,openpyxl'],capture_output=True).returncode==0
 checks['native_office']=bool(app and (app/'runtime/office-skills/office-docx/SKILL.md').exists())
 checks['workspace_ready']=(assistant_root()/'assistant.sqlite').is_file()
 checks['windows_ocr']=ocr_ready()
 print(json.dumps(checks,ensure_ascii=False,indent=2));return checks

def xhs_browser_config():
 path=assistant_root()/'xhs-config.json'
 saved=json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {}
 config={key:saved[key] for key in ['port','userDataDir','chromePath'] if key in saved}
 config.setdefault('port',9222)
 config.setdefault('userDataDir',str(core.HOME/'.dsh-assistant-browser/xhs'))
 if type(config['port']) is not int or not 0<config['port']<65536:raise RuntimeError('小红书浏览器端口无效')
 folder=Path(config['userDataDir']).expanduser().resolve()
 if 'google/chrome/user data' in folder.as_posix().lower():raise RuntimeError('请使用小红书专用浏览器目录，不要使用日常 Chrome 个人资料')
 config['userDataDir']=str(folder)
 return config

def chrome():
 config=xhs_browser_config()
 exe=config.get('chromePath') or chrome_exe()
 if not exe:raise RuntimeError('先安装 Google Chrome')
 folder=Path(config['userDataDir']);folder.mkdir(parents=True,exist_ok=True)
 # Visible window is necessary for the user to log in.
 # Match the runtime's persisted profile/port so the login window cannot
 # silently open a second empty profile after an upgrade or custom install.
 subprocess.Popen([exe,'--remote-debugging-port='+str(config['port']),'--remote-debugging-address=127.0.0.1','--user-data-dir='+str(folder),'--no-first-run','--no-default-browser-check','https://www.xiaohongshu.com/explore'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 print('请在专用 Chrome 登录自己的 XHS，并保持浏览器运行。')

def ocr_ready():
 try:
  cmd="[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]::AvailableRecognizerLanguages.Count"
  result=subprocess.run(['powershell.exe','-NoProfile','-Command',cmd],capture_output=True,text=True,timeout=15)
  return result.returncode==0 and int(result.stdout.strip())>0
 except Exception:return False

def refresh_path():
 try:
  import winreg
  parts=[os.environ.get('PATH','')]
  for hive,key in [(winreg.HKEY_CURRENT_USER,'Environment'),(winreg.HKEY_LOCAL_MACHINE,r'SYSTEM\CurrentControlSet\Control\Session Manager\Environment')]:
   with winreg.OpenKey(hive,key) as k:parts.append(os.path.expandvars(winreg.QueryValueEx(k,'Path')[0]))
  parts.append(str(Path(os.environ.get('LOCALAPPDATA',''))/'Microsoft/WinGet/Links'))
  os.environ['PATH']=os.pathsep.join(parts)
 except OSError:pass

def winget_install(package):
 if not shutil.which('winget'):raise RuntimeError('缺少 Windows 应用安装程序 winget，无法自动安装 '+package+'；请在 Microsoft Store 更新“应用安装程序”后重试。')
 core.run(['winget','install','--id',package,'--exact','--source','winget','--accept-package-agreements','--accept-source-agreements','--disable-interactivity'])
 refresh_path()

def dependencies():
 _,node,python=env()
 if not python:raise RuntimeError('缺少 Python，请先初始化 DSH Python 运行环境')
 valid=False
 if node:
  try:valid=int(subprocess.check_output([node,'-p','process.versions.node'],text=True).strip().split('.')[0])>=24
  except Exception:pass
 if not valid:
  winget_install('OpenJS.NodeJS.LTS')
  candidate=Path(os.environ.get('ProgramFiles','C:/Program Files'))/'nodejs/node.exe'
  if candidate.exists():os.environ['DSH_NODE']=str(candidate)
  _,node,_=env()
  if not node or int(subprocess.check_output([node,'-p','process.versions.node'],text=True).strip().split('.')[0])<24:raise RuntimeError('Node 24 尚未就绪，请检查安装结果')
 npm_command()
 if subprocess.run([python,'-c','import docx,pptx,openpyxl'],capture_output=True).returncode:
  core.run([python,'-m','pip','install','-r',core.ROOT/'requirements-office.txt'])
 if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):winget_install('Gyan.FFmpeg')
 for exe in ['ffmpeg','ffprobe']:
  if not shutil.which(exe):raise RuntimeError(exe+' 安装后仍不可用，请关闭安装窗口后重试')
  subprocess.run([exe,'-version'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 if not chrome_exe():winget_install('Google.Chrome')
 if not chrome_exe():raise RuntimeError('Chrome 安装后未找到，请检查安装结果')
 print('办公、音视频及浏览器依赖已就绪。小红书无需另外安装 agent-browser。')

def one_click(*,noninteractive=False,provider=None,model=None):
 print('[1/4] 校验安装环境；账号、密钥不会写入检查报告。')
 app,_,_=env()
 if not app:raise RuntimeError('找不到 DSH resources 目录；在 DSH 内安装时请传入 --resources 实际路径，不代表 DSH 未安装。')
 if not (core.PROFILE/'cordis.patch.yml').exists():raise RuntimeError('找不到 desktop 配置：'+str(core.PROFILE/'cordis.patch.yml')+'；请先打开 DSH，或传入 --profile 实际 desktop 目录。')
 print('[2/4] 检查并补齐 Node、办公库、FFmpeg、Chrome（需要联网，可能出现系统安装许可窗口）。')
 dependencies()
 print('[3/4] 安装/升级能力包；备份原配置后切换。')
 install(noninteractive=noninteractive,provider=provider,model=model)
 print('[4/4] 安装基础图库并复查。')
 _,node,_=env()
 module=(core.ROOT/'packages/wechat-channel/lib/assistant/meme-library.mjs').as_uri()
 core.run([node,'--input-type=module','-e',"const m=await import(process.argv[1]); console.log('基础图库已就绪:',m.ensureMemeLibrary(process.argv[2]));",module,assistant_root().parent])
 checks=doctor()
 required=['DSH','node24','python','desktop_profile','ffmpeg','ffprobe','Chrome','office_python','native_office']
 if any(not checks.get(k) for k in required):raise RuntimeError('部署已执行，但环境复查未通过，请查看上方 false 项。')
 print('安装完成。请完整退出并重新打开 DSH。新用户在高级设置选 3 扫微信二维码；邮箱和小红书需自己的授权。')
 if not checks['windows_ocr']:print('可选功能未就绪：Windows OCR；自动识别表情文字需在系统语言设置安装 OCR。')
 print('语音转写还需要 DSH 的 sensevoice-local 服务和模型；安装完成不代表账号或语音模型已授权/就绪。')


def install(*,noninteractive=False,provider=None,model=None):
 app,node,python=env()
 if not app or not node or not python:raise RuntimeError('先启动 DSH 并初始化 Node24、Python、Office 和模型')
 patch=core.PROFILE/'cordis.patch.yml'
 if not patch.exists():raise RuntimeError('请先启动一次 DSH 桌面版，初始化 desktop profile；不要创建独立 wechat profile')
 text=patch.read_text(encoding='utf-8-sig')
 initial=None
 if 'id: im-weixin' not in text and 'id: assistant-weixin-runtime' not in text:
  if not provider or not model:
   from dsh_model_config import default_model
   detected=default_model(core.PROFILE)
   if detected:provider,model=detected['provider'],detected['model']
   elif noninteractive:raise RuntimeError('未找到唯一的默认模型。请让 DSH 确认当前模型后用 --provider 和 --model 指定；不要填写或输出 API 密钥。')
   else:provider=input('DSH 中已配置的 provider ID：').strip();model=input('model ID：').strip()
  if not provider or not model:raise RuntimeError('provider 和 model 不能为空，不需要填写密钥')
  root=assistant_root();root.mkdir(parents=True,exist_ok=True)
  lines=['','- id: im-weixin','  name: '+json.dumps((core.ROOT/'packages/wechat-channel/lib/index.js').as_posix()),'  config:','    provider: '+json.dumps(provider),'    model: '+json.dumps(model),'    cwd: '+json.dumps(root.parent.as_posix())]
  for key,cmd in [('ffmpegPath','ffmpeg'),('ffprobePath','ffprobe')]:
   if shutil.which(cmd):lines.append('    '+key+': '+json.dumps(shutil.which(cmd)))
  # Do not expose an unverified plugin to the live host's config watcher.
  fd,name=tempfile.mkstemp(prefix='dsh-initial-',suffix='.yml')
  initial=Path(name)
  with os.fdopen(fd,'w',encoding='utf-8') as f:f.write(text+'\n'.join(lines)+'\n')
 try:
  args=[python,core.ROOT/'scripts/install-capabilities.py','--profile',core.PROFILE,'--resources',app,'--node',node,'--python',python,'--apply']
  if initial:args+=['--initial-patch',initial]
  core.run(args)
 finally:
  if initial:initial.unlink(missing_ok=True)
 print('已安装。微信扫码后完整重启 DSH 桌面版，再从微信发一条消息。')

def bind():
 import sqlite3,re
 from urllib.parse import urlparse
 db=assistant_root()/'assistant.sqlite'
 if not db.exists():raise RuntimeError('先在微信发一条消息，让助手建立数据库')
 with closing(sqlite3.connect(db)) as c:peers=[r[0] for r in c.execute("SELECT peer FROM activity WHERE peer LIKE 'weixin:%' ORDER BY lastInbound DESC")]
 if not peers:raise RuntimeError('未找到微信会话')
 for i,p in enumerate(peers):print(str(i+1)+': …'+p[-16:])
 i=int(input('选择自己的微信会话序号：'))-1
 if not 0<=i<len(peers):raise RuntimeError('序号无效')
 u=urlparse(input('小红书个人主页链接：').strip())
 if u.hostname not in ['www.xiaohongshu.com','xiaohongshu.com'] or not re.fullmatch('/user/profile/[a-fA-F0-9]{24}',u.path):raise RuntimeError('个人主页链接无效')
 dest=db.parent/'xhs-config.json'
 browser_config=xhs_browser_config()
 if dest.exists():shutil.copy2(dest,dest.with_suffix('.json.backup'))
 dest.write_text(json.dumps({**browser_config,'ownerPeer':peers[i],'profilePath':u.path},indent=2),encoding='utf-8')
 print('绑定已保存，重启 DSH 后生效。未开启自动采集。')


def report():
 path=core.ROOT/'windows-test-report.json';path.write_text(json.dumps(doctor(),indent=2),encoding='utf-8');print('已生成 windows-test-report.json，不含账号、路径、聊天或密钥。')

def main():
 p=argparse.ArgumentParser();p.add_argument('--verify',action='store_true');p.add_argument('--doctor',action='store_true');p.add_argument('--auto',action='store_true');a=p.parse_args();core.verify()
 if a.verify:print('Bundle integrity verified');return
 if a.doctor:doctor();return
 if platform.system()!='Windows':raise RuntimeError('此入口仅供 Windows 测试')
 if a.auto:one_click();return
 actions={'1':doctor,'2':install,'3':core.login,'4':chrome,'5':bind,'6':report,'7':dependencies}
 while True:
  print('1 检查环境  2 安装/升级  3 微信扫码  4 打开XHS浏览器  5 绑定XHS  6 导出检查结果  7 安装依赖（联网）  0 退出')
  choice=input('选择：').strip()
  if choice=='0':return
  try:
   if choice in actions:actions[choice]()
  except (Exception,KeyboardInterrupt) as e:print('未完成：'+str(e))

core.env=env
core.install_node_dependencies=install_node_dependencies
if __name__=='__main__':
 try:main()
 except Exception as e:print('未完成：'+str(e));sys.exit(1)
