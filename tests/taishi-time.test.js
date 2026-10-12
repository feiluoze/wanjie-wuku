import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {storyTimeEvents,validateTaishiTime} from '../src/taishi-time.js';
import {clone,validateState} from '../src/core.js';
import {rollbackStoryRecords} from '../src/archive-branch.js';
import {undoArchiveUpdate} from '../src/archive-journal.js';
async function setup(advanced=false){
 const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};f.app.ui.showTaishiDevelopment=()=>{};
 await f.store.transact(s=>{const p=s.powers[f.app.powerId];p.taishiAutonomy=true;p.taishiWorkflow=advanced;f.world=saveArchive(p,{type:'environment',name:'海蓝界',status:'active',fields:{conditions:'已有文明'},specific:{adapterId:'wuku.primordial_world',recordId:'world',version:'1.2.0',label:'世界',fields:{clock:'第九年'},labels:{clock:'内历'}}},archiveSource(f.ctx.chat,'原世界')).id;});
 f.ctx.chat.push({is_user:false,swipe_id:0,mes:'海蓝界内部过去了3天。'});f.calls=[];
 f.app.model.request=async(prompt,{connection})=>{f.calls.push(connection.task);return JSON.stringify(connection.task==='taishiSummary'?{message:'待确认'}:{changes:connection.task==='taishiPeople'?[]:[{archiveId:f.world,name:'海蓝界',type:'environment',status:'active',fields:{conditions:'本段历时内灵圃发展'},recordId:'world',details:{overview:'本段发展完成'},sourceIndex:-1}]});};
 f.p=()=>f.store.read().powers[f.app.powerId];f.events=()=>storyTimeEvents(f.p(),f.ctx.chat);return f;
}
async function preview(f){f.app.openTaishiDevelopment();await f.app.evolveTaishiStory(f.events()[0].id);return f.app.pendingArchiveReview;}
async function commit(f,p){return f.app.commitArchiveReview(p,new Map(p.changes.map((c,i)=>[i,c.id])));}

test('time discovery is model-free and accepts only explicit standalone internal elapsed facts',async()=>{
 const f=await setup(),before=clone(f.store.read());assert.equal(f.events().length,1);f.app.openTaishiDevelopment();assert.equal(f.calls.length,0);assert.deepEqual(f.store.read(),before);
 for(const mes of ['```text\n海蓝界内部过去了3天。\n```','<think>\n海蓝界内部过去了3天。\n</think>','<blockquote>\n海蓝界内部过去了3天。\n</blockquote>','计划海蓝界内部过去了3天。','“海蓝界内部过去了3天。”','海蓝界内部过去了三天。','海蓝界内部过去了0天。','海蓝界外界过去了3天。','海蓝界内部过去了3天，准备开工。','如果海蓝界内部过去了3天。','海蓝界内部过去了1000000001年。']){f.ctx.chat[1].mes=mes;assert.equal(f.events().length,0,mes);}
 f.ctx.chat[1].mes='海蓝界内部已经经过2.5小时。';assert.equal(f.events()[0].elapsed,2.5);assert.equal(f.events()[0].unit,'hours');f.ctx.chat[1].is_user=true;assert.equal(f.events().length,0);
});

test('preview is reversible and repeated discovery after save or reload does not advance the same elapsed period',async()=>{
 const f=await setup(),before=clone(f.store.read()),p=await preview(f);assert.deepEqual(f.calls,['archive']);assert.deepEqual(f.store.read(),before);assert.equal(f.events().length,1);
 assert(p.changes.every(c=>c.source.type==='story'));assert(!p.changes[0].specific.fields.clock.includes('本次确认推进'));await commit(f,p);
 assert.equal(f.events().length,0);assert.equal(storyTimeEvents(clone(f.p()),clone(f.ctx.chat)).length,0);validateState(clone(f.store.read()));assert.equal(f.p().taishiTime.receipts.length,1);
 await assert.rejects(commit(f,p),/变化|修订|已经采用/);assert.equal(f.p().taishiTime.receipts.length,1);
});

test('normal continuation retains receipts while reroll restores baseline world and removes the receipt',async()=>{
 const f=await setup(),p=await preview(f);await commit(f,p);f.ctx.chat[1].mes+='\n后续继续。';assert.equal(f.events().length,0);
 for(const mutate of [chat=>chat[1].swipe_id=1,chat=>chat[1].mes='新分支尚未经过三天',chat=>chat.splice(1,1)]){
  const s=clone(f.store.read()),chat=clone(f.ctx.chat);mutate(chat);const result=rollbackStoryRecords(s,chat);assert.equal(result.restored,1);assert.equal(s.powers[f.app.powerId].archives[f.world].specific.fields.clock,'第九年');assert.equal(s.powers[f.app.powerId].taishiTime.receipts.length,0);validateState(s);
 }
});

