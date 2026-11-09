"""macOS friend-test setup; contains no account data."""
import argparse,hashlib,json,os,platform,re,shutil,sqlite3,subprocess,sys,shlex
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];HOME=Path.home()
PROFILE=HOME/'.dsh/profiles/desktop';STATE=HOME/'.dsh-plugin-wechat'
RUNTIME=HOME/'.dsh/dsh-runtimes/dsh-primary-runtime/dependencies'
def choose(paths,command):
 for value in paths:
  if value and Path(value).is_file():return str(value)
 return shutil.which(command) if command else None
def env():
 app=next((p for p in [Path('/Applications/DeepSeek Harness.app/Contents/Resources'),HOME/'Applications/DeepSeek Harness.app/Contents/Resources'] if p.exists()),None)
 node=choose([os.environ.get('DSH_NODE'),RUNTIME/'node/bin/node'],'node')
 python=choose([os.environ.get('DSH_PYTHON'),RUNTIME/'python/bin/python3',RUNTIME/'python/bin/python',sys.executable],'python3')
 return app,node,python
def run(args,**kwargs):
 _,node,_=env();e=os.environ.copy()
 if node:e['PATH']=str(Path(node).parent)+os.pathsep+e.get('PATH','')
 return subprocess.run([str(x) for x in args],check=True,env=e,**kwargs)
def verify():
 for name,expected in json.loads((ROOT/'SHA256SUMS.json').read_text(encoding='utf-8')).items():
  path=ROOT/name
  if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise RuntimeError('文件校验失败：'+name)
