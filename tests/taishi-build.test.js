import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {clone,validateState} from '../src/core.js';
import {packReferences,referenceEntries,attachReferences,REFERENCE_LIMIT,REFERENCE_BUILD_LIMIT} from '../src/ai-worldbooks-data.js';
import {planTaishiBuild,buildProgress,validateTaishiBuild,BUILD_BATCH_LIMIT} from '../src/taishi-build.js';
import {undoArchiveUpdate} from '../src/archive-journal.js';
import {WorkbenchUI} from '../src/ui.js';

const selection=[{name:'个人诸界',entryIds:['1']}];
const packet=content=>packReferences(selection,new Map([['个人诸界',referenceEntries({entries:{1:{uid:1,comment:'成熟世界',content}}},'个人诸界')]]),{limit:REFERENCE_BUILD_LIMIT});
async function setup(content='海蓝界是一个已成熟的海洋世界。'.repeat(4000)){
  const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';
  f.app.ui.showTaishiBuild=d=>{f.screen=d;};f.app.ui.showArchiveReview=()=>{};
  f.content=content;f.ctx.loadWorldInfo=async()=>({entries:{1:{uid:1,comment:'成熟世界',content:f.content}}});
  await f.store.transact(s=>{s.aiWorldbooks={mode:'manual',books:selection};s.powers[f.app.powerId].taishiBuildReferences={mode:'manual',books:selection};});f.calls=0;
  f.app.model.request=async p=>{f.calls++;f.input=JSON.parse(p.user);const old=f.input.current.find(r=>r.name==='海蓝界');return JSON.stringify({changes:[{...(old?{archiveId:old.id}:{}),type:'environment',name:'海蓝界',status:'active',fields:{conditions:'已成熟的海洋世界'},recordId:'world',details:old?{overview:'群岛文明'}:{clock:'第一年'},sourceIndex:-1}]});};
  return f;
}
async function accept(f){const p=f.app.pendingArchiveReview;assert(p);const result=await f.app.commitArchiveReview(p,new Map(p.changes.map((c,i)=>[i,c.id])));f.app.pendingArchiveReview=null;return result;}

test('ordinary references above the old cap attach in full, enforce new cap and combined request cap',()=>{
  assert.equal(REFERENCE_LIMIT,800000);
  const p=packet('字'.repeat(120000));assert.equal(p.characters,120000);
  const result=attachReferences({system:'s',user:'{}'},p);assert.equal(JSON.parse(result.user).attachedWorldbooks.books[0].entries[0].content.length,120000);
  assert.throws(()=>attachReferences({system:'s',user:JSON.stringify({other:'字'.repeat(1100000)})},p),/合计过长/);
  assert.throws(()=>packReferences([{name:'x',entryIds:['1','2','3','4','5']}],new Map([['x',Array.from({length:5},(_,i)=>({id:String(i+1),title:'x',content:'字'.repeat(180000)}))]])),/800000/);
});

test('a single entry larger than the ordinary cap can be split for setup without truncation',()=>{
  const content='界'.repeat(900000),plan=planTaishiBuild(packet(content),'a'.repeat(16));
  assert(plan.total>30);assert.equal(plan.chunks.flatMap(c=>c.payload.books.flatMap(b=>b.entries)).map(e=>e.content).join(''),content);
});

test('JSON-escaped control text fits the serialized budget without lost characters',()=>{
  const content='\u0000'.repeat(7000),plan=planTaishiBuild(packet(content),'a'.repeat(16));
  assert(plan.chunks.every(c=>JSON.stringify(c.payload).length<=BUILD_BATCH_LIMIT));
  assert.equal(plan.chunks.flatMap(c=>c.payload.books.flatMap(b=>b.entries)).map(e=>e.content).join(''),content);
});

