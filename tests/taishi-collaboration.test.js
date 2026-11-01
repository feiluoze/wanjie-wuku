import test from 'node:test';
import assert from 'node:assert/strict';
import {runCollaboration,collaborationSettings,collaborationPlan,collaborationOutput,rebaseCollaboration} from '../src/taishi-collaboration.js';
import {fixture} from './mvu-fixture.js';
import {completeReview} from './review-response-fixture.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {finalizeBatchLinks} from '../src/archive-batch-links.js';
import {clone,validateState} from '../src/core.js';

const schemas=[{id:'world',fields:[]},{id:'organization',fields:[]},{id:'companion',fields:[]},{id:'relation',fields:[]}];
const prompt=(extra={})=>({system:'仅核对本次材料',user:JSON.stringify({taskMode:'narrative',current:[],sources:[],recordSchemas:schemas,...extra})});
const row=(kind='world',extra={})=>({name:kind==='world'?'海蓝界':kind==='organization'?'药师会':'云岚',recordId:kind,type:kind==='world'?'environment':'record',status:'active',fields:kind==='world'?{conditions:'群岛文明'}:{description:'已确认对象'},details:kind==='world'?{overview:'群岛文明'}:{profile:'灵植师'},sourceIndex:-1,...extra});
const respond=(p,changes=[])=>({changes,floorReviews:(JSON.parse(p.user).sources||[]).map(s=>({sourceIndex:s.index,status:'reviewed',changeCount:changes.filter(c=>c.sourceIndex===s.index).length})),message:'候选'});

