// Input compatibility only. Never changes persisted schemas or guesses ownership.
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
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
