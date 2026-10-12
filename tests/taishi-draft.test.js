import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {clone,validateState} from '../src/core.js';
import {validateAdapter} from '../src/adapters.js';
import {taishiConfig} from '../src/taishi.js';
import {WorkbenchUI} from '../src/ui.js';
import {archiveSource,saveArchive} from '../src/archives.js';

async function setup(){
  const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';
  f.app.ui.showTaishiDraft=()=>{};f.app.ui.showArchiveReview=()=>{};
  return f;
}
const world=()=>({name:'海蓝界',type:'environment',status:'active',fields:{conditions:'成熟的海洋修仙世界'},recordId:'world',details:{overview:'群岛文明',geography:'三片群岛',era:'宗门与海商并存'},sourceIndex:-1});
const person=()=>({name:'云岚',type:'member',status:'active',fields:{role:'灵植师'},recordId:'companion',details:{profile:'沉稳的灵植师',goals:'培育耐盐灵植',relationship:'已经签订永恒契约'},sourceIndex:-1});

test('additive schemas remain valid and retain all original record and field identities',()=>{
  const c=taishiConfig();validateAdapter(c);
  assert.equal(c.records.find(r=>r.id==='companion').fields.length,16);
  assert(c.records.find(r=>r.id==='world').fields.some(f=>f.id==='clock'));
  assert(c.records.find(r=>r.id==='companion').fields.some(f=>f.id==='core_memory'));
});

test('without worldbooks world draft previews once, persists only after confirmation and round trips',async()=>{
  const f=await setup();let calls=0,prompt;
  f.app.model.request=async p=>{calls++;prompt=p;return JSON.stringify({changes:[world()]});};
  f.app.openTaishiDraft('world');const before=clone(f.store.read());
  await f.app.submitTaishiDraft({kind:'world',description:'建立成熟的海洋修仙世界'});
  assert.equal(calls,1);assert.deepEqual(f.store.read(),before);
  assert.equal(JSON.parse(prompt.user).taishiDraft.kind,'world');assert.match(prompt.system,/待玩家确认的建档草案/);
  const pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,1);assert.match(pending.changes[0].source.note,/AI 建档草案/);
  await f.app.commitArchiveReview(pending,new Map([[0,null]]));
  const state=f.store.read(),p=state.powers[f.app.powerId];assert.equal(Object.keys(p.archives).length,1);
  assert.equal(Object.values(p.archives)[0].specific.fields.geography,'三片群岛');
  assert.deepEqual(validateState(clone(state)),state);assert(p.archiveUndo);assert.equal(f.replacementCount,0);
});

test('encounter and ordinary NPC drafts cannot claim a contract or complete an encounter',async()=>{
  for(const joining of ['encounter','npc','direct']){
    const f=await setup();f.app.model.request=async()=>JSON.stringify({changes:[person(),world()]});
    f.app.openTaishiDraft('companion');await f.app.submitTaishiDraft({kind:'companion',joining,description:'原创人物云岚，是沉稳的灵植师'});
    const pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,1);assert(pending.issues.some(i=>i.kind==='草案范围'));
    const c=pending.changes[0];assert.equal(c.status,joining==='encounter'?'planned':'active');
    assert.match(c.specific.fields.relationship,joining==='direct'?/确认采用/:/未缔约/);
    await f.app.commitArchiveReview(pending,new Map([[0,null]]));validateState(f.store.read());
  }
});

test('world draft fills gaps without overwriting old clock, history, identity or current conditions',async()=>{
  const f=await setup(),id=f.app.powerId;
  await f.store.transact(s=>{saveArchive(s.powers[id],{name:'海蓝界',type:'environment',status:'working',fields:{conditions:'旧档当前现状'},specific:{adapterId:'wuku.primordial_world',recordId:'world',version:'1.1.0',label:'世界',labels:{clock:'内历'},fields:{clock:'第九年'}}},archiveSource(f.ctx.chat,'旧档案'));});
  const old=clone(Object.values(f.store.read().powers[id].archives)[0]);
  f.app.model.request=async()=>JSON.stringify({changes:[{...world(),archiveId:old.id}]});
  f.app.openTaishiDraft('world');await f.app.submitTaishiDraft({kind:'world',description:'补充海蓝界的地理和势力轮廓'});
  const pending=f.app.pendingArchiveReview;assert.equal(pending.changes[0].id,old.id);assert.equal(pending.changes[0].patch.conditions,undefined);
  await f.app.commitArchiveReview(pending,new Map([[0,old.id]]));
  const p=f.store.read().powers[id];assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[old.id].fields.conditions,old.fields.conditions);
  assert.equal(p.archives[old.id].status,'working');assert.equal(p.archives[old.id].history.length,old.history.length+1);
  assert.equal(p.archives[old.id].specific.fields.clock,'第九年');
});

test('closing a draft prevents late response from creating a preview or saved data',async()=>{
  const f=await setup();let release;f.app.model.request=()=>new Promise(r=>release=r);
  f.app.openTaishiDraft('world');const run=f.app.submitTaishiDraft({kind:'world',description:'建立成熟的海洋世界'});
  while(!release)await new Promise(r=>setTimeout(r,0));
  f.app.dismissTaishiDraft();release(JSON.stringify({changes:[world()]}));
  await assert.rejects(run);assert.equal(f.app.pendingArchiveReview,null);assert.equal(f.app.taishiDraft,null);
  assert.equal(Object.keys(f.store.read().powers[f.app.powerId].archives||{}).length,0);
});

test('stale form and automatic draft requests reject before calling a model',async()=>{
  const f=await setup();let calls=0;f.app.model.request=async()=>{calls++;return '{}';};
  f.app.openTaishiDraft('world');await f.store.transact(s=>{s.powers[f.app.powerId].active=false;});
  await assert.rejects(f.app.submitTaishiDraft({kind:'world',description:'建立成熟的海洋世界'}));
  await f.store.transact(s=>{s.powers[f.app.powerId].active=true;});
  await assert.rejects(f.app.reviewArchives({automatic:true,taishiDraft:{kind:'world',joining:'none'}}),/预览后保存/);
  assert.equal(calls,0);
});

test('default page keeps advanced model guidance behind a separate entry',async()=>{
  const f=await setup(),ui=Object.create(WorkbenchUI.prototype);ui.view={state:f.store.read()};
  const html=ui.taishiStatistics(f.store.read().powers[f.app.powerId],false,'st',f.ctx.chat);
  assert.match(html,/data-action="taishi-create-world"/);assert.match(html,/data-action="taishi-add-companion"/);
  assert.match(html,/data-action="taishi-advanced"/);assert(!html.includes('Flash 类'));
  let dialog='';ui.dialog=(_title,body)=>dialog=body;ui.showTaishiAdvanced();
  assert.match(dialog,/Flash 类/);assert.match(dialog,/Pro 类/);assert.match(dialog,/旧档默认关闭/);assert.match(dialog,/name="workflow"/);
  ui.showTaishiDraft('world');assert.match(dialog,/name="description"/);assert(!dialog.includes('name="joining"'));
});
