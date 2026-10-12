import {assert,clone,emptyState,validateState,VERSION} from './core.js';
import {isTaishi} from './taishi.js';
import {isMmlc} from './mmlc.js';
export const MODULE_NAMES=Object.freeze({wuku:'万界武库',mmlc:'漫漫长路',taishi:'太始天'});
const space=p=>isMmlc(p)?'mmlc':isTaishi(p)?'taishi':'wuku';
const lists=['transactions','narrativeActions','favoriteActions','terminalOrders','creations'];
export function exportModule(state,module){
 assert(Object.hasOwn(MODULE_NAMES,module),'请选择有效模块');
 const s=emptyState(),ids=new Set(Object.values(state.powers).filter(p=>space(p)===module).map(p=>p.id));
 s.powers=Object.fromEntries([...ids].map(id=>[id,clone(state.powers[id])]));
 for(const name of lists)if(state[name])s[name]=clone(state[name].filter(r=>ids.has(r.powerId)));
 s.archiveMemory.selections=clone(Object.fromEntries(Object.entries(state.archiveMemory?.selections||{}).filter(([id])=>ids.has(id.split('/')[0]))));
 if(module==='taishi'&&state.archiveMemory?.taishi)s.archiveMemory.taishi=clone(state.archiveMemory.taishi);
 validateState(s);
 return {format:'wjwk-module-backup',version:VERSION,module,exportedAt:new Date().toISOString(),state:s};
}
export function validateModuleBackup(raw){
 assert(raw?.format==='wjwk-module-backup'&&Object.hasOwn(MODULE_NAMES,raw.module),'模块备份格式无效');
 const state=validateState(clone(raw.state));
 assert(Object.values(state.powers).every(p=>space(p)===raw.module),'模块备份混入其他模块，已拒绝恢复');
 const ids=new Set(Object.keys(state.powers));
 for(const name of lists)assert((state[name]||[]).every(r=>ids.has(r.powerId)),'模块备份包含其他模块的记录');
 return {module:raw.module,state};
}
export function mergeModuleBackup(current,raw,{currentHashes=null}={}){
 const {module,state}=validateModuleBackup(raw),next=clone(current),remove=new Set(Object.values(next.powers).filter(p=>space(p)===module).map(p=>p.id));
 for(const id of Object.keys(state.powers))assert(!next.powers[id]||remove.has(id),'模块档案ID与其他模块冲突');
 for(const id of remove)delete next.powers[id];Object.assign(next.powers,clone(state.powers));
 for(const name of lists){
  const retained=(next[name]||[]).filter(r=>!remove.has(r.powerId)),incoming=state[name]||[];
  assert(incoming.every(r=>!retained.some(other=>other.id===r.id)),'模块历史ID与保留记录冲突');
  if(next[name]||state[name])next[name]=[...retained,...clone(incoming)];
 }
 next.archiveMemory ||= {auto:true,budget:3000,selections:{}};
 next.archiveMemory.selections ||= {};
 const selections=next.archiveMemory.selections;
 for(const id of Object.keys(selections))if(remove.has(id.split('/')[0]))delete selections[id];
 Object.assign(selections,clone(state.archiveMemory?.selections||{}));
 if(module==='taishi'){
  if(state.archiveMemory?.taishi)next.archiveMemory.taishi=clone(state.archiveMemory.taishi);else delete next.archiveMemory.taishi;
 }
 // Restored plans are records, never permission to replay old work.
 for(const a of next.narrativeActions||[])if(state.powers[a.powerId])a.status='stopped';
 for(const o of next.creations||[])if(state.powers[o.powerId]&&o.status==='queued')o.status='cancelled';
 for(const p of Object.values(next.powers))if(state.powers[p.id]){
  p.quotes=[];delete p.archiveUndo;
  if(currentHashes){p.archiveReviewed=[];p.archiveStart=currentHashes.length;p.autoArchiveStart=currentHashes.length;}
 }
 // A pending whole-state write must not replay over a restored module.
 assert(!(current.roleWrites||[]).some(w=>w.status==='pending'),'请先处理待写回角色变量，再恢复模块档案');
 if(next.roleLink?.bindings)for(const id of Object.keys(next.roleLink.bindings))if(remove.has(id.split(':')[0]))delete next.roleLink.bindings[id];
 delete next.archiveMemory.last;
 return validateState(next);
}
