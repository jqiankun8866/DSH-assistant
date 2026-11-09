"""First-install and custom-profile browser entry regression checks."""
import json,sqlite3,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import windows_setup as setup

class XhsSetupTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.home=Path(self.temp.name);self.root=self.home/'assistant';self.root.mkdir()
  for target,value in [('windows_setup.core.HOME',self.home),('windows_setup.assistant_root',lambda:self.root),('windows_setup.chrome_exe',lambda:'chrome.exe')]:
   p=patch(target,value);p.start();self.addCleanup(p.stop)
 def config(self,value):
  (self.root/'xhs-config.json').write_text(json.dumps(value),encoding='utf-8')
 def test_fresh_login_opens_xhs_in_runtime_default_profile(self):
  with patch('windows_setup.subprocess.Popen') as launch:
   setup.chrome()
  args=launch.call_args.args[0]
  self.assertEqual(args[-1],'https://www.xiaohongshu.com/explore')
  self.assertNotIn('about:blank',args)
  self.assertIn('--user-data-dir='+str((self.home/'.dsh-assistant-browser/xhs').resolve()),args)
  self.assertIn('--remote-debugging-port=9222',args)
 def test_custom_login_and_rebind_preserve_runtime_profile_and_port(self):
  folder=self.home/'custom-browser';folder.mkdir();(folder/'login-marker').write_text('keep')
  self.config({'port':9444,'userDataDir':str(folder),'chromePath':'custom-chrome.exe','ownerPeer':'old'})
  with patch('windows_setup.subprocess.Popen') as launch:setup.chrome()
  args=launch.call_args.args[0];self.assertEqual(args[0],'custom-chrome.exe')
  self.assertIn('--remote-debugging-port=9444',args);self.assertIn('--user-data-dir='+str(folder),args)
  with sqlite3.connect(self.root/'assistant.sqlite') as db:
   db.execute('CREATE TABLE activity(peer TEXT,lastInbound INTEGER)');db.execute("INSERT INTO activity VALUES('weixin:test',1)")
  db.close()
  with patch('builtins.input',side_effect=['1','https://www.xiaohongshu.com/user/profile/'+'a'*24]):setup.bind()
  saved=json.loads((self.root/'xhs-config.json').read_text(encoding='utf-8'))
  self.assertEqual(saved['port'],9444);self.assertEqual(saved['userDataDir'],str(folder));self.assertEqual(saved['ownerPeer'],'weixin:test')
  self.assertEqual((folder/'login-marker').read_text(),'keep')
 def test_unsafe_profile_or_invalid_port_never_launches(self):
  for value in [{'port':True},{'port':65536},{'userDataDir':str(self.home/'Google/Chrome/User Data/Default')}]:
   self.config(value)
   with patch('windows_setup.subprocess.Popen') as launch:
    with self.assertRaises(RuntimeError):setup.chrome()
    launch.assert_not_called()

if __name__=='__main__':unittest.main()
