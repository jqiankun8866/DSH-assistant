// Only fixed, reviewed messages leave this boundary. Provider payloads stay in logs.
export function isQuotaFailure(error){
 if(error instanceof TurnFailure)return error.failureKind==='quota';
 const code=String(error?.code??'');const status=Number(error?.status??error?.statusCode);const message=String(error?.message??error??'');
 return status===402||/^(ACCOUNT_QUOTA|insufficient_quota)$/i.test(code)||/Insufficient Balance|余额不足|额度不足/i.test(message);
}
export function failureMessage(error){
 const code=String(error?.code??'');const status=Number(error?.status??error?.statusCode);const message=String(error?.message??error??'');
 if(status===402||/ACCOUNT_QUOTA|insufficient_quota/i.test(code)||/Insufficient Balance|余额不足/i.test(message))return '消息收到了，但模型账户的余额或额度不足，暂时没法回答。请在 DSH 中补充额度，或切换到有额度的模型后再试。';
 if(status===401||status===403)return '消息收到了，但模型服务的登录或授权失效了。请检查 DSH 的模型账户和 API 密钥。';
 if(status===429||/rate_limit/i.test(code))return '消息收到了，模型服务现在请求过多，暂时没能回复。请稍后再试。';
 if(status>=500||/at capacity|overloaded/i.test(message))return '消息收到了，模型服务暂时不可用。请稍后再试，或在 DSH 中切换模型。';
 if(/timeout|ETIMEDOUT|ENOTFOUND|ECONNRESET|fetch failed/i.test(code+' '+message))return '消息收到了，但连接模型服务时失败了。请检查网络，稍后再试。';
 return '消息收到了，但这次处理没有完成。请稍后再试；如果刚才涉及下单或发送，先核对结果，避免重复操作。';
}
export class TurnFailure extends Error{
 constructor(cause){super(failureMessage(cause));this.name='TurnFailure';this.userMessage=this.message;this.failureKind=isQuotaFailure(cause)?'quota':'other';}
}
export function assertTurnSucceeded(events,afterSeq){
 const ends=events.filter(e=>e.seq>afterSeq&&e.type==='turn/end');
 const reason=ends.at(-1)?.data?.reason;
 if(reason?.kind==='error')throw new TurnFailure(reason.error);
}
export function safeFailureReply(error){return error instanceof TurnFailure?error.userMessage:failureMessage(error)}
