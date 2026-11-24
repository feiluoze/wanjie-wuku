import {worldSchedules,putWorldSchedule} from './taishi-schedule.js';
import {timeReceiptCurrent} from './taishi-time.js';
import {assert,clone,hash,stable,storyText} from './core.js';
import {archiveContextCurrent} from './archives.js';
import {managementContextCurrent} from './core.js';
import {getContext} from './host.js';

const recordStamp=record=>record?hash(stable(record)):'';
export const branchCurrent=(branch,chat)=>branch.kind==='archive'?archiveContextCurrent(branch.record,chat):managementContextCurrent(branch.record,chat);
const branchMap=(power,kind)=>kind==='archive'?power.archives:power.managementRecords;
const branchName=branch=>branch.record.name||branch.record.label;
const branchFloor=branch=>(branch.record.source?.anchor?.index??branch.record.source?.index??-1)+1;
function keepBranch(power,kind,record,fallback){
 const id=kind+'_'+recordStamp(record);
 const branches=power.storyBranches ||= [];
 const existing=branches.find(row=>row.id===id);
 if(existing)return existing;
 const branch={id,kind,record,fallback:recordStamp(fallback)};
 branches.push(branch);
 return branch;
}
function restoreBranch(power,branch,chat,explicit=false){
 const {record,kind}=branch,map=branchMap(power,kind),current=map[record.id];
 if(!branchCurrent(branch,chat)||!explicit&&recordStamp(current)!==branch.fallback)return false;
 if(!current&&Object.keys(map).length>=(kind==='archive'?512:128))return false;
 if(kind==='archive'&&Object.values(map).some(other=>other.id!==record.id&&other.type===record.type&&other.name===record.name&&other.module===record.module&&other.specific?.recordId===record.specific?.recordId))return false;
 // A deliberate replacement keeps the displaced version available, without
 // making it an automatic replacement for the version the player just chose.
 if(explicit&&current)keepBranch(power,kind,current,null);
 map[record.id]=record;
 power.storyBranches=power.storyBranches.filter(row=>row.id!==branch.id);
 if(!power.storyBranches.length)delete power.storyBranches;
 return true;
}
export function rollbackStoryRecords(state,chat,events=[]){
  const result={removed:0,restored:0};
  for(const p of Object.values(state.powers)){
    let changed=false;
    for(const [id,r] of Object.entries(p.archives||{})){
      if(archiveContextCurrent(r,chat))continue;
      const versions=r.history||[];let restored=null;
      for(let i=versions.length-1;i>=0;i--){const candidate={...clone(versions[i]),history:clone(versions.slice(0,i))};if(archiveContextCurrent(candidate,chat)){restored=candidate;break;}}
      const branch=keepBranch(p,'archive',r,restored);
      events.push({action:'移入旧分支',powerId:p.id,recordId:r.id,name:branchName(branch),floor:branchFloor(branch),rolledBack:Boolean(restored)});
      if(restored){p.archives[id]=restored;result.restored++;}
      else {delete p.archives[id];if(state.archiveMemory)delete state.archiveMemory.selections[p.id+'/'+id];result.removed++;}
      changed=true;
    }
    for(const [id,r] of Object.entries(p.managementRecords||{}))if(!managementContextCurrent(r,chat)){
      const branch=keepBranch(p,'management',r,null);
      events.push({action:'移入旧分支',powerId:p.id,recordId:r.id,name:branchName(branch),floor:branchFloor(branch)});
      delete p.managementRecords[id];result.removed++;changed=true;
    }
    for(const branch of [...(p.storyBranches||[])].reverse())if(restoreBranch(p,branch,chat)){
      result.restored++;changed=true;
      events.push({action:'恢复原分支',powerId:p.id,recordId:branch.record.id,name:branchName(branch),floor:branchFloor(branch)});
    }
    for(const schedule of Object.values(worldSchedules(p))){
      const current=o=>o&&archiveContextCurrent({source:{type:'story',anchor:o.anchor}},chat);const history=[];
      for(const row of schedule.history){if(!current(row.from)||!current(row.to))break;history.push(row);}
      if(history.length!==schedule.history.length||schedule.baseline&&!current(schedule.baseline)){
        const original=schedule.history[0]?.from;schedule.history=history;const baseline=history.at(-1)?.to||(current(original)?original:null);if(baseline)schedule.baseline=clone(baseline);else delete schedule.baseline;schedule.paused=true;putWorldSchedule(p,schedule);changed=true;
      }
    }
    if(p.taishiTime){const receipts=p.taishiTime.receipts.filter(r=>{const world=p.archives?.[r.worldId];return timeReceiptCurrent(r,chat)&&world&&[...(world.history||[]),world].some(v=>v.source?.note?.includes('#'+r.id));});if(receipts.length!==p.taishiTime.receipts.length){p.taishiTime={receipts};changed=true;}}
    if(changed){delete p.lastArchiveUpdate;delete p.archiveUndo;}
    p.archiveReviewed=(p.archiveReviewed||[]).filter(anchor=>archiveContextCurrent({source:{type:'story',anchor}},chat));
  }
  state.managementReviewed=(state.managementReviewed||[]).filter(id=>{const [index,swipe,digest]=id.split(':'),m=chat[Number(index)];return m&&(m.swipe_id??0)===Number(swipe)&&hash(storyText(m.mes??m.content??''))===digest;});
  if(result.removed||result.restored){if(state.archiveMemory)delete state.archiveMemory.last;}
  return result;
}
export const archiveBranchMethods={
  async cleanupStoryRecords(){
    if(this.destroyed||this.mainBusy||this.committing)return;
    const s=this.contextSnapshot(),preview=clone(s.state);rollbackStoryRecords(preview,s.ctx.chat);
    if(stable(preview)===stable(s.state))return;
    const events=[],ticket=this.runtimeLog?.begin('旧分支记录整理');
    let result;
    try{
      const saved=await this.store.transact(next=>{
        if(this.mainBusy||this.committing||next.id!==s.state.id)return null;
        return rollbackStoryRecords(next,getContext().chat,events);
      });
      result=saved.result;
      if(events.length){
        this.runtimeLog?.step(ticket,'旧分支变化',{entries:events.map(({name,...event})=>event)});
        this.runtimeLog?.capture(ticket,'旧分支档案明细',events);
      }
      this.runtimeLog?.finish(ticket,events.length?'已保存':'未更新');
    }catch(error){this.runtimeLog?.finish(ticket,'失败',error.message);throw error;}
    if(events.length)this.notice(`已移入旧分支 ${events.filter(e=>e.action==='移入旧分支').length} 项，恢复 ${events.filter(e=>e.action==='恢复原分支').length} 项。可在长期档案库查看。`);
    this.refresh();return result;
  },
  async restoreStoryBranch(id){
    const s=this.ensureStable(),powerId=this.powerId;
    const branch=s.state.powers[powerId]?.storyBranches?.find(row=>row.id===id);
    assert(branch&&branchCurrent(branch,s.ctx.chat),'请先切回此记录对应的正文版本');
    if(!globalThis.confirm(`恢复「${branchName(branch)}」？现有同一档案的版本会移入旧分支记录。`))return;
    const ticket=this.runtimeLog?.begin('手动恢复旧分支');
    try{
      await this.store.transact(next=>{
        const p=next.powers[powerId],entry=p?.storyBranches?.find(row=>row.id===id);
        assert(entry&&restoreBranch(p,entry,getContext().chat,true),'当前有同名档案、已达档案上限或正文发生变化，无法恢复');
        delete p.lastArchiveUpdate;delete p.archiveUndo;
      },{captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}});
      this.runtimeLog?.step(ticket,'旧分支变化',{entries:[{action:'恢复原分支',powerId,recordId:branch.record.id,floor:branchFloor(branch)}]});
      this.runtimeLog?.finish(ticket,'已保存');this.refresh();this.ui.updateArchiveLibrary?.();this.notice('已恢复旧分支记录。');
    }catch(error){this.runtimeLog?.finish(ticket,'失败',error.message);throw error;}
  }
};
