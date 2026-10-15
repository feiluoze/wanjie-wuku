import {assert,text} from './primitives.js';
import {isTaishi} from './taishi.js';
import {creationConfig} from './creation-config.js';
import {saveArchive,archiveSource,saveArchiveUpdate} from './archives.js';
import {journalSnapshot,saveArchiveUndo} from './archive-journal.js';
import {resolveTaishiLinks} from './taishi-links.js';
import {worldForRecord} from './taishi-world.js';
export const taishiCivilizationMethods={
 openTaishiCivilization(){
  const s=this.ensureStable(),p=s.state.powers[this.powerId];assert(isTaishi(p)&&p.active&&!this.busy,'请先进入太始天并等待当前操作完成');
  const layout=this.ui.getTaishiLayout(p,this.store.context().chat);assert(layout.world,'请先建立世界');
  this.taishiCivilizationDraft={powerId:p.id,captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}};
  this.ui.showTaishiCivilization(p,layout.world.id,this.store.context().chat);
 },
 async saveTaishiCivilization(values){
  assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前操作完成');
  const d=this.taishiCivilizationDraft;assert(d&&d.powerId===this.powerId,'文明登记窗口已失效，请重新打开');this.ensureStable();
  const name=text(values.name,200).trim(),description=text(values.description,4000).trim();assert(name&&description,'请填写文明名称及已确认的概况');
  this.committing=true;this.refresh();
  try{await this.store.transact(next=>{
   const p=next.powers[d.powerId],chat=this.store.context().chat;assert(isTaishi(p)&&p.active,'太始天接入已变化');
   const w=p.archives?.[values.worldId];assert(w&&worldForRecord(p,w,chat)?.id===w.id,'请选择当前有效世界');
   const c=creationConfig(p),def=c.records.find(r=>r.id==='inhabitants');
   assert(!Object.values(p.archives||{}).some(r=>r.status!=='ended'&&r.specific?.recordId==='inhabitants'&&r.name===name&&worldForRecord(p,r,chat)?.id===w.id),'此世界已有同名文明，请打开原档案修改');
   const specific={adapterId:c.id,version:c.version,recordId:def.id,label:def.label,labels:Object.fromEntries(def.fields.map(f=>[f.id,f.label])),fields:{kind:'civilization',world_id:w.id,world:w.name,region_id:values.regionId||'',civilization:description}};
   resolveTaishiLinks(p,{specific});
   if(values.regionId)assert(worldForRecord(p,p.archives[values.regionId],chat)?.id===w.id,'地域不属于所选世界');
   const undo=journalSnapshot(next,p.id),before={...p.archives};
   const r=saveArchive(p,{type:'environment',name,status:'active',fields:{conditions:description},specific,ownerPowerId:p.id},archiveSource(chat,'玩家登记世界内部文明'));
   saveArchiveUpdate(p,before,[r],[],{chat});saveArchiveUndo(next,p.id,undo,'登记文明');
   this.record(next,'太始天 · 登记文明',[name,w.name],'archive',p.id);
  },{captured:d.captured});this.taishiCivilizationDraft=null;this.ui.closeDialog();this.notice('文明已登记，可在档案编辑中选择文明归属。');}
  finally{this.committing=false;this.refresh();}
 },
};
