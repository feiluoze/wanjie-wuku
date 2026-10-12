// Bounded transport failover. Parsing, validation and persistence stay outside.
export function transportFailure(kind,message,httpStatus){
 const error=new Error(message);error.transportKind=kind;
 error.retryableTransport=['network','timeout'].includes(kind)||(kind==='http'&&[408,429,500,502,503,504].includes(httpStatus));
 if(httpStatus!==undefined)error.httpStatus=httpStatus;
 return error;
}
export async function requestWithFallback(plan,request,{signal,check=()=>{},onAttempt=()=>{},onFailure=()=>{},onSwitch=()=>{}}={}){
 const guard=()=>{if(signal?.aborted)throw new DOMException('查询已取消','AbortError');check();};
 guard();
 for(let i=0;i<plan.length;i++){
  guard();const connection={...plan[i],attempt:i+1,attemptLimit:plan.length};onAttempt(connection);
  try{const result=await request(connection);guard();return result;}
  catch(error){guard();onFailure(connection,error);
   if(error?.name==='AbortError'||error?.retryableTransport!==true||i+1===plan.length)throw error;
   onSwitch({from:connection,to:plan[i+1],kind:error.transportKind,httpStatus:error.httpStatus});
  }
 }
 throw Error('没有可用的AI连接');
}
