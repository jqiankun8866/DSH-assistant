"""Shared Windows assistant location; no writes on import."""
import json,os
from pathlib import Path
def assistant_root(home=None,environ=None):
 home=Path(home or Path.home()); env=os.environ if environ is None else environ
 if env.get('DSH_ASSISTANT_ROOT'):return Path(env['DSH_ASSISTANT_ROOT']).expanduser().resolve()
 default=home/'.dsh-plugin-wechat/workspace/.assistant'
 marker=default/'location.json'
 if marker.is_file():
  value=json.loads(marker.read_text(encoding='utf-8'))['root']
  if not Path(value).is_absolute():raise ValueError('工作区登记路径无效')
  return Path(value)
 return default