test('deterministic chunks preserve every character including escapes and surrogate pairs',()=>{
  const text=('字'.repeat(2999)+'🌏\n"\\\u0000').repeat(20),ref=packet(text),plan=planTaishiBuild(ref,'a'.repeat(16));
  assert(plan.total>1);assert.equal(plan.fingerprint,planTaishiBuild(ref,'a'.repeat(16)).fingerprint);
  const entries=plan.chunks.flatMap(c=>c.payload.books.flatMap(b=>b.entries));
  assert.equal(entries.map(e=>e.content).join(''),text);
  assert(plan.chunks.every(c=>JSON.stringify(c.payload).length<=BUILD_BATCH_LIMIT));
  for(const e of entries){assert.equal(e.content,text.slice(e.offset,e.end));assert(!/[\uD800-\uDBFF]$/.test(e.content));assert.equal(e.entryCharacters,text.length);}
  assert.notEqual(plan.fingerprint,planTaishiBuild(ref,'b'.repeat(16)).fingerprint);
});

test('preview invokes one setup task, no state changes until confirmation, then resume and undo stay atomic',async()=>{
  const f=await setup(),initial=clone(f.store.read());await f.app.initializeTaishi();assert.equal(f.calls,0);assert(f.screen.plan.total>1);
  await f.app.runTaishiBuild();assert.equal(f.calls,1);assert.deepEqual(f.store.read(),initial);
  assert(f.input.attachedWorldbooks.books[0].entries[0].parts>1);assert(f.app.pendingArchiveReview.taishiBuild);
  const pending=f.app.pendingArchiveReview;await accept(f);
  let p=f.store.read().powers[f.app.powerId];assert.equal(p.taishiBuild.next,1);assert.equal(Object.keys(p.archives).length,1);assert(!JSON.stringify(p.taishiBuild).includes('content'));
  await assert.rejects(f.app.commitArchiveReview(pending,new Map([[0,null]])),/变化|完成/);
  assert.equal(Object.keys(f.store.read().powers[p.id].archives).length,1);
  await f.store.transact(s=>undoArchiveUpdate(s,p.id));assert.deepEqual(f.store.read().powers[p.id].archives,initial.powers[p.id].archives);assert(!f.store.read().powers[p.id].taishiBuild);
  await f.app.initializeTaishi();await f.app.runTaishiBuild();await accept(f);
  // Mimic a refreshed controller: persisted progress is sufficient; no in-memory candidate required.
  f.app.taishiBuildDraft=null;f.app.pendingArchiveReview=null;validateState(clone(f.store.read()));await f.app.initializeTaishi();assert.equal(f.screen.plan.next,1);
  await f.app.runTaishiBuild();await accept(f);p=f.store.read().powers[p.id];assert.equal(p.taishiBuild.next,2);assert.equal(Object.keys(p.archives).length,1);assert.equal(Object.values(p.archives)[0].specific.fields.clock,'第一年');
});

test('failure and close never advance; retry requests the same part without automatic calls',async()=>{
  const f=await setup();await f.app.initializeTaishi();const good=f.app.model.request;
  f.app.model.request=async()=>{f.calls++;throw Error('模型暂不可用');};await f.app.runTaishiBuild();assert.equal(f.calls,1);assert.match(f.screen.error,/暂不可用/);assert(!f.store.read().powers[f.app.powerId].taishiBuild);
  f.app.model.request=good;await f.app.runTaishiBuild();assert.equal(f.calls,2);assert.equal(f.app.pendingArchiveReview.taishiBuild.next,0);
  f.app.pendingArchiveReview=null;await f.app.initializeTaishi();let release;
  f.app.model.request=()=>new Promise(r=>{release=r;});const running=f.app.runTaishiBuild();while(!release)await new Promise(r=>setTimeout(r,1));
  f.app.dismissTaishiBuild();release('{"changes":[]}');await assert.rejects(running,{name:'AbortError'});assert(!f.app.pendingArchiveReview);assert(!f.store.read().powers[f.app.powerId].taishiBuild);
});