def doctor():
 app,node,python=env();checks={'system':platform.system(),'architecture':platform.machine(),'DSH':bool(app),'node24':False,'python':bool(python),'wechat_profile':(PROFILE/'cordis.patch.yml').exists(),'ffmpeg':bool(shutil.which('ffmpeg')),'Chrome':Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome').exists()}
 if node:
  try:checks['node24']=int(subprocess.check_output([node,'-p','process.versions.node'],text=True).strip().split('.')[0])>=24
  except Exception:pass
 if python:checks['office_python']=subprocess.run([python,'-c','import docx,pptx,openpyxl'],capture_output=True).returncode==0
 checks['native_office']=bool(app and (app/'runtime/office-skills/office-docx/SKILL.md').exists())
 print(json.dumps(checks,ensure_ascii=False,indent=2));return checks
def install():
 app,node,python=env()
 if not app or not node or not python:raise RuntimeError('先安装 DSH 并初始化 Node 24 和 Python；非标准位置可设置 DSH_NODE / DSH_PYTHON')
 patch=PROFILE/'cordis.patch.yml'
 if not patch.exists():raise RuntimeError('先打开 DSH 初始化 desktop profile 并配置模型')
 text=patch.read_text(encoding='utf-8-sig')
 if 'id: im-weixin' not in text and 'id: assistant-weixin-runtime' not in text:
  provider=input('已在 DSH 配置的 provider ID：').strip();model=input('model ID：').strip()
  if not provider or not model:raise RuntimeError('provider/model 不能为空；不在此处填写密钥')
  backup=PROFILE/'cordis.patch.before-mac-core.yml'
  if backup.exists():raise RuntimeError('已有初始化备份，请先检查 profile')
  shutil.copy2(patch,backup)
  lines=['','- id: im-weixin','  name: '+json.dumps((ROOT/'packages/wechat-channel/lib/index.js').as_posix()),'  config:','    provider: '+json.dumps(provider),'    model: '+json.dumps(model)]
  for key,cmd in [('ffmpegPath','ffmpeg'),('ffprobePath','ffprobe')]:
   if shutil.which(cmd):lines.append('    '+key+': '+json.dumps(shutil.which(cmd)))
  text+=chr(10).join(lines)+chr(10)
  patch.write_text(text,encoding='utf-8')
 run([python,ROOT/'scripts/install-capabilities.py','--resources',app,'--node',node,'--python',python,'--apply'])
 # Core installer verifies media dependencies before switching live config.
 print('核心已安装；完整重启 DSH 桌面版后测试。')
def install_node_dependencies(folder):
 _,node,_=env()
 npm=choose([Path(node).parent/'npm'] if node else [],'npm')
 if not npm:raise RuntimeError('需要 npm 安装二维码和 SILK 音频依赖')
 run([npm,'install','--prefix',folder,'--omit=dev','--legacy-peer-deps','--ignore-scripts','--no-audit','--no-fund'])
def login():
 _,node,_=env()
 if not node:raise RuntimeError('缺少 Node 24')
 install_node_dependencies(ROOT/'packages/wechat-channel')
 run([node,ROOT/'packages/wechat-channel/lib-bin/login.js'])
def chrome():
 exe=Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
 if not exe.exists():raise RuntimeError('先安装 Google Chrome')
 folder=HOME/'.dsh-assistant-browser/xhs';folder.mkdir(parents=True,exist_ok=True)
 subprocess.Popen([str(exe),'--remote-debugging-port=9222','--remote-debugging-address=127.0.0.1','--user-data-dir='+str(folder),'https://www.xiaohongshu.com/explore'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
 print('在专用 Chrome 登录自己的 XHS，保持浏览器运行。')
def bind():
 executable=choose([os.environ.get('AGENT_BROWSER_BIN'),HOME/'.dsh-assistant-tools/agent-browser'],'agent-browser')
 if not executable:raise RuntimeError('先安装 agent-browser，或设置 AGENT_BROWSER_BIN')
 db=STATE/'workspace/.assistant/assistant.sqlite'
 if not db.exists():raise RuntimeError('请先向微信机器人发送消息')
 with sqlite3.connect(db) as c:peers=[r[0] for r in c.execute('SELECT peer FROM activity ORDER BY lastInbound DESC')]
 if not peers:raise RuntimeError('没有微信会话，先给机器人发消息')
 for i,p in enumerate(peers):print(str(i+1)+': …'+p[-16:])
 i=int(input('选择你自己的会话序号：'))-1
 if not 0<=i<len(peers):raise RuntimeError('序号无效')
 from urllib.parse import urlparse
 u=urlparse(input('XHS个人主页链接：').strip())
 if u.hostname not in ['www.xiaohongshu.com','xiaohongshu.com'] or not re.fullmatch('/user/profile/[a-fA-F0-9]{24}',u.path):raise RuntimeError('主页链接无效')
 dest=db.parent/'xhs-config.json'
 if dest.exists():shutil.copy2(dest,dest.with_suffix('.json.backup'))
 chrome_path=os.environ.get('CHROME_PATH') or ('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' if sys.platform=='darwin' else str(Path(os.environ.get('ProgramFiles','C:/Program Files'))/'Google/Chrome/Application/chrome.exe'))
 dest.write_text(json.dumps({'ownerPeer':peers[i],'profilePath':u.path,'executable':executable,'port':9222,'session':'dsh-xhs','chromePath':chrome_path,'userDataDir':str(HOME/'.dsh-assistant-browser/xhs')},indent=2),encoding='utf-8');os.chmod(dest,0o600)
 print('已绑定。重启后生效，未开启自动浏览。')
def report():
 (ROOT/'mac-test-report.json').write_text(json.dumps(doctor(),indent=2),encoding='utf-8');print('已导出 mac-test-report.json，不含账号、聊天、token、路径或记忆。')
def dependencies():
 _,node,python=env()
 if not node or not python:raise RuntimeError('先初始化 DSH Node24/Python')
 run([python,'-m','pip','install','-r',ROOT/'requirements-office.txt'])
 npm=choose([Path(node).parent/'npm'],'npm')
 if not npm:raise RuntimeError('缺少 npm')
 folder=HOME/'.dsh-assistant-tools';folder.mkdir(exist_ok=True)
 run([npm,'install','--prefix',folder,'--ignore-scripts','--no-audit','--no-fund','agent-browser@0.41.0'])
 wrapper=folder/'agent-browser';cli=folder/'node_modules/agent-browser/bin/agent-browser.js'
 wrapper.write_text(chr(10).join(['#!/bin/sh','export PATH='+shlex.quote(str(Path(node).parent))+':"$PATH"','exec '+shlex.quote(node)+' '+shlex.quote(str(cli))+' "$@"','']),encoding='utf-8');os.chmod(wrapper,0o700)
 if not shutil.which('ffmpeg'):
  brew=choose(['/opt/homebrew/bin/brew','/usr/local/bin/brew'],'brew')
  if not brew:raise RuntimeError('办公/浏览器依赖已装。FFmpeg 尚缺失，请按说明先安装 Homebrew，再执行 brew install ffmpeg。')
  run([brew,'install','ffmpeg'])
 print('依赖安装完成。请再执行环境检查。')
def main():
 p=argparse.ArgumentParser();p.add_argument('--verify',action='store_true');p.add_argument('--doctor',action='store_true');a=p.parse_args();verify()
 if a.verify:print('Bundle integrity verified');return
 if a.doctor:doctor();return
 if platform.system()!='Darwin':raise RuntimeError('此菜单仅供 macOS；其他系统可运行 --verify')
 actions={'1':doctor,'2':install,'3':login,'4':chrome,'5':bind,'6':report,'7':dependencies}
 while True:
  print('1 检查环境  2 安装/升级  3 微信扫码  4 打开XHS浏览器  5 绑定XHS  6 导出检查结果  7 安装依赖（联网）  0 退出')
  choice=input('选择：').strip()
  if choice=='0':return
  try:
   if choice in actions:actions[choice]()
  except (Exception,KeyboardInterrupt) as e:print('未完成：'+str(e))
if __name__=='__main__':
 try:main()
 except Exception as e:print('未完成：'+str(e));sys.exit(1)
