import { readFileSync } from 'node:fs';
import { panelMemoryCall } from './panel-memory.mjs';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { panelHtml } from './control-panel-ui.mjs';
import {panelTaskCall} from './panel-tasks.mjs';
import {personaPromptStatus} from './personal-prompt.mjs';
import {join} from 'node:path';

const allowed = {
  health: ['assistant_health',['chart','save_demographics','save_record','delete_record']],
  memes: ['meme_collection',['get','set','open']],
  persona: ['assistant_persona', ['get', 'update']],
  profile: ['assistant_profile', ['get', 'update']],
  memory: ['assistant_memory', ['list','update','delete']],
  tasks: ['assistant_tasks', ['list','create','update','complete','reopen','retry','delete']],
};
export function panelPeers(service) {
  return service.engine.db.prepare('SELECT peer FROM activity UNION SELECT peer FROM profiles UNION SELECT peer FROM personas ORDER BY peer').all()
    .filter(r => r.peer.startsWith('weixin:')).map(({peer}) => ({peer, nickname: service.engine.profile(peer).nickname}));
}
export async function startControlPanel(service, {port = 17960} = {}) {
  const token = randomBytes(32).toString('hex');
  let origin;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    const json = (status, value) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return json(403, {error:'仅接受本机面板请求'});
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/') {
      const nonce = randomBytes(18).toString('base64');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      // The loopback document bootstraps its own credential. SOP, exact Host,
      // no CORS and bearer-only JSON mutations prevent cross-site API access.
      if(req.headers['sec-fetch-dest'] && !['document','empty'].includes(req.headers['sec-fetch-dest'])) return json(403,{error:'请直接打开本机面板'});
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
      return res.end(panelHtml.replace('SCRIPT_NONCE',nonce).replace('PANEL_TOKEN',token));
    }
    if(req.method==='GET' && url.pathname==='/assets/fish-secretary.png'){
      // A dedicated text-free avatar, independent from the user's chat stickers.
      try{const asset=readFileSync(join(service.root,'assets','fish-secretary.png'));res.writeHead(200,{'Content-Type':'image/png'});return res.end(asset)}catch{}
      try{const asset=readFileSync(new URL('../../assets/fish-secretary.png',import.meta.url));res.writeHead(200,{'Content-Type':'image/png'});return res.end(asset)}catch{return json(404,{error:'头像文件缺失'})}
    }
    const auth = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from('Bearer '+token);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return json(401, {error:'请重新运行“打开大肥鱼面板”以取得访问权限'});
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') return json(200,{ok:true});
      if (req.method === 'GET' && url.pathname === '/api/peers') return json(200,{peers:panelPeers(service)});
      if (req.method !== 'POST' || url.pathname !== '/api/call') return json(404,{error:'接口不存在'});
      if (!(req.headers['content-type']??'').startsWith('application/json')) return json(415,{error:'需要 JSON'});
      let size=0; const chunks=[];
      for await (const chunk of req) {size+=chunk.length; if(size>16384){json(413,{error:'内容过长'}); return;} chunks.push(chunk);}
      const {peer, section, action, data={}}=JSON.parse(Buffer.concat(chunks).toString());
      if (!panelPeers(service).some(p=>p.peer===peer)) return json(404,{error:'微信用户不存在；请先在微信发起对话'});
      const route=Object.hasOwn(allowed,section)?allowed[section]:null;
      if (!route || !route[1].includes(action)) return json(403,{error:'面板不支持此操作'});
      if (!data || typeof data!=='object' || Array.isArray(data)) throw Error('设置格式无效');
      if(section==='health'&&action==='save_record'&&!data.key)return json(403,{error:'新增档案请在微信对话中提供资料'});
      if(section==='persona'&&action==='get')return json(200,{...service.call(peer,'assistant_persona','get',data),prompt:personaPromptStatus(service,peer)});
      return json(200,await (section==='memes'?service.memeCollector.call(peer,action,data):section==='memory'?panelMemoryCall(service,peer,action,data):section==='tasks'?panelTaskCall(service,peer,action,data):service.call(peer,route[0],action,data)));
    } catch(error) { return json(400,{error:error instanceof SyntaxError?'请求格式无效':String(error.message??error)}); }
  });
  server.requestTimeout=15000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  origin='http://127.0.0.1:'+server.address().port;
  return {origin,token,url:origin+'/#'+token,close:()=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections()})};
}
