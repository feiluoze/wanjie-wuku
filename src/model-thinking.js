// DeepSeek-specific option; never attach vendor fields to unrelated models.
export function thinkingOptions(settings={}){
 const mode=settings.thinkingMode||'auto',model=String(settings.model||'').toLowerCase();
 let official=false;try{official=new URL(settings.baseUrl).hostname==='api.deepseek.com';}catch{}
 const supported=official||/^deepseek-(?:flash|v4-pro)$/.test(model);
 if(!supported)return {};
 return {thinking:{type:mode==='on'?'enabled':'disabled'}};
}
