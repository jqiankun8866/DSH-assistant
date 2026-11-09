import unittest,tempfile
from pathlib import Path
from unittest.mock import patch
from dsh_model_config import parse_default,default_model
import windows_setup as w

DEFAULT='- id: agent-default-model\n  config:\n    provider: example-provider\n    model: example-model\n'
class ModelTests(unittest.TestCase):
 def test_only_identifiers_are_returned(self):
  self.assertEqual(parse_default(DEFAULT+'    apiKey: never-return-this\n'),{'provider':'example-provider','model':'example-model'})
 def test_nested_quoted_identifiers(self):
  text='- insert:\n'+''.join('    '+v+'\n' for v in DEFAULT.splitlines())
  self.assertEqual(parse_default(text)['model'],'example-model')
  self.assertEqual(parse_default(DEFAULT.replace('example-model','"vendor/model-v1"'))['model'],'vendor/model-v1')
 def test_ambiguous_disabled_or_dynamic_models_are_not_guessed(self):
  for text in [DEFAULT+DEFAULT,DEFAULT.replace('  config:','  disabled: true\n  config:'),DEFAULT.replace('example-model','${MODEL}'),DEFAULT+'    model: other\n']:
   self.assertIsNone(parse_default(text))
 def test_unresolved_patch_does_not_fall_back(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t);(p/'cordis.yml').write_text(DEFAULT);(p/'cordis.patch.yml').write_text(DEFAULT.replace('example-model','${MODEL}'))
   self.assertIsNone(default_model(p))
 def test_new_install_reuses_default_without_input(self):
  with tempfile.TemporaryDirectory() as t:
   h=Path(t);profile=h/'desktop';profile.mkdir();(profile/'cordis.patch.yml').write_text(DEFAULT)
   def commit(args,**kw):
    self.assertEqual((profile/'cordis.patch.yml').read_text(),DEFAULT)
    (profile/'cordis.patch.yml').write_bytes(Path(args[args.index('--initial-patch')+1]).read_bytes())
   with patch.object(w.core,'PROFILE',profile),patch.object(w.core,'ROOT',h/'bundle'),patch.object(w,'env',return_value=(h/'resources','node','python')),patch.object(w,'assistant_root',return_value=h/'workspace/.assistant'),patch.object(w.core,'run',side_effect=commit),patch('builtins.input',side_effect=AssertionError('must not prompt')):
    w.install(noninteractive=True)
   self.assertIn('"example-model"',(profile/'cordis.patch.yml').read_text())
 def test_unknown_model_blocks_before_writes(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t);(p/'cordis.patch.yml').write_text('# original')
   with patch.object(w.core,'PROFILE',p),patch.object(w,'env',return_value=(p/'resources','node','python')),patch('builtins.input',side_effect=AssertionError('must not prompt')):
    with self.assertRaisesRegex(RuntimeError,'默认模型'):w.install(noninteractive=True)
   self.assertEqual((p/'cordis.patch.yml').read_text(),'# original')
if __name__=='__main__':unittest.main()