test('new collaboration defaults to two specialists and zero summary/review calls',async()=>{
 const calls=[];const out=await runCollaboration(prompt(),async(p,r)=>{calls.push(r);return respond(p,[row(r==='taishiWorld'?'world':'companion')]);});
 assert.deepEqual(calls,['taishiWorld','taishiPeople']);assert.equal(out.workflowState.stages.taishiSummary.status,'skipped');assert.equal(out.workflowState.stages.taishiReview.status,'skipped');assert.equal(out.changes.length,2);assert(!('candidateRef'in out.changes[0]));
});
test('no eligible schema or explicit empty people selection omits the role without guessing unknown names',()=>{
 assert.deepEqual(collaborationPlan({recordSchemas:[schemas[0]]},{}).roles,['taishiWorld']);
 assert.deepEqual(collaborationPlan({recordSchemas:schemas.filter(r=>r.id!=='relation'),peopleSelection:{mode:'selected',selected:[],pinned:[]}},{}).roles,['taishiWorld']);
 assert.equal(collaborationPlan({recordSchemas:schemas,sources:[{content:'陌生人物阿甲抵达'}]},{}).roles.length,2);
 assert.throws(()=>collaborationSettings({maxAttempts:4}));assert.throws(()=>collaborationSettings({mode:'mystery'}));
});
test('explicit limited scope does not claim that the entire floor was reviewed',async()=>{
 const calls=[];const out=await runCollaboration(prompt({sources:[{index:0,content:'云岚修行'}]}),async(p,r)=>{calls.push(r);return respond(p);},{config:{scope:'people'}});
 assert.deepEqual(calls,['taishiPeople']);assert.equal(out.floorReviews[0].status,'uncertain');assert(out.workflowIssues.some(i=>i.kind==='局部核对'));
});
test('extraction can overlap custom requests while evolution is always world then people',async()=>{
 for(const evolution of [false,true]){let active=0,peak=0;const out=await runCollaboration(prompt({taskMode:evolution?'evolution':'narrative'}),async(p,r)=>{if(evolution&&r==='taishiPeople'){assert(JSON.parse(p.user).peerCandidates.length);assert.match(p.system,/人物已经得知/);}active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return respond(p,[row(r==='taishiWorld'?'world':'companion')]);});assert.equal(peak,evolution?1:2);assert.equal(out.changes.length,2);}
});
test('failure retains the successful role, resume invokes only failed role, cached settings/source changes invalidate resume',async()=>{
 const p=prompt(),calls=[];let fail=true;const invoke=async(p,r)=>{calls.push(r);if(r==='taishiPeople'&&fail)throw Error('超时');return respond(p,[row(r==='taishiWorld'?'world':'companion')]);};
 const out=await runCollaboration(p,invoke);assert.equal(out.changes.length,1);const world=clone(out.workflowState.stages.taishiWorld);fail=false;
 const resumed=await runCollaboration(p,invoke,{resume:out.workflowState,retryRole:'taishiPeople'});assert.deepEqual(calls,['taishiWorld','taishiPeople','taishiPeople']);assert.deepEqual(resumed.workflowState.stages.taishiWorld,world);assert.equal(resumed.changes.length,2);
 await assert.rejects(runCollaboration(prompt({rules:'已改'}),invoke,{resume:out.workflowState,retryRole:'taishiPeople'}),/已变化/);
 await assert.rejects(runCollaboration(p,invoke,{resume:out.workflowState,retryRole:'taishiPeople',config:{summary:true}}),/已变化/);
});
test('format correction runs once and shares actual wire attempt cap',async()=>{
 let world=0;const out=await runCollaboration(prompt(),async(p,r,budget)=>{if(r==='taishiWorld'){world++;if(world===1)throw Object.assign(Error('JSON不完整'),{jsonDiagnostic:{}});assert(JSON.parse(p.user).correction);budget.onExtraAttempt();}return respond(p);});
 assert.equal(world,2);assert.equal(out.workflowState.stages.taishiWorld.attempts,3);
 let calls=0;await runCollaboration(prompt(),async()=>{calls++;throw Object.assign(Error('JSON不完整'),{jsonDiagnostic:{}});},{config:{maxAttempts:1}});assert.equal(calls,2);
});
test('evolution people wait for failed world; manual continuation never quietly bills downstream roles',async()=>{
 const p=prompt({taskMode:'evolution'}),calls=[];let fail=true;const invoke=async(p,r)=>{calls.push(r);if(fail)throw Error('连接失败');return respond(p,[row(r==='taishiWorld'?'world':'companion')]);};
 let out=await runCollaboration(p,invoke);assert.deepEqual(calls,['taishiWorld']);assert.equal(out.workflowState.stages.taishiPeople.status,'pending');fail=false;
 out=await runCollaboration(p,invoke,{resume:out.workflowState,retryRole:'taishiWorld'});assert.deepEqual(calls,['taishiWorld','taishiWorld']);
 out=await runCollaboration(p,invoke,{resume:out.workflowState,retryRole:'taishiPeople'});assert.equal(out.changes.length,2);
});
test('world impacts trigger at most one coordination sharing world budget and preserve untouched world candidates',async()=>{
 const calls=[];const out=await runCollaboration(prompt({taskMode:'evolution'}),async(p,r)=>{const input=JSON.parse(p.user);calls.push(r);
  if(r==='taishiPeople')return {...respond(p,[row('companion',{candidateRef:'person'})]),worldImpacts:[{reason:'人物研究改善农场',candidateRefs:['person']}]};
  if(input.worldImpacts)return respond(p,[row('organization',{name:'农场',candidateRef:'farm',details:{overview:'农业改良'}})]);
  return respond(p,[row('world',{candidateRef:'world'})]);});
 assert.deepEqual(calls,['taishiWorld','taishiPeople','taishiWorld']);assert.equal(out.changes.length,3);assert.equal(out.workflowState.coordination.status,'success');assert.equal(out.workflowState.stages.taishiWorld.attempts,2);assert(out.workflowDependencies.some(d=>d.name==='云岚'));
});
test('coordination failure leaves original valid world results and reports the unresolved suggestion',async()=>{
 const out=await runCollaboration(prompt({taskMode:'evolution'}),async(p,r)=>r==='taishiPeople'?{...respond(p,[row('companion',{candidateRef:'p'})]),worldImpacts:[{reason:'待协调',candidateRefs:['p']}]}:respond(p,[row()]),{config:{maxAttempts:1}});
 assert.equal(out.workflowState.coordination.status,'failed');assert.equal(out.workflowState.stages.taishiWorld.attempts,1);assert.equal(out.changes.length,2);assert(out.workflowWarnings.some(i=>i.kind==='影响协调'));
});
test('review can only flag existing candidates, unresolved groups are withheld while independent changes survive',async()=>{
 const out=await runCollaboration(prompt(),async(p,r)=>r==='taishiReview'?{conflicts:[{candidateRefs:['w','p'],reason:'所在地矛盾',suggestion:'核对人物去向'}],message:'发现矛盾',changes:[row('world',{name:'伪造奖励'})]}:respond(p,r==='taishiWorld'?[row('world',{candidateRef:'w'}),row('organization',{candidateRef:'o'})]:[row('companion',{candidateRef:'p'})]),{config:{mode:'deep'}});
 assert.equal(out.changes.length,1);assert.equal(out.changes[0].candidateRef,undefined);assert.equal(out.changes[0].name,'药师会');assert(out.workflowIssues.some(i=>i.kind==='协作待处理'));
 out.workflowState.conflictDecisions={0:'keep'};assert.equal(collaborationOutput(out.workflowState,{current:[]}).changes.length,3);
});
test('invalid reviewer reference and summary failure cannot add archives or erase valid candidates',async()=>{
 const out=await runCollaboration(prompt(),async(p,r)=>r==='taishiReview'?{conflicts:[{candidateRefs:['missing'],reason:'理由',suggestion:'建议'}]}:r==='taishiSummary'?(()=>{throw Error('摘要断线');})():respond(p,[row(r==='taishiWorld'?'world':'companion')]),{config:{mode:'deep',summary:true}});
 assert.equal(out.changes.length,2);assert.equal(out.workflowWarnings.length,2);assert.match(out.message,/基础摘要/);
});
test('unknown dependencies and cycles withhold only affected candidates',async()=>{
 const out=await runCollaboration(prompt(),async(p,r)=>respond(p,r==='taishiWorld'?[row('world',{candidateRef:'a',details:{world_id:'@candidate:b'}}),row('organization',{candidateRef:'safe'})]:[row('companion',{candidateRef:'b',details:{world_id:'@candidate:a'}})]));
 assert.deepEqual(out.changes.map(r=>r.name),['药师会']);assert(out.workflowIssues.length);
});
test('cancelled late outputs never become saved candidates',async()=>{
 const controller=new AbortController();let release;const gate=new Promise(r=>release=r);const work=runCollaboration(prompt(),async p=>{await gate;return respond(p,[row()]);},{signal:controller.signal});controller.abort();release();await assert.rejects(work,{name:'AbortError'});
});

