import unittest,importlib.util,tempfile,json,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('mailworker',Path(__file__).resolve().parents[1]/'packages/wechat-channel/src/assistant/email_worker.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
class Mail:
 def __init__(self):self.calls=[]
 def select(self,name,readonly=False):self.calls.append(('select',name,readonly));return 'OK',[b'2']
 def response(self,name):return name,[b'9']
 def uid(self,*args):
  self.calls.append(args)
  if args[0]=='search':return 'OK',[b'10 11']
  if args[-1]=='(RFC822.SIZE)':return 'OK',[b'11 (RFC822.SIZE 120)']
  return 'OK',[(b'11',b'Subject: task\r\nFrom: test@example.com\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nPlease reply tomorrow')]
class TestEmail(unittest.TestCase):
 def test_general_imap_requires_explicit_config_and_binds_account(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'credentials.xml'
   self.assertEqual(w.mailbox_config(path,'user@qq.com')['host'],'imap.qq.com')
   self.assertRaises(ValueError,w.mailbox_config,path,'user@example.com')
   settings={'imapHost':'imap.example.com','imapPort':993,'accountHash':hashlib.sha256(b'user@example.com').hexdigest()}
   path.with_suffix('.settings.json').write_text(json.dumps(settings),encoding='utf-8')
   cfg=w.mailbox_config(path,'user@example.com');self.assertEqual(cfg['host'],'imap.example.com')
   self.assertRaises(ValueError,w.mailbox_config,path,'other@example.com')
   out=w.read_mail(Mail(),{'action':'list','limit':1},cfg['namespace']);self.assertEqual(out['uidValidity'],cfg['namespace']+':9')
   self.assertRaises(ValueError,w.read_mail,Mail(),{'action':'read','uid':'11','uidValidity':'9'},cfg['namespace'])
   settings['auth']='oauth2';path.with_suffix('.settings.json').write_text(json.dumps(settings),encoding='utf-8');self.assertRaises(ValueError,w.mailbox_config,path,'user@example.com')
 def test_list_is_readonly_and_bounded(self):
  m=Mail();out=w.read_mail(m,{'action':'list','limit':1});self.assertEqual(len(out['messages']),1);self.assertEqual(out['messages'][0]['uid'],'11');self.assertEqual(m.calls[0],('select','INBOX',True));self.assertIn('BODY.PEEK',m.calls[-1][-1])
 def test_body_peek_epoch_and_limits(self):
  m=Mail();out=w.read_mail(m,{'action':'read','uid':'11','uidValidity':'9'});self.assertIn('reply tomorrow',out['mail']['body']);self.assertEqual(m.calls[-1][-1],'(BODY.PEEK[])');self.assertRaises(ValueError,w.read_mail,Mail(),{'action':'read','uid':'11','uidValidity':'8'});self.assertRaises(ValueError,w.fetch,Mail(),'1:*',True)
 def test_large_mail_not_downloaded(self):
  m=Mail();m.uid=lambda *args:('OK',[b'11 (RFC822.SIZE 9000000)']);self.assertIn('skipped',w.fetch(m,'11',True))
class TestSync(unittest.TestCase):
 def test_baseline_and_epoch_change_only_record_cursor(self):
  out=w.read_mail(Mail(),{'action':'sync'});self.assertTrue(out['baseline']);self.assertEqual(out['cursor'],11);self.assertEqual(out['messages'],[])
  out=w.read_mail(Mail(),{'action':'sync','uidValidity':'old','cursor':0});self.assertTrue(out['baseline'])
 def test_incremental_sync_uses_uid_cursor(self):
  out=w.read_mail(Mail(),{'action':'sync','uidValidity':'9','cursor':10});self.assertEqual(len(out['messages']),1);self.assertEqual(out['messages'][0]['uid'],'11');self.assertEqual(out['cursor'],11)
  out=w.read_mail(Mail(),{'action':'sync','uidValidity':'9','cursor':11});self.assertEqual(out['messages'],[])
if __name__=='__main__':unittest.main()
