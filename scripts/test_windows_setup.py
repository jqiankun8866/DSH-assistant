import unittest,tempfile,json
from pathlib import Path
from unittest.mock import patch
from runtime_paths import assistant_root
import windows_setup as w
class WindowsSetupTests(unittest.TestCase):
 def test_default_and_custom_location(self):
  with tempfile.TemporaryDirectory() as t:
   h=Path(t);default=h/'.dsh-plugin-wechat/workspace/.assistant'
   self.assertEqual(assistant_root(h,{}),default)
   custom=h/'自定义 工作区/.assistant';default.mkdir(parents=True)
   (default/'location.json').write_text(json.dumps({'root':str(custom)}),encoding='utf8')
   self.assertEqual(assistant_root(h,{}),custom)
   self.assertEqual(assistant_root(h,{'DSH_ASSISTANT_ROOT':str(h/'override')}),h/'override')
 def test_desktop_initialization_and_upgrade(self):
  with tempfile.TemporaryDirectory() as t:
   h=Path(t);profile=h/'.dsh/profiles/desktop';profile.mkdir(parents=True);p=profile/'cordis.patch.yml';p.write_text('# existing desktop settings\n')
   root=h/'bundle'
   ws=h/'custom workspace/.assistant';calls=[]
   original=p.read_bytes()
   def commit(args,**kw):
    calls.append(args);self.assertEqual(p.read_bytes(),original)
    initial=Path(args[args.index('--initial-patch')+1]);p.write_bytes(initial.read_bytes())
   with patch.object(w.core,'PROFILE',profile),patch.object(w.core,'ROOT',root),patch.object(w,'env',return_value=(h/'resources','node','python')),patch.object(w,'assistant_root',return_value=ws),patch.object(w.core,'run',side_effect=commit),patch('builtins.input',side_effect=['configured-provider','configured-model']):w.install()
   content=p.read_text(encoding='utf8');self.assertIn('configured-model',content);self.assertIn(ws.parent.as_posix(),content);self.assertIn('--profile',calls[0]);self.assertIn(profile,calls[0]);self.assertFalse(Path(calls[0][-1]).exists())
   self.assertNotIn('profiles/wechat',str(calls))
 def test_windows_uses_desktop(self):self.assertEqual(w.core.PROFILE.name,'desktop')
class AutoInstallTests(unittest.TestCase):
 def test_missing_dsh_stops_before_dependencies(self):
  with patch.object(w,'env',return_value=(None,None,None)),patch.object(w,'dependencies') as deps:
   with self.assertRaises(RuntimeError):w.one_click()
   deps.assert_not_called()
 def test_winget_failure_stops(self):
  with patch.object(w.shutil,'which',return_value='winget'),patch.object(w.core,'run',side_effect=RuntimeError('download failed')),patch.object(w,'refresh_path') as refresh:
   with self.assertRaises(RuntimeError):w.winget_install('Gyan.FFmpeg')
   refresh.assert_not_called()
 def test_failed_install_restores_initial_profile(self):
  with tempfile.TemporaryDirectory() as t:
   h=Path(t);p=h/'cordis.patch.yml';p.write_text('# original\n');before=p.read_bytes()
   staged=[]
   def fail(args,**kw):
    self.assertEqual(p.read_bytes(),before)
    staged.append(Path(args[args.index('--initial-patch')+1]));self.assertTrue(staged[-1].exists())
    raise RuntimeError('dependency failed')
   with patch.object(w.core,'PROFILE',h),patch.object(w,'env',return_value=(h/'resources','node','python')),patch.object(w,'assistant_root',return_value=h/'workspace/.assistant'),patch.object(w.core,'run',side_effect=fail),patch('builtins.input',side_effect=['provider','model']):
    with self.assertRaises(RuntimeError):w.install()
   self.assertEqual(before,p.read_bytes());self.assertFalse((h/'cordis.patch.before-windows-assistant.yml').exists())
   self.assertFalse(staged[0].exists())
if __name__=='__main__':unittest.main()