async function appFixture(config={}){const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};f.ctx.chat[0].mes='太始天已纳入海蓝界。云岚已正式加入太始天。云岚在海蓝界修行。';await f.store.transact(s=>{const p=s.powers[f.app.powerId];p.taishiWorkflow=true;p.taishiCollaboration=collaborationSettings(config);});return f;}
const storyRow=kind=>row(kind,{sourceIndex:0,quote:kind==='world'?'太始天已纳入海蓝界。':'云岚已正式加入太始天。'});
test('application defaults to two calls and writes only after confirmation',async()=>{
 const f=await appFixture(),calls=[];const before=clone(f.store.read());f.app.model.request=async(p,{connection})=>{calls.push(connection.task);return completeReview(p,{changes:[storyRow(connection.task==='taishiWorld'?'world':'companion')]});};
 await f.app.reviewArchives();assert.equal(calls.length,2);assert.deepEqual(f.store.read(),before);const pending=f.app.pendingArchiveReview;assert.deepEqual(pending.issues,[]);await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,i)=>[i,c.id])));validateState(f.store.read());assert.equal(Object.keys(f.store.read().powers[f.app.powerId].archives).length,2);
});
test('partial save preserves remainder; failed role resumes against saved state without repeating successful role',async()=>{
 const f=await appFixture(),calls=[];let fail=true;f.app.model.request=async(p,{connection})=>{calls.push(connection.task);if(connection.task==='taishiPeople'&&fail)throw Error('断线');return completeReview(p,{changes:[storyRow(connection.task==='taishiWorld'?'world':'companion')]});};
 await f.app.reviewArchives();let pending=f.app.pendingArchiveReview;const result=await f.app.commitArchiveReview(pending,new Map([[0,null]]));assert(result.remainingReview);assert.equal(f.app.pendingArchiveReview.changes.length,0);fail=false;await f.app.retryTaishiWorkflow('taishiPeople');assert.deepEqual(calls,['taishiWorld','taishiPeople','taishiPeople']);pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,1);assert.equal(pending.changes[0].name,'云岚');await f.app.commitArchiveReview(pending,new Map([[0,null]]));assert.equal(Object.keys(f.store.read().powers[f.app.powerId].archives).length,2);
});
test('new world and its person link are preview dependencies, real IDs appear only after topological save',async()=>{
 const f=await appFixture();f.app.model.request=async(p,{connection})=>completeReview(p,{changes:connection.task==='taishiWorld'?[{...storyRow('world'),candidateRef:'new_world'}]:[{...storyRow('companion'),candidateRef:'person',details:{world_id:'@candidate:new_world',profile:'灵植师'}}]});
 // Narrative jobs can be independent, so explicitly place the link in the returned
 // person row. No inferred name-based identity or formal ID is invented.
 await f.app.reviewArchives();const pending=f.app.pendingArchiveReview;assert.deepEqual(pending.issues,[]);assert.equal(pending.changes.length,2);assert(pending.changes[1].pendingLinks.length);
 await assert.rejects(f.app.commitArchiveReview(pending,new Map([[1,null]])),/同时接受/);
 await f.app.commitArchiveReview(pending,new Map([[1,null],[0,null]]));const power=f.store.read().powers[f.app.powerId],world=Object.values(power.archives).find(r=>r.specific.recordId==='world'),person=Object.values(power.archives).find(r=>r.specific.recordId==='companion');assert.equal(person.specific.fields.world_id,world.id);assert(!JSON.stringify(power).includes('preview:'));validateState(f.store.read());
});
test('invalid target withholds its dependents but preserves independent rows',async()=>{
 const f=await appFixture();f.app.model.request=async(p,{connection})=>completeReview(p,{changes:connection.task==='taishiWorld'?[{...storyRow('world'),candidateRef:'bad_world',details:{unknown_column:'坏字段'}}]:[{...storyRow('companion'),details:{world_id:'@candidate:bad_world',profile:'灵植师'}}]});
 await f.app.reviewArchives();assert.equal(f.app.pendingArchiveReview.changes.length,0);assert(f.app.pendingArchiveReview.issues.length);
});
test('preview conflict confirmation rebuilds candidates locally with zero extra model requests',async()=>{
 const f=await appFixture({mode:'deep'});let calls=0;f.app.model.request=async(p,{connection})=>{calls++;if(connection.task==='taishiReview')return JSON.stringify({conflicts:[{candidateRefs:['w','p'],reason:'需要玩家核对',suggestion:'检查当前地点'}],message:'两项待核对'});return completeReview(p,{changes:[{...storyRow(connection.task==='taishiWorld'?'world':'companion'),candidateRef:connection.task==='taishiWorld'?'w':'p'}]});};
 await f.app.reviewArchives();assert.equal(f.app.pendingArchiveReview.changes.length,0);await f.app.resolveTaishiConflict(0);assert.equal(calls,3);assert.equal(f.app.pendingArchiveReview.changes.length,2);assert(!f.app.pendingArchiveReview.issues.some(i=>i.kind==='协作待处理'));
});
test('new organization, person and their relationship save in dependency order with no preview IDs',async()=>{
 const f=await appFixture(),power=clone(f.store.read().powers[f.app.powerId]);const world=saveArchive(power,{type:'environment',name:'海蓝界',status:'active',fields:{conditions:'已有世界'},specific:{adapterId:'wuku.primordial_world',recordId:'world',version:'1.2.0',label:'世界',fields:{overview:'群岛文明'},labels:{overview:'概况'}}},archiveSource(f.ctx.chat,'确认世界'));
 const org=row('organization',{candidateRef:'o',details:{world_id:world.id,overview:'灵植研究组织'}}),person=row('companion',{candidateRef:'p',details:{world_id:world.id,organization_id:'@candidate:o',profile:'灵植师'}}),relation=row('relation',{name:'云岚任职药师会',candidateRef:'r',details:{world_id:world.id,subject_id:'@candidate:p',target_id:'@candidate:o',direction:'单向',state:'任职',cause:'接受聘任',evidence:'玩家确认聘任'}});
 const out=await runCollaboration(prompt({current:[{archiveId:world.id}],taskMode:'supplement'}),async(p,r)=>respond(p,r==='taishiWorld'?[org]:[person,relation]));
 const batch=normalizeArchiveBatch(out,power,[],f.ctx.chat,'玩家确认药师会成立，云岚任职其中。',f.store.read());finalizeBatchLinks(batch,out);assert.deepEqual(batch.issues,[]);assert.equal(batch.changes.length,3);
 applyArchiveChanges(power,batch.changes,[],new Map([[2,null],[1,null],[0,null]]),f.ctx.chat);const rows=Object.values(power.archives),p=rows.find(r=>r.name==='云岚'),o=rows.find(r=>r.name==='药师会'),r=rows.find(r=>r.specific.recordId==='relation');assert.equal(p.specific.fields.organization_id,o.id);assert.equal(r.specific.fields.subject_id,p.id);assert.equal(r.specific.fields.target_id,o.id);assert(!JSON.stringify(power).includes('preview:'));
});
test('saving a world before retrying its people advances an autonomous period only once',async()=>{
 const f=await appFixture();let worldId;await f.store.transact(s=>{const p=s.powers[f.app.powerId];p.taishiAutonomy=true;worldId=saveArchive(p,{type:'environment',name:'海蓝界',status:'active',fields:{conditions:'已有世界'},specific:{adapterId:'wuku.primordial_world',recordId:'world',version:'1.2.0',label:'世界',fields:{clock:'起点',overview:'群岛文明'},labels:{clock:'内历',overview:'概况'}}},archiveSource(f.ctx.chat,'确认世界')).id;});
 let fail=true;const calls=[];f.app.ui.showTaishiDevelopment=()=>{};f.app.model.request=async(p,{connection})=>{calls.push(connection.task);if(connection.task==='taishiPeople'&&fail)throw Error('暂时断线');return completeReview(p,{changes:connection.task==='taishiWorld'?[row('world',{archiveId:worldId,details:{overview:'农田改良完成'}})]:[row('companion',{details:{world_id:worldId,world:'海蓝界',profile:'灵植师'}})]});};
 f.app.openTaishiDevelopment();await f.app.evolveTaishi({worldId,elapsed:2,unit:'years',note:'推进农业研究'});let pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,1);await f.app.commitArchiveReview(pending,new Map([[0,worldId]]));const clock=f.store.read().powers[f.app.powerId].archives[worldId].specific.fields.clock;assert.match(clock,/2年/);
 fail=false;await f.app.retryTaishiWorkflow('taishiPeople');pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,1);assert.equal(pending.changes[0].name,'云岚');await f.app.commitArchiveReview(pending,new Map([[0,null]]));assert.equal(f.store.read().powers[f.app.powerId].archives[worldId].specific.fields.clock,clock);assert.deepEqual(calls,['taishiWorld','taishiPeople','taishiPeople']);validateState(f.store.read());
});
test('malformed dependency metadata cannot erase unrelated valid candidates',async()=>{
 const out=await runCollaboration(prompt(),async(p,r)=>respond(p,r==='taishiWorld'?[row('world',{dependsOn:17}),row('organization')]:[]));assert.deepEqual(out.changes.map(r=>r.name),['药师会']);assert(out.workflowIssues.some(i=>i.kind==='候选依赖'));
});
test('identical repeated candidates are deduplicated, differing values for one identity remain conflicts',async()=>{
 const valid=await runCollaboration(prompt(),async(p,r)=>respond(p,r==='taishiWorld'?[row(),row()]:[]));assert.equal(valid.changes.length,1);assert.equal(valid.workflowIssues.length,0);
 const conflict=await runCollaboration(prompt(),async(p,r)=>respond(p,r==='taishiWorld'?[row(),row('world',{details:{overview:'不同内容'}})]:[]));assert.equal(conflict.changes.length,0);assert(conflict.workflowIssues.some(i=>i.kind==='候选冲突'));
});
test('mutual causal dependencies require joint acceptance, without inventing a circular ID reference',async()=>{
 const f=await appFixture();f.app.model.request=async(p,{connection})=>completeReview(p,{changes:[{...storyRow(connection.task==='taishiWorld'?'world':'companion'),candidateRef:connection.task==='taishiWorld'?'w':'p',dependsOn:[connection.task==='taishiWorld'?'p':'w']}]});
 await f.app.reviewArchives();const pending=f.app.pendingArchiveReview;assert.deepEqual(pending.issues,[]);assert.equal(pending.changes.length,2);await assert.rejects(f.app.commitArchiveReview(pending,new Map([[0,null]])),/同时接受/);await f.app.commitArchiveReview(pending,new Map([[0,null],[1,null]]));assert.equal(Object.keys(f.store.read().powers[f.app.powerId].archives).length,2);
});
test('coordinating an existing world preserves unmentioned fields and failed validation preserves its original candidate',async()=>{
 for(const bad of [false,true]){
  const out=await runCollaboration(prompt({taskMode:'evolution',current:[{archiveId:'saved_world',recordId:'world'}]}),async(p,r)=>{
   const input=JSON.parse(p.user);if(r==='taishiPeople')return {...respond(p,[row('companion',{candidateRef:'p'})]),worldImpacts:[{reason:'农业研究完成',candidateRefs:['p']}]};
   return respond(p,[row('world',{archiveId:input.worldImpacts?undefined:'saved_world',candidateRef:'w',details:input.worldImpacts?{events:bad?'bad':'研究完成'}:{overview:'原生态保留'}})]);
  },{validateChanges:changes=>changes.some(r=>r.details.events==='bad')?[{name:'海蓝界',reason:'测试坏协调'}]:[]});
  assert.equal(out.changes[0].details.overview,'原生态保留');assert.equal(out.changes[0].archiveId,'saved_world');assert.equal(out.workflowState.coordination.status,bad?'failed':'success');assert.equal(out.changes[0].details.events,bad?undefined:'研究完成');
 }
});
