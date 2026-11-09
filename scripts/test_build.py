"""Build from a fresh fixture and ensure deleted modules do not survive rebuilds."""
import unittest,tempfile,shutil,subprocess,json
from pathlib import Path

class BuildTests(unittest.TestCase):
 def test_rebuild_prunes_retired_modules_and_is_reproducible(self):
  with tempfile.TemporaryDirectory(prefix='DSH build 中文 ') as tmp:
   root=Path(tmp);(root/'scripts').mkdir();src=root/'packages/wechat-channel/src';src.mkdir(parents=True)
   shutil.copy2(Path(__file__).with_name('build-channel.mjs'),root/'scripts/build-channel.mjs')
   (src/'entry.ts').write_text('export const answer: number = 42;',encoding='utf8')
   (src/'kept.mjs').write_text('export const ready = true;',encoding='utf8')
   lib=root/'packages/wechat-channel/lib';lib.mkdir();(lib/'obsolete.js').write_text('throw Error("old")')
   def build():subprocess.run(['node',str(root/'scripts/build-channel.mjs')],check=True,capture_output=True)
   build();self.assertFalse((lib/'obsolete.js').exists());self.assertTrue((lib/'entry.js').exists())
   before={p.name:p.read_bytes() for p in lib.iterdir()};build()
   self.assertEqual(before,{p.name:p.read_bytes() for p in lib.iterdir()})
   (src/'kept.mjs').unlink();build();self.assertFalse((lib/'kept.mjs').exists())

