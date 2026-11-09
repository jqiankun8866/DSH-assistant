"""Noninteractive installer for execution by the user's DSH agent."""
import argparse,json,os,platform,sys
from pathlib import Path
import windows_setup as w
from dsh_model_config import default_model

def status():
 app,node,python=w.env();profile=w.core.PROFILE
 patch=profile/'cordis.patch.yml';exists=patch.is_file()
 text=patch.read_text(encoding='utf-8-sig') if exists else ''
 existing='id: im-weixin' in text or 'id: assistant-weixin-runtime' in text
 model=default_model(profile) if exists else None
 missing=[]
 if not app:missing.append('dsh_resources_not_found')
 if not exists:missing.append('desktop_profile_not_found')
 if not python:missing.append('python_not_found')
 if exists and not existing and not model:missing.append('default_model_not_resolved')
 return {'platform':platform.system(),'profile':str(profile),'resources':str(app) if app else None,
         'node':node,'python':python,'defaultModel':model,'existingAssistant':existing,'missing':missing,
         'scope':'office, health, preferences, native tasks, email, XHS, media, memes; no simulator',
         'requiresPersonalAction':['WeChat QR login','optional XHS login','optional mailbox authorization'],
         'note':'No API keys or account credentials are copied or printed.'}

def main():
 p=argparse.ArgumentParser()
 p.add_argument('--action',choices=['check','install','wechat-login'],default='check')
 p.add_argument('--profile',type=Path);p.add_argument('--resources',type=Path)
 p.add_argument('--provider');p.add_argument('--model')
 a=p.parse_args()
 if platform.system()!='Windows':raise RuntimeError('本包只支持 Windows')
 w.core.verify()
 if a.profile:
  profile=a.profile.expanduser().resolve()
  if profile.name!='desktop':raise RuntimeError('只支持 desktop profile，不创建另一套 wechat profile')
  w.core.PROFILE=profile
 if a.resources:
  app=a.resources.expanduser().resolve()
  if not (app/'app.asar.unpacked').is_dir():raise RuntimeError('--resources 路径无效，需指向 DSH resources 目录')
  os.environ['DSH_RESOURCES']=str(app)
 if bool(a.provider)!=bool(a.model):raise RuntimeError('--provider 与 --model 必须同时提供')
 report=status()
 if a.provider and a.model:report['missing']=[v for v in report['missing'] if v!='default_model_not_resolved']
 print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
 if a.action=='check':return 0 if not report['missing'] else 2
 if report['missing']:raise RuntimeError('环境未就绪：'+', '.join(report['missing'])+'。请根据 DSH 运行上下文定位目录后重试，不要猜路径或密钥。')
 if a.action=='wechat-login':w.core.login();return 0
 w.one_click(noninteractive=True,provider=a.provider,model=a.model)
 print(json.dumps({'installed':True,'restartRequired':True,'accountLoginVerified':False},ensure_ascii=False))
 return 0

if __name__=='__main__':
 try:sys.exit(main())
 except Exception as e:print(json.dumps({'installed':False,'error':str(e)},ensure_ascii=False));sys.exit(1)
