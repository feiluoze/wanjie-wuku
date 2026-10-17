import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {completeReview} from './review-response-fixture.js';
import {clone,stable,hash,chatHashes,validateState} from '../src/core.js';
import {creationConfig} from '../src/creation-config.js';
import {saveArchive,archiveSource,saveArchiveUpdate,ARCHIVE_FIELDS} from '../src/archives.js';
import {archivePrompt} from '../src/archive-review.js';
import {developmentGroups,taishiFocus,taskPhase} from '../src/taishi-continuity.js';
import {encodeCheckpoint,decodeCheckpoint} from '../src/review-checkpoint.js';
import {worldSchedules,hasWorldSchedule} from '../src/taishi-schedule.js';
import {memoryPlan} from '../src/archive-memory.js';
import {rollbackStoryRecords} from '../src/archive-branch.js';
async function setup(){
 const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};f.app.ui.showTaishiDevelopment=()=>{};
 f.ctx.chat[0].mes='<tp>纪元618年-01月-01日-00:00</tp>海蓝界研究站开始调查潮汐，赤砂界工坊运作正常。';
 f.ids={};await f.store.transact(s=>{const p=s.powers[f.app.powerId],c=creationConfig(p);p.taishiAutonomy=true;
  for(const [name,kind,fields] of [['海蓝界','world',{overview:'海洋文明'}],['赤砂界','world',{overview:'沙漠文明'}],['潮汐调查','event',{world:'海蓝界',phase:'进行中',completion:'取得潮汐记录'}],['暂停的工坊','development',{world:'赤砂界',phase:'搁置'}],['已建档旧事','event',{world:'海蓝界'}]]){
   const def=c.records.find(r=>r.id===kind),type=kind==='world'?'environment':kind==='development'?'research':'record';f.ids[name]=saveArchive(p,{type,name,status:'active',fields:{[Object.keys(ARCHIVE_FIELDS[type])[0]]:'已有记录'},specific:{adapterId:c.id,version:c.version,recordId:kind,label:def.label,fields,labels:Object.fromEntries(def.fields.map(v=>[v.id,v.label]))}},archiveSource(f.ctx.chat,'玩家已确认')).id;
  }
 });f.power=()=>f.store.read().powers[f.app.powerId];return f;
}
const clock=(f,name)=>({scheduleEnabled:'on',source:'tag',tags:'tp',worldId:f.ids[name],calendar:'gregorian',interval:12,unit:'hour',timeKind:'internal',rate:1,onParseFail:'notify'});
test('continuity distinguishes established archives from completed tasks and keeps unrelated tasks out of focus',async()=>{
 const f=await setup(),p=f.power(),rows=Object.values(p.archives),focus=taishiFocus(p,rows,'海蓝界出现新观测');
 assert(focus.ids.includes(f.ids['潮汐调查']));assert(!focus.ids.includes(f.ids['暂停的工坊']));assert.equal(taskPhase(p.archives[f.ids['已建档旧事']]),'');
 assert.equal(developmentGroups(p,f.ctx.chat).completed.length,0);assert.equal(developmentGroups(p,f.ctx.chat).attention.length,1);
 const prompt=JSON.parse(archivePrompt(p,[{index:0,swipeId:0,content:'海蓝界出现新观测'}],f.ctx.chat,'',{state:f.store.read()}).user);
 assert(prompt.taishiFocus.unfinished.some(r=>r.id===f.ids['潮汐调查']));const foreign=prompt.current.find(r=>r.archiveId===f.ids['暂停的工坊']);assert(foreign.identityOnly);assert(!foreign.details?.phase);
});
test('a task closure updates the same identity from explicit evidence without granting rewards',async()=>{
 const f=await setup(),id=f.ids['潮汐调查'];f.ctx.chat.push({is_user:false,swipe_id:0,mes:'海蓝界潮汐调查已完成，取得全部潮汐记录。'});const before=clone(f.store.read());
 f.app.model.request=async p=>completeReview(p,{changes:[{archiveId:id,name:'潮汐调查',type:'record',status:'active',recordId:'event',details:{phase:'已完成',result:'取得全部潮汐记录'},sourceIndex:1,quote:'潮汐调查已完成，取得全部潮汐记录。'}]});
 await f.app.reviewArchives({rescan:true});const pending=f.app.pendingArchiveReview;assert(pending.changes.some(c=>c.id===id));await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,i)=>[i,c.id])));
 const p=f.power();assert.equal(taskPhase(p.archives[id]),'已完成');assert.equal(developmentGroups(p,f.ctx.chat).completed[0].id,id);assert.deepEqual(p.resources,before.powers[p.id].resources);assert.equal(Object.keys(p.archives).length,5);
});
test('two worlds keep independent starts, confirmation history and global off state',async()=>{
 const f=await setup();f.app.openTaishiDevelopment();await f.app.saveTaishiSchedule(clock(f,'海蓝界'));
 f.ctx.chat.push({is_user:false,swipe_id:0,mes:'<tp>纪元618年-01月-01日-06:00</tp>'});f.app.openTaishiDevelopment();await f.app.saveTaishiSchedule(clock(f,'赤砂界'));f.app.taishiEvolutionDraft=null;
 let p=f.power(),s=worldSchedules(p);assert.equal(Object.keys(s).length,2);assert.notEqual(s[f.ids['海蓝界']].baseline.raw,s[f.ids['赤砂界']].baseline.raw);
 f.ctx.chat.push({is_user:false,swipe_id:0,mes:'<tp>纪元618年-01月-01日-12:00</tp>'});let calls=0;f.app.model.request=async()=>{calls++;return JSON.stringify({changes:[]});};
 await f.app.runTaishiScheduled(p.id);assert.equal(f.app.pendingArchiveReview.taishiScheduleEvent.worldId,f.ids['海蓝界']);const pending=f.app.pendingArchiveReview;await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,i)=>[i,c.id])));f.app.pendingArchiveReview=null;
 s=worldSchedules(f.power());assert.equal(s[f.ids['海蓝界']].history.length,1);assert.equal(s[f.ids['赤砂界']].history.length,0);assert.equal(await f.app.runTaishiScheduled(p.id),false);assert.equal(calls,1);
 await f.app.togglePlayerAutoSave();assert(!hasWorldSchedule(f.power()));assert(Object.values(worldSchedules(f.power())).every(v=>!v.config.enabled));validateState(clone(f.store.read()));
});
test('refresh restores pending candidates with no requests; discard and successful commit clear cache',async()=>{
 const f=await setup();let calls=0;f.app.model.request=async p=>{calls++;return completeReview(p,{changes:[{archiveId:f.ids['海蓝界'],name:'海蓝界',type:'environment',status:'active',recordId:'world',details:{events:'观测站已建成'},sourceIndex:0,quote:'海蓝界研究站开始调查潮汐'}]});};
 await f.app.reviewArchives({rescan:true});assert(f.app.pendingArchiveReview.checkpointSaved);const before=stable(f.store.read());f.app.pendingArchiveReview=null;f.app.refresh();assert(f.app.pendingArchiveReview.restored);assert.equal(calls,1);assert.equal(stable(f.store.read()),before);
 await f.app.action('taishi-workflow-discard',{});f.app.refresh();assert(!f.app.pendingArchiveReview);assert.equal(calls,1);
 await f.app.reviewArchives({rescan:true});const pending=f.app.pendingArchiveReview;await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,i)=>[i,c.id])));f.app.pendingArchiveReview=null;f.app.refresh();assert(!f.app.pendingArchiveReview);
});
test('cache corruption, changed branches, revisions and reference selection cannot restore candidates',async()=>{
 const f=await setup(),s=f.app.contextSnapshot(),pending={captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision},contextHash:hash(stable(s.hashes)),powerId:f.app.powerId,changes:[],sources:[],issues:[],terminalResults:[],creationResults:[]},raw=encodeCheckpoint(pending,s.state.aiWorldbooks);
 assert(decodeCheckpoint(raw,s));assert(!decodeCheckpoint(raw.replace('"digest":"','"digest":"0'),s));assert(!decodeCheckpoint(raw,{...s,chatKey:'other'}));assert(!decodeCheckpoint(raw,{...s,hashes:[]}));assert(!decodeCheckpoint(raw,{...s,state:{...s.state,revision:s.state.revision+1}}));assert(!decodeCheckpoint(raw,{...s,state:{...s.state,aiWorldbooks:{books:['changed']}}}));
});
test('interrupted advanced stage retains successful work and resumes only the missing role',async()=>{
 const f=await setup();await f.store.transact(s=>s.powers[f.app.powerId].taishiWorkflow=true);const calls=[];let release,started;const blocked=new Promise(r=>release=r),ready=new Promise(r=>started=r);
 f.app.model.request=async(p,{connection})=>{calls.push(connection.task);if(connection.task==='taishiPeople'){started();await blocked;}return completeReview(p,connection.task==='taishiSummary'?{message:'完成'}:{changes:[]});};
 const job=f.app.reviewArchives({rescan:true});await ready;f.app.cancel();release();await job.catch(()=>{});f.app.pendingArchiveReview=null;f.app.refresh();const pending=f.app.pendingArchiveReview;assert(pending.restored);assert.equal(pending.data.workflowState.stages.taishiWorld.status,'success');assert.equal(pending.data.workflowState.stages.taishiPeople.status,'failed');
 f.app.model.request=async p=>{calls.push('retryPeople');return completeReview(p,{changes:[]});};await f.app.retryTaishiWorkflow('taishiPeople');assert.deepEqual(calls,['taishiWorld','taishiPeople','retryPeople']);assert.equal(f.app.pendingArchiveReview.data.workflowState.stages.taishiWorld.attempts,1);
});
test('relevant saved changes use the existing budget, deduplicate after observed delivery and return after branch edit',async()=>{
 const f=await setup(),p=f.power(),id=f.ids['潮汐调查'],before=clone(p.archives);
 await f.store.transact(s=>{const power=s.powers[p.id],r=power.archives[id],{history,...old}=clone(r);r.history.push(old);r.specific.fields.phase='已完成';r.specific.fields.result='取得潮汐记录';saveArchiveUpdate(power,before,[r],[],{chat:f.ctx.chat});});
 const first=memoryPlan(f.store.read(),f.ctx.chat,'继续海蓝界故事');const item=first.included.find(i=>i.id===p.id+'/'+id);assert(item.feedback);assert(first.packet.includes('近期已确认变化'));assert(!memoryPlan(f.store.read(),f.ctx.chat,'继续赤砂界故事').included.some(i=>i.feedback));
 const old=chatHashes(f.ctx.chat);f.ctx.chat.push({is_user:false,swipe_id:0,mes:'下一轮海蓝界故事'});f.app.memoryAttempt={chatKey:f.app.contextSnapshot().chatKey,stateId:f.store.read().id,type:'normal',before:old,rendered:1,ended:true,plan:first,diagnostic:{request:{status:'matched'}}};await f.app.completeArchiveMemory();
 assert.equal(f.store.read().archiveMemory.feedback.length,1);assert(!memoryPlan(f.store.read(),f.ctx.chat,'继续海蓝界故事').included.some(i=>i.feedback));
 f.ctx.chat[1].mes='重写这一轮';assert(memoryPlan(f.store.read(),f.ctx.chat,'继续海蓝界故事').included.some(i=>i.feedback));
 await f.store.transact(s=>s.archiveMemory.taishi={world:{auto:false,budget:750},people:{auto:false,budget:750}});assert(!memoryPlan(f.store.read(),f.ctx.chat,'继续海蓝界故事').included.some(i=>i.feedback));
});
test('invalid feedback persistence is rejected rather than making the archive unreadable later',async()=>{
 const f=await setup(),s=clone(f.store.read());s.archiveMemory.feedback=[{id:'x',signature:'wrong',anchor:{}}];assert.throws(()=>validateState(s),/变化回传/);
});
test('cache quota failure leaves candidates usable and does not mutate archive facts',async()=>{
 const f=await setup(),s=f.app.contextSnapshot(),pending={captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision},contextHash:hash(stable(s.hashes)),powerId:f.app.powerId,changes:[],sources:[],issues:[],terminalResults:[],creationResults:[]};
 const before=stable(f.store.read()),storage=f.store.storageImpl;f.store.storageImpl={getItem:storage.getItem,setItem(){throw Error('quota');}};
 assert.equal(f.app.saveReviewCheckpoint(pending),false);assert.equal(pending.checkpointSaved,false);assert.equal(stable(f.store.read()),before);assert.equal(f.app.checkpointError,'quota');f.store.storageImpl=storage;
});
test('an invalid clock source cannot starve a different due world',async()=>{
 const f=await setup();for(const name of ['海蓝界','赤砂界']){f.app.openTaishiDevelopment();await f.app.saveTaishiSchedule(clock(f,name));}f.app.taishiEvolutionDraft=null;
 await f.store.transact(s=>{const p=s.powers[f.app.powerId];p.taishiSchedules[f.ids['海蓝界']].config.tags=['不存在的标签'];});
 f.ctx.chat.push({is_user:false,swipe_id:0,mes:'<tp>纪元618年-01月-01日-12:00</tp>'});f.app.model.request=async()=>JSON.stringify({changes:[]});await f.app.runTaishiScheduled(f.app.powerId);
 assert.equal(f.app.pendingArchiveReview.taishiScheduleEvent.worldId,f.ids['赤砂界']);
});
