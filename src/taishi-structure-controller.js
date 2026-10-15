import {assert,text,stable} from './primitives.js';
import {isTaishi} from './taishi.js';
import {creationConfig} from './creation-config.js';
import {archiveCurrent,archiveSource,saveArchive} from './archives.js';
import {journalSnapshot,saveArchiveUndo} from './archive-journal.js';
export const taishiStructureMethods={
 openTaishiStructure(next='references'){
  const s=this.ensureStable(),p=s.state.powers[this.powerId];assert(isTaishi(p)&&p.active&&!this.busy&&!this.pendingArchiveReview,'请先处理当前任务或待确认结果');
  this.taishiStructureDraft={powerId:p.id,next,captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}};
  this.ui.showTaishiStructure(p,this.store.context().chat);
 },
 async saveTaishiStructure(values){
  const d=this.taishiStructureDraft;assert(d&&d.powerId===this.powerId&&!this.busy&&!this.committing,'世界结构窗口已失效或任务正在运行');this.ensureStable();
  assert(['single','multi'].includes(values.mode),'请选择单世界或多世界');
  const name=values.mode==='single'?text(values.worldName||'',200).trim():'';assert(values.mode!=='single'||name,'请填写主世界名称');
  await this.store.transact(next=>{
   const p=next.powers[d.powerId];assert(isTaishi(p)&&p.active,'太始天接入已变化');const before=journalSnapshot(next,p.id);let world;
   if(values.mode==='single'){
    const matches=Object.values(p.archives||{}).filter(r=>r.specific?.recordId==='world'&&r.name===name&&r.status!=='ended'&&archiveCurrent(r,this.store.context().chat));
    assert(matches.length<=1,'存在多个同名世界，请先更正名称');world=matches[0];
    if(!world){const c=creationConfig(p),def=c.records.find(r=>r.id==='world');world=saveArchive(p,{type:'environment',name,status:'active',fields:{conditions:'玩家指定主世界，具体设定待导入'},specific:{adapterId:c.id,recordId:'world',version:c.version,label:def.label,labels:Object.fromEntries(def.fields.map(f=>[f.id,f.label])),fields:{overview:'玩家指定主世界，具体设定待导入'}}},archiveSource(this.store.context().chat,'玩家选择单世界建档并指定名称'));}
   }
   const config={mode:values.mode,worldId:world?.id||'',worldName:world?.name||''};
   if(stable(config)!==stable(p.taishiWorldStructure)){p.taishiWorldStructure=config;delete p.taishiBuild;saveArchiveUndo(next,p.id,before,'选择世界建档结构');}
  },{captured:d.captured});
  this.taishiStructureDraft=null;this.ui.closeDialog();this.refresh();
  const p=this.store.read().powers[d.powerId];this.ui.setTaishiLayout?.({mode:p.taishiWorldStructure.mode,worldId:p.taishiWorldStructure.worldId});
  if(d.next==='references')return this.openAIWorldbooks({taishiPowerId:d.powerId});
  return this.initializeTaishi();
 },
};
