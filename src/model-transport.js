// Verified against SillyTavern 1.18 custom chat-completions routes.
// Host CSRF/session headers stay local; the explicitly supplied API key goes upstream.
export function backendRequestHeaders(context){
 const ctx=context?.();
 return typeof ctx?.getRequestHeaders==='function'?{...ctx.getRequestHeaders(),'Content-Type':'application/json'}:null;
}
export function independentFetch(fetchImpl,url,options,requestHeaders){
 if(!requestHeaders)return fetchImpl(url,options);
 const discovery=options.method==='GET',suffix=discovery?'/models':'/chat/completions';
 if(!url.endsWith(suffix))throw new Error('独立接口路径无效');
 const generation=discovery?{}:JSON.parse(options.body);
 const body={...generation,chat_completion_source:'custom',custom_url:url.slice(0,-suffix.length),
  // JSON is valid YAML. Explicit empty authorization prevents use of a saved host key.
  custom_include_headers:JSON.stringify({Authorization:options.headers?.Authorization||''})};
 return fetchImpl(discovery?'/api/backends/chat-completions/status':'/api/backends/chat-completions/generate',{
  method:'POST',credentials:'same-origin',headers:requestHeaders,signal:options.signal,body:JSON.stringify(body)});
}
