// Input compatibility only. Never changes persisted schemas or guesses ownership.
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Translate an echoed storage envelope only when its adapter and category are declared.
export function normalizeArchiveEnvelope(input,config){
 if(!object(input)||!Object.hasOwn(input,'specific'))return input;
 const spec=input.specific;
 const fail=message=>{throw Error(message);};
 if(!object(spec)||!object(spec.fields)||!config||spec.adapterId!==config.id||!config.records.some(r=>r.id===spec.recordId))return fail('专用统计存储结构与当前适配声明不符');
 if(!Object.keys(spec).every(k=>['adapterId','recordId','fields','version','label','labels'].includes(k)))return fail('专用统计存储结构包含不允许的操作字段');
 if(input.recordId!==undefined&&input.recordId!==spec.recordId)return fail('专用统计分类与存储结构冲突');
 const raw={...input,recordId:spec.recordId};delete raw.specific;
 if(raw.details!==undefined){
  if(!object(raw.details))return fail('专用统计字段结构无效');
  if(object(raw.details.fields)){
   const d=raw.details;
   if(!Object.keys(d).every(k=>['adapterId','recordId','fields','version','label','labels'].includes(k))||(d.adapterId!==undefined&&d.adapterId!==config.id)||(d.recordId!==undefined&&d.recordId!==spec.recordId))return fail('专用统计字段结构与存储结构冲突');
   raw.details=d.fields;
  }
  for(const [key,value]of Object.entries(raw.details))if(Object.hasOwn(spec.fields,key)&&!same(spec.fields[key],value))return fail('重复字段内容冲突：'+key+'；请核对');
 }
 raw.details={...spec.fields,...raw.details};return raw;
}
export function unwrapArchiveInput(input){
 if(!object(input))return input;
 const raw={...input};let details=raw.details;
 if(!object(details))return raw;
 // Accept the persisted specific envelope when the model echoes current records.
 const envelope=object(details.fields)
  &&Object.keys(details).every(k=>['recordId','adapterId','version','label','labels','fields'].includes(k));
 if(envelope){
  if(raw.recordId&&details.recordId&&raw.recordId!==details.recordId)return raw;
  raw.recordId||=details.recordId;raw.details={...details.fields};
 }
 return raw;
}
export function prepareArchiveFields(input,types,definition){
 const raw=unwrapArchiveInput(input),fields={},details={},held=[];
 const general=Object.entries(types[raw?.type]||{}),specific=(definition?.fields||[]).map(f=>[f.id,f.label]);
 const resolve=(key,entries)=>entries.find(([id])=>id===key)?.[0]||entries.find(([,label])=>label===key)?.[0];
 const valueText=value=>{
  if(typeof value==='string')return value;
  if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean')return String(value);
  if(Array.isArray(value)&&value.length&&value.every(v=>typeof v==='string'))return value.join('\n');
  return null;
 };
 const add=(section,key,value)=>{
  // Never quarantine protected fields and thereby bypass their original checks.
  if(['source_profile','time_state'].includes(key)){details[key]=value;return;}
  const sid=resolve(key,specific),gid=resolve(key,general);
  const target=section==='details'&&sid?details:gid?fields:sid?details:null;
  const id=target===details?sid:gid;
  const text=valueText(value);
  if(!target||text===null||text.length>4000){held.push({section,key,value,code:!target?'unknown_field':text===null?'non_text_field':'overlong_field'});return;}
  if(Object.hasOwn(target,id)&&!same(target[id],text)){
   // Let the existing canonical conflict UI arbitrate; never choose a value.
   throw Object.assign(Error('重复字段内容冲突：'+key+'；请本地核对'),{fieldConflicts:[{key:(target===details?'details':'fields')+':'+id,section:target===details?'details':'fields',id,label:key,left:target[id],right:text}]});
  }
  target[id]=text;
 };
 for(const section of ['fields','details']){
  if(raw[section]!==undefined&&!object(raw[section]))return {raw,held:[]};
  for(const [key,value]of Object.entries(raw[section]||{}))add(section,key,value);
 }
 return {raw:{...raw,fields,...(definition?{details}:raw.details!==undefined?{details:raw.details}:{})},held};
}
