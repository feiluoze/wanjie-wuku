// Model-facing wire contract. Internal storage envelopes never cross this boundary.
import {ARCHIVE_FIELDS} from './archives.js';
import {legacyFrameworkForType} from './record-frameworks.js';
export function wireArchiveRecord(record){
 const {id,specific,...rest}=record;
 return {...rest,...(id?{archiveId:id}:{}),...(specific?.recordId?{recordId:specific.recordId,...(specific.fields&&Object.keys(specific.fields).length?{details:specific.fields}:{})}:{})};
}
export function archiveResponseSchema(payload){
 const text={type:'string',maxLength:4000},fields=entries=>({type:'object',additionalProperties:false,properties:Object.fromEntries(entries.map(id=>[id,text]))});
 const common={archiveId:{type:'string'},ownerPowerId:{type:'string'},name:{type:'string',minLength:1,maxLength:200},status:{enum:['active','planned','working','ended']},sourceIndex:{type:'integer'},quote:text,ruleQuote:{type:'string',maxLength:1200}};
 if(payload.moduleKind==='mmlc')common.module={type:'string'};
 if(payload.taskMode==='worldbook')common.settingRefs={type:'array',items:{type:'object',properties:{book:{type:'string'},id:{type:['string','integer']},part:{type:'integer'}},required:['book','id'],additionalProperties:false}};
 common.uncertainFields={type:'array',maxItems:64,items:{type:'object',additionalProperties:false,required:['section','field','reason'],properties:{section:{enum:['fields','details']},field:{type:'string',maxLength:200},reason:{type:'string',maxLength:600}}}};
 common.staleFields=common.uncertainFields;
 const definitions={},variants=[];
 for(const [type,definition]of Object.entries(ARCHIVE_FIELDS))definitions['fields_'+type]=fields(Object.keys(definition));
 for(const record of payload.recordSchemas||[])definitions['details_'+record.id]=fields((record.fields||[]).map(f=>f.id).filter(id=>!['source_profile','time_state'].includes(id)));
 for(const type of Object.keys(ARCHIVE_FIELDS)){
  const base={...common,type:{const:type},fields:{$ref:'#/$defs/fields_'+type}};
  const selection=payload.longTermTables?.selection,legacyIds=selection?(payload.current||[]).filter(r=>!r.recordId&&r.type===type&&selection.enabled.includes(legacyFrameworkForType(type))).map(r=>r.archiveId).filter(Boolean):[];
  if(!selection||legacyIds.length)variants.push({type:'object',additionalProperties:false,required:['type','name','status','sourceIndex',...(selection?['archiveId']:[])],properties:{...base,...(selection?{archiveId:{enum:legacyIds}}:{})}});
  for(const record of payload.recordSchemas||[]){const isTable=payload.longTermTables?.tables.some(t=>t.id===record.id);variants.push({type:'object',additionalProperties:false,required:['type','name','status','sourceIndex','recordId'],properties:{...base,...(isTable?{operation:{enum:['insert','update','transition']}}:{}),recordId:{const:record.id},details:{$ref:'#/$defs/details_'+record.id}}});}
 }
 const properties={changes:{type:'array',maxItems:variants.length?payload.limits?.changes||64:0,items:variants.length?{anyOf:variants}:{type:'object',additionalProperties:false}},floorReviews:{type:'array',items:{type:'object',additionalProperties:false,required:['sourceIndex','status','changeCount'],properties:{sourceIndex:{type:'integer'},status:{enum:['reviewed','uncertain']},changeCount:{type:'integer',minimum:0},reason:{type:'string',maxLength:600}}}},message:{type:'string'}};
 for(const key of ['guide','terminalResults','creationResults'])if(payload.responseContract?.outputs?.includes(key))properties[key]=key==='guide'?{type:'object'}:{type:'array',items:{type:'object'}};
 return {$defs:definitions,type:'object',additionalProperties:false,required:['changes',...(payload.moduleKind==='taishi'?['floorReviews']:[]),'message'],properties};
}
export function archiveFormatOptions(settings,prompt){
 if(!prompt.archiveSchema)return {};
 const mode=settings.archiveOutputMode||'auto';
 if(mode==='off')return {};
 if(mode==='schema')return {response_format:{type:'json_schema',json_schema:{name:'wuku_archive_v1',strict:false,schema:prompt.archiveSchema}}};
 let official=false;try{official=new URL(settings.baseUrl).hostname==='api.deepseek.com';}catch{}
 if(mode==='json'||official)return {response_format:{type:'json_object'}};
 return {};
}

export function archiveFieldRepairSchema(payload){
 const text={type:'string',maxLength:4000},all=Object.keys(ARCHIVE_FIELDS).flatMap(type=>Object.keys(ARCHIVE_FIELDS[type]));
 const fields=keys=>({type:'object',additionalProperties:false,properties:Object.fromEntries(keys.map(k=>[k,text]))});
 const variants=payload.failed.flatMap(row=>{
  const contract=row.repairContract,base={index:{const:row.index},fields:fields(contract?.fields||[...new Set(all)])};
  if(payload.setupReferences)base.settingRefs={type:'array',items:{type:'object'}};
  const options=contract?.recordId?[{id:contract.recordId,fields:(contract.details||[]).map(id=>({id}))}]:[{id:'',fields:[]},...(payload.declaredSchemas||[])];
  return options.map(record=>({type:'object',additionalProperties:false,required:['index','fields','details',...(record.id?['recordId']:[])],properties:{...base,recordId:{const:record.id},details:fields((record.fields||[]).map(f=>f.id).filter(id=>!['source_profile','time_state'].includes(id)))}}));
 });
 return {type:'object',additionalProperties:false,required:['repairs'],properties:{repairs:{type:'array',maxItems:32,items:{anyOf:variants}},unresolved:{type:'array',items:{type:'object'}},message:{type:'string'}}};
}
