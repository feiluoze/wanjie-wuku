import {BUILTIN_RESOURCES} from './builtin-resource-data.js';
import {hash,clone,assert} from './primitives.js';
const registry=new Map(BUILTIN_RESOURCES.map(r=>[r.contentHash,r]));
export function builtinResources(entity){return registry.get(hash(entity?.primaryRules??entity?.content??entity?.rules??''))||null;}
export function inferBuiltinResources(entry){
 const row=builtinResources(entry);if(!row)return null;
 return row.resources.map(d=>({id:d.id,name:d.name,balance:null,floor:'0',labels:[...d.labels]}));
}
export function resourceMatches(resource,definition){return resource.id===definition.id||definition.labels.includes(resource.name);}
export function resourceDefinition(power,resource){return builtinResources(power)?.resources.find(d=>resourceMatches(resource,d))||null;}
export function statusbarResource(power,fieldId){
 const definition=builtinResources(power)?.resources.find(d=>'s_'+hash(d.label).slice(0,10)===fieldId||d.label===fieldId);return resourceBinding(power,definition);
}
function resourceBinding(power,definition){
 if(!definition)return null;
 const matches=Object.values(power.resources||{}).filter(r=>resourceMatches(r,definition));
 return {definition,resource:matches.length===1?matches[0]:null,conflict:matches.length>1};
}
export function archiveResource(power,recordId,fieldId){
 if(recordId?.startsWith('statusbar_'))return statusbarResource(power,fieldId);
 const definition=builtinResources(power)?.resources.find(d=>d.legacyBindings?.some(b=>(b.recordId===recordId||b.recordLabel===recordId)&&(b.fieldId===fieldId||b.fieldLabel===fieldId)));
 return resourceBinding(power,definition);
}
export function statusbarResourceReadOnly(power,fieldId){const b=statusbarResource(power,fieldId);return Boolean(b&&(b.definition.kind!=='energy'||b.conflict||b.resource?.balance!=null));}
export function assertStatusbarResourceFields(power,raw){
 const recordId=raw.recordId??power.archives?.[raw.archiveId]?.specific?.recordId;if(!recordId)return;
 for(const [id,value]of Object.entries(raw.details||{})){
  const binding=archiveResource(power,recordId,id);if(!binding)continue;
  assert(binding.definition.kind==='energy'&&!binding.conflict&&binding.resource?.balance==null&&typeof value==='string'&&!/\d/.test(value),'状态栏或专用档案的资源余额引用现有账本，不接受第二份数值；请通过余额核对或角色MVU更新');
 }
}
export function projectResourceStatus(power,record){
 if(!record?.specific?.recordId)return record;
 const ids=Object.keys(record.specific.labels||{}).filter(id=>archiveResource(power,record.specific.recordId,id));if(!ids.length)return record;
 const result=clone(record);
 for(const id of ids){
  const b=archiveResource(power,result.specific.recordId,id);if(!b)continue;
  if(b.conflict)result.specific.fields[id]='同名资源账本有歧义，需核对';
  else if(b.resource?.balance!=null)result.specific.fields[id]=String(b.resource.balance);
  else if(b.definition.kind!=='energy'||/\d/.test(result.specific.fields[id]||''))result.specific.fields[id]='未确认（以资源账本为准）';
 }
 return result;
}
export function resourcePolicy(power){
 const row=builtinResources(power);if(!row?.resources.length)return null;
 return {sourceHash:row.contentHash,resources:row.resources.map(d=>{const matches=Object.values(power.resources||{}).filter(r=>resourceMatches(r,d));return {...d,resourceId:matches.length===1?matches[0].id:d.id,balance:matches.length===1?matches[0].balance:null,conflict:matches.length>1};}),
  authority:'当前聊天resources是余额唯一账本；绑定角色MVU时沿用原有绑定与核对机制。状态总览只读引用，不另建资源余额档案，不重复结算。正文快照是核对候选，成果整理不更新或重算账本。次数不按电脑时间自动补足，当前能量与上限分别理解，规则初始赠送不是已完成入账。负值快照不自动授予新的预支权限。'};
}
export function negativeResourceSnapshotAllowed(power,resource){return resourceDefinition(power,resource)?.negativeSnapshot===true;}

export function assertNoResourceClone(power,raw){
 if(raw.recordId?.startsWith('statusbar_'))return;
 const row=builtinResources(power),name=String(raw.name||'').normalize('NFKC').replace(/\s/g,'');
 assert(!row?.resources.some(d=>d.labels.some(label=>label.normalize('NFKC').replace(/\s/g,'')===name)),'专属资源余额已有唯一账本，请通过余额核对入口更新，不另建同名成果');
}
