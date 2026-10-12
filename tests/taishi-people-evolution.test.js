import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {clone,validateState} from '../src/core.js';
import {undoArchiveUpdate} from '../src/archive-journal.js';
import {filterPeopleBatch,validatePeopleControls} from '../src/taishi-people.js';
import {WorkbenchUI} from '../src/ui.js';
import {evolutionConsequence} from '../src/taishi-evolution.js';

const specific=(id,fields)=>({adapterId:'wuku.primordial_world',recordId:id,version:'1.2.0',label:id,fields,labels:Object.fromEntries(Object.keys(fields).map(k=>[k,k]))});
async function setup(){
  const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';
  for(const name of ['showArchiveReview','showTaishiPeople','showTaishiDevelopment','showTaishiDraft'])f.app.ui[name]=()=>{};
  await f.store.transact(s=>{const p=s.powers[f.app.powerId];
    f.world=saveArchive(p,{type:'environment',name:'海蓝界',status:'active',fields:{conditions:'海洋文明'},specific:specific('world',{clock:'第九年',rates:'十倍',reset:'尚未到期'})},archiveSource(f.ctx.chat,'已有世界')).id;
    f.other=saveArchive(p,{type:'environment',name:'赤砂界',status:'active',fields:{conditions:'沙漠文明'},specific:specific('world',{clock:'第一年'})},archiveSource(f.ctx.chat,'已有世界')).id;
    f.a=saveArchive(p,{type:'member',name:'云岚',status:'active',fields:{role:'灵植师'},specific:specific('companion',{world:'海蓝界',profile:'沉稳',relationship:'普通人物'})},archiveSource(f.ctx.chat,'已有NPC')).id;
    f.b=saveArchive(p,{type:'member',name:'青禾',status:'active',fields:{role:'船匠'},specific:specific('companion',{world:'海蓝界',profile:'爽朗'})},archiveSource(f.ctx.chat,'已有NPC')).id;
  });return f;
}
const personRow=(f,id,name)=>({archiveId:id,type:'member',name,status:'active',fields:{role:'继续原有工作'},recordId:'companion',details:{world:'海蓝界',action:'照顾灵圃'},sourceIndex:0});
const worldRow=f=>({archiveId:f.world,type:'environment',name:'海蓝界',status:'active',fields:{conditions:'海洋文明逐渐发展'},recordId:'world',details:{overview:'海商繁荣',clock:'AI猜到第999年',rates:'无限倍',reset:'资格已使用'},sourceIndex:-1});
async function enable(f,advanced=false){await f.store.transact(s=>{s.powers[f.app.powerId].taishiAutonomy=true;s.powers[f.app.powerId].taishiWorkflow=advanced;});f.app.openTaishiDevelopment();}
const values=f=>({worldId:f.world,elapsed:'2',unit:'years',note:'沿用原有安排，发展社会与人物目标'});

test('autonomous ending of a person is blocked in basic and advanced; good candidates remain reversible',async()=>{
  for(const advanced of [false,true]){
    const f=await setup();await enable(f,advanced);const before=clone(f.store.read());
    f.app.model.request=async(_p,{connection})=>JSON.stringify(connection.task==='taishiSummary'?{message:'候选'}:{changes:connection.task==='taishiPeople'?[{...personRow(f,f.a,'云岚'),status:'ended',sourceIndex:-1}]:[worldRow(f),...(advanced?[]:[{...personRow(f,f.a,'云岚'),status:'ended',sourceIndex:-1}])]});
    await f.app.evolveTaishi(values(f));const pending=f.app.pendingArchiveReview;
    assert.equal(pending.changes.length,1);assert.equal(pending.changes[0].id,f.world);assert(pending.issues.some(i=>i.kind==='高影响后果'));assert.deepEqual(f.store.read(),before);
    await f.app.commitArchiveReview(pending,new Map([[0,f.world]]));assert.deepEqual(f.store.read().powers[f.app.powerId].archives[f.a],before.powers[f.app.powerId].archives[f.a]);
    await f.store.transact(s=>undoArchiveUpdate(s,f.app.powerId));assert.deepEqual(f.store.read().powers[f.app.powerId].archives,before.powers[f.app.powerId].archives);
  }
});

