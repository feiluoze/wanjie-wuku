import {worldSchedules,hasWorldSchedule} from './taishi-schedule.js';
export { normalizePlayerGuide, currentPlayerGuide } from './player-guide.js';
import { archiveSources, combinedArchivePrompt } from './archive-review.js';
import { normalizeArchiveAuto } from './archive-scope.js';
import { assert, text, stable, hash, chatHashes } from './core.js';
import { archiveContextCurrent as archiveCurrent } from './archives.js';

// Rule explanations describe possibilities, never ownership or completed events.


export function playerTimeline(power, chat) {
  const rows = [];
  for (const r of Object.values(power.archives || {})) {
    if (!archiveCurrent(r, chat)) continue;
    const versions = [...r.history, r];
    versions.forEach((row, i) => {
      if (!archiveCurrent(row, chat)) return;
      const previous = versions[i - 1], changes = Object.entries(row.fields).filter(([k, v]) => v && (!previous || previous.fields[k] !== v));
      if (!changes.length && previous?.status === row.status) return;
      rows.push({ ...(row.module ? { module: row.module } : {}), id: row.id, version: i, name: row.name, type: row.type, status: row.status, at: row.updatedAt, source: row.source,
        text: changes.map(([, v]) => v).join('；').slice(0, 500), first: !previous });
    });
  }
  return rows.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id) || b.version - a.version).slice(0, 8);
}
export const playerHomeMethods = {
  openPlayerReview() {
    const s = this.ensureStable(), p = s.state.powers[this.powerId], pending = this.pendingArchiveReview;
    assert(pending && p?.active && pending.powerId === p.id && pending.captured.stateId === s.state.id && pending.captured.revision === s.state.revision, '整理结果已变化，请重新整理');
    this.ui.resumeTaishiDialogs?.();
    this.ui.showArchiveReview(pending, p, s.ctx.chat);
  },
  async togglePlayerAuto() {
    const s = this.ensureStable(), p = s.state.powers[this.powerId]; assert(p?.active, '请先选择当前金手指');
    assert(!this.busy && !this.mainBusy && !this.committing, '请等待当前操作完成');
    await this.store.transact(next => { next.powers[p.id].autoArchiveReview = !p.autoArchiveReview; if (p.autoArchiveReview) next.powers[p.id].autoArchiveSave = false; }, { facts: false, captured: { chatKey: s.chatKey, stateId: s.state.id, revision: s.state.revision } });
    this.refresh(); this.notice(p.autoArchiveReview ? '已关闭正文后自动整理。' : '已开启：当前选中的金手指在正文完成后调用一次已配置的API整理变化，确认后保存。');
  },
  async togglePlayerAutoSave() {
    const s = this.ensureStable(), p = s.state.powers[this.powerId]; assert(p?.active, '请先选择当前金手指');
    assert(!this.busy && !this.mainBusy && !this.committing, '请等待当前操作完成');
    const enabled = !(p.autoArchiveReview || p.autoArchiveSave || Object.values(worldSchedules(p)).some(s=>s.config.enabled));
    await this.store.transact(next => { next.powers[p.id].autoArchiveSave = enabled; next.powers[p.id].autoArchiveReview = enabled; if(!enabled)for(const value of Object.values(worldSchedules(next.powers[p.id])))value.config.enabled=false; if (enabled) next.powers[p.id].autoArchiveStart ??= Math.max(0,s.ctx.chat.length-1); }, { facts: false, captured: { chatKey: s.chatKey, stateId: s.state.id, revision: s.state.revision } });
    if(!enabled){this.archiveAutoStatus ||= {};this.archiveAutoStatus[p.id]='自动更新已关闭';}
    this.refresh(); this.notice(enabled ? '已开启自动整理并保存：正文完成后调用已配置API，整理出的成果按字段格式保存并保留历史；无需保持打开该词条，漫漫长路八个模块一并更新；已有待确认结果先由你处理。' : '已关闭正文后自动整理、自动保存和剧情时间自动触发，不再因此调用API。');
  },
  schedulePlayerReview(type) {
    if (!['normal', 'continue', 'regenerate', 'swipe'].includes(type)) return;
    const s = this.contextSnapshot(); if(this.settings.mode === 'off')return;
    const powerIds=Object.values(s.state.powers).filter(p=>p.active&&(p.autoArchiveReview&&(p.autoArchiveSave||p.id===this.powerId)||p.taishiAutonomy===true&&hasWorldSchedule(p))).map(p=>p.id);
    if(!powerIds.length)return;
    const capture = { chatKey:s.chatKey, powerId:powerIds[0], powerIds, stateId:s.state.id, hash:hash(stable(chatHashes(s.ctx.chat))) };
    if(this.lastPlayerAuto === stable(capture))return;
    this.playerAutoQueued = capture;
    clearTimeout(this.playerReviewTimer); this.playerReviewTimer = null; this.resumePlayerReview();
  },
  archiveUpdateWaiting() {
    if (this.role?.rawPending) return true;
    try { return this.role?.engine?.()?.isDuringExtraAnalysis?.() === true; }
    catch { return true; } // An available but unreadable parser must not be treated as ready.
  },
  resumePlayerReview() {
    if (!this.playerAutoQueued || this.playerAutoRunning || this.playerReviewTimer || this.busy || this.mainBusy || this.committing || this.continuation || this.pendingArchiveReview || this.archiveReviewJob || this.terminalDraft || this.terminalRequest || this.creationDraft || this.creationRequest || this.taishiDraft || this.taishiControlDraft || this.taishiEvolutionDraft || this.taishiPeopleDraft || this.taishiRelationDraft || this.taishiBuildDraft || this.archiveToolRequest || this.referenceDraft) return;
    if (this.archiveUpdateWaiting()) {
      this.archiveAutoStatus ||= {};
      let changed = false;
      for (const id of this.playerAutoQueued.powerIds || [this.playerAutoQueued.powerId]) { if (this.archiveAutoStatus[id] !== '等待变量更新完成') changed = true; this.archiveAutoStatus[id] = '等待变量更新完成'; }
      if (changed) this.refresh();
      return;
    }
    this.playerReviewTimer = setTimeout(() => { this.playerReviewTimer = null; void this.runPlayerReview(); }, 450);
  },
  async runPlayerReview() {
    const capture = this.playerAutoQueued; if (!capture || this.playerAutoRunning) return;
    const now = this.contextSnapshot();
    if(this.settings.mode==='off'||now.chatKey!==capture.chatKey||now.state.id!==capture.stateId){this.playerAutoQueued=null;return;}
    // Keep queued work while other operations finish; refresh resumes it when idle.
    if (this.busy || this.mainBusy || this.committing || this.continuation || this.pendingArchiveReview || this.archiveReviewJob || this.terminalDraft || this.terminalRequest || this.creationDraft || this.creationRequest || this.taishiDraft || this.taishiControlDraft || this.taishiEvolutionDraft || this.taishiPeopleDraft || this.taishiRelationDraft || this.taishiBuildDraft || this.archiveToolRequest || this.referenceDraft) return;
    if (this.archiveUpdateWaiting()) { this.resumePlayerReview(); return; }
    const id = stable(capture); this.playerAutoQueued = null;
    if (this.lastPlayerAuto === id) return;
    const run = {}; this.lastPlayerAuto = id; this.playerAutoRunning = run;
    const powerIds=capture.powerIds||[capture.powerId], due=new Set(), paused=new Set();
    try {
      for(const powerId of powerIds){
        if(this.pendingArchiveReview||this.playerAutoRunning!==run)break;
        const scheduledPower=this.contextSnapshot().state.powers[powerId];
        if(scheduledPower?.taishiAutonomy&&hasWorldSchedule(scheduledPower)){
          try{if(await this.runTaishiScheduled(powerId))continue;}catch(error){this.notice('按剧情时间演化已暂停：'+error.message,true);continue;}
        }

        let first=capture.drainingPowerId!==powerId&&!due.has(powerId);
        while(true){
          const snapshot=this.contextSnapshot(),p=snapshot.state.powers[powerId];
          if(this.playerAutoRunning!==run||snapshot.chatKey!==capture.chatKey||snapshot.state.id!==capture.stateId||!p?.active||!p.autoArchiveReview||this.settings.mode==='off'||(!p.autoArchiveSave&&this.powerId!==powerId)||this.pendingArchiveReview||paused.has(powerId)||p.archiveBatch&&p.archiveBatch.cursor<p.archiveBatch.parts.length)break;
          if (this.archiveUpdateWaiting()) {
            this.playerAutoQueued ||= { ...capture, drainingPowerId: powerId };
            if (this.lastPlayerAuto === id) this.lastPlayerAuto = null;
            break;
          }
          if(p.autoArchiveSave&&p.autoArchiveStart===undefined){
            await this.store.transact(next=>{next.powers[powerId].autoArchiveStart=Math.max(p.archiveStart??snapshot.state.managementStart??0,snapshot.ctx.chat.length-24);},{facts:false,captured:{chatKey:snapshot.chatKey,stateId:snapshot.state.id,revision:snapshot.state.revision}});
            continue;
          }
          const sources=archiveSources(snapshot.ctx.chat,snapshot.state,p,{automatic:true});
          const config=normalizeArchiveAuto(p.archiveAuto);
          if(!sources.length||first&&sources.length<config.every)break;
          first=false;due.add(powerId);this.archiveAutoStatus ||= {};this.archiveAutoStatus[powerId]='正在更新';this.refresh();
          try {
            let group;
            if(config.combine&&p.autoArchiveSave&&!this.archiveUpdateWaiting()){
              const peers=powerIds.filter(otherId=>otherId!==powerId&&!paused.has(otherId)).map(otherId=>snapshot.state.powers[otherId]).filter(other=>{
                if(!other?.active||!other.autoArchiveReview||!other.autoArchiveSave||other.autoArchiveStart===undefined||hasWorldSchedule(other)||other.archiveBatch&&other.archiveBatch.cursor<other.archiveBatch.parts.length)return false;
                const settings=normalizeArchiveAuto(other.archiveAuto);
                if(!settings.combine||settings.every!==config.every)return false;
                const pending=archiveSources(snapshot.ctx.chat,snapshot.state,other,{automatic:true});
                return (due.has(other.id)||pending.length>=settings.every)&&stable(pending[0])===stable(sources[0]);
              });
              if(peers.length)group=combinedArchivePrompt(snapshot,[p,...peers],sources[0]);
            }
            if(!group||group.members[0].powerId!==powerId){
              await this.reviewArchives({silent:true,autoSave:Boolean(p.autoArchiveSave),automatic:true,powerId});
            }else{
              let reply;
              for(const member of group.members){
                if(this.pendingArchiveReview||this.playerAutoRunning!==run)break;
                due.add(member.powerId);
                const combinedReply=async(current,selected)=>{
                  assert(current.chatKey===snapshot.chatKey&&current.state.id===snapshot.state.id&&stable(current.hashes)===stable(snapshot.hashes)&&
                    stable(current.state.powers[member.powerId])===stable(snapshot.state.powers[member.powerId])&&stable(selected[0])===stable(sources[0]),'剧情或词条已变化，请重新整理');
                  if(!reply){
                    this.runtimeLog?.step(this.logTask,'合并更新请求',{floor:sources[0].index+1,entries:group.members.map(m=>m.name)});
                    reply=await this.query(group.prompt,{...current,referenceOnly:false},{task:'archive',retryTransient:true});
                  }else this.runtimeLog?.step(this.logTask,'沿用合并更新回复',{floor:sources[0].index+1});
                  const section=reply.data?.[member.key];
                  assert(section&&Array.isArray(section.changes)&&Array.isArray(section.floorReviews)&&section.floorReviews.length===1&&section.floorReviews[0]?.sourceIndex===sources[0].index,
                    '合并回复缺少本词条在该楼层的完整结果，读取进度未推进');
                  const data=Object.fromEntries(Object.keys(group.prompt.archiveSchema.properties[member.key].properties).filter(key=>Object.hasOwn(section,key)).map(key=>[key,section[key]]));
                  return {...reply,data,logId:this.logTask,captured:{...reply.captured,revision:current.state.revision}};
                };
                try{
                  await this.reviewArchives({silent:true,autoSave:true,automatic:true,powerId:member.powerId,combinedReply});
                }catch(error){
                  if(!reply||error?.name==='AbortError'){
                    for(const item of group.members){paused.add(item.powerId);this.archiveAutoStatus[item.powerId]='合并更新暂停：'+error.message;}
                    throw error;
                  }
                  paused.add(member.powerId);this.archiveAutoStatus[member.powerId]='更新暂停：'+error.message;
                  this.notice(member.name+'自动更新未完成：'+error.message,true);
                }
                if(this.archiveAutoIncomplete?.[member.powerId]){
                  paused.add(member.powerId);this.archiveAutoIncomplete[member.powerId]=false;
                  this.archiveAutoStatus[member.powerId]='部分楼层待重查，自动整理已暂停';
                }
              }
              if(paused.has(powerId))break;
            }
          }
          catch(error){const current=this.contextSnapshot();if(this.playerAutoRunning!==run||current.chatKey!==capture.chatKey||current.state.id!==capture.stateId||error?.name==='AbortError')break;this.archiveAutoStatus[powerId]=`更新暂停：${error.message}`;this.notice(`${p.name}自动更新未完成：${error.message}。有限尝试已结束，可查看运行日志后手动重查。`,true);break;}
          if (this.playerAutoRunning !== run) break;
          if(this.archiveAutoIncomplete?.[powerId]){this.archiveAutoStatus[powerId]='部分楼层待重查，自动整理已暂停';this.archiveAutoIncomplete[powerId]=false;break;}
          if(!p.autoArchiveSave||this.pendingArchiveReview){this.archiveAutoStatus[powerId]=this.pendingArchiveReview?.data?.rawFailures?.length?'等待修复 · 原回复已保留':'等待确认';break;}
          const after=this.contextSnapshot(),next=archiveSources(after.ctx.chat,after.state,after.state.powers[powerId] || p,{automatic:true});
          if(next.length&&stable(next)===stable(sources)){this.archiveAutoStatus[powerId]='本批进度未前进，请手动重查';break;}
        }
      }
    }
    finally { if (this.playerAutoRunning === run) { this.playerAutoRunning = null; this.resumePlayerReview(); } }
  },
};
