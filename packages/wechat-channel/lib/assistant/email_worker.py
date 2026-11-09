"""TLS IMAP read-only worker. No SMTP, no marking read, no attachment writes."""
import sys,json,imaplib,ssl,email,email.policy,re,subprocess,os,hashlib
from pathlib import Path

def credentials(path):
 if sys.platform!='win32': raise ValueError('UNSUPPORTED_CREDENTIAL_STORE')
 env=dict(os.environ);env['DSH_MAIL_CREDENTIAL']=str(path)
 code="$c=Import-Clixml -LiteralPath $env:DSH_MAIL_CREDENTIAL; @{account=$c.UserName;password=$c.GetNetworkCredential().Password}|ConvertTo-Json -Compress"
 result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',code],env=env,capture_output=True,text=True,timeout=12,creationflags=0x08000000)
 if result.returncode: raise ValueError('CREDENTIAL_UNAVAILABLE')
 return json.loads(result.stdout)

def check(result):
 if result[0]!='OK': raise ValueError('MAIL_REQUEST_FAILED')
 return result[1]

def fetch(mail,uid,full=False):
 if not re.fullmatch(r'[0-9]{1,12}',str(uid)): raise ValueError('INVALID_UID')
 if full:
  sizes=check(mail.uid('fetch',str(uid),'(RFC822.SIZE)'))
  found=re.search(rb'RFC822.SIZE (\d+)',b' '.join(x for x in sizes if isinstance(x,bytes)))
  if not found or int(found[1])>2*1024*1024: return {'uid':str(uid),'skipped':'邮件大于2MB或无法确认大小，未下载正文'}
 spec='(BODY.PEEK[])' if full else '(BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE MESSAGE-ID)])'
 rows=check(mail.uid('fetch',str(uid),spec))
 raw=b''.join(x[1] for x in rows if isinstance(x,tuple) and isinstance(x[1],bytes))
 if not raw: raise ValueError('MAIL_EMPTY_RESPONSE')
 msg=email.message_from_bytes(raw,policy=email.policy.default)
 out={'sender':email.utils.parseaddr(str(msg.get('From','')))[1].lower(),'uid':str(uid),'subject':str(msg.get('Subject',''))[:500],'from':str(msg.get('From',''))[:500],'date':str(msg.get('Date',''))[:100]}
 if full:
  texts=[];attachments=[]
  for part in msg.walk():
   if part.get_content_disposition()=='attachment' or part.get_filename(): attachments.append(str(part.get_filename() or 'attachment')[:200]);continue
   if part.get_content_type()=='text/plain':
    try:texts.append(part.get_content())
    except Exception:pass
  if not texts:
   for part in msg.walk():
    if part.get_content_type()=='text/html' and not part.get_filename():
     try:texts.append(re.sub('<[^>]*>',' ',part.get_content()))
     except Exception:pass
  body='\n'.join(texts);out.update(body=body[:16000],truncated=len(body)>16000,attachments=attachments[:30],scope='正文文字；未读取附件内容')
 return out

def mailbox_config(path,account):
 if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+',account):raise ValueError('INVALID_ACCOUNT')
 settings=path.with_suffix('.settings.json')
 if not settings.exists():
  if not re.fullmatch(r'[^@\s]+@(?:qq|foxmail)\.com',account,re.I):raise ValueError('MAIL_SERVER_REQUIRED')
  return {'host':'imap.qq.com','port':993,'namespace':''}
 config=json.loads(settings.read_text(encoding='utf-8-sig'))
 if config.get('accountHash')!=hashlib.sha256(account.lower().encode()).hexdigest():raise ValueError('MAIL_CONFIG_ACCOUNT_MISMATCH')
 host=config.get('imapHost','');port=config.get('imapPort',993)
 if not isinstance(host,str) or not re.fullmatch(r'(?=.{1,253}$)[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*',host):raise ValueError('INVALID_MAIL_SERVER')
 if not isinstance(port,int) or isinstance(port,bool) or not 1<=port<=65535:raise ValueError('INVALID_MAIL_SERVER')
 if config.get('auth','password')!='password':raise ValueError('OAUTH_REQUIRED')
 if host.lower() in ['outlook.office365.com','imap-mail.outlook.com'] or account.rsplit('@',1)[1].lower() in ['outlook.com','hotmail.com','live.com','msn.com']:raise ValueError('OAUTH_REQUIRED')
 namespace=hashlib.sha256((account.lower()+'|'+host.lower()+'|'+str(port)).encode()).hexdigest()[:16]
 return {'host':host,'port':port,'namespace':namespace}