test('world ending blocks the entire evolution including people and elapsed time',async()=>{
  for(const details of [{overview:'世界已经毁灭'},{}]){
    const f=await setup();await enable(f);const before=clone(f.store.read());
    f.app.model.request=async()=>JSON.stringify({changes:[{...worldRow(f),status:'ended',details},{...personRow(f,f.a,'云岚'),sourceIndex:-1}]});
    await f.app.evolveTaishi(values(f));assert(!f.app.pendingArchiveReview);assert.deepEqual(f.store.read(),before);
  }
});

test('advanced consequence triage marks only the offending role failed and permits isolated retry',async()=>{
  const f=await setup();await enable(f,true);const calls=[];let unsafe=true;
  f.app.model.request=async(_p,{connection})=>{calls.push(connection.task);return JSON.stringify(connection.task==='taishiSummary'?{message:'说明'}:{changes:connection.task==='taishiWorld'?[worldRow(f)]:[{...personRow(f,f.a,'云岚'),status:unsafe?'ended':'active',sourceIndex:-1}]});};
  await f.app.evolveTaishi(values(f));assert.deepEqual(calls,['taishiWorld','taishiPeople']);const pending=f.app.pendingArchiveReview;
  assert.equal(pending.data.workflowState.stages.taishiWorld.status,'success');assert.equal(pending.data.workflowState.stages.taishiPeople.status,'failed');
  unsafe=false;await f.app.retryTaishiWorkflow('taishiPeople');assert.deepEqual(calls,['taishiWorld','taishiPeople','taishiPeople']);assert.equal(f.app.pendingArchiveReview.changes.length,2);
});

test('major consequences hidden in action, memories or world events are triaged as whole candidates',async()=>{
  for(const [id,details] of [['companion',{action:'在途中身亡'}],['companion',{recent_memory:'已经解除契约，永久离去'}],['world',{events:'本轮世界毁灭'}]]){
    const f=await setup();await enable(f);const before=clone(f.store.read());
    f.app.model.request=async()=>JSON.stringify({changes:id==='world'?[{...worldRow(f),details}]:[worldRow(f),{...personRow(f,f.a,'云岚'),sourceIndex:-1,details:{world:'海蓝界',...details}}]});
    await f.app.evolveTaishi(values(f));const pending=f.app.pendingArchiveReview;
    if(id==='world')assert(!pending);else {assert.equal(pending.changes.length,1);assert(pending.issues.some(i=>i.kind==='高影响后果'));}
    assert.deepEqual(f.store.read(),before);
  }
});

test('ordinary completed work, denied consequences and unchanged old memories are allowed',()=>{
  const change={type:'member',status:'active',patch:{condition:'没有死亡；正在防范死亡风险'},before:{type:'member',status:'active',fields:{},specific:{fields:{core_memory:'先祖身亡是旧有历史'}}},specific:{recordId:'companion',fields:{action:'已经完成采集',core_memory:'先祖身亡是旧有历史'}}};
  assert.equal(evolutionConsequence(change),'');
  change.patch.condition='尚未死亡，但后来死亡';assert.match(evolutionConsequence(change),/疑似/);
  assert.equal(evolutionConsequence({type:'research',status:'ended',patch:{outcome:'研究完成'},specific:{recordId:'development',fields:{}}}),'');
  assert.match(evolutionConsequence({...change,status:'active',before:{type:'member',status:'ended'}}),/恢复/);
});

