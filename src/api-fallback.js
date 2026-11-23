// Bounded transport failover. Parsing, validation and persistence stay outside.
export function transportFailure(kind,message,httpStatus){
 const error=new Error(message);error.transportKind=kind;
 error.retryableTransport=['network','timeout'].includes(kind)||(['http','provider'].includes(kind)&&[408,429,500,502,503,504,524].includes(httpStatus));
 if(httpStatus!==undefined)error.httpStatus=httpStatus;
 return error;
}
// Only explicit temporary provider failures qualify; quota/auth/schema errors do not.
export function permanentProviderError(d={}) {
 return /insufficient|quota|billing|balance|payment|invalid.{0,8}key|authentication|unauthorized|forbidden|invalid.?request|unsupported|not.?found|context.?length|token.?limit|content.?filter|额度|余额|欠费|鉴权|不支持|上下文.{0,8}(限制|超)/i.test(`${d.providerCode||''} ${d.providerMessage||''}`);
}
export function wrappedProviderError(content){
 return /^\[API\s*错误\]\s*(\S[\s\S]*)$/i.exec(content.trim())?.[1];
}
export function providerFailure(d,message,kind='provider'){
 if(!d.providerError&&kind!=='http')return Object.assign(new Error(message),{requestStage:'response'});
 const detail=`${d.providerCode||''} ${d.providerMessage||''}`.trim();
 const status=Number(detail.match(/^([45]\d{2})(?:\s|$)|\bstatus(?:\s+code)?\s*[:=]?\s*([45]\d{2})\b/i)?.slice(1).find(Boolean))||d.httpStatus;
 const quota=/insufficient.?quota|quota.*(?:exceeded|exhausted)|(?:monthly|daily) quota|billing|balance|payment|额度|余额|欠费/i.test(detail);
 const busy=status===503||/service.?unavailable|overload|high demand|server.?busy|服务.{0,4}(不可用|繁忙)/i.test(detail);
 const limited=status===429||/rate.?limit|too.?many.?requests|限流/i.test(detail);
 const timeout=[408,504,524].includes(status)||/gateway.?timeout|timed out/i.test(detail);
 const label=quota?'AI 渠道额度不足，请更换渠道或补充额度':busy?'AI 渠道繁忙，请稍后重试或更换渠道':timeout?'AI 渠道请求超时，请稍后重试或更换渠道':limited?'AI 渠道请求太频繁，请稍后再试':message;
 const error=transportFailure(kind,label===message?message:`${label}${status>=400?`（HTTP ${status}）`:''}`,status);
 error.requestStage='transport';
 error.retryableTransport=!quota&&!permanentProviderError(d)&&(kind==='http'||!d.textCharacters)&&(error.retryableTransport||busy||timeout||limited||/temporar|internal.?server.?error/i.test(detail));
 return error;
}
export function retryDelay(ms,signal){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('查询已取消','AbortError'));return;}
  const abort=()=>{clearTimeout(timer);reject(new DOMException('查询已取消','AbortError'));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
  signal?.addEventListener('abort',abort,{once:true});
 });
}
export async function requestWithFallback(plan,request,{signal,check=()=>{},onAttempt=()=>{},onFailure=()=>{},onSwitch=()=>{},retryDelays=[],wait=retryDelay,onRetry=()=>{},maxAttempts=Infinity}={}){
 const guard=()=>{if(signal?.aborted)throw new DOMException('查询已取消','AbortError');check();};
 guard();
 if(maxAttempts!==Infinity&&(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>3))throw Error('请求次数预算无效');
 const limit=Math.min(maxAttempts,retryDelays.length?Math.min(3,Math.max(plan.length,1+retryDelays.length)):plan.length);
 for(let i=0;i<limit;i++){
  const index=Math.min(i,plan.length-1);if(index<0)break;
  guard();const connection={...plan[index],attempt:i+1,attemptLimit:limit,connectionIndex:index+1,retry:Math.max(0,i-plan.length+1)};onAttempt(connection);
  try{const result=await request(connection);guard();return result;}
  catch(error){guard();onFailure(connection,error);
   if(error?.name==='AbortError'||error?.retryableTransport!==true||i+1===limit)throw error;
   const nextIndex=Math.min(i+1,plan.length-1);
   // generateRaw may keep running after timeout; never start it again on that connection.
   if(nextIndex===index&&connection.settings?.mode==='st')throw error;
   if(nextIndex!==index)onSwitch({from:connection,to:plan[nextIndex],kind:error.transportKind,httpStatus:error.httpStatus});
   if(retryDelays.length){const delay=retryDelays[Math.min(i,retryDelays.length-1)];onRetry({attempt:i+2,limit,delay,kind:error.transportKind,httpStatus:error.httpStatus});guard();await wait(delay,signal);guard();}
  }
 }
 throw Error('没有可用的AI连接');
}

