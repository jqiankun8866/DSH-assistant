import unittest,re
from unittest.mock import patch
from pathlib import Path
from core_install import plan_config, deployment_path, npm_candidates
class InstallTests(unittest.TestCase):
 def test_standalone_node_uses_system_npm(self):
  with patch('shutil.which',return_value='/tools/node/npm.cmd'),patch.dict('os.environ',{},clear=True):
   self.assertIn(Path('/tools/node/node_modules/npm/bin/npm-cli.js'),npm_candidates(Path('/runtime/node/bin/node.exe')))
 def test_deployment_survives_dependency_directory_cleanup(self):
  profile=Path('/tmp/profile')
  stage=deployment_path(profile,'20261106-140000-123456')
  self.assertEqual(stage.parent,profile/'assistant-plugins')
  self.assertNotIn('node_modules',stage.relative_to(profile).parts)
  with self.assertRaises(ValueError):deployment_path(profile,'../escape')
 def plan(self,text,version='20261102-110000'):
  # Isolate the external YAML transform here; real mixed-block parsing is
  # covered separately by test-managed-overlay.cjs against DSH's parser.
  clean=lambda value,*args:re.sub(r'(?ms)^- insert:\n(?:[ \t]*\n)*    - id: assistant-(?:personal-skills[^\n]*|office-skills|wechat-preset)\n.*?(?=^- |\Z)','',value)
  with patch('core_install.wechat_preset',return_value='- insert:\n    - id: assistant-wechat-preset\n      name: native-preset\n'),patch('core_install.prune_managed',side_effect=clean):
   return plan_config(text,Path('/tmp/core-'+version),version,Path('/Applications/DSH.app/Contents/Resources'),Path('/tmp/node'))
 def test_first_install_then_upgrade_preserves_settings_and_single_entry(self):
  original='- id: unrelated\n  name: keep\n- id: im-weixin\n  name: upstream\n  config:\n    model: user-selected\n'
  first=self.plan(original);second=self.plan(first,'20261102-120000')
  self.assertIn('model: user-selected',second);self.assertIn('name: keep',second)
  self.assertEqual(second.count('id: assistant-weixin-runtime-'),1)
  self.assertEqual(second.count('id: assistant-office-skills'),0)
  self.assertEqual(second.count('id: assistant-personal-skills-'),1)
  self.assertEqual(second.count('id: assistant-wechat-preset'),1)
  self.assertNotIn('/tmp/core-20261102-110000',second)
  self.assertIn('id: im-weixin\n  disabled: true',second)
 def test_errorfix_upgrade(self):
  first=self.plan('- id: im-weixin\n  name: upstream\n')
  first=first.replace('assistant-weixin-runtime-','assistant-weixin-runtime-errorfix-')
  updated=self.plan(first)
  self.assertNotIn('assistant-weixin-runtime-errorfix-',updated)

 def test_missing_or_ambiguous_profile_fails_closed(self):
  for text in ['', '- id: im-weixin\n  disabled: true\n', '- id: im-weixin\n  name: a\n- id: im-weixin\n  name: b\n']:
   with self.assertRaises(ValueError):self.plan(text)
 def test_folded_runtime_path_is_replaced_as_one_scalar(self):
  first=self.plan('- id: im-weixin\n  name: upstream\n')
  first=first.replace('/tmp/core-20261102-110000/lib/index.js', '/tmp/core-20261102-'+'\\'+'\n        '+'110000/lib/index.js')
  updated=self.plan(first,'20261102-120000')
  self.assertNotIn('110000/lib/index.js',updated)
  self.assertIn('name: "/tmp/core-20261102-120000/lib/index.js"',updated)
 def test_folded_upstream_path_is_replaced_as_one_scalar(self):
  original='- id: im-weixin\n  name: "/tmp/upstream-'+'\\'+'\n    '+'continuation/index.js"\n  config:\n    model: chosen\n'
  updated=self.plan(original)
  self.assertNotIn('continuation/index.js',updated)
  self.assertIn('model: chosen',updated)
 def test_blank_lines_between_keys_preserve_single_provider_on_upgrade(self):
  first=self.plan('- id: im-weixin\n  name: upstream\n').replace('\n','\n\n')
  updated=self.plan(first,'20261102-120000')
  self.assertEqual(updated.count('id: assistant-personal-skills-'),1)
  self.assertEqual(updated.count('id: assistant-office-skills'),0)
  self.assertIn('/tmp/core-20261102-120000/lib/index.js',updated)
if __name__=='__main__':unittest.main()