test('changed book, changed selection and stale capture block calls; explicit restart preserves archives',async()=>{
  const f=await setup();await f.app.initializeTaishi();await f.app.runTaishiBuild();await accept(f);const archives=clone(f.store.read().powers[f.app.powerId].archives),calls=f.calls;
  await f.app.initializeTaishi();f.content+='新设定';await f.app.runTaishiBuild();assert.equal(f.calls,calls);assert.match(f.screen.error,/已变化/);
  await f.app.initializeTaishi();assert(f.screen.changed);await f.app.restartTaishiBuild();assert.equal(f.screen.plan.next,0);assert.deepEqual(f.store.read().powers[f.app.powerId].archives,archives);assert.equal(f.calls,calls);
  await f.store.transact(s=>{s.aiWorldbooks.books[0].entryIds=[];});await assert.rejects(f.app.runTaishiBuild());assert.equal(f.calls,calls);
});

test('partial or rejected candidates keep cursor; explicit skip is recorded, undoable and calls no model',async()=>{
  const f=await setup();await f.app.initializeTaishi();f.app.model.request=async()=>{f.calls++;return JSON.stringify({changes:[{type:'environment',name:'海蓝界',status:'active',fields:{conditions:'成熟'},recordId:'world',details:{clock:'第一年'},sourceIndex:-1},{type:'invalid',name:'无效项',status:'active',fields:{},sourceIndex:-1}]});};
  await f.app.runTaishiBuild();assert.equal(f.app.pendingArchiveReview.issues.length,1);await accept(f);assert(!f.store.read().powers[f.app.powerId].taishiBuild);
  await f.app.initializeTaishi();const before=clone(f.store.read().powers[f.app.powerId].archives);await f.app.skipTaishiBuild();let p=f.store.read().powers[f.app.powerId];assert.equal(f.calls,1);assert.deepEqual(p.taishiBuild.skipped,[0]);assert.equal(p.taishiBuild.next,1);assert.deepEqual(p.archives,before);
  f.app.dismissTaishiBuild();await f.store.transact(s=>undoArchiveUpdate(s,p.id));assert(!f.store.read().powers[p.id].taishiBuild);assert.deepEqual(f.store.read().powers[p.id].archives,before);
});

test('unselected proposals keep the same batch; retry reuses saved IDs and keeps known history',async()=>{
  const f=await setup();f.app.model.request=async prompt=>{f.calls++;const input=JSON.parse(prompt.user);return JSON.stringify({changes:['海蓝界','赤砂界'].map(name=>{
    const old=input.current.find(r=>r.name===name);return {...(old?{archiveId:old.id}:{}),type:'environment',name,status:'active',fields:{conditions:'成熟文明'},recordId:'world',details:{clock:old?'猜测的新时点':'第一年'},sourceIndex:-1};
  })});};
  await f.app.initializeTaishi();await f.app.runTaishiBuild();let pending=f.app.pendingArchiveReview;
  await f.app.commitArchiveReview(pending,new Map([[0,null]]));f.app.pendingArchiveReview=null;
  assert(!f.store.read().powers[f.app.powerId].taishiBuild);const original=clone(Object.values(f.store.read().powers[f.app.powerId].archives)[0]);
  await f.app.initializeTaishi();await f.app.runTaishiBuild();pending=f.app.pendingArchiveReview;assert(pending.issues.some(i=>i.kind==='设定冲突'));
  await accept(f);const p=f.store.read().powers[f.app.powerId];assert.equal(p.taishiBuild.next,1);assert.equal(Object.keys(p.archives).length,2);assert.equal(p.archives[original.id].specific.fields.clock,'第一年');assert.deepEqual(p.archives[original.id].history,original.history);
});

