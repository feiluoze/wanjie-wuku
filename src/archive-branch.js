import {worldSchedules,putWorldSchedule} from './taishi-schedule.js';
import {timeReceiptCurrent} from './taishi-time.js';
import {clone,hash,stable,storyText} from './core.js';
import {archiveContextCurrent} from './archives.js';
import {managementContextCurrent} from './core.js';
import {getContext} from './host.js';

// Remove only facts whose story branch no longer exists. Ledger transactions,
// purchased assets and explicit manual settings are never rolled back here.
export function rollbackStoryRecords(state,chat){
  const result={removed:0,restored:0};
  for(const p of Object.values(state.powers)){
    let changed=false;
    for(const [id,r] of Object.entries(p.archives||{})){
      if(archiveContextCurrent(r,chat))continue;
      const versions=r.history||[];let restored=null;
      for(let i=versions.length-1;i>=0;i--){const candidate={...clone(versions[i]),history:clone(versions.slice(0,i))};if(archiveContextCurrent(candidate,chat)){restored=candidate;break;}}
      if(restored){p.archives[id]=restored;result.restored++;}
      else {delete p.archives[id];if(state.archiveMemory)delete state.archiveMemory.selections[p.id+'/'+id];result.removed++;}
      changed=true;
    }
    for(const [id,r] of Object.entries(p.managementRecords||{}))if(!managementContextCurrent(r,chat)){delete p.managementRecords[id];result.removed++;changed=true;}
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
    const captured={chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision},contextHash=hash(stable(s.hashes));let result;
    await this.store.transact(next=>{if(this.mainBusy)throw Error('主叙事已开始，稍后再清理旧分支');if(hash(stable(this.contextSnapshot().hashes))!==contextHash)throw Error('正文再次变化，等待下一次清理');result=rollbackStoryRecords(next,getContext().chat);},{captured});
    if(result.removed||result.restored)this.notice(`旧分支记录已清理：删除 ${result.removed} 项，回退 ${result.restored} 项。已结算购买保留。`);
    this.refresh();return result;
  }
};
