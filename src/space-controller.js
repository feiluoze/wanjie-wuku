import {createPower,assert} from './core.js';
import {builtinEntries,builtinPowerId} from './builtin-worldbook.js';
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
          const entry=space==='mmlc'?MMLC_ENTRY:builtinEntries().find(e=>e.name.startsWith('太始天（完整版'));
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
    if(!id){const entry=builtinEntries().find(e=>e.name.startsWith('太始天（完整版'));
      assert(entry,'内置太始天完整版缺失');id=builtinPowerId(entry,s.state.powers);
      const p=createPower({...entry,id});p.archiveStart=Math.max(0,s.ctx.chat.length-24);
      p.autoArchiveReview=false;
      await this.store.transact(next=>{assert(!next.powers[id],'词条已接入，请重试');next.powers[id]=p;this.record(next,'接入独立太始天',['复用档案与自动更新；未调用模型'],'setup',id);},{captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}});
    }
    this.powerId=id;this.ui.space='taishi';this.ui.taishiSection=null;this.ui.tab='management';this.plans=[];this.selected=null;this.ui.closeDialog();this.refresh();
    this.notice('太始天已就绪。可整理剧情，或选择个人世界书建立底稿；开启自动更新后在后台记录变化。');
  },
  selectTaishiSection(id){assert(!id||TAISHI_SECTIONS.some(s=>s.id===id),'未知太始天分类');this.ui.taishiSection=id||null;this.ui.tab='management';this.refresh();},
  async initializeTaishi(){
    const s=this.ensureStable({model:true});assert(isTaishi(s.state.powers[this.powerId]),'请先进入太始天');
    if(!s.state.aiWorldbooks){await this.openAIWorldbooks();return this.notice('先选择作为个人设定的世界书条目，保存后再点“从我的世界书建立底稿”。');}
    return this.reviewArchives({setupReferences:true});
  }
};
