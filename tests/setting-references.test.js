import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePersonSources,attachPersonSources} from '../src/taishi-profile.js';
import {resolveSettingRefs,inferSettingRefs} from '../src/setting-references.js';
import {fixture} from './mvu-fixture.js';
import {normalizeArchiveBatch} from '../src/archive-review.js';
import {RuntimeLog} from '../src/runtime-log.js';
const packet={payload:{books:[{name:'分类书',entries:[{id:'1000',title:'【地域】银城｜甲国',content:'银城位于甲国北部。',part:2,offset:10},{id:'20',title:'【世界】主星｜主世界',content:'主星为唯一世界。'}]}]}};
test('missing region references use unique exact classified title and copy the actual selected part',()=>{
 const prepared=preparePersonSources({changes:[{name:'银城',recordId:'region'}]},packet);
 assert.equal(prepared.errors.size,0);assert.equal(prepared.sources.get(0)[0].part,2);
 const batch={changes:[{inputIndex:0,name:'银城',specific:{recordId:'region',fields:{},labels:{}}}],issues:[]};attachPersonSources(batch,prepared);
 assert.equal(JSON.parse(batch.changes[0].specific.fields.source_profile)[0].content,'银城位于甲国北部。');
});
test('stable IDs accept uid alias, numeric strings and omitted unique book/part without inventing references',()=>{
 assert.equal(resolveSettingRefs([{uid:1000,part:'2'}],packet)[0].id,'1000');
 assert.equal(resolveSettingRefs(['1000'],packet)[0].part,2);
 assert.equal(resolveSettingRefs({id:1000},packet)[0].part,2);
 assert.equal(preparePersonSources({changes:[{name:'银城',recordId:'region',settingRefs:[]}]},packet).errors.size,0);
 assert.throws(()=>resolveSettingRefs([{id:'1000',book:'未选书'}],packet),e=>e.referenceCode==='reference_not_selected');
 assert.throws(()=>resolveSettingRefs([{id:'1000',part:1}],packet),e=>e.referenceCode==='reference_not_selected');
 assert.throws(()=>resolveSettingRefs([{id:'1000',uid:'20'}],packet),e=>e.referenceCode==='reference_format');
});
test('same names and same IDs across books remain ambiguous, never bind to the last result',()=>{
 const duplicated={payload:{books:[...packet.payload.books,{name:'另一本',entries:[{id:'1000',title:'【地域】银城｜乙国',content:'另一座城'}]}]}};
 assert.throws(()=>resolveSettingRefs([{id:'1000'}],duplicated),e=>e.referenceCode==='reference_ambiguous');
 assert.throws(()=>inferSettingRefs({name:'银城'},duplicated),e=>e.referenceCode==='reference_ambiguous');
 assert.equal(resolveSettingRefs([{id:'1000',book:'分类书'}],duplicated)[0].book,'分类书');
});
test('regional source errors retain candidates with actionable codes, without calling them people',()=>{
 const raw={name:'未知地域',recordId:'region',fields:{conditions:'有依据'}};
 const prepared=preparePersonSources({changes:[raw]},packet),batch={changes:[{inputIndex:0,name:raw.name,specific:{recordId:'region',fields:{},labels:{}}}],issues:[]};attachPersonSources(batch,prepared);
 assert.equal(batch.changes.length,0);assert.equal(batch.issues[0].kind,'地域原文');assert.equal(batch.issues[0].diagnostic.code,'reference_missing');assert.deepEqual(batch.issues[0].candidate,raw);
 const memory=new Map(),log=new RuntimeLog({storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}}),ticket=log.begin('测试');log.step(ticket,'校验结果',{issues:batch.issues});
 const issue=log.export().records[0].steps[0].issues[0];assert.equal(issue.code,'reference_missing');assert(!JSON.stringify(issue).includes('未知地域'));assert(!JSON.stringify(issue).includes('有依据'));
});
test('large classified batch copies short region sources independently without dropping all records',()=>{
 const reference={payload:{books:[{name:'分类书',entries:Array.from({length:58},(_,i)=>({id:String(1000+i),title:'【地域】地区'+i+'｜主星',content:'地区'+i+'的真实原文。'}))}]}};
 const changes=Array.from({length:58},(_,i)=>({name:'地区'+i,recordId:'region'})),prepared=preparePersonSources({changes},reference);
 const batch={changes:changes.map((r,inputIndex)=>({inputIndex,name:r.name,specific:{recordId:'region',fields:{},labels:{}}})),issues:[]};attachPersonSources(batch,prepared);
 assert.equal(batch.changes.length,58);assert.equal(batch.issues.length,0);assert.equal(prepared.sources.size,58);
});
test('local source retry repairs earlier 1.4.8 issue shape and never makes a model request',async()=>{
 const f=fixture();await f.app.openTaishi();f.app.ui.showArchiveReview=()=>{};
 const snapshot=f.app.contextSnapshot(),power=snapshot.state.powers[f.app.powerId];
 const data={changes:[{name:'银城',type:'environment',recordId:'region',status:'active',fields:{conditions:'城邦地域'},details:{geography:'位于甲国北部'},settingRefs:[{book:'未选书',id:'1000'}],sourceIndex:-1}]};
 const batch=normalizeArchiveBatch(preparePersonSources(data,packet).data,power,[],f.ctx.chat,'玩家确认分类书设定',snapshot.state);
 assert.equal(batch.changes.length,1);
 const {hash,stable}=await import('../src/core.js');
 const pending={captured:{chatKey:snapshot.chatKey,stateId:snapshot.state.id,revision:snapshot.state.revision},contextHash:hash(stable(snapshot.hashes)),referenceFingerprint:'fixed-packet',powerId:power.id,data,setupReferences:true,sources:[],playerNote:'玩家确认分类书设定',changes:[],terminalResults:[],creationResults:[],issues:[{kind:'人物原文',name:'银城',reason:'旧版不在所选片段'}],blockedFloors:[]};
 f.app.pendingArchiveReview=pending;f.app.readReviewReferences=async()=>({...packet,fingerprint:'fixed-packet'});f.app.model.request=()=>{throw Error('禁止调用模型');};
 await f.app.retryArchiveReferences();assert.equal(pending.changes.length,1);assert.equal(pending.issues.length,0);assert.equal(pending.readOnly,false);assert(pending.checkpointSaved);
});
test('restored build checks its dedicated chunk instead of unrelated shared reference books',async()=>{
 const f=fixture();await f.app.openTaishi();let edited=false;
 f.ctx.loadWorldInfo=async name=>({entries:{1:{uid:1,comment:name==='独立构建书'?'【地域】银城':'共享记录',content:edited?'已修改的原文':'本批真实原文'}}});
 await f.store.transact(s=>{s.aiWorldbooks={mode:'manual',books:[{name:'共享参考书',entryIds:['1']}]};Object.assign(s.powers[f.app.powerId],{taishiBuildReferences:{mode:'manual',books:[{name:'独立构建书',entryIds:['1']}]},taishiWorldStructure:{mode:'multi',worldId:'',worldName:''}});});
 const snapshot=f.app.contextSnapshot(),power=snapshot.state.powers[f.app.powerId];
 const {readReferencePacket}=await import('../src/ai-worldbooks.js'),{planTaishiBuild,buildProgress}=await import('../src/taishi-build.js'),{hash,stable}=await import('../src/core.js');
 const reference=await readReferencePacket(power.taishiBuildReferences,{ctx:f.ctx}),plan=planTaishiBuild(reference,power.ruleVersion,power.taishiWorldStructure);
 const pending={captured:{chatKey:snapshot.chatKey,stateId:snapshot.state.id,revision:snapshot.state.revision},powerId:power.id,contextHash:hash(stable(snapshot.hashes)),referenceFingerprint:plan.chunks[0].fingerprint,taishiBuild:buildProgress(plan),setupReferences:true,restored:true};
 await f.app.assertReviewReferences(pending);assert.equal((await f.app.readReviewReferences(pending)).payload.books[0].name,'独立构建书');
 edited=true;await assert.rejects(f.app.assertReviewReferences(pending),/世界书或建档结构已变化/);
});
