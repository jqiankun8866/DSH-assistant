import unittest,tempfile,shutil,subprocess,sys
from pathlib import Path
class DistributionTests(unittest.TestCase):
 def test_runtime_credentials_and_database_sidecars_are_rejected(self):
  for name in ['.assistant/config.json','cookies-local.json','credentials.xml','state.sqlite-wal','backup.zip']:
   with self.subTest(name=name),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);scripts=root/'scripts';scripts.mkdir();target=scripts/'verify-distribution.py';shutil.copy2(Path(__file__).with_name('verify-distribution.py'),target)
    f=root/name;f.parent.mkdir(exist_ok=True);f.write_text('{}')
    result=subprocess.run([sys.executable,str(target),'--write'],capture_output=True)
    self.assertNotEqual(result.returncode,0);self.assertFalse((root/'SHA256SUMS.json').exists())
 def test_private_patterns_fail_before_manifest_write(self):
  for payload,suffix in [('sk-'+'x'*30,'.txt'),('<SS>'+'a'*80+'</SS>','.xml'),('C:'+chr(92)+'Users'+chr(92)+'example-person'+chr(92)+'file','.md')]:
   with self.subTest(suffix=suffix),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);scripts=root/'scripts';scripts.mkdir();target=scripts/'verify-distribution.py';shutil.copy2(Path(__file__).with_name('verify-distribution.py'),target)
    (root/('fixture'+suffix)).write_text(payload,encoding='utf-8')
    r=subprocess.run([sys.executable,str(target),'--write'],capture_output=True)
    self.assertNotEqual(r.returncode,0);self.assertFalse((root/'SHA256SUMS.json').exists())
 def test_manifest_detects_tampering(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);scripts=root/'scripts';scripts.mkdir();target=scripts/'verify-distribution.py';shutil.copy2(Path(__file__).with_name('verify-distribution.py'),target)
   f=root/'README.md';f.write_text('public fixture',encoding='utf-8')
   self.assertEqual(subprocess.run([sys.executable,str(target),'--write'],capture_output=True).returncode,0)
   f.write_text('changed',encoding='utf-8');self.assertNotEqual(subprocess.run([sys.executable,str(target)],capture_output=True).returncode,0)
