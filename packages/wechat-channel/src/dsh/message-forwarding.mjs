// User-role messages also carry internal snapshots. Only explicit human
// messages may be mirrored; scheduled turns have a single scheduler delivery.
export function shouldForwardUserMessage(message,{scheduled=false,fromWechat=false}={}){
 return !scheduled&&!fromWechat&&message?.source?.kind==='user';
}
