import {assert} from './core.js';
import {resolveTaskConnection} from './host.js';
import {taskConnectionLabel} from './task-routing.js';
import {isTaishi} from './taishi.js';
import {readReferencePacket} from './ai-worldbooks.js';
import {REFERENCE_BUILD_LIMIT} from './ai-worldbooks-data.js';
import {planTaishiBuild,buildProgress,assertBuildMatch,advanceTaishiBuild} from './taishi-build.js';
import {journalSnapshot,saveArchiveUndo} from './archive-journal.js';

export const taishiBuildMethods={
  async initializeTaishi(){
    assert(!this.busy&&!this.mainBusy&&!this.committing&&!this.pendingArchiveReview,'请先处理当前任务或待确认结果');
    const s=this.ensureStable(),p=s.state.powers[this.powerId];assert(isTaishi(p)&&p.active,'请先启用太始天');
    if(!p.taishiWorldStructure)return this.openTaishiStructure('references');
    if(p.taishiWorldStructure.mode==='single')assert(p.archives?.[p.taishiWorldStructure.worldId]?.specific?.recordId==='world'&&p.archives[p.taishiWorldStructure.worldId].status!=='ended','指定主世界已失效，请重新选择建档结构');
    if(!p.taishiBuildReferences?.books.some(b=>b.entryIds.length)){await this.openAIWorldbooks({taishiPowerId:p.id});return this.notice('请为太始天构建单独选择世界书和词条；共享参考不会自动加入。');}
    let connectionLabel;try{connectionLabel=taskConnectionLabel(resolveTaskConnection('setup',s.ctx,this.settings,this.apiKey));}catch{connectionLabel='世界书初始化 · 未配置可用连接，请到连接设置检查任务分流';}
    const d={includePeople:false,structure:p.taishiWorldStructure,connectionLabel,selectionSummary:p.taishiBuildReferences.books.filter(b=>b.entryIds.length).map(b=>`${b.name}（${b.entryIds.length}条）`).join('、'),powerId:p.id,captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision},loading:true,error:''};this.taishiBuildDraft=d;this.ui.showTaishiBuild(d);
    try{
      const reference=await readReferencePacket(p.taishiBuildReferences,{ctx:s.ctx,limit:REFERENCE_BUILD_LIMIT});
      assert(this.taishiBuildDraft===d,'构建窗口已关闭');this.store.assertCapture(d.captured);
      d.includePeople=reference.payload.books.flatMap(b=>b.entries).every(e=>/^【人物】/.test(e.title));
      d.plan=planTaishiBuild(reference,p.ruleVersion,p.taishiWorldStructure);
      try{assertBuildMatch(p.taishiBuild,d.plan);if(p.taishiBuild)Object.assign(d.plan,p.taishiBuild);}catch(e){d.changed=true;d.error=e.message;}
    }catch(e){if(this.taishiBuildDraft===d)d.error=e.message;}
    finally{if(this.taishiBuildDraft===d){d.loading=false;this.ui.showTaishiBuild(d);}}
  },
  async runTaishiBuild(){
    const d=this.taishiBuildDraft;assert(d?.plan&&!d.loading&&!d.changed,'请先读取有效的世界书批次');
    assert(!this.pendingArchiveReview,'请先处理待确认结果');this.ensureStable({model:true});this.store.assertCapture(d.captured);
    assert(d.plan.next<d.plan.total,'所有批次已经处理完成');d.includePeople=this.ui.modal?.querySelector?.('[data-build-people]')?.checked??d.includePeople;d.loading=true;d.error='';this.ui.showTaishiBuild(d);
    try{
      // Re-read before every request; source edits must never silently resume the old cursor.
      const s=this.ensureStable({model:true}),p=s.state.powers[d.powerId];
      const reference=await readReferencePacket(p.taishiBuildReferences,{ctx:s.ctx,limit:REFERENCE_BUILD_LIMIT});
      assert(this.taishiBuildDraft===d,'构建窗口已关闭');this.store.assertCapture(d.captured);
      const fresh=planTaishiBuild(reference,p.ruleVersion,p.taishiWorldStructure);assertBuildMatch(buildProgress(d.plan),fresh);assertBuildMatch(p.taishiBuild,fresh);
      await this.reviewArchives({setupReferences:true,skipSetupPeople:!d.includePeople,taishiBuild:buildProgress(d.plan),referenceBatch:fresh.chunks[d.plan.next]});
      if(this.pendingArchiveReview?.taishiBuild)this.taishiBuildDraft=null;
      else d.error='本批没有可确认的有效候选，进度未推进；请查看运行日志后重试或明确跳过。';
    }catch(e){if(this.taishiBuildDraft===d){d.error=e.message;this.notice(e.message,true);}else throw e;}
    finally{if(this.taishiBuildDraft===d){d.loading=false;this.ui.showTaishiBuild(d);}}
  },
  async skipTaishiBuild(){
    const d=this.taishiBuildDraft;assert(d?.plan&&!d.loading&&!d.changed,'构建窗口无效');this.ensureStable();
    assert(!this.busy&&!this.mainBusy&&!this.committing&&!this.pendingArchiveReview,'请先处理当前任务');
    await this.store.transact(next=>{const p=next.powers[d.powerId];assert(p?.active,'太始天已停用');const before=journalSnapshot(next,p.id);advanceTaishiBuild(p,buildProgress(d.plan),{skip:true});saveArchiveUndo(next,p.id,before,'跳过世界书批次');},{captured:d.captured});
    this.taishiBuildDraft=null;await this.initializeTaishi();this.notice('已明确跳过这一批，已有档案保留；可撤销本次跳过。');
  },
  async restartTaishiBuild(){
    const d=this.taishiBuildDraft;assert(d&&!d.loading,'请等待读取完成');this.ensureStable();
    assert(!this.busy&&!this.mainBusy&&!this.committing&&!this.pendingArchiveReview,'请先处理当前任务');
    await this.store.transact(next=>{const p=next.powers[d.powerId];assert(p?.active,'太始天已停用');delete p.taishiBuild;},{captured:d.captured,facts:false});
    this.taishiBuildDraft=null;await this.initializeTaishi();this.notice('批次已重新建立；已有档案与历史保留，尚未调用模型。');
  },
  async selectTaishiBuildReferences(){
    const d=this.taishiBuildDraft;assert(d&&!d.loading,'请等待读取或生成结束');
    this.store.assertCapture(d.captured);this.taishiBuildDraft=null;
    return this.openTaishiStructure('references');
  },
  dismissTaishiBuild(){if(this.taishiBuildDraft)this.cancel();this.taishiBuildDraft=null;this.resumePlayerReview();},
};