test('autonomy cannot form contracts for NPCs or new people; existing direct identity persists',async()=>{
  const f=await setup();await enable(f);await f.store.transact(s=>s.powers[f.app.powerId].taishiPeople={mode:'all',selected:[],pinned:[f.a],joining:{[f.a]:'direct',[f.b]:'npc'}});f.app.openTaishiDevelopment();
  f.app.model.request=async()=>JSON.stringify({changes:[worldRow(f),{...personRow(f,f.a,'云岚'),sourceIndex:-1},{...personRow(f,f.b,'青禾'),sourceIndex:-1,details:{world:'海蓝界',relationship:'成为眷属'}},{...personRow(f,undefined,'新人'),sourceIndex:-1,details:{world:'海蓝界',relationship:'已缔约'}}]});
  await f.app.evolveTaishi(values(f));const pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,2);assert.equal(pending.issues.filter(i=>i.kind==='高影响后果').length,2);
  await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,i)=>[i,c.id])));const p=f.store.read().powers[f.app.powerId];assert.equal(p.taishiPeople.joining[f.a],'direct');assert.equal(p.taishiPeople.joining[f.b],'npc');assert(!Object.values(p.archives).some(r=>r.name==='新人'));
});

test('explicit supplements and ordinary story facts are not mistaken for autonomous consequences',async()=>{
  for(const supplement of [false,true]){
    const f=await setup();f.app.model.request=async()=>JSON.stringify({changes:[{...personRow(f,f.a,'云岚'),status:'ended',sourceIndex:supplement?-1:0,details:{world:'海蓝界',action:'剧情明确人物身亡'}}]});
    await f.app.reviewArchives(supplement?{supplement:true,values:{playerNote:'我确认云岚已在剧情中身亡，请登记这个结果'}}:{});
    assert.equal(f.app.pendingArchiveReview.changes[0].status,'ended');assert(!f.app.pendingArchiveReview.issues.some(i=>i.kind==='高影响后果'));
  }
});

test('selecting people and promoting an NPC requires no model and keeps history; undo restores both',async()=>{
  const f=await setup();let calls=0;f.app.model.request=async()=>{calls++;throw Error('不应调用');};const before=clone(f.store.read().powers[f.app.powerId]);
  f.app.openTaishiPeople();await f.app.saveTaishiPeople({mode:'selected',['pin:'+f.a]:'on',['join:'+f.a]:'direct'});
  const p=f.store.read().powers[f.app.powerId];assert.equal(calls,0);assert.equal(Object.keys(p.archives).length,4);assert.equal(p.taishiPeople.joining[f.a],'direct');assert(p.taishiPeople.pinned.includes(f.a));assert.match(p.archives[f.a].specific.fields.relationship,/眷属/);assert.equal(p.archives[f.a].history.length,before.archives[f.a].history.length+1);
  await f.store.transact(s=>undoArchiveUpdate(s,f.app.powerId));assert.deepEqual(f.store.read().powers[f.app.powerId].archives,before.archives);assert(!f.store.read().powers[f.app.powerId].taishiPeople);
});

test('selected plus pinned people update, excluded and new people remain untouched in both modes',async()=>{
  for(const advanced of [false,true]){const f=await setup();
    await f.store.transact(s=>{const p=s.powers[f.app.powerId];p.taishiWorkflow=advanced;p.taishiPeople={mode:'selected',selected:[],pinned:[f.a],joining:{[f.a]:'direct'}};});
    f.app.model.request=async(p,{connection})=>JSON.stringify(connection.task==='taishiSummary'?{message:'已筛选'}:connection.task==='taishiWorld'?{changes:[]}:{changes:[personRow(f,f.a,'云岚'),personRow(f,f.b,'青禾'),{...personRow(f,undefined,'新人物'),archiveId:undefined}]});
    await f.app.reviewArchives();const pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,1);assert.equal(pending.changes[0].id,f.a);assert.match(pending.message,/跳过 2 名人物/);
    await f.app.commitArchiveReview(pending,new Map([[0,f.a]]));const p=f.store.read().powers[f.app.powerId];assert(p.archives[f.b]);assert.equal(p.archives[f.b].specific.fields.action,undefined);assert.equal(p.taishiPeople.joining[f.a],'direct');assert.equal(Object.keys(p.archives).length,4);
  }
});

