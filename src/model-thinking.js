// Vendor controls are explicit; unknown providers remain under user configuration.
export function thinkingOptions(settings={}){
 const mode=settings.thinkingMode||'auto',model=String(settings.model||'').toLowerCase();
 let official=false;try{official=new URL(settings.baseUrl).hostname==='api.deepseek.com';}catch{}
 if(official||/^deepseek-(?:flash|v4-pro|v4\.1-flash-free)$/.test(model))return {thinking:{type:mode==='on'?'enabled':'disabled'}};
 // MiniMax M2 always thinks. Splitting reasoning prevents it entering the JSON reader.
 if(/^minimax-m2(?:\.|$)/.test(model))return {reasoning_split:true};
 if(model==='minimax-m3')return {thinking:{type:mode==='on'?'adaptive':'disabled'},reasoning_split:true};
 if(model==='minimax-m3.1-flash-preview')return {reasoning_split:true,...(mode==='on'?{}:{reasoning_effort:'low'})};
 return {};
}
