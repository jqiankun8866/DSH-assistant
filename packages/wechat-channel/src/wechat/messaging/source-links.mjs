// Presentation only: preserve signed URLs byte-for-byte, with no shortener/network call.
export function compactXhsLinks(text){
 const isNote=url=>{try{const u=new URL(url);return /^https?:$/.test(u.protocol)&&((['www.xiaohongshu.com','xiaohongshu.com'].includes(u.hostname)&&/^\/(explore|discovery\/item)\//.test(u.pathname))||u.hostname==='xhslink.com')}catch{return false}};
 // Protect code and existing Markdown (including image syntax) before bare URLs.
 return text.replace(/(```[\s\S]*?(?:```|$)|`[^`\n]*`|!?\[[^\]\n]*\]\(<?https?:\/\/[^\s<>]+?>?\)|https?:\/\/[^\s<>\[\]"'\u3000-\uffef]+)/g,part=>{
  if(part.startsWith('`')||part.startsWith('!['))return part;
  if(part.startsWith('['))return part;
  const end=part.match(/[.,;!?)]+$/)?.[0]??'';
  const url=end?part.slice(0,-end.length):part;
  return isNote(url)?'[原帖]('+url+')'+end:part;
 });
}
