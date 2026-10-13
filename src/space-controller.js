import {storyTimeEvents,assertStoryTime} from './taishi-time.js';
import {taishiBuildMethods} from './taishi-build-controller.js';
import {createPower,assert,clone} from './core.js';
import {taishiPerson,peopleControls,validatePeopleControls} from './taishi-people.js';
import {saveArchive,archiveSource,saveArchiveUpdate} from './archives.js';
import {journalSnapshot,saveArchiveUndo} from './archive-journal.js';
import {evolutionWorld,TAISHI_TIME_UNITS} from './taishi-evolution.js';
import {builtinTaishiEntry,builtinPowerId} from './builtin-worldbook.js';
import {isTaishi,TAISHI_SECTIONS} from './taishi.js';
import {isMmlc,MMLC_ENTRY} from './mmlc.js';
// Space selection has no archive migration or destructive side effects.
export const powerSpace=p=>isMmlc(p)?'mmlc':isTaishi(p)?'taishi':'wuku';
export const moduleEnabled=(state,space)=>Object.values(state?.powers||{}).some(p=>powerSpace(p)===space&&p.active);
export const spaceMethods={
  async saveModules(values){
    assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前任务完成后再切换模块');
    const s=this.ensureStable();
    assert(!(s.state.roleWrites||[]).some(w=>w.status==='pending'),'请先处理待完成的角色写回');
    await this.store.transact(next=>{
      for(const space of ['mmlc','taishi']){
        const enabled=values[space]==='on';
        let powers=Object.values(next.powers).filter(p=>powerSpace(p)===space);
        if(enabled&&!powers.length){
          const entry=space==='mmlc'?MMLC_ENTRY:builtinTaishiEntry();
          assert(entry,'内置模块规则缺失');
          const p=createPower(space==='mmlc'?entry:{...entry,id:builtinPowerId(entry,next.powers)});
          p.archiveStart=Math.max(0,s.ctx.chat.length-24);p.autoArchiveReview=false;
          next.powers[p.id]=p;powers=[p];
        }
        for(const p of powers)p.active=enabled;
      }
      this.record(next,'修改独立模块开关',['关闭模块暂停整理与发送；档案保留'],'setup');
    },{captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}});
    this.plans=[];this.selected=null;this.ui.closeDialog();this.refresh();
    this.notice('模块开关已保存到当前聊天；关闭的模块不再整理或发送，已有档案保留。');
  },
  async openTaishi(){
    assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前操作完成');
    const s=this.ensureStable(),existing=Object.values(s.state.powers).find(isTaishi);
    let id=existing?.id;
    if(!id){const entry=builtinTaishiEntry();
      assert(entry,'内置太始天完整版缺失');id=builtinPowerId(entry,s.state.powers);
      const p=createPower({...entry,id});p.archiveStart=Math.max(0,s.ctx.chat.length-24);
      p.autoArchiveReview=false;
      await this.store.transact(next=>{assert(!next.powers[id],'词条已接入，请重试');next.powers[id]=p;this.record(next,'接入独立太始天',['复用档案与自动更新；未调用模型'],'setup',id);},{captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}});
    }
    this.powerId=id;this.ui.space='taishi';this.ui.taishiSection=null;this.ui.tab='management';this.plans=[];this.selected=null;this.ui.closeDialog();this.refresh();
    this.notice('太始天已就绪。可整理剧情，或选择个人世界书建立底稿；开启自动更新后在后台记录变化。');
  },
  selectTaishiSection(id){assert(!id||TAISHI_SECTIONS.some(s=>s.id===id),'未知太始天分类');this.ui.taishiSection=id||null;this.ui.tab='management';this.refresh();},
  openTaishiDraft(kind){
    const s=this.ensureStable({model:true});assert(isTaishi(s.state.powers[this.powerId])&&s.state.powers[this.powerId].active,'请先启用太始天');
    assert(['world','companion'].includes(kind),'未知太始天创建方式');
    this.ui.setNotice?.('');
    this.taishiDraft={kind,powerId:this.powerId,captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}};
    this.ui.showTaishiDraft(kind);
  },
  async submitTaishiDraft(values){
    const d=this.taishiDraft;assert(d&&d.powerId===this.powerId&&values.kind===d.kind,'创建窗口已失效，请重新打开');
    this.ensureStable({model:true});this.store.assertCapture(d.captured);
    const description=values.description;
    assert(typeof description==='string'&&description.trim().length>=6&&description.length<=2500,'请填写6至2500字的构想');
    const joining=d.kind==='world'?'none':values.joining;
    assert(['none','direct','encounter','npc'].includes(joining),'人物加入方式无效');
    return this.reviewArchives({supplement:true,taishiDraft:{kind:d.kind,joining},values:{playerNote:description.trim()}});
  },
  dismissTaishiDraft(){if(this.taishiDraft)this.cancel();this.taishiDraft=null;this.resumePlayerReview();},
  openTaishiPeople(){
    const s=this.ensureStable(),p=s.state.powers[this.powerId];assert(isTaishi(p)&&p.active,'请先启用太始天');
    this.taishiPeopleDraft={powerId:p.id,captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}};
    this.ui.showTaishiPeople(p);
  },
  async saveTaishiPeople(values){
    assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前操作完成');
    const d=this.taishiPeopleDraft;assert(d&&d.powerId===this.powerId,'人物筛选窗口已失效');const s=this.ensureStable();
    assert(['all','selected'].includes(values.mode),'人物筛选方式无效');
    await this.store.transact(next=>{
      const p=next.powers[d.powerId];assert(isTaishi(p)&&p.active,'太始天接入已变化');
      const undo=journalSnapshot(next,p.id),before={...p.archives},saved=[],old=peopleControls(p);
      const controls={mode:values.mode,selected:[],pinned:[],joining:{...old.joining}};
      for(const r of Object.values(p.archives||{}).filter(taishiPerson)){
        if(values['update:'+r.id]==='on')controls.selected.push(r.id);
        if(values['pin:'+r.id]==='on')controls.pinned.push(r.id);
        const join=values['join:'+r.id]||old.joining[r.id];
        assert(join===undefined||['direct','encounter','npc'].includes(join),'人物加入方式无效');
        if(join){controls.joining[r.id]=join;if(join!==old.joining[r.id]){
          const relationship={direct:'玩家指定为太始天眷属',encounter:'玩家计划相遇；尚未缔约',npc:'玩家指定为普通人物；未缔约'}[join];
          const role=old.joining[r.id]?(r.fields.role||'').split('；').slice(1).join('；'):(r.fields.role||'');
          const specific=r.specific?clone(r.specific):null;if(specific)specific.fields.relationship=relationship;
          saved.push(saveArchive(p,{id:r.id,type:r.type,name:r.name,status:r.status,fields:{...r.fields,role:relationship+'；'+role},...(specific?{specific}:{})},archiveSource(s.ctx.chat,'玩家设置人物加入方式；不表示正文已发生契约仪式或相遇')));
        }}
      }
      validatePeopleControls(controls);p.taishiPeople=controls;
      if(saved.length)saveArchiveUpdate(p,before,saved,[],{chat:s.ctx.chat});
      saveArchiveUndo(next,p.id,undo,'人物筛选与身份设置');
    },{captured:d.captured});
    this.taishiPeopleDraft=null;this.ui.closeDialog();this.refresh();this.resumePlayerReview();this.notice('人物筛选已保存；未选人物档案保留，自选保留的人仍参与更新。');
  },
  openTaishiDevelopment(){
    const s=this.ensureStable(),p=s.state.powers[this.powerId];assert(isTaishi(p)&&p.active,'请先启用太始天');
    this.taishiEvolutionDraft={powerId:p.id,captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}};
    this.ui.showTaishiDevelopment(p,this.settings.mode,storyTimeEvents(p,s.ctx.chat));
  },
  async saveTaishiAutonomy(values){
    assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前操作完成');
    const d=this.taishiEvolutionDraft;assert(d&&d.powerId===this.powerId,'发展设置窗口已失效');this.ensureStable();
    await this.store.transact(next=>{const p=next.powers[d.powerId];assert(isTaishi(p)&&p.active,'太始天接入已变化');p.taishiAutonomy=values.autonomy==='on';},{captured:d.captured,facts:false});
    this.openTaishiDevelopment();this.notice(values.autonomy==='on'?'已允许AI合理创作发展候选；指定内部历时后可生成预览。':'已关闭自主发展；剧情整理与已有档案继续保留。');
  },
  evolveTaishiStory(id){
    const d=this.taishiEvolutionDraft;assert(d&&d.powerId===this.powerId,'发展窗口已失效');const s=this.ensureStable({model:true});this.store.assertCapture(d.captured);
    const p=s.state.powers[d.powerId],event=storyTimeEvents(p,s.ctx.chat).find(r=>r.id===id);assert(event,'正文历时已变化，请重新打开自主发展');assertStoryTime(p,s.ctx.chat,event);
    return this.evolveTaishi({worldId:event.worldId,elapsed:event.elapsed,unit:event.unit,note:'根据正文明确历时生成发展候选；不得重复兑现正文已完成的成果。'},event);
  },
  evolveTaishi(values,timeEvent=null){
    const d=this.taishiEvolutionDraft;assert(d&&d.powerId===this.powerId,'发展窗口已失效');const s=this.ensureStable({model:true});this.store.assertCapture(d.captured);
    const p=s.state.powers[d.powerId];assert(p?.active&&p.taishiAutonomy===true,'请先开启自主发展');
    const evolution={worldId:values.worldId,elapsed:Number(values.elapsed),unit:values.unit};const world=evolutionWorld(p,evolution);
    assert(typeof values.note==='string'&&values.note.length<=1500,'发展方向最多1500字');
    const playerNote=timeEvent?`正文已经明确记载「${world.name}」内部 ${evolution.elapsed}${TAISHI_TIME_UNITS[evolution.unit]}，原文：${timeEvent.quote}。只补全这段已发生历时内的发展，不额外推进同样时间，不重复正文已有成果；新增细节是AI候选而非原文证实。`:`玩家允许AI合理创作，确认仅推进「${world.name}」内部 ${evolution.elapsed}${TAISHI_TIME_UNITS[evolution.unit]}。发展方向：${values.note.trim()||'沿用已有安排，让世界与人物自然发展。'} 不表示正文已经发生。`;
    return this.reviewArchives({supplement:true,taishiEvolution:evolution,...(timeEvent?{taishiTimeEvent:timeEvent}:{}),values:{playerNote}});
  },
  dismissTaishiDevelopment(){if(this.taishiEvolutionDraft)this.cancel();this.taishiEvolutionDraft=null;this.resumePlayerReview();},
  openTaishiAdvanced(){
    const s=this.ensureStable();const p=s.state.powers[this.powerId];assert(isTaishi(p)&&p.active,'请先启用太始天');
    this.taishiWorkflowDraft={powerId:p.id,captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}};
    this.ui.showTaishiAdvanced(p);
  },
  async saveTaishiWorkflow(values){
    assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前操作完成');
    const d=this.taishiWorkflowDraft;assert(d&&d.powerId===this.powerId,'高级窗口已失效，请重新打开');this.ensureStable();
    await this.store.transact(next=>{const p=next.powers[d.powerId];assert(isTaishi(p)&&p.active,'太始天已变化');p.taishiWorkflow=values.workflow==='on';},{captured:d.captured,facts:false});
    this.taishiWorkflowDraft=null;this.ui.closeDialog();this.refresh();this.notice(values.workflow==='on'?'高级剧情核对已开启：最多3次模型请求，仍经统一预览与保存流程。':'已使用基础单模型核对。');
  },
  ...taishiBuildMethods
};
