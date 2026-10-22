import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {clone,createPower,hash,stable} from '../src/core.js';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {archiveMergeComparison,manualMergeProposal,applyCorrection} from '../src/archive-tools.js';
import {undoArchiveUpdate} from '../src/archive-journal.js';
import {normalizeArchiveBatch,applyArchiveChanges,archiveSources} from '../src/archive-review.js';
import {normalizeCreation} from '../src/creation.js';
import {archiveText} from '../src/core.js';
import {encodeCheckpoint,decodeCheckpoint} from '../src/review-checkpoint.js';
import {archiveSyncSummary} from '../src/archive-sync-summary.js';
import {WorkbenchUI} from '../src/ui.js';

function pairFixture(){const f=fixture();const a=saveArchive(f.power,{type:'record',name:'旧称玉佩',status:'active',fields:{description:'一枚'}},archiveSource(f.ctx.chat,'玩家确认第一份记录'));const b=saveArchive(f.power,{type:'record',name:'新称玉佩',status:'working',fields:{description:'两枚',limits:'传讯'}},archiveSource(f.ctx.chat,'玩家确认第二份记录'));return {...f,a,b};}
test('manual merge selects conflicting fields, preserves complementary facts and is fully reversible',()=>{
 const f=pairFixture(),before=clone(f.power.archives),pair=archiveMergeComparison(f.power,f.a.id,f.b.id,f.ctx.chat);
 assert.equal(pair.conflicts.length,2);assert.throws(()=>manualMergeProposal(f.power,pair,{},f.ctx.chat),/请选择/);
 const values=Object.fromEntries(pair.conflicts.map((c,i)=>['merge-choice:'+i,'left'])),proposal=manualMergeProposal(f.power,pair,values,f.ctx.chat);
 assert.deepEqual(f.power.archives,before);applyCorrection(f.state,f.power.id,proposal,f.ctx.chat,'玩家确认是同一个玉佩');
 const merged=f.power.archives[f.a.id];assert.equal(Object.keys(f.power.archives).length,1);assert.equal(merged.fields.description,'一枚');assert.equal(merged.fields.limits,'传讯');assert.equal(merged.history.length,2);
 undoArchiveUpdate(f.state,f.power.id);assert.deepEqual(f.power.archives,before);
});
test('manual merge refuses same ID, incompatible tables, stale pair and injected field choices',()=>{
 const f=pairFixture();assert.throws(()=>archiveMergeComparison(f.power,f.a.id,f.a.id,f.ctx.chat),/不同/);
 const pair=archiveMergeComparison(f.power,f.a.id,f.b.id,f.ctx.chat);assert.throws(()=>manualMergeProposal(f.power,pair,{'merge-choice:0':'custom'},f.ctx.chat),/请选择/);
 f.a.fields.description='已经改过';assert.throws(()=>manualMergeProposal(f.power,pair,{},f.ctx.chat),/已变化/);
 f.b.type='skill';assert.throws(()=>archiveMergeComparison(f.power,f.a.id,f.b.id,f.ctx.chat),/不兼容/);
});
test('manual merge controller remains local and rejects changes between preview and save',async()=>{
 const f=pairFixture();await f.store.transact(s=>{s.powers[f.power.id]=clone(f.power);});f.app.powerId=f.power.id;
 for(const name of ['showArchiveMergePicker','showArchiveMergeComparison','showArchiveCorrection'])f.app.ui[name]=()=>{};
 f.app.query=()=>{throw Error('must not call model');};f.app.openArchiveMerge();f.app.compareArchiveMerge({values:{keepId:f.a.id,removeId:f.b.id}});
 f.app.previewArchiveMerge({values:{'merge-choice:0':'left','merge-choice:1':'left'}});assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,2);
 await f.store.transact(s=>{s.powers[f.power.id].archives[f.a.id].fields.description='后续修改';});await assert.rejects(f.app.applyArchiveCorrection());assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,2);clearTimeout(f.app.roleTimer);
});
test('summary counts actual unchanged candidates without equating absent output to no change',()=>{
 const p=createPower(builtinEntries().find(e=>e.name==='人间游戏')),raw={type:'record',recordId:'skill',name:'冲锋',status:'active',sourceIndex:-1,details:{effect:'向前突进'}};
 const b=normalizeArchiveBatch({changes:[raw]},p,[],[],'玩家确认已掌握冲锋');assert.equal(b.issues.length,0);applyArchiveChanges(p,b.changes,[],new Map([[0,null]]),[]);
 const data={changes:[raw,{...raw,name:'斩杀',details:{invalid:'错列'}}]},batch=normalizeArchiveBatch(data,p,[],[],'玩家确认已掌握冲锋与斩杀'),summary=archiveSyncSummary(p,{...batch,data});
 assert.equal(summary.unchanged,1);assert.equal(summary.tableUpdated,0);assert.equal(summary.failed,1);assert.equal(summary.tables.find(t=>t.id==='skill').failed,1);
 const html=Object.create(WorkbenchUI.prototype).syncSummary(p,{...batch,data});assert.match(html,/未返回可核对内容/);assert.match(html,/内容无变化 1/);assert.match(html,/待处理 1/);
});
async function pendingFixture(){
 const f=fixture(),p=createPower(builtinEntries().find(e=>e.name==='万界网购'));
 await f.store.transact(s=>{s.powers={[p.id]:p};});f.app.powerId=p.id;f.app.refresh();
 const raw=(name,details)=>({type:'record',recordId:'orders',name,status:'active',sourceIndex:-1,details});
 const data={changes:[raw('有效订单',{item:'铁剑'}),raw('错列订单',{invalid:'未知字段'})]},playerNote='玩家确认两笔订单已经存在',batch=normalizeArchiveBatch(data,p,[],f.ctx.chat,playerNote);
 assert.equal(batch.changes.length,1);assert.equal(batch.issues.length,1);
 f.app.pendingArchiveReview={...batch,powerId:p.id,captured:f.store.capture(),contextHash:hash(stable(f.app.contextSnapshot().hashes)),data,sources:[],playerNote};
 f.app.ui.showArchiveReview=()=>{};return {f,p};
}
test('partial save retains only remaining raw candidates and repairing them does not repeat saved objects',async()=>{
 const {f,p}=await pendingFixture(),pending=f.app.pendingArchiveReview,result=await f.app.commitArchiveReview(pending,new Map([[0,null]]));
 const remaining=result.remainingReview;assert.equal(remaining,f.app.pendingArchiveReview);assert.equal(remaining.data.changes.length,1);assert.equal(remaining.data.changes[0].name,'错列订单');assert.equal(remaining.issues[0].index,0);assert.equal(remaining.captured.revision,f.store.capture().revision);
 assert.equal(decodeCheckpoint(encodeCheckpoint(remaining,f.app.contextSnapshot().state.aiWorldbooks),f.app.contextSnapshot()).data.changes[0].name,'错列订单');
 const saved=clone(Object.values(f.store.read().powers[p.id].archives)[0]);
 await f.app.repairArchiveCandidate({index:0,values:{'repair-candidate:0':JSON.stringify({...remaining.data.changes[0],details:{item:'盾牌'}})}});
 assert.equal(remaining.issues.length,0);await f.app.commitArchiveReview(remaining,new Map([[0,null]]));
 const rows=f.store.read().powers[p.id].archives;assert.equal(Object.keys(rows).length,2);assert.deepEqual(rows[saved.id],saved);clearTimeout(f.app.roleTimer);
});
test('remaining creation links follow reindexed candidates or already saved IDs without pointing at another object',async()=>{
 for(const selectedIndex of [0,1]){
  const f=fixture(),p=f.power,body=archiveText(f.ctx.chat[0].mes);
  const o=normalizeCreation({title:'掌法整理',content:'整理已有成果',conditions:'实际结果交正文判定',ruleQuote:p.rules.slice(0,12)},p,{goal:'整理已有成果'});o.status='delivered';o.story={index:0,swipeId:0,length:body.length,textHash:hash(body)};
  await f.store.transact(s=>{s.creations=[o];s.transactions.push({id:o.id,powerId:p.id,type:"creation",costs:[],effects:[]});});f.app.powerId=p.id;
  const snap=f.app.contextSnapshot(),power=snap.state.powers[p.id],sources=archiveSources(f.ctx.chat,snap.state,power,{rescan:true});
  const raw=name=>({type:'record',name,status:'active',fields:{description:'已存在的成果'},sourceIndex:0,quote:body,ruleQuote:p.rules.slice(0,12)});
  const data={changes:[raw('第一份成果'),raw('第二份成果')],creationResults:[{creationId:o.id,status:'completed',summary:'已经完成整理',sourceIndex:0,quote:body,archiveRefs:[{changeIndex:1}]}]},batch=normalizeArchiveBatch(data,power,sources,f.ctx.chat,'',snap.state);
  assert.equal(batch.issues.length,0);assert.equal(batch.creationResults.length,1);
  const pending={...batch,data,powerId:p.id,captured:f.store.capture(),contextHash:hash(stable(snap.hashes)),sources};
  const result=await f.app.commitArchiveReview(pending,new Map([[selectedIndex,null]]));const rest=result.remainingReview;
  assert.equal(rest.issues.length,0);assert.equal(rest.creationResults.length,1);
  if(selectedIndex===0)assert.deepEqual(rest.data.creationResults[0].archiveRefs,[{changeIndex:0}]);
  else {const id=rest.data.creationResults[0].archiveRefs[0].archiveId;assert.equal(f.store.read().powers[p.id].archives[id].name,'第二份成果');}
  clearTimeout(f.app.roleTimer);
 }
});
test('unselected valid updates remain available after accepting a different update',async()=>{
 const {f,p}=await pendingFixture();const pending=f.app.pendingArchiveReview;pending.data.changes[1].details={item:'盾牌'};Object.assign(pending,normalizeArchiveBatch(pending.data,p,[],f.ctx.chat,pending.playerNote));
 const result=await f.app.commitArchiveReview(pending,new Map([[0,null]]));assert.equal(result.remainingReview.changes.length,1);assert.equal(result.remainingReview.changes[0].name,'错列订单');assert.equal(result.remainingReview.issues.length,0);clearTimeout(f.app.roleTimer);
});
test('automatic partial save also retains failed candidates for manual recovery',async()=>{
 const {f,p}=await pendingFixture();const pending=f.app.pendingArchiveReview;
 await f.store.transact(s=>{s.powers[p.id].autoArchiveReview=true;s.powers[p.id].autoArchiveSave=true;});pending.captured=f.store.capture();
 const result=await f.app.commitArchiveReview(pending,new Map([[0,null]]),{automatic:true});
 assert.equal(result.remainingReview.issues.length,1);assert.equal(f.app.pendingArchiveReview.data.changes[0].name,'错列订单');assert.equal(Object.keys(f.store.read().powers[p.id].archives).length,1);assert.equal(result.remainingReview.checkpointSaved,true);clearTimeout(f.app.roleTimer);
});
