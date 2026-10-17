// Model-facing wire contract. Internal storage envelopes never cross this boundary.
import {ARCHIVE_FIELDS} from './archives.js';
export function wireArchiveRecord(record){
 const {id,specific,...rest}=record;
 return {...rest,...(id?{archiveId:id}:{}),...(specific?.recordId?{recordId:specific.recordId,...(specific.fields&&Object.keys(specific.fields).length?{details:specific.fields}:{})}:{})};
}
export function archiveResponseSchema(payload){
 const text={type:'string',maxLength:4000},fields=entries=>({type:'object',additionalProperties:false,properties:Object.fromEntries(entries.map(id=>[id,text]))});
 const common={archiveId:{type:'string'},ownerPowerId:{type:'string'},name:{type:'string',minLength:1,maxLength:200},status:{enum:['active','planned','working','ended']},sourceIndex:{type:'integer'},quote:text,ruleQuote:{type:'string',maxLength:1200}};
 if(payload.moduleKind==='mmlc')common.module={type:'string'};
 if(payload.taskMode==='worldbook')common.settingRefs={type:'array',items:{type:'object',properties:{book:{type:'string'},id:{type:['string','integer']},part:{type:'integer'}},required:['book','id'],additionalProperties:false}};
 const definitions={},variants=[];
 for(const [type,definition]of Object.entries(ARCHIVE_FIELDS))definitions['fields_'+type]=fields(Object.keys(definition));
 for(const record of payload.recordSchemas||[])definitions['details_'+record.id]=fields((record.fields||[]).map(f=>f.id).filter(id=>!['source_profile','time_state'].includes(id)));
 for(const type of Object.keys(ARCHIVE_FIELDS)){
  const base={...common,type:{const:type},fields:{$ref:'#/$defs/fields_'+type}};
  variants.push({type:'object',additionalProperties:false,required:['type','name','status','fields','sourceIndex'],properties:base});
  for(const record of payload.recordSchemas||[])variants.push({type:'object',additionalProperties:false,required:['type','name','status','fields','sourceIndex','recordId','details'],properties:{...base,recordId:{const:record.id},details:{$ref:'#/$defs/details_'+record.id}}});
 }
 const properties={changes:{type:'array',maxItems:payload.limits?.changes||64,items:{anyOf:variants}},floorReviews:{type:'array',items:{type:'object',additionalProperties:false,required:['sourceIndex','status','changeCount'],properties:{sourceIndex:{type:'integer'},status:{enum:['reviewed','uncertain']},changeCount:{type:'integer',minimum:0}}}},message:{type:'string'}};
 for(const key of ['guide','terminalResults','creationResults'])if(payload.responseContract?.outputs?.includes(key))properties[key]=key==='guide'?{type:'object'}:{type:'array',items:{type:'object'}};
 return {$defs:definitions,type:'object',additionalProperties:false,required:['changes','floorReviews','message'],properties};
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
 const text={type:'string',maxLength:4000},all=Object.keys(ARCHIVE_FIELDS).flatMap(type=>Object.keys(ARCHIVE_FIELDS[type])),ids=[...new Set((payload.declaredSchemas||[]).flatMap(r=>(r.fields||[]).map(f=>f.id).filter(id=>!['source_profile','time_state'].includes(id))))];
 const fields=keys=>({type:'object',additionalProperties:false,properties:Object.fromEntries(keys.map(k=>[k,text]))});
 const properties={index:{enum:payload.failed.map(f=>f.index)},fields:fields([...new Set(all)]),details:fields(ids)};
 if(payload.setupReferences)properties.settingRefs={type:'array',items:{type:'object'}};
 return {type:'object',additionalProperties:false,required:['repairs'],properties:{repairs:{type:'array',maxItems:16,items:{type:'object',additionalProperties:false,required:['index','fields','details'],properties}},unresolved:{type:'array',items:{type:'object'}},message:{type:'string'}}};
}
