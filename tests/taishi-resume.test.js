import {completeReview} from './review-response-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {clone,validateState} from '../src/core.js';
import {WorkbenchUI} from '../src/ui.js';
import {runTaishiWorkflow} from '../src/taishi-workflow.js';

const row=role=>({name:role==='taishiWorld'?'海蓝界':'云岚',type:role==='taishiWorld'?'environment':'member',status:'active',fields:role==='taishiWorld'?{conditions:'海洋文明'}:{role:'灵植师'},recordId:role==='taishiWorld'?'world':'companion',details:role==='taishiWorld'?{overview:'群岛文明'}:{profile:'沉稳'},sourceIndex:0});
async function setup(){
  const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};
  await f.store.transact(s=>s.powers[f.app.powerId].taishiWorkflow=true);f.calls=[];
  f.fail=new Set(['taishiPeople']);f.app.model.request=async(p,{connection})=>{const role=connection.task;f.calls.push(role);if(f.fail.has(role))throw Error(role+' 超时');return completeReview(p,role==='taishiSummary'?{message:'世界与人物候选'}:{changes:[row(role)]});};return f;
}
const pending=f=>f.app.pendingArchiveReview;

test('retry only requests the failed role, retains successful candidates, and summary is explicitly separate',async()=>{
  const f=await setup(),before=clone(f.store.read());await f.app.reviewArchives();const world=clone(pending(f).data.workflowState.stages.taishiWorld);
  assert.deepEqual(f.calls,['taishiWorld','taishiPeople']);assert.equal(pending(f).changes.length,1);
  f.fail.clear();await f.app.retryTaishiWorkflow('taishiPeople');assert.deepEqual(f.calls,['taishiWorld','taishiPeople','taishiPeople']);assert.deepEqual(pending(f).data.workflowState.stages.taishiWorld,world);assert.equal(pending(f).changes.length,2);assert.equal(pending(f).data.workflowState.stages.taishiSummary.status,'pending');
  await f.app.retryTaishiWorkflow('taishiSummary');assert.equal(f.calls.length,4);assert.equal(f.calls[3],'taishiSummary');assert.equal(pending(f).issues.length,0);assert.deepEqual(f.store.read(),before);
  await f.app.commitArchiveReview(pending(f),new Map(pending(f).changes.map((c,i)=>[i,c.id])));const state=validateState(clone(f.store.read()));assert.equal(state.powers[f.app.powerId].archiveReviewed.length,1);assert.equal(Object.keys(state.powers[f.app.powerId].archives).length,2);assert(!JSON.stringify(state).includes('workflowState'));
});

test('both failures produce retryable read-only preview; successful and premature summary stages cannot run',async()=>{
  const f=await setup();f.fail.add('taishiWorld');await f.app.reviewArchives();assert(pending(f).readOnly);assert.equal(pending(f).changes.length,0);
  await assert.rejects(f.app.commitArchiveReview(pending(f),new Map()),/没有可保存/);
  await assert.rejects(f.app.retryTaishiWorkflow('taishiSummary'),/先完成/);assert.equal(f.calls.length,2);
  f.fail.delete('taishiWorld');await f.app.retryTaishiWorkflow('taishiWorld');assert.equal(f.calls.length,3);assert(!pending(f).readOnly);
  await assert.rejects(f.app.retryTaishiWorkflow('taishiWorld'),/无需/);assert.equal(f.calls.length,3);
});

test('summary failure retries only summary and cannot inject facts or rewards',async()=>{
  const f=await setup();f.fail=new Set(['taishiSummary']);await f.app.reviewArchives();const changes=clone(pending(f).changes);
  f.app.model.request=async(p,{connection})=>{f.calls.push(connection.task);return JSON.stringify({message:'摘要已恢复',changes:[row('taishiWorld')],terminalResults:[{}],creationResults:[{}]});};
  await f.app.retryTaishiWorkflow('taishiSummary');assert.deepEqual(f.calls,['taishiWorld','taishiPeople','taishiSummary','taishiSummary']);assert.deepEqual(pending(f).changes,changes);assert.equal(pending(f).terminalResults.length,0);assert.equal(pending(f).creationResults.length,0);assert.equal(pending(f).issues.length,0);
});

test('invalid candidate schema marks its specialist failed and can be replaced by retry',async()=>{
  const f=await setup();f.app.model.request=async(p,{connection})=>{const role=connection.task;f.calls.push(role);return JSON.stringify({changes:[role==='taishiWorld'?{...row(role),status:'invalid'}:row(role)]});};
  await f.app.reviewArchives();assert.equal(pending(f).data.workflowState.stages.taishiWorld.status,'failed');assert.equal(pending(f).data.workflowState.stages.taishiPeople.status,'success');assert.equal(f.calls.length,2);
  f.app.model.request=async(p,{connection})=>{f.calls.push(connection.task);return JSON.stringify({changes:[row(connection.task)]});};
  await f.app.retryTaishiWorkflow('taishiWorld');assert.equal(f.calls.length,3);assert.equal(pending(f).changes.length,2);assert(!pending(f).issues.some(i=>i.role==='taishiWorld'));assert.equal(pending(f).data.workflowState.stages.taishiWorld.attempts,2);
});

