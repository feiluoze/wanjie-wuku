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
export function resolveArchiveCategory(input,config,before){
 // Existing and explicitly declared categories carry meaning: never reclassify them by field shape.
 if(!object(input)||input.recordId||before?.specific||!object(input.details))return input;
 if(['wuku.primordial_world','builtin-mmlc'].includes(config?.id))return input;
 const keys=Object.keys(input.details).filter(k=>!['quote','ruleQuote','ownerPowerId'].includes(k));
 if(!keys.length||keys.some(k=>['source_profile','time_state'].includes(k)))return input;
 const matches=(config?.records||[]).filter(r=>keys.every(k=>r.fields?.some(f=>f.id===k)));
 return matches.length===1?{...input,recordId:matches[0].id}:input;
}
export function prepareArchiveFields(input,types,definition,config){
 const raw=unwrapArchiveInput(input),fields={},details={},held=[];if(object(raw.details))raw.details={...raw.details};
 // Evidence metadata is never a dedicated statistic. Preserve conflicts for review.
 if(object(raw.details))for(const key of ['quote','ruleQuote'])if(Object.hasOwn(raw.details,key)){
  const value=raw.details[key];if(typeof value!=='string')continue;
  if(raw[key]!==undefined&&raw[key]!==value)throw Error('引用字段内容冲突，请按原文核对');
  raw[key]=value;delete raw.details[key];
 }
 const general=Object.entries(types[raw?.type]||{}),specific=(definition?.fields||[]).map(f=>[f.id,f.label]);
 const resolve=(key,entries)=>entries.find(([id])=>id===key)?.[0]||entries.find(([,label])=>label===key)?.[0];
 const valueText=value=>{
  if(typeof value==='string')return value;
  if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean')return String(value);
  if(Array.isArray(value)&&value.length&&value.every(v=>typeof v==='string'))return value.join('\n');
  return null;
 };
 const add=(section,key,value)=>{
  if(key==='ownerPowerId'){
   if(value===null)return;
   if(typeof value!=='string'||raw.ownerPowerId!==undefined&&raw.ownerPowerId!==value)throw Error('字段中的金手指归属冲突，请核对');
   raw.ownerPowerId=value;return;
  }
  // Never quarantine protected fields and thereby bypass their original checks.
  if(['source_profile','time_state'].includes(key)){details[key]=value;return;}
  const sid=resolve(key,specific),gid=resolve(key,general);
  const target=section==='details'&&sid?details:gid?fields:sid?details:null;
  const id=target===details?sid:gid;
  const text=valueText(value);
  // Preserve known, misplaced descriptive statistics without assigning a different category.
  if(!target&&definition&&supplementTarget&&descriptiveLabels.has(key)&&text!==null&&text.length<=4000){extras.push(descriptiveLabels.get(key)+'：'+text);return;}
  if(!target&&section==='fields'&&!definition&&!raw.recordId&&supplementTarget&&genericLabels.has(key)&&text!==null&&text.length<=4000){extras.push(genericLabels.get(key)+'：'+text);return;}
  if(!target||text===null||text.length>4000){held.push({section,key,value,code:!target?'unknown_field':text===null?'non_text_field':'overlong_field'});return;}
  if(Object.hasOwn(target,id)&&!same(target[id],text)){
   // A more precise location containing the full shorter location is complementary.
   if(id==='location'){
    const normalize=v=>v.normalize('NFKC').replace(/\s/g,'');
    const left=normalize(target[id]),right=normalize(text);
    if(left&&right&&(left.includes(right)||right.includes(left))){if(right.length>left.length)target[id]=text;return;}
   }
   // Let the existing canonical conflict UI arbitrate; never choose a value.
   throw Object.assign(Error('重复字段内容冲突：'+key+'；请本地核对'),{fieldConflicts:[{key:(target===details?'details':'fields')+':'+id,section:target===details?'details':'fields',id,label:key,left:target[id],right:text}]});
  }
  target[id]=text;
 };
 // Exact declared general fields accidentally placed at top level are moved, never inferred.
 for(const [id]of general)if(Object.hasOwn(raw,id)){add('fields',id,raw[id]);delete raw[id];}
 const extraLabels={progress:'进度',triggerMechanism:'触发依据',consumed:'消耗记录',remaining:'剩余记录'};
 const extras=[];
 const supplementTarget=Object.hasOwn(types[raw.type]||{},'description')?'description':Object.hasOwn(types[raw.type]||{},'condition')?'condition':Object.hasOwn(types[raw.type]||{},'conditions')?'conditions':Object.hasOwn(types[raw.type]||{},'progress')?'progress':null;
 if(!definition&&!raw.recordId&&typeof raw.details==='string'&&supplementTarget){extras.push('补充记录：'+raw.details);delete raw.details;}
 const genericLabels=new Map(Object.values(types).flatMap(row=>Object.entries(row)));
 const descriptiveLabels=new Map((config?.records||[]).flatMap(r=>(r.fields||[]).filter(f=>!/(?:^|_)(?:id|ids)$/.test(f.id)&&!['source_profile','time_state'].includes(f.id)).map(f=>[f.id,f.label||f.id])));

 if(!definition&&!raw.recordId&&object(raw.details))for(const [key,value]of Object.entries(raw.details)){
  if(!Object.hasOwn(extraLabels,key)||typeof value!=='string'||value.length>4000)continue;
  if(key==='progress'){
   const numbers=s=>String(s).match(/\d+(?:\.\d+)?%/g)||[];
   const left=numbers(raw.fields?.limits),right=numbers(value);
   if(left.length&&right.length&&JSON.stringify(left)!==JSON.stringify(right))throw Object.assign(Error('重复字段内容冲突：进度与通用字段不一致；请按原文核对'),{fieldConflicts:[{section:'fields',id:'limits',key:'fields:limits',label:'进度',left:raw.fields.limits,right:value}]});
  }
  extras.push(extraLabels[key]+'：'+value);delete raw.details[key];
 }
 for(const section of ['fields','details']){
  if(raw[section]!==undefined&&!object(raw[section]))return {raw,held:[]};
  for(const [key,value]of Object.entries(raw[section]||{}))add(section,key,value);
 }
 if(extras.length){const target=supplementTarget;const combined=[fields[target],...extras].filter(Boolean).join('\n');if(target&&combined.length<=4000)fields[target]=combined;else for(const value of extras)held.push({section:'details',key:'补充记录',value,code:'overlong_field'});}
 if(!definition&&!raw.recordId&&object(raw.details)&&!Object.keys(raw.details).length)delete raw.details;
 return {raw:{...raw,fields,...(definition?{details}:raw.details!==undefined?{details:raw.details}:{})},held};
}
