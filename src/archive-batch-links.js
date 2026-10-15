// Preview-only dependencies. Actual IDs are obtained only after selected targets save.
import {assert,clone} from './primitives.js';
const name=v=>String(v??'').normalize('NFKC').trim();
export function prepareOrganizationLink(raw,power,rows){
 const fields=raw.details||{},ref=fields.organization_id;
 if(!ref||power.archives?.[ref])return {raw};
 const saved=Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='organization'&&name(r.name)===name(ref));
 if(saved.length===1)return {raw:{...raw,details:{...fields,organization_id:saved[0].id}}};
 const candidates=rows.map((r,index)=>({r,index})).filter(({r})=>r.recordId==='organization'&&name(r.name)===name(ref));
 const copy=clone(raw);delete copy.details.organization_id;
 if(!saved.length&&candidates.length===1)return {raw:copy,pendingLink:{field:'organization_id',targetInputIndex:candidates[0].index,name:candidates[0].r.name}};
 return {raw:copy,unresolved:true};
}
export function orderLinkedSelection(changes,chosen){
 const order=[],active=new Set(),done=new Set();
 const visit=i=>{
  assert(!active.has(i),'本批组织关联形成循环，请本地核对');if(done.has(i))return;
  const c=changes[i];assert(c,'所选候选不存在');active.add(i);
  for(const link of c.pendingLinks||[]){const target=changes.findIndex(r=>r.inputIndex===link.targetInputIndex);
   assert(target>=0&&chosen.has(target),'请同时接受关联组织「'+link.name+'」，或取消依赖它的人物/组织');visit(target);}
  active.delete(i);done.add(i);order.push([i,chosen.get(i)]);
 };
 for(const i of chosen.keys())visit(i);return order;
}
export function materializeBatchLinks(change,savedByInput){
 if(!change.pendingLinks?.length)return change;
 const c=clone(change);
 for(const link of c.pendingLinks){const target=savedByInput.get(link.targetInputIndex);assert(target?.specific?.recordId==='organization','关联组织尚未保存或类别错误');
  c.specific.fields[link.field]=target.id;c.specificPatch={...c.specificPatch,[link.field]:target.id};}
 return c;
}
export function finalizeBatchLinks(batch,data){
 for(const c of batch.changes){if(!c.pendingLinks?.length)continue;
  const valid=c.pendingLinks.every(link=>{const target=batch.changes.find(t=>t.inputIndex===link.targetInputIndex&&t.specific?.recordId==='organization');return target&&(!target.specific.fields.world_id||!c.specific?.fields.world_id||target.specific.fields.world_id===c.specific.fields.world_id);});
  if(valid)continue;delete c.pendingLinks;
  batch.issues.push({kind:'成果',index:c.inputIndex,name:c.name,sourceIndex:data.changes[c.inputIndex]?.sourceIndex,reason:'关联组织未通过本批核对或属于另一世界；其他有效字段可单独保存',repairable:true,candidate:clone(data.changes[c.inputIndex])});
  const floor=c.source?.anchor?.index;if(Number.isSafeInteger(floor)&&!batch.blockedFloors.includes(floor))batch.blockedFloors.push(floor);
 }
 return batch;
}
