"""Read only literal model identifiers from the DSH default-model block."""
import json,re

def scalar(value):
 value=value.strip()
 try:
  if value.startswith('"'):value=json.loads(value)
  elif value.startswith("'") and value.endswith("'"):value=value[1:-1].replace("''","'")
  else:value=value.split(' #',1)[0].strip()
 except (ValueError,TypeError):return None
 return value if isinstance(value,str) and re.fullmatch(r'[\w./:@+\-]+',value) else None

def parse_default(text):
 lines=text.splitlines();found=[]
 for i,line in enumerate(lines):
  match=re.fullmatch(r'( *)- id: [\'\"]?agent-default-model[\'\"]?\s*',line)
  if not match:continue
  indent=len(match[1]);block=[]
  for value in lines[i+1:]:
   if value.strip() and not value.lstrip().startswith('#') and len(value)-len(value.lstrip())<=indent:break
   block.append(value)
  if any(re.fullmatch(' '*(indent+2)+r'disabled:\s*true\s*',v) for v in block):return None
  if not any(re.fullmatch(' '*(indent+2)+r'config:\s*',v) for v in block):return None
  data={}
  for key in ('provider','model'):
   values=[scalar(m[1]) for v in block if (m:=re.fullmatch(' '*(indent+4)+key+r':\s*(.+)',v))]
   if len(values)!=1 or not values[0]:return None
   data[key]=values[0]
  found.append(data)
 return found[0] if len(found)==1 else None

def default_model(profile):
 for name in ('cordis.patch.yml','cordis.yml'):
  path=profile/name
  if not path.is_file():continue
  text=path.read_text(encoding='utf-8-sig')
  # Explicit but unrecognized patch must not fall back to a different base model.
  if re.search(r'^\s*- id: [\'\"]?agent-default-model[\'\"]?\s*$',text,re.M):return parse_default(text)
 return None