test('failed storage, skipped world, source changes and cancellation cannot consume elapsed events',async()=>{
 const f=await setup(),p=await preview(f),before=clone(f.store.read());await assert.rejects(f.app.commitArchiveReview(p,new Map()),/必须同时保存世界/);assert.equal(f.events().length,1);
 const set=f.storage.setItem,save=f.ctx.saveChat;f.ctx.saveChat=undefined;f.storage.setItem=()=>{throw Error('quota');};await assert.rejects(commit(f,p),/未提交/);f.storage.setItem=set;f.ctx.saveChat=save;assert.deepEqual(f.store.read(),before);assert.equal(f.events().length,1);
 f.ctx.chat[1].swipe_id=1;await assert.rejects(commit(f,p),/变化|正文/);assert.equal(f.events().length,1);
 const g=await setup();g.app.openTaishiDevelopment();let resolve;g.app.model.request=()=>new Promise(r=>resolve=r);const running=g.app.evolveTaishiStory(g.events()[0].id);await new Promise(r=>setTimeout(r,5));g.app.dismissTaishiDevelopment();resolve(JSON.stringify({changes:[]}));await assert.rejects(running,/取消|Abort|失效/);assert.equal(g.events().length,1);assert(!g.p().taishiTime);
});

test('one-step undo restores both world and time receipt, making the period selectable again',async()=>{
 const f=await setup(),p=await preview(f);await commit(f,p);assert.equal(f.events().length,0);await f.store.transact(s=>undoArchiveUpdate(s,f.app.powerId));assert.equal(f.events().length,1);assert.equal(f.p().archives[f.world].specific.fields.clock,'第九年');
});

test('advanced workflow uses the same story event and one preview commit without automatic extra calls',async()=>{
 const f=await setup(true),p=await preview(f);assert.deepEqual(f.calls,['taishiWorld','taishiPeople','taishiSummary']);assert(p.workflowOptions.taishiTimeEvent);assert(p.changes.every(c=>c.source.type==='story'));await commit(f,p);assert.equal(f.events().length,0);
});

test('time receipt validation rejects malformed, duplicate, or oversized persisted data',async()=>{
 const f=await setup(),e=f.events()[0],receipt={id:e.id,worldId:e.worldId,anchor:e.anchor};validateTaishiTime({receipts:[receipt]});assert.throws(()=>validateTaishiTime({receipts:[receipt,receipt]}),/标识/);assert.throws(()=>validateTaishiTime({receipts:[{...receipt,anchor:{...receipt.anchor,index:-1}}]}),/来源/);assert.throws(()=>validateTaishiTime({receipts:Array(513).fill(receipt)}),/记录/);
});

test('rerolling an earlier period clears later receipts when their inherited world development is rolled back',async()=>{
 const f=await setup();await commit(f,await preview(f));f.ctx.chat.push({is_user:false,swipe_id:0,mes:'海蓝界内部过去了2年。'});await commit(f,await preview(f));assert.equal(f.p().taishiTime.receipts.length,2);
 const s=clone(f.store.read());f.ctx.chat[1].mes='原来的三天没有发生';rollbackStoryRecords(s,f.ctx.chat);assert.equal(s.powers[f.app.powerId].taishiTime.receipts.length,0);assert.equal(storyTimeEvents(s.powers[f.app.powerId],f.ctx.chat).length,1);
});

test('advanced failed specialist retry retains the time event until final confirmation',async()=>{
 const f=await setup(true),request=f.app.model.request;let fail=true;f.app.model.request=async(p,o)=>{if(o.connection.task==='taishiPeople'&&fail){fail=false;throw Error('people unavailable');}return request(p,o);};
 await preview(f);assert.equal(f.events().length,1);assert.equal(f.app.pendingArchiveReview.data.workflowState.stages.taishiPeople.status,'failed');await f.app.retryTaishiWorkflow('taishiPeople');await f.app.retryTaishiWorkflow('taishiSummary');assert(f.app.pendingArchiveReview.taishiTimeEvent);await commit(f,f.app.pendingArchiveReview);assert.equal(f.events().length,0);
});
