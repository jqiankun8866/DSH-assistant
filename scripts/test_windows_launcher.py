"""Exercise actual PowerShell binding against a harmless Python stub."""
import unittest,subprocess,tempfile,shutil,os,sys
from pathlib import Path
class LauncherTests(unittest.TestCase):
 def test_all_entry_modes_bind_without_installing(self):
  root=Path(__file__).resolve().parents[1]
  launcher=root/'setup-windows.ps1'
  if not launcher.exists():launcher=root/'release/windows/setup-windows.ps1'
  with tempfile.TemporaryDirectory(prefix='DSH launch 中文 ') as t:
   folder=Path(t);(folder/'scripts').mkdir()
   shutil.copy2(launcher,folder/'setup-windows.ps1')
   (folder/'scripts/windows_setup.py').write_text('import sys\nprint("STUB_ARGS="+repr(sys.argv[1:]))\n',encoding='utf8')
   for flags,expected in [(['-VerifyOnly'],"['--verify']"),(['-CheckOnly'],"['--doctor']"),(['-Menu'],'[]'),([],"['--auto']")]:
    result=subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(folder/'setup-windows.ps1'),*flags],env={**os.environ,'DSH_PYTHON':sys.executable},capture_output=True)
    self.assertEqual(result.returncode,0,result.stderr.decode(errors='replace'))
    self.assertEqual(result.stderr,b'')
    self.assertIn(('STUB_ARGS='+expected).encode(),result.stdout)
if __name__=='__main__':unittest.main()
