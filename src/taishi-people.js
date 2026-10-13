import {assert,clone} from './primitives.js';
export const taishiPerson=r=>Boolean(r&&(r.specific?.recordId==='companion'||!r.specific&&r.type==='member'));
export function peopleControls(power){return clone(power.taishiPeople||{mode:'all',selected:[],pinned:[],joining:{}});}
export function validatePeopleControls(value){
  if(value===undefined)return;
  const safe=id=>typeof id==='string'&&id.length>0&&id.length<=200&&!['__proto__','constructor','prototype'].includes(id);
  assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['mode','selected','pinned','joining'].includes(k))&&['all','selected'].includes(value.mode),'人物筛选设置无效');
  for(const key of ['selected','pinned'])assert(Array.isArray(value[key])&&value[key].length<=512&&value[key].every(safe)&&new Set(value[key]).size===value[key].length,'人物筛选列表无效');
  assert(value.joining&&typeof value.joining==='object'&&!Array.isArray(value.joining)&&Object.keys(value.joining).length<=512&&Object.entries(value.joining).every(([id,v])=>safe(id)&&['direct','encounter','npc'].includes(v)),'人物身份设置无效');
}
export function personSelected(power,id){const c=peopleControls(power);return c.mode==='all'||Boolean(id&&(c.selected.includes(id)||c.pinned.includes(id)));}
export function protectPeopleIdentity(batch,power,draft=null){
 const original=batch.changes;
 batch.changes=batch.changes.filter(c=>{
  if(!taishiPerson(c)||draft?.joining==='direct')return true;
  const joining=peopleControls(power).joining[c.id];
  const values=[['role',c.patch?.role,c.before?.fields?.role],['relationship',c.specificPatch?.relationship,c.before?.specific?.fields.relationship],['role',c.specificPatch?.role,c.before?.specific?.fields.role]];
  const unauthorized=values.some(([,value,old])=>value!==undefined&&value!==old&&/(?:已缔约|正式缔约|成为眷属|太始天眷属|解除契约|脱离眷属)/.test(value)&&!/(?:尚未|未曾|不能|不自动|未缔约)/.test(value));
  if(unauthorized&&joining!=='direct'){batch.issues.push({kind:'人物身份',name:c.name,sourceIndex:c.source.anchor?.index,reason:'眷属身份须由玩家在人物身份入口确认，AI不能自行授予或取消'});return false;}return true;
 });
 const remap=new Map(batch.changes.map((c,i)=>[original.indexOf(c),i]));
 batch.creationResults=(batch.creationResults||[]).filter(result=>{if(result.refs.some(ref=>ref.changeIndex!==undefined&&!remap.has(ref.changeIndex))){batch.issues.push({kind:'人物身份',name:result.creationId,reason:'关联候选的身份尚未由玩家确认，拟定进展保留待核对'});if(result.progress?.anchor)batch.blockedFloors=[...new Set([...(batch.blockedFloors||[]),result.progress.anchor.index])];return false;}for(const ref of result.refs)if(ref.changeIndex!==undefined)ref.changeIndex=remap.get(ref.changeIndex);return true;});
 return batch;
}
export function relationSelected(power,record){const f=record.specific?.fields||{};if(record.specific?.recordId!=='relation')return true;const people=[f.subject_id,f.target_id].map(id=>power.archives?.[id]).filter(taishiPerson);return !people.length||people.some(r=>personSelected(power,r.id));}
export function peoplePolicy(power){
  const c=peopleControls(power);
  return {...c,instruction:'只更新筛选范围内人物。pinned为玩家自选保留，与selected一起参与更新；未选中只暂停更新，绝不删除、替换、移除或自动解除眷属身份。joining为玩家明确指定的身份，AI不能修改。all只允许核对已关联太始天世界的人物，不把外界出场当作加入；新人物须有归属依据并确认，selected不登记未选新人物。世界等其他档案照常核对。'};
}
export function filterPeopleBatch(batch,power){
  const original=batch.changes;
  batch.skippedPeople=[];
  batch.changes=batch.changes.filter(c=>{
    if(relationSelected(power,c)&&(!taishiPerson(c.before||{type:c.type,specific:c.specific})||personSelected(power,c.id)))return true;
    batch.skippedPeople.push(c.name);return false;
  });
  const remap=new Map(batch.changes.map((c,i)=>[original.indexOf(c),i]));
  batch.creationResults=(batch.creationResults||[]).filter(result=>{
    if(result.refs.some(ref=>ref.changeIndex!==undefined&&!remap.has(ref.changeIndex))){
      batch.issues.push({kind:'拟定进展',name:result.creationId,reason:'关联人物未参与本轮更新，留待重查'});
      if(result.progress?.anchor)batch.blockedFloors=[...new Set([...(batch.blockedFloors||[]),result.progress.anchor.index])];return false;
    }
    for(const ref of result.refs)if(ref.changeIndex!==undefined)ref.changeIndex=remap.get(ref.changeIndex);
    return true;
  });
  return batch;
}
export function retainDraftPeople(power,saved,joining){
  const c=peopleControls(power);
  for(const r of saved.filter(taishiPerson)){if(!c.pinned.includes(r.id))c.pinned.push(r.id);if(!c.joining[r.id])c.joining[r.id]=joining;}
  validatePeopleControls(c);power.taishiPeople=c;
}