test('manual character drafts bypass selected scope, pin after save only, and survive backup and undo',async()=>{
  const f=await setup();await f.store.transact(s=>s.powers[f.app.powerId].taishiPeople={mode:'selected',selected:[],pinned:[],joining:{}});
  f.app.model.request=async()=>JSON.stringify({changes:[{...personRow(f,undefined,'星澜'),sourceIndex:-1}]});
  f.app.openTaishiDraft('companion');await f.app.submitTaishiDraft({kind:'companion',joining:'encounter',description:'原创人物星澜，擅长航海，安排将来相遇'});
  assert.equal(f.store.read().powers[f.app.powerId].taishiPeople.pinned.length,0);
  const pending=f.app.pendingArchiveReview;await f.app.commitArchiveReview(pending,new Map([[0,null]]));
  const state=validateState(clone(f.store.read())),p=state.powers[f.app.powerId],r=Object.values(p.archives).find(r=>r.name==='星澜');assert(r);assert(p.taishiPeople.pinned.includes(r.id));assert.equal(p.taishiPeople.joining[r.id],'encounter');assert.equal(r.status,'planned');
  await f.store.transact(s=>undoArchiveUpdate(s,f.app.powerId));assert.equal(f.store.read().powers[f.app.powerId].taishiPeople.pinned.length,0);
});

test('filtering remaps retained creation references and blocks those depending on skipped people',()=>{
  const changes=[{id:'b',name:'B',type:'member'},{id:'w',name:'W',type:'environment'}];
  const batch={changes,creationResults:[{creationId:'good',refs:[{changeIndex:1}]},{creationId:'skip',refs:[{changeIndex:0}],progress:{anchor:{index:4}}}],issues:[],blockedFloors:[]};
  filterPeopleBatch(batch,{taishiPeople:{mode:'selected',selected:[],pinned:[],joining:{}}});assert.equal(batch.creationResults.length,1);assert.equal(batch.creationResults[0].refs[0].changeIndex,0);assert.deepEqual(batch.blockedFloors,[4]);
});

test('old autonomy is off and invalid elapsed values reject before model calls',async()=>{
  const f=await setup();let calls=0;f.app.model.request=async()=>{calls++;};f.app.openTaishiDevelopment();assert.throws(()=>f.app.evolveTaishi(values(f)),/开启/);
  await enable(f);for(const value of ['0','-1','NaN','Infinity','1000000001'])assert.throws(()=>f.app.evolveTaishi({...values(f),elapsed:value}));assert.equal(calls,0);
  assert.throws(()=>validatePeopleControls({mode:'selected',selected:['x','x'],pinned:[],joining:{}}));
  const bad=clone(f.store.read());bad.powers[f.app.powerId].taishiAutonomy='on';assert.throws(()=>validateState(bad));
});

test('autonomous candidates preview without mutation, keep rates/reset, advance only selected world on commit',async()=>{
  for(const advanced of [false,true]){const f=await setup();await enable(f,advanced);const before=clone(f.store.read());let calls=0;
    f.app.model.request=async(p,{connection})=>{calls++;const input=JSON.parse(p.user);if(connection.task==='taishiSummary')return JSON.stringify({message:'已生成候选'});assert.equal(input.taishiEvolution.worldName,'海蓝界');assert.match(p.system,/不再乘时间倍率/);return JSON.stringify({changes:connection.task==='taishiPeople'?[{...personRow(f,f.a,'云岚'),sourceIndex:-1}]:[worldRow(f),...(advanced?[]:[{...personRow(f,f.a,'云岚'),sourceIndex:-1}])]});};
    await f.app.evolveTaishi(values(f));assert.equal(calls,advanced?3:1);assert.deepEqual(f.store.read(),before);
    const pending=f.app.pendingArchiveReview;assert(pending.taishiEvolution);assert.equal(pending.changes.length,2);assert(pending.changes.every(c=>c.source.type==='manual'&&c.source.note.includes('自主发展')));
    const personIndex=pending.changes.findIndex(c=>c.id===f.a);await assert.rejects(f.app.commitArchiveReview(pending,new Map([[personIndex,f.a]])),/一并保存/);
    await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,i)=>[i,c.id])));
    const p=f.store.read().powers[f.app.powerId];assert.match(p.archives[f.world].specific.fields.clock,/第九年.*内部 2年/);assert.equal(p.archives[f.world].specific.fields.rates,'十倍');assert.equal(p.archives[f.world].specific.fields.reset,'尚未到期');assert.deepEqual(p.archives[f.other],before.powers[f.app.powerId].archives[f.other]);assert.deepEqual(p.resources,before.powers[f.app.powerId].resources);assert.equal(f.replacementCount,0);validateState(clone(f.store.read()));
    await f.store.transact(s=>undoArchiveUpdate(s,f.app.powerId));assert.deepEqual(f.store.read().powers[f.app.powerId].archives,before.powers[f.app.powerId].archives);
  }
});

