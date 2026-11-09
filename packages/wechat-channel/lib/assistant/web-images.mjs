import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import http from 'node:http';import https from 'node:https';
import {saveNoteImages} from './xhs-images.mjs';
const check=(v,m)=>{if(!v)throw Error(m)};
export function publicAddress(ip){if(isIP(ip)===6)return /^[23][0-9a-f]{3}:/i.test(ip)&&!/^2001:(?:db8|0|10|20):/i.test(ip)&&!/^2002:/i.test(ip);if(isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===192&&b===2||a===198&&b===51||a===203&&b===0);}
export function publicUrl(value){const u=new URL(value);check(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&(!u.port||['80','443'].includes(u.port)),'只支持公开HTTP/HTTPS网页和图片');check(!/^(localhost|.*\.localhost|.*\.local)$/i.test(u.hostname),'不允许访问本机或内网');const host=u.hostname.replace(/^\[|\]$/g,'');if(isIP(host))check(publicAddress(host),'不允许访问本机或内网');return u;}
export async function publicFetch(value,{maxBytes=8*1024*1024,signal,redirects=3}={}){
 const u=publicUrl(value);signal?.throwIfAborted();const host=u.hostname.replace(/^\[|\]$/g,'');const addresses=await lookup(host,{all:true});check(addresses.length&&addresses.every(x=>publicAddress(x.address)),'目标解析到非公开地址');signal?.throwIfAborted();const selected=addresses[0];
 return new Promise((resolve,reject)=>{
 const req=(u.protocol==='https:'?https:http).request(u,{method:'GET',signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; DSH-ImageFetcher/1.0)','Accept':'image/*,text/html;q=0.9'},lookup:(_h,opts,cb)=>opts?.all?cb(null,[selected]):cb(null,selected.address,selected.family)},res=>{
 if([301,302,303,307,308].includes(res.statusCode)){res.resume();if(redirects<=0||!res.headers.location){reject(Error('重定向过多'));return}publicFetch(new URL(res.headers.location,u).href,{maxBytes,signal,redirects:redirects-1}).then(resolve,reject);return}
 if(res.statusCode!==200){res.resume();reject(Error('网站返回HTTP '+res.statusCode+'，不绕过登录或访问限制'));return}
 if(Number(res.headers['content-length'])>maxBytes){res.destroy();reject(Error('内容超过下载大小限制'));return}
 const chunks=[];let bytes=0;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){req.destroy(Error('内容超过下载大小限制'));return}chunks.push(chunk)});res.on('error',reject);res.on('end',()=>resolve({url:u.href,type:String(res.headers['content-type']??''),bytes:Buffer.concat(chunks)}));
 });const timer=setTimeout(()=>req.destroy(Error('网站读取超时')),15000);req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
 });
}
const decode=s=>String(s??'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>{const v=Number(n);return v<=0x10ffff?String.fromCodePoint(v):''});
export function pageImages(html,base){
 const output=[],seen=new Set();for(const match of html.matchAll(/<(img|meta)\b[^>]*>/gi)){
 const attrs={};for(const a of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[a[1].toLowerCase()]=decode(a[2]??a[3]??a[4]);
 let value;if(match[1].toLowerCase()==='meta'){if(!['og:image','og:image:url','twitter:image','twitter:image:src'].includes(attrs.property??attrs.name))continue;value=attrs.content;}else value=attrs['data-src']||attrs['data-original']||attrs.src||attrs.srcset?.split(',').at(-1)?.trim().split(/\s+/)[0];
 if(!value)continue;try{const url=publicUrl(new URL(value,base).href).href;if(seen.has(url))continue;seen.add(url);output.push({index:output.length+1,url,alt:(attrs.alt??'').slice(0,160),kind:match[1].toLowerCase()==='meta'?'页面封面候选':'页面图片候选'});if(output.length>=30)break}catch{}
 }return output;
}
export async function webImages(root,action,data,signal){
 if(action==='list'){const r=await publicFetch(data.url,{signal,maxBytes:3*1024*1024});if(r.type.startsWith('image/'))return {source:r.url,images:[{index:1,url:r.url,kind:'图片直链'}]};check(/text\/html|application\/xhtml/i.test(r.type),'该地址不是HTML网页或图片');return {source:r.url,images:pageImages(r.bytes.toString('utf8'),r.url),scope:'只提取公开HTML中的图片地址，候选可能包括封面或图标；未看图。动态页面、登录墙可能无结果，不能绕过。'};}
 check(action==='download','action只能为list或download');check(Array.isArray(data.urls)&&data.urls.length>=1&&data.urls.length<=4&&data.urls.every(x=>typeof x==='string'),'urls为1–4个图片直链');for(const u of data.urls)publicUrl(u);if(data.source)publicUrl(data.source);
 const result=await saveNoteImages({root,folderName:'web-images',note:{url:data.source??null,title:'公开网页图片',images:data.urls},indices:data.urls.map((_,i)=>i+1),signal,download:async(url,s)=>{const r=await publicFetch(url,{signal:s});check(r.type.startsWith('image/'),'地址未返回图片，请先list网页找图');return r.bytes}});
 return {...result,scope:'下载公开图片并转为PNG，不代表已经理解画面；GIF仅取第一帧。保留原页面来源，不冒充原作者。',files:result.files.map(f=>({...f,imageUrl:data.urls[f.index-1]}))};
}