test('invalid stored cursor is rejected; no-result batches can confirm progress',async()=>{
  const progress=buildProgress(planTaishiBuild(packet('设定'),'a'.repeat(16)));validateTaishiBuild(progress);
  for(const bad of [{next:2},{version:2},{skipped:[0]},{fingerprint:'invalid'},{content:'secret'}])assert.throws(()=>validateTaishiBuild({...progress,...bad}));
  const f=await setup('只有规则，没有明确已有世界。');f.app.model.request=async()=>'{"changes":[],"message":"无明确已有对象"}';await f.app.initializeTaishi();await f.app.runTaishiBuild();await accept(f);assert.equal(f.store.read().powers[f.app.powerId].taishiBuild.next,1);await f.app.initializeTaishi();assert.equal(f.screen.plan.next,f.screen.plan.total);await assert.rejects(f.app.runTaishiBuild(),/完成/);
});

test('build page escapes source names and shows restart, explicit costs, and resume',()=>{
  let html;const ui={dialog:(title,value)=>{html=value;}};
  const plan=planTaishiBuild(packet('世界'), 'a'.repeat(16));plan.chunks[0].summary[0].name='<img onerror="x">';
  WorkbenchUI.prototype.showTaishiBuild.call(ui,{plan,error:'<script>',loading:false});assert(html.includes('&lt;img'));assert(!html.includes('<img'));assert(html.includes('taishi-build-run'));assert(html.includes('最多调用一次'));assert(html.includes('刷新不会自动调用'));
});
test('legacy shared references never start a build; first entry requires an independent selection',async()=>{
 const f=await setup();await f.store.transact(s=>{delete s.powers[f.app.powerId].taishiBuildReferences;});
 f.app.ui.showAIWorldbooks=d=>{f.selection=d;};
 const reads=[];f.ctx.loadWorldInfo=async name=>{reads.push(name);throw Error('must not read shared books');};
 await f.app.initializeTaishi();assert(f.selection.taishiPowerId===f.app.powerId);
 assert.deepEqual(f.selection.config,{mode:'manual',books:[]});assert.deepEqual(reads,[]);assert.equal(f.calls,0);
});
test('scoped picker selects exact entries, preserves global references and archives, and invalidates old cursor only on changed selection',async()=>{
 const f=await setup();await f.app.initializeTaishi();await f.app.runTaishiBuild();await accept(f);
 const before=clone(f.store.read()),id=f.app.powerId,calls=f.calls;
 f.app.ui.showAIWorldbooks=d=>{f.selection=d;};
 f.ctx.getWorldInfoNames=()=>['个人诸界','漫漫长路'];
 f.ctx.loadWorldInfo=async name=>({entries:{1:{uid:1,comment:name+'世界',content:'世界已成熟。'},2:{uid:2,comment:'不采用词条',content:'不应发送的设定'}}});
 await f.app.initializeTaishi();await f.app.selectTaishiBuildReferences();
 f.app.ui.readReferenceChoices=()=>new Map([['个人诸界',['1']]]);
 await f.app.saveAIWorldbooks();
 assert.deepEqual(f.store.read().powers[id].taishiBuild,before.powers[id].taishiBuild);
 await f.app.selectTaishiBuildReferences();
 f.app.ui.readReferenceChoices=()=>new Map([['个人诸界',['2']]]);
 await f.app.saveAIWorldbooks();
 const after=f.store.read();assert(!after.powers[id].taishiBuild);assert.deepEqual(after.aiWorldbooks,before.aiWorldbooks);
 assert.deepEqual(after.powers[id].archives,before.powers[id].archives);assert.equal(f.calls,calls);
 assert.deepEqual(f.screen.plan.chunks.flatMap(c=>c.payload.books.flatMap(b=>b.entries.map(e=>e.id))),['2']);
 await f.app.runTaishiBuild();assert.equal(f.calls,calls+1);
 assert.equal(f.input.attachedWorldbooks.books.length,1);assert.equal(f.input.attachedWorldbooks.books[0].name,'个人诸界');
 assert.equal(f.input.attachedWorldbooks.books[0].entries[0].id,'2');
});
