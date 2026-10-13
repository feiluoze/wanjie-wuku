import {assert} from './primitives.js';
export const RELATION_FIELDS=['subject_id','target_id','direction','state','cause','event_id','evidence'];
export function findRelation(power,fields={}){
 const matches=Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='relation'&&r.specific.fields.direction===fields.direction&&(
  r.specific.fields.subject_id===fields.subject_id&&r.specific.fields.target_id===fields.target_id||fields.direction==='双向'&&r.specific.fields.subject_id===fields.target_id&&r.specific.fields.target_id===fields.subject_id));
 assert(matches.length<=1,'同一关系存在多份档案，请手动核对');return matches[0];
}
export function validateTaishiLocks(locks){
 if(locks===undefined)return;
 assert(locks&&typeof locks==='object'&&!Array.isArray(locks)&&Object.keys(locks).length<=512,'玩家关系保护无效');
 for(const [id,v]of Object.entries(locks))assert(id&&id.length<=200&&!['__proto__','constructor','prototype'].includes(id)&&Array.isArray(v)&&v.length<=16&&new Set(v).size===v.length&&v.every(k=>['social','relationship',...RELATION_FIELDS].includes(k)),'玩家关系保护字段无效');
}
export function assertTaishiClaims(power,raw,before,specific){
 if(!before||before.specific?.adapterId!=='wuku.primordial_world')return;
 for(const k of power.taishiLocks?.[before.id]||[])assert(!Object.hasOwn(raw.details||{},k)||specific?.fields[k]===before.specific.fields[k],'玩家已保护此关系字段，请手动修改或解除保护：'+k);
 if(before.specific.recordId==='relation'&&power.taishiLocks?.[before.id]?.length){assert(raw.status===undefined||raw.status===before.status,'玩家已保护此关系，不能自动改变状态');for(const [k,v]of Object.entries(raw.fields||{}))assert(v===before.fields[k],'玩家已保护此关系，不能通过通用字段覆盖');}
 const joining=power.taishiPeople?.joining?.[before.id];
 if(joining&&before.specific.recordId==='companion'){
  assert(!Object.hasOwn(raw.details||{},'relationship')||specific.fields.relationship===before.specific.fields.relationship,'眷属身份由玩家确认，请在人物身份入口修改');
  const prefix={direct:'玩家指定为太始天眷属',encounter:'玩家计划相遇；尚未缔约',npc:'玩家指定为普通人物；未缔约'}[joining];
  if(Object.hasOwn(raw.fields||{},'role')&&before.fields.role?.startsWith(prefix)&&!raw.fields.role.startsWith(prefix)){
   assert(!/(?:解除契约|取消契约|脱离眷属|不再是眷属|已缔约|成为眷属|太始天眷属)/.test(raw.fields.role),'不能改换玩家指定的人物身份');
   // A new job title is legitimate; carry the independently confirmed identity
   // forward rather than making the model reproduce a UI-owned prefix.
   raw.fields.role=prefix+'；'+raw.fields.role;
  }
 }
}
export function assertRelation(power,change){
 if(change.specific?.recordId!=='relation')return;
 const f=change.specific.fields,a=power.archives?.[f.subject_id],b=power.archives?.[f.target_id];
 assert(a&&b&&a.id!==b.id&&[a,b].every(r=>['companion','organization'].includes(r.specific?.recordId)),'关系两端须为已登记且不同的人物或组织');
 assert(['单向','双向'].includes(f.direction)&&f.state?.trim()&&f.cause?.trim()&&f.evidence?.trim(),'关系须包含方向、状态、变化原因和来源事件说明');
 if(f.event_id)assert(power.archives?.[f.event_id]?.specific?.recordId==='event','关系来源事件ID不存在');
 const w=f.world_id;assert(w&&power.archives[w]?.specific?.recordId==='world','关系须关联已有世界');
 for(const r of [a,b])if(r.specific.fields.world_id)assert(r.specific.fields.world_id===w,'关系两端不属于所选世界');
}
export function relationLinks(power,record){
 return Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='relation'&&[r.specific.fields.subject_id,r.specific.fields.target_id].includes(record.id));
}
