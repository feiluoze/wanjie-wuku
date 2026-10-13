import {assert} from './primitives.js';
export const TAISHI_REFERENCE_FIELDS={world_id:'world',region_id:'region',organization_id:'organization'};
// IDs are authoritative. Names are only a unique lookup aid for unlinked records.
export function resolveTaishiLinks(power,change){
 const f=change.specific?.fields;if(!f)return;
 for(const [field,kind] of Object.entries(TAISHI_REFERENCE_FIELDS)){
  if(!f[field])continue;
  const target=power.archives?.[f[field]];
  assert(target&&target.specific?.recordId===kind,'关联档案不存在或类别错误：'+field);
  assert(target.id!==change.id,'档案不能关联自身：'+field);
  if(field!=='world_id'&&f.world_id&&target.specific.fields.world_id)assert(target.specific.fields.world_id===f.world_id,'关联区域或组织属于另一个世界');
 }
 if(f.world_id){f.world=power.archives[f.world_id].name;change.specificPatch={...change.specificPatch,world:f.world};}
 else if(f.world){const matches=Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='world'&&r.status!=='ended'&&[r.name,...(r.history||[]).map(h=>h.name)].includes(f.world));if(matches.length===1){f.world_id=matches[0].id;change.specificPatch={...change.specificPatch,world_id:f.world_id};}}
}
export const TAISHI_140_POLICY=`太始天只有一个本体。降界记录使用manifestation，关联原world_id；多处展开不是新世界、不复制人口设施或库存。mode只填写整界、局部、法则或收回，分别记录锚点、区域、展开形态、实际状态和留置去向。展开、变形与收回以正式结算或明确正文为依据，不凭动作意向写成已展开；调整与收回已有展开单元必须复用原archiveId，收回可标记ended并保留历史；无额外冷却、费用或阶段门槛。收回保留已发生的消耗、损毁、交付和外界留置，不自动移动其他档案或恢复库存。世界既有成果用available，本源与位格或永久神通用growth且kind明确三者身份；世界变化不得撤销既得归身力量。原始设定、AI草案、正式剧情和玩家补充分清；调用世界知识不代表每个人知道。已存在对象始终复用archiveId，关系使用输入中真实ID，改名不另建。region_id和organization_id只关联已登记对象；没有独立资料时保留世界概述，不创造组织。程序字段time_state不得填写。`;
