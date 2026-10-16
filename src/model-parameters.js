// One JSON object per connection. Parse before any network request.
const ownObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const reserved=new Set(['model','messages','prompt','stream','chat_completion_source','custom_url','custom_include_body','custom_exclude_body','custom_include_headers','secret_id','apiKey','api_key','authorization','Authorization','headers','requestHeaders','reverse_proxy','proxy_password']);
export function customRequestParameters(value=''){
 if(value===undefined||value===null||value==='')return {};
 let parsed;
 if(typeof value==='string'){
  if(value.length>16000)throw Error('附加参数超过16000字符，请缩短后保存');
  if(!value.trim())return {};
  try{parsed=JSON.parse(value);}catch{throw Error('附加参数必须是完整 JSON 对象，请检查双引号、逗号和大括号');}
 }else throw Error('附加参数必须填写 JSON 对象文本');
 if(!ownObject(parsed))throw Error('附加参数顶层必须是 JSON 对象，不能是数组或单个值');
 for(const key of Object.keys(parsed))if(reserved.has(key)||key.startsWith('custom_'))throw Error('附加参数不能覆盖 '+key+'；模型、正文、传输与鉴权请使用对应设置');
 const inspect=(v,depth=0)=>{
  if(depth>12)throw Error('附加参数嵌套过深，最多12层');
  if(typeof v==='number'&&!Number.isFinite(v))throw Error('附加参数包含无效数值');
  if(v&&typeof v==='object')for(const [key,child] of Object.entries(v)){
   if(['__proto__','constructor','prototype'].includes(key))throw Error('附加参数包含不支持的对象键');
   inspect(child,depth+1);
  }
 };inspect(parsed);
 return parsed;
}
export function normalizeCustomParameters(value=''){
 const parsed=customRequestParameters(value);return Object.keys(parsed).length?JSON.stringify(parsed,null,2):'';
}
