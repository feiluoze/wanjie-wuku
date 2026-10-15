import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {decodeCheckpoint} from '../src/review-checkpoint.js';
import {assertRelation} from '../src/taishi-relations.js';
import {validationIssueCode} from '../src/runtime-log.js';
async function setup(personOnly=false){const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.showTaishiBuild=d=>{f.screen=d;};f.app.ui.showTaishiStructure=()=>{};f.app.ui.showAIWorldbooks=()=>{};f.app.ui.showArchiveReview=()=>{};f.app.ui.setTaishiLayout=()=>{};
 f.app.openTaishiStructure();await f.app.saveTaishiStructure({mode:'single',worldName:'主星'});f.book={entries:{1:{uid:1,comment:personOnly?'【人物】本地官员':'【世界】主星',content:'【世界】主星\n已成立世界。\n【人物】本地官员\n现任郡守，普通居民。'}}};f.ctx.loadWorldInfo=async()=>f.book;await f.store.transact(s=>{s.powers[f.app.powerId].taishiBuildReferences={mode:'manual',books:[{name:'书',entryIds:['1']}]};});f.calls=0;return f;}
const world={type:'record',name:'主星',status:'active',recordId:'world',fields:{description:'已有完整世界',limits:'真实边界'},details:{overview:'完整设定'},sourceIndex:-1};
const npc={type:'member',name:'本地官员',status:'active',recordId:'companion',fields:{role:'郡守'},details:{profile:'普通居民'},sourceIndex:-1};
test('world generic record description routes to existing environment; world build excludes people before save',async()=>{
 const f=await setup();let input;f.app.model.request=async p=>{f.calls++;input=JSON.parse(p.user);return JSON.stringify({changes:[world,npc]});};await f.app.initializeTaishi();assert.equal(f.screen.includePeople,false);await f.app.runTaishiBuild();const p=f.app.pendingArchiveReview;assert.equal(p.issues.length,0);assert.equal(p.changes.length,1);assert.equal(p.changes[0].type,'environment');assert.equal(p.changes[0].patch.conditions,world.fields.description);assert.equal(p.changes[0].specific.fields.limits,'真实边界');assert(!input.recordSchemas.some(r=>r.id==='companion'));assert(input.personImport);
 await f.app.commitArchiveReview(p,new Map([[0,p.changes[0].id]]));const power=f.store.read().powers[f.app.powerId];assert.equal(power.taishiBuild.next,1);assert.equal(Object.keys(power.archives).length,1);
});
test('dedicated person selection includes ordinary person but never grants confirmed identity',async()=>{
 const f=await setup(true);f.app.model.request=async()=>JSON.stringify({changes:[npc]});await f.app.initializeTaishi();assert.equal(f.screen.includePeople,true);await f.app.runTaishiBuild();const p=f.app.pendingArchiveReview;assert.equal(p.changes.length,1);assert.equal(p.issues.length,0);await f.app.commitArchiveReview(p,new Map([[0,null]]));assert.equal(f.store.read().powers[f.app.powerId].taishiPeople?.joining?.[p.changes[0].id],undefined);
});
test('partial commit restores only unresolved raw candidate; local repair completes same batch with one model call',async()=>{
 const f=await setup(),bad={type:'record',name:'可用知识',status:'active',recordId:'available',fields:{unknown_blob:{text:'保留内容'}},details:{current:'已有知识'},sourceIndex:-1};f.app.model.request=async()=>{f.calls++;return JSON.stringify({changes:[world,bad]});};await f.app.initializeTaishi();await f.app.runTaishiBuild();let pending=f.app.pendingArchiveReview;assert(pending.issues.length);const result=await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,i)=>[i,c.id])));assert(result.remainingReview);const s=f.app.contextSnapshot();pending=decodeCheckpoint(f.storage.getItem('wanjie-wuku:review-checkpoint:'+s.chatKey),s);assert(pending);assert.equal(pending.data.changes.length,1);assert.equal(pending.data.changes[0].name,'可用知识');assert.equal(s.state.powers[f.app.powerId].taishiBuild.next,0);f.app.pendingArchiveReview=pending;
 const i=pending.issues.findIndex(i=>i.repairable),fixed={...pending.issues[i].candidate,fields:{description:Object.values(f.store.read().powers[f.app.powerId].archives).find(r=>r.name==='可用知识').fields.description},details:{current:'已有知识',use:'保留内容'}};await f.app.repairArchiveCandidate({index:i,values:{['repair-candidate:'+i]:JSON.stringify(fixed)}});pending=f.app.pendingArchiveReview;assert.equal(pending.issues.length,0);await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,i)=>[i,c.id])));assert.equal(f.calls,1);assert.equal(f.store.read().powers[f.app.powerId].taishiBuild.next,1);assert.equal(Object.keys(f.store.read().powers[f.app.powerId].archives).length,2);
});
test('relationship diagnostics distinguish direction, required facts and missing endpoints without values',()=>{
 const p={archives:{a:{id:'a',specific:{recordId:'organization',fields:{}}},b:{id:'b',specific:{recordId:'organization',fields:{}}}}};
 for(const [fields,code]of [[{subject_id:'missing',target_id:'b'},'relation_endpoints'],[{subject_id:'a',target_id:'b',direction:'错误'},'relation_direction'],[{subject_id:'a',target_id:'b',direction:'单向',state:'私密状态'},'relation_required_fields']]){
 let error;try{assertRelation(p,{specific:{recordId:'relation',fields}});}catch(e){error=e;}assert.equal(validationIssueCode({diagnostic:error.relationDiagnostic}),code);assert(!JSON.stringify(error.relationDiagnostic).includes('私密状态'));
 }
});

