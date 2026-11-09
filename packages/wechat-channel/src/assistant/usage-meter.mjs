// Aggregate counts only: no messages, credentials, prompts or attachments.
export class UsageMeter {
 constructor(db,now=Date.now){this.db=db;this.now=now;db.exec(`CREATE TABLE IF NOT EXISTS auxiliary_usage(day TEXT NOT NULL,chain TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(day,chain,provider,model))`)}
 record({chain,provider,model,usage,durationMs=0,failed=false,inputChars=0,outputChars=0,eventTypes=[]}){
  const day=new Date(this.now()).toISOString().slice(0,10),key=[day,chain,provider,model];
  const old=this.db.prepare('SELECT data FROM auxiliary_usage WHERE day=? AND chain=? AND provider=? AND model=?').get(...key);
  const r=old?JSON.parse(old.data):{requests:0,reportedRequests:0,failedRequests:0,durationMs:0,inputChars:0,outputChars:0,tokens:{}};
  r.requests++;r.failedRequests+=Number(failed);r.durationMs+=durationMs;r.inputChars+=inputChars;r.outputChars+=outputChars;
  const fields=['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','totalTokens'];
  if(usage&&fields.some(k=>Number.isFinite(usage[k]))){r.reportedRequests++;for(const k of fields)if(Number.isFinite(usage[k]))r.tokens[k]=(r.tokens[k]??0)+usage[k]}
  r.missingUsageRequests=r.requests-r.reportedRequests;r.lastEventTypes=[...new Set(eventTypes)].slice(0,16);
  this.db.prepare('INSERT OR REPLACE INTO auxiliary_usage VALUES(?,?,?,?,?)').run(...key,JSON.stringify(r));
 }
 summary(){return {timeZone:'UTC',scope:'auxiliary-only; main chat and native compaction remain in DSH session logs',rows:this.db.prepare('SELECT * FROM auxiliary_usage ORDER BY day DESC,chain LIMIT 120').all().map(({data,...r})=>({...r,...JSON.parse(data)}))}}
}