def read_mail(mail,request,namespace=''):
 check(mail.select('INBOX',readonly=True))
 validity=mail.response('UIDVALIDITY')[1]
 epoch=(validity[0].decode() if validity and validity[0] else None)
 if epoch and namespace:epoch=namespace+':'+epoch
 if request['action']=='sync':
  if not epoch: raise ValueError('UIDVALIDITY_UNAVAILABLE')
  all_uids=check(mail.uid('search',None,'ALL'))[0].split()
  highest=max([int(x) for x in all_uids],default=0)
  if str(request.get('uidValidity'))!=epoch:
   return {'uidValidity':epoch,'cursor':highest,'baseline':True,'messages':[]}
  cursor=int(request.get('cursor',0))
  new_uids=sorted(int(x) for x in all_uids if int(x)>cursor)[:50]
  return {'uidValidity':epoch,'cursor':new_uids[-1] if new_uids else cursor,'baseline':False,'messages':[fetch(mail,str(x)) for x in new_uids],'hasMore':highest>(new_uids[-1] if new_uids else cursor)}
 if request['action']=='read':
  if not epoch or str(request.get('uidValidity'))!=epoch: raise ValueError('UIDVALIDITY_CHANGED')
  return {'mail':fetch(mail,request['uid'],True),'uidValidity':epoch,'untrustedContent':True}
 uids=check(mail.uid('search',None,'ALL'))[0].split()
 return {'messages':[fetch(mail,x.decode()) for x in reversed(uids[-request.get('limit',5):])],'uidValidity':epoch,'scope':'收件箱最近邮件；不是完整邮箱','untrustedContent':True}

def main():
 try:
  request=json.load(sys.stdin)
  if request.get('action') not in ['list','read','sync']: raise ValueError('INVALID_ACTION')
  if not isinstance(request.get('limit',5),int) or not 1<=request.get('limit',5)<=10:raise ValueError('INVALID_LIMIT')
  path=Path(sys.argv[1]);cred=credentials(path);config=mailbox_config(path,cred['account'])
  with imaplib.IMAP4_SSL(config['host'],config['port'],ssl_context=ssl.create_default_context(),timeout=18) as mail:
   mail.login(cred['account'],cred['password']);out=read_mail(mail,request,config['namespace'])
  print(json.dumps({'ok':True,**out},ensure_ascii=False))
 except imaplib.IMAP4.error: print(json.dumps({'ok':False,'error':'邮箱授权失败或请求被拒绝，请检查IMAP服务和授权码'}))
 except Exception as e:
  allowed=['UIDVALIDITY_CHANGED','INVALID_ACCOUNT','MAIL_SERVER_REQUIRED','MAIL_CONFIG_ACCOUNT_MISMATCH','INVALID_MAIL_SERVER','OAUTH_REQUIRED','INVALID_UID','INVALID_ACTION','INVALID_LIMIT','CREDENTIAL_UNAVAILABLE','UNSUPPORTED_CREDENTIAL_STORE']
  print(json.dumps({'ok':False,'error':str(e) if str(e) in allowed else '邮箱读取失败，请检查网络、授权配置或稍后重试'}))
if __name__=='__main__': main()
