// User-owned prompt snapshots. No imported code, connection parameters or host
// macro evaluator executes here. Task data and the plugin contract stay intact.
import {assert,clone} from './primitives.js';
import {AI_TASKS} from './task-routing.js';
export const PRESET_FILE_LIMIT=2*1024*1024;
const roles=new Set(['system','user','assistant']);
const markers=new Set(['personaDescription','worldInfoBefore','charDescription','charPersonality','scenario','worldInfoAfter','dialogueExamples','chatHistory']);
export const emptyPromptLibrary=()=>({version:1,revision:0,presets:[],routes:{}});
export function importPromptPreset(input,name='自定义预设'){
 assert(typeof input==='string'&&input.length<=PRESET_FILE_LIMIT,'预设超过2MB或不是文本');
 let raw;try{raw=JSON.parse(input.replace(/^\uFEFF/,''));}catch{throw Error('预设不是有效JSON，请导入酒馆补全预设或武库预设JSON');}
 assert(raw&&typeof raw==='object'&&!Array.isArray(raw),'预设必须为JSON对象');
 const own=raw.format==='wjwk-prompt-preset-v1',rows=own?raw.blocks:raw.prompts;
 assert(Array.isArray(rows)&&rows.length>0&&rows.length<=256,'预设需包含1—256个提示块（prompts）');
 const ids=new Set(),blocks=rows.map((b,i)=>{
  assert(b&&typeof b==='object','提示块格式无效');
  const id=String(own?b.id:b.identifier||'block-'+i);assert(id.length<=120&&!ids.has(id),'提示块标识重复或过长');ids.add(id);
  const marker=own?b.kind==='task'||b.kind==='context':Boolean(b.marker||markers.has(id));
  const kind=marker?(id==='chatHistory'||b.kind==='task'?'task':'context'):'text';
  const role=b.role||'system';assert(roles.has(role),'不支持的提示角色：'+role);
  const content=kind==='text'?b.content||'':'';assert(typeof content==='string'&&content.length<=200000,'提示块正文无效或超过200000字符');
  return {id,name:String(b.name||id).slice(0,120),role,kind,content,enabled:kind!=='context'&&b.enabled!==false};
 });
 if(!own&&Array.isArray(raw.prompt_order)&&raw.prompt_order.length){
  const entry=raw.prompt_order.find(e=>e?.character_id===100001)||raw.prompt_order.find(e=>e?.character_id===100000)||raw.prompt_order[0];
  assert(Array.isArray(entry?.order),'预设prompt_order缺少有效顺序');
  const seen=new Set(),ordered=[];
  for(const item of entry.order){const b=blocks.find(b=>b.id===item.identifier);if(!b)continue;assert(!seen.has(b.id),'预设顺序含重复提示块');seen.add(b.id);ordered.push({...b,enabled:b.enabled&&item.enabled!==false});}
  for(const b of blocks)if(!seen.has(b.id))ordered.push({...b,enabled:false});
  blocks.splice(0,blocks.length,...ordered);
 }
 const preset={id:'prompt_'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)),name:String(raw.name||name).replace(/\.json$/i,'').trim().slice(0,80)||'自定义预设',blocks};
 assert(blocks.some(b=>b.kind==='text'&&b.content.trim()),'预设没有可用的文本提示块');return preset;
}
export function validatePromptLibrary(value){
 assert(value?.version===1&&Number.isSafeInteger(value.revision)&&value.revision>=0&&Array.isArray(value.presets)&&value.presets.length<=20,'预设库格式无效或超过20份');
 assert(JSON.stringify(value).length<=4*1024*1024,'预设库总量超过4MB，请删减提示块');
 const ids=new Set();for(const p of value.presets){
  assert(typeof p.id==='string'&&p.id.length<=120&&!ids.has(p.id)&&typeof p.name==='string'&&p.name.trim()&&p.name.length<=80,'预设名称或标识无效');ids.add(p.id);
  assert(Array.isArray(p.blocks)&&p.blocks.length>0&&p.blocks.length<=256,'预设提示块数量无效');
  const blockIds=new Set();for(const b of p.blocks){assert(typeof b.id==='string'&&!blockIds.has(b.id)&&b.id.length<=120&&typeof b.name==='string'&&b.name.length<=120&&roles.has(b.role)&&['text','task','context'].includes(b.kind)&&typeof b.content==='string'&&b.content.length<=200000&&typeof b.enabled==='boolean','预设提示块无效');blockIds.add(b.id);assert(b.kind!=='context'||!b.enabled,'角色与世界书插槽不在内部任务中重复展开');}
 }
 assert(value.routes&&typeof value.routes==='object'&&!Array.isArray(value.routes),'预设任务配置无效');
 for(const [task,id]of Object.entries(value.routes))assert(Object.hasOwn(AI_TASKS,task)&&typeof id==='string'&&(!id||ids.has(id)),'预设任务引用不存在');
 return clone(value);
}
export function exportPromptPreset(p){return {format:'wjwk-prompt-preset-v1',name:p.name,blocks:clone(p.blocks)};}
// Minimal deterministic macro subset, scoped to this one request. Host chat
// variables are never read/written. Unknown syntax fails before any API call.
function renderBlock(block,names,vars){
 let text=block.content,steps=0;
 while(/\{\{[^{}]*\}\}/.test(text)){
  assert(++steps<=2000,'预设宏展开次数过多：'+block.name);
  text=text.replace(/\{\{([^{}]*)\}\}/,(whole,body)=>{
   const bits=body.split('::'),key=bits[0].trim().toLowerCase();
   if((key==='user'||key==='char')&&bits.length===1)return String(names[key]||'');
   if(['setvar','setglobalvar'].includes(key)&&bits.length>=3){vars.set(key==='setvar'?'local:'+bits[1]:'global:'+bits[1],bits.slice(2).join('::'));return '';}
   if(['getvar','getglobalvar'].includes(key)&&bits.length===2){const id=(key==='getvar'?'local:':'global:')+bits[1];assert(vars.has(id),'预设宏引用未初始化：'+block.name+' / '+bits[1]);return vars.get(id);}
   if(key.startsWith('//'))return '';
   throw Error('预设包含暂不支持的宏：'+block.name+' / '+key+'；请取消该块或改为普通文本');
  });
  assert(text.length<=200000,'预设宏展开后过长：'+block.name);
 }
 assert(!text.includes('{{')&&!text.includes('}}'),'预设包含未闭合或嵌套不兼容宏：'+block.name);return text;
}
export function composePromptPreset(prompt,settings,task='general',names={}){
 const library=settings?.promptPresetLibrary;if(!library?.routes?.[task])return prompt;
 validatePromptLibrary(library);const p=library.presets.find(p=>p.id===library.routes[task]);
 const messages=[],vars=new Map(),original=prompt.messages?clone(prompt.messages):[{role:'system',content:prompt.system},{role:'user',content:prompt.user}];
 let placed=false;const place=()=>{if(!placed){messages.push(...original);placed=true;}};
 for(const b of p.blocks){if(!b.enabled)continue;if(b.kind==='task'){place();continue;}if(b.kind!=='text')continue;const content=renderBlock(b,names,vars);if(content.trim())messages.push({role:b.role,content});}
 place();
 // A final task contract prevents a writing preset's prefill from accidentally
 // turning an internal JSON operation into a main-chat continuation.
 messages.push({role:'system',content:'以上是玩家选定的辅助预设与本次内部任务。本次只返回武库任务规定的结果格式，不续写主聊天，不输出预设的剧情模板或思考过程。任务中的事实、来源、归属与资源约束仍须遵守。'});
 assert(JSON.stringify(messages).length<=1600000,'加上预设后请求超过1600000字符，请减少提示块或任务范围');
 return {...prompt,messages};
}
