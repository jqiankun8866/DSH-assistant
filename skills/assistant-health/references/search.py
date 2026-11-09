"""Offline evidence-card lookup. No network, paid model or patient data."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('query');p.add_argument('--limit',type=int,default=5);a=p.parse_args()
rows=json.loads(Path(__file__).with_name('evidence.json').read_text(encoding='utf-8'))['records']
terms=a.query.lower().split()
result=[]
for r in rows:
 text=' '.join(str(r.get(k,'')) for k in ['topic','title','type','note','limitations']).lower()
 score=sum(3*(t in r['topic'].lower())+(t in text) for t in terms)
 if score:result.append((score,r))
result.sort(key=lambda x:(-x[0],x[1]['id']))
print(json.dumps({'query':a.query,'totalMatches':len(result),'records':[r for _,r in result[:max(1,min(a.limit,10))]],'notice':'这是初筛证据卡。按review_status判断已读范围；重要健康结论仍须核验原文和更新。'},ensure_ascii=False,indent=2))
