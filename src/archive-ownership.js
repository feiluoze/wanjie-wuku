// Ownership is separate from presentation modules and optional source annotations.
import {assert,clone} from './primitives.js';
import {isMmlc} from './mmlc.js';
import {isTaishi} from './taishi.js';
import {settledOwnership,sourceOwnership} from './archive-protocol.js';
const nameKey=v=>String(v||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
export function ownershipContext(state={},power){
 const powers=Object.values(state.powers||{});let budget=14000,omitted=0;
 const otherPowers=[];
 for(const p of powers){if(p.id===power.id)continue;const row={id:p.id,name:p.name,objects:[]};
  for(const r of Object.values(p.archives||{})){if(row.objects.length>=48){omitted++;continue;}const n={name:r.name,type:r.type};const size=JSON.stringify(n).length;if(budget<size){omitted++;continue;}row.objects.push(n);budget-=size;}
  const size=JSON.stringify({id:row.id,name:row.name}).length;if(budget<size){omitted++;continue;}budget-=size;otherPowers.push(row);
 }
 return {currentPower:{id:power.id,name:power.name},otherPowers,omitted,policy:'先确定所属金手指，再在当前词条内部分类。其他金手指和对象仅用于区分归属，不是当前词条资产。未列出不等于不存在。协作不转移所有权。'};
}
export function foreignArchiveOwner(raw,power,state={}){
 const others=Object.values(state.powers||{}).filter(p=>p.id!==power.id),declared=raw?.ownerPowerId;
 if(declared && declared!==power.id)return {id:declared,name:state.powers?.[declared]?.name||'其他或未明归属',reason:'AI标明属于其他金手指'};
 // Explicit protocol headings are ownership evidence for every module, even
 // when the model incorrectly labels the current power as owner.
 const powers=[power,...others],alias=p=>nameKey(p.name).replace(/[（(].*$/,'');
 const markers=[...String(raw?.quote||'').matchAll(/【([^】·]+)(?:·[^】]*)?】/g)].map(m=>nameKey(m[1]));
 const tagged=powers.filter(p=>markers.includes(alias(p)));
 if(tagged.length===1&&tagged[0].id!==power.id)return {id:tagged[0].id,name:tagged[0].name,reason:'引用的结算或状态标题明确属于其他金手指'};
 // A display title can describe research, cooperation or a borrowed object.
 // Its prefix is not evidence of ownership.
 if(!isMmlc(power)&&!isTaishi(power))return null;
 const name=nameKey(raw?.name);if(!name)return null;
 // The goldfinger itself is not an estate; no prose/hash/quote validation here.
 const identity=raw.type==='research'||raw.module==='projects'?[]:others.filter(p=>nameKey(p.name).length>=2&&(name===nameKey(p.name)||name.endsWith(nameKey(p.name))));
 if(identity.length===1)return {id:identity[0].id,name:identity[0].name,reason:'对象名称指向已接入的其他金手指本身'};
 if(declared===power.id)return null; // One person can have distinct, explicit roles in two systems.
 const matches=others.filter(p=>Object.values(p.archives||{}).some(r=>[r.name,...(r.history||[]).map(h=>h.name)].some(n=>nameKey(n)===name)));
 return matches.length?{id:matches.length===1?matches[0].id:'',name:matches.map(p=>p.name).join('／'),reason:'同名对象已记录在其他金手指，未说明漫漫长路中的独立身份'}:null;
}
// Shared source-scope gate for all narrative changes. Required links for new
// objects are declarative; canonical status rows and existing IDs are separate.
export function assertArchiveOwnership(power,raw,{before,mainStatus,table,config,policy,quote,content,state={},suppliedName}={}){
 const foreign=foreignArchiveOwner({...raw,quote},power,state);
 assert(!foreign,'归属与原文明确声明冲突，请核对所属词条');
 const powers=[power,...Object.values(state.powers||{}).filter(p=>p.id!==power.id)];
 const aliases=powers.map(p=>String(p.name||'').split(/[（(]/)[0].trim());
 const tags=sourceOwnership(content||'',quote,aliases);
 assert(tags.length<=1,'引用跨越多个金手指的归属范围，请缩小引用到本项事实，不能仅凭ownerPowerId选择归属');
 assert(!tags.length||nameKey(tags[0])===nameKey(aliases[0]),'归属与来源结算或状态栏标题冲突；请保留在原词条，不按展示名称或ownerPowerId改归属');
 if(!before&&!mainStatus&&table?.kind!=='singleton')assert(!config?.records.some(r=>nameKey(r.label)===nameKey(raw.name)),'对象名称不能使用分类标题；请填写具体任务、事件或对象名称');
 if(before||mainStatus||isTaishi(power)||!policy?.requireLink)return;
 const alias=String(power.name||'').split(/[（(]/)[0].trim();
 const owned=Object.values(power.archives||{}).flatMap(r=>[r.name,...(r.history||[]).map(h=>h.name)]).filter(Boolean);
 const rules=power.primaryRules??power.rules??'';
 // Mechanisms come from maintained, hash-bound declarations, never arbitrary
 // model-supplied rule quotes or words extracted from schema descriptions.
 const mechanisms=(policy.mechanisms||[]).filter(s=>s.length>=2&&rules.includes(s));
 const identityIds=table?.identityFields||[];
 const anchors=[raw.name,...(table?.kind==='singleton'?[suppliedName]:[]),...identityIds.map(id=>raw.details?.[id]),...['location','origin','source','target','item'].map(id=>raw.details?.[id])].filter(v=>typeof v==='string'&&v.trim().length>=2);
 const sentences=String(quote||'').split(/[。！？\n]/);
 const literal=Boolean(quote&&content?.includes(quote));
 const related=literal&&sentences.some(s=>{
  if(alias&&s.includes(alias)&&anchors.some(n=>s.includes(n)))return true;
  if(owned.some(n=>n.length>=2&&s.includes(n))&&anchors.some(n=>s.includes(n)))return true;
  return mechanisms.some(n=>s.includes(n))&&anchors.some(n=>s.includes(n));
 });
 const settled=anchors.some(n=>settledOwnership(content||'',power.name,n));
 assert(related||settled,'归属缺少正文或本层正式结算依据：请引用当前词条、已有对象或规则机制与本项事实的明确联系；展示标题不要求逐字出现在原文');
}
export function moveArchiveOwnership(state,fromId,id,toId){
 const from=state.powers?.[fromId],to=state.powers?.[toId],record=from?.archives?.[id];
 assert(record&&to?.active&&fromId!==toId,'请选择另一项已接入的金手指');
 to.archives||={};const existing=to.archives[id]||Object.values(to.archives).find(r=>nameKey(r.name)===nameKey(record.name));
 assert(!existing||existing.type===record.type,'目标同名对象类型不同，请先核对类型再更正归属');
 assert(existing||Object.keys(to.archives).length<512,'目标档案已满');
 const moved=clone(record);
 // Preserve dedicated values and original module in history metadata; render current values generically.
 const convert=row=>{if(row.module){row.previousModule=row.module;delete row.module;}if(row.specific){row.previousSpecific=clone(row.specific);delete row.specific;}};
 for(const row of [moved,...moved.history])convert(row);
 moved.ownershipHistory=[...(moved.ownershipHistory||[]),{from:fromId,to:toId,at:Date.now()}];
 assert(moved.ownershipHistory.length<=128,'归属更正记录已满');
 let result=moved;
 if(existing){
  const snapshots=[...moved.history,(({history,...row})=>row)(moved)].map(row=>({...row,id:existing.id,originalArchiveId:row.originalArchiveId||id}));
  assert(existing.history.length+snapshots.length<=1000,'目标档案历史已满');
  result={...clone(existing),history:[...clone(existing.history),...snapshots],ownershipHistory:[...(existing.ownershipHistory||[]),...moved.ownershipHistory]};
 }
 assert(result.ownershipHistory.length<=128,'归属更正记录已满');
 result.ownerPowerId=toId;
 to.archives[result.id]=result;delete from.archives[id];
 for(const p of [from,to]){delete p.archiveUndo;if(p.lastArchiveUpdate)p.lastArchiveUpdate.records=p.lastArchiveUpdate.records.filter(r=>Boolean(p.archives[r.id]));}
 const selections=state.archiveMemory?.selections;if(selections){const old=fromId+'/'+id;if(Object.hasOwn(selections,old)){const next=toId+'/'+result.id;if(!Object.hasOwn(selections,next))selections[next]=selections[old];delete selections[old];}}
 return result;
}