test('three requests per stage is a hard manual budget with no automatic retries',async()=>{
  const f=await setup();await f.app.reviewArchives();await f.app.retryTaishiWorkflow('taishiPeople');await f.app.retryTaishiWorkflow('taishiPeople');assert.equal(f.calls.length,4);assert.equal(pending(f).data.workflowState.stages.taishiPeople.attempts,3);
  await assert.rejects(f.app.retryTaishiWorkflow('taishiPeople'),/上限/);assert.equal(f.calls.length,4);
});

test('changed story, changed book and changed revision block resume before model invocation',async()=>{
  for(const kind of ['story','book','revision']){
    const f=await setup();let content='个人参考';if(kind==='book'){f.ctx.loadWorldInfo=async()=>({entries:{1:{uid:1,content}}});await f.store.transact(s=>s.aiWorldbooks={mode:'manual',books:[{name:'个人书',entryIds:['1']}]});}
    await f.app.reviewArchives();if(kind==='story')f.ctx.chat[0].mes+='出现新剧情';if(kind==='book')content+='新内容';if(kind==='revision')await f.store.transact(s=>s.powers[f.app.powerId].taishiWorkflow=false);
    await assert.rejects(f.app.retryTaishiWorkflow('taishiPeople'));assert.equal(f.calls.length,2);
  }
});

test('cancelling a retry ignores late replies and keeps the previous successful cache intact',async()=>{
  const f=await setup();await f.app.reviewArchives();const old=pending(f);let release;
  f.app.model.request=()=>new Promise(r=>release=r);const work=f.app.retryTaishiWorkflow('taishiPeople');while(!release)await new Promise(r=>setTimeout(r,1));
  f.app.cancel();release(JSON.stringify({changes:[row('taishiPeople')]}));await assert.rejects(work,{name:'AbortError'});assert.equal(pending(f),old);assert.equal(pending(f).data.workflowState.stages.taishiPeople.attempts,2);
});

test('story edits during retry discard the response instead of mixing two revisions',async()=>{
  const f=await setup();await f.app.reviewArchives();const old=pending(f);let release;f.app.model.request=()=>new Promise(r=>release=r);
  const work=f.app.retryTaishiWorkflow('taishiPeople');while(!release)await new Promise(r=>setTimeout(r,1));f.ctx.chat.push({mes:'新的角色正文',is_user:false,swipe_id:0});release(JSON.stringify({changes:[row('taishiPeople')]}));await assert.rejects(work,/剧情.*变化/);assert.equal(pending(f),old);
});

test('cancelled requests consume the manual budget and cannot be used to bypass its cap',async()=>{
  const f=await setup();await f.app.reviewArchives();
  for(let i=0;i<2;i++){
    let release;f.app.model.request=()=>new Promise(r=>release=r);const work=f.app.retryTaishiWorkflow('taishiPeople');
    while(!release)await new Promise(r=>setTimeout(r,1));f.app.cancel();release('{"changes":[]}');await assert.rejects(work,{name:'AbortError'});
  }
  assert.equal(pending(f).data.workflowState.stages.taishiPeople.attempts,3);let called=false;f.app.model.request=async()=>{called=true;return '{}';};
  await assert.rejects(f.app.retryTaishiWorkflow('taishiPeople'),/上限/);assert.equal(called,false);
});

test('automatic partial runs pause for preview; successful cache cannot be resumed after saving',async()=>{
  const f=await setup(),before=clone(f.store.read());await f.app.reviewArchives({autoSave:true});assert.deepEqual(f.store.read(),before);assert(pending(f));
  const old=pending(f);await f.app.commitArchiveReview(old,new Map([[0,null]]));assert.equal(f.store.read().powers[f.app.powerId].archiveReviewed.length,0);await assert.rejects(f.app.retryTaishiWorkflow('taishiPeople'));assert.equal(f.calls.length,2);
});

test('workflow panel exposes individual retry, budget, cancel/discard and refresh limitation',async()=>{
  const f=await setup();await f.app.reviewArchives();const html=WorkbenchUI.prototype.taishiWorkflowReview.call({},pending(f));
  assert(html.includes('data-stage="taishiPeople"'));assert(!html.includes('data-stage="taishiWorld"'));assert(html.includes('2/9'));assert(html.includes('刷新后需重新核对'));assert(html.includes('taishi-workflow-discard'));
});

test('invalid resume input fails without invoking a model',async()=>{
  let calls=0;await assert.rejects(runTaishiWorkflow({system:'s',user:'{}'},async()=>{calls++;},{resume:{version:1,promptHash:'invalid'},retryRole:'taishiWorld'}),/已变化/);assert.equal(calls,0);
});
