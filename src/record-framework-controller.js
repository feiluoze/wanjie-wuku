import {assert} from './primitives.js';
import {setRecordFrameworks,supportsRecordFrameworks} from './record-frameworks.js';
export const recordFrameworkMethods={
 openRecordFrameworks(){
  const s=this.ensureStable(),p=s.state.powers[this.powerId];
  assert(supportsRecordFrameworks(p),'请先选择普通武库词条；专用模块沿用原结构');
  assert(!this.busy&&!this.mainBusy&&!this.committing&&!this.pendingArchiveReview&&!this.archiveReviewJob&&!this.manualBatchRun,'请先完成或放弃当前整理候选，再调整框架');
  this.frameworkCapture={powerId:p.id,chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision};
  this.ui.showRecordFrameworks(p);
 },
 async saveRecordFrameworks(data){
  const capture=this.frameworkCapture;assert(capture&&capture.powerId===this.powerId,'词条已切换，请重新打开记录框架');
  assert(!this.busy&&!this.mainBusy&&!this.committing&&!this.pendingArchiveReview&&!this.archiveReviewJob&&!this.manualBatchRun,'请先完成或放弃当前整理候选，再调整框架');
  assert(data.form?.elements?.['framework-selection']?.value==='1','请重新打开框架选择');
  const enabled=new FormData(data.form).getAll('record-framework');
  this.committing=true;this.refresh();
  try{
   await this.store.transact(next=>{const p=next.powers[capture.powerId];assert(p,'词条已不存在');setRecordFrameworks(p,enabled);},{captured:{chatKey:capture.chatKey,stateId:capture.stateId,revision:capture.revision},facts:false});
   this.frameworkCapture=null;this.ui.closeDialog();this.notice('记录框架已保存。旧档完整保留，之后整理只更新启用的框架及原状态栏。');
  }finally{this.committing=false;this.refresh();}
 }
};