test('evolution rejects another world, personal rewards, excluded people and cross-world reassignment',async()=>{
  const f=await setup();await enable(f);await f.store.transact(s=>s.powers[f.app.powerId].taishiPeople={mode:'selected',selected:[],pinned:[],joining:{}});f.app.openTaishiDevelopment();
  f.app.model.request=async()=>JSON.stringify({changes:[worldRow(f),{...worldRow(f),archiveId:f.other,name:'赤砂界'},{...personRow(f,f.a,'云岚'),sourceIndex:-1},{type:'skill',name:'免费神通',status:'active',fields:{description:'凭空得到'},recordId:'growth',details:{world:'海蓝界'},sourceIndex:-1}]});
  await f.app.evolveTaishi(values(f));const pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,1);assert(pending.issues.length>=2);
  await assert.rejects(f.app.commitArchiveReview(pending,new Map([[0,f.other]])),/不能改派/);assert.equal(f.store.read().powers[f.app.powerId].archives[f.other].specific.fields.clock,'第一年');
});

test('missing world candidate blocks person-only evolution, and closing ignores late returns',async()=>{
  const f=await setup();await enable(f);f.app.model.request=async()=>JSON.stringify({changes:[{...personRow(f,f.a,'云岚'),sourceIndex:-1}]});await f.app.evolveTaishi(values(f));assert(!f.app.pendingArchiveReview);
  f.app.openTaishiDevelopment();let release;f.app.model.request=()=>new Promise(r=>release=r);const pending=f.app.evolveTaishi(values(f));await new Promise(r=>setTimeout(r,0));f.app.dismissTaishiDevelopment();release(JSON.stringify({changes:[worldRow(f)]}));await assert.rejects(pending);assert(!f.app.pendingArchiveReview);assert.equal(f.store.read().powers[f.app.powerId].archives[f.world].specific.fields.clock,'第九年');
});

test('autonomy changes invalidate stale windows, cannot use auto-save, and UI escapes names',async()=>{
  const f=await setup();f.app.openTaishiDevelopment();await f.app.saveTaishiAutonomy({autonomy:'on'});assert.equal(f.store.read().powers[f.app.powerId].taishiAutonomy,true);
  await assert.rejects(f.app.reviewArchives({automatic:true,autoSave:true,taishiEvolution:{worldId:f.world,elapsed:1,unit:'years'},values:{playerNote:'玩家确认推进一年'}}));
  await f.store.transact(s=>s.powers[f.app.powerId].taishiAutonomy=false);assert.throws(()=>f.app.evolveTaishi(values(f)));
  const ui=Object.create(WorkbenchUI.prototype);let html;ui.dialog=(_title,body)=>html=body;const p=clone(f.store.read().powers[f.app.powerId]);p.archives[f.a].name='<img onerror=bad>';ui.showTaishiPeople(p);assert(!html.includes('<img'));assert(html.includes('&lt;img'));ui.showTaishiDevelopment(p,'st');assert.match(html,/旧档默认关闭/);assert.match(html,/data-action="taishi-evolve" disabled/);
});
