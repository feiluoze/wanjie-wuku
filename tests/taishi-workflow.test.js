import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runTaishiWorkflow} from '../src/taishi-workflow.js';
import {fixture} from './mvu-fixture.js';
import {builtinTaishiEntry,builtinEntries,upgradeBuiltinPower,builtinPowerId} from '../src/builtin-worldbook.js';
import {createPower,clone,validateState} from '../src/core.js';
import {isTaishi} from '../src/taishi.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {managementProfile} from '../src/management-profiles.js';
import {creationConfig} from '../src/creation-config.js';

const row=(recordId='world')=>({name:recordId==='world'?'海蓝界':'云岚',type:recordId==='world'?'environment':'member',status:'active',fields:recordId==='world'?{conditions:'海洋世界'}:{role:'灵植师'},recordId,details:recordId==='world'?{overview:'群岛文明'}:{profile:'沉稳'},sourceIndex:0,quote:recordId==='world'?'太始天已纳入海蓝界。':'云岚已正式加入太始天。'});
const prompt={system:'核对剧情',user:JSON.stringify({current:[],recordSchemas:[{id:'world'},{id:'companion'}]})};
async function setup(advanced=false){const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};f.ctx.chat[0].mes='太始天已纳入海蓝界。云岚已正式加入太始天。';if(advanced)await f.store.transact(s=>s.powers[f.app.powerId].taishiWorkflow=true);return f;}

test('latest full author rule is used directly by the dedicated module',()=>{
 const body=readFileSync(new URL('../data/taishi-rules.txt',import.meta.url),'utf8');
 const latest=builtinTaishiEntry();assert.equal(latest.content,body);assert.match(body,/【天地归主】/);
 const p=createPower(latest);assert.equal(isTaishi(p),true);assert.equal(managementProfile(p).match,'exact');
 assert.equal(creationConfig(p).id,'wuku.primordial_world');assert(creationConfig(p).operations.every(o=>body.includes(o.ruleQuote)));
});

test('two specialists overlap; summary cannot replace candidates or add rewards',async()=>{
  let active=0,peak=0;const calls=[];
  const result=await runTaishiWorkflow(prompt,async(p,role)=>{calls.push(role);if(role==='taishiSummary')return {message:'两项待确认',changes:[row()],terminalResults:[{}]};active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return {changes:[row(role==='taishiWorld'?'world':'companion')]};});
  assert.equal(peak,2);assert.equal(calls.length,3);assert.equal(result.changes.length,2);assert(!result.terminalResults);assert.equal(result.message,'两项待确认');
});

test('host serialization and partial failure retain good candidates, skip summary and never retry',async()=>{
  let active=0,peak=0;const calls=[];
  const result=await runTaishiWorkflow(prompt,async(p,role)=>{calls.push(role);active++;peak=Math.max(peak,active);await Promise.resolve();active--;if(role==='taishiPeople')throw Error('人物超时');return {changes:[row()]};},{parallel:false});
  assert.equal(peak,1);assert.deepEqual(calls,['taishiWorld','taishiPeople']);assert.equal(result.changes.length,1);assert(result.workflowIssues.some(i=>i.role==='taishiPeople'));assert.equal(result.workflowState.stages.taishiSummary.status,'pending');
});

test('cross-specialist writes are rejected and cancelled late returns never produce candidates',async()=>{
  const result=await runTaishiWorkflow(prompt,async()=>({changes:[row()]}));
  assert.equal(result.changes.length,1);assert.equal(result.workflowIssues[0].kind,'专职范围');
  const controller=new AbortController();let release;const gate=new Promise(r=>release=r);let calls=0;
  const work=runTaishiWorkflow(prompt,async()=>{calls++;await gate;return {changes:[]};},{signal:controller.signal});
  controller.abort();release();await assert.rejects(work,{name:'AbortError'});assert.equal(calls,2);
});

test('basic defaults to one request; opt-in uses three and saves once through existing review queue',async()=>{
  for(const advanced of [false,true]){
    const f=await setup(advanced);const calls=[];const before=clone(f.store.read());
    f.app.model.request=async(p,{connection})=>{calls.push(connection.task);return JSON.stringify(connection.task==='taishiSummary'?{message:'汇总'}:{changes:[row(connection.task==='taishiPeople'?'companion':'world')]});};
    await f.app.reviewArchives();assert.equal(calls.length,advanced?3:1);assert.deepEqual(f.store.read(),before);
    const pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,advanced?2:1);
    await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,i)=>[i,c.id])));
    const state=f.store.read();validateState(state);assert.equal(Object.keys(state.powers[f.app.powerId].archives).length,advanced?2:1);
  }
});

test('partial specialist failure does not advance reading progress',async()=>{
  const f=await setup(true);let calls=0;
  f.app.model.request=async(p,{connection})=>{calls++;if(connection.task==='taishiPeople')throw Error('人物失败');return JSON.stringify({changes:[row()]});};
  await f.app.reviewArchives();const pending=f.app.pendingArchiveReview;
  assert.equal(calls,2);assert.equal(pending.changes.length,1);assert(pending.blockedFloors.includes(0));
  await f.app.commitArchiveReview(pending,new Map([[0,null]]));assert.equal(f.store.read().powers[f.app.powerId].archiveReviewed.length,0);
});

test('changing state while specialist is running discards stale results, and work is deduplicated',async()=>{
  const f=await setup(true);let release,calls=0;f.app.model.request=()=>{calls++;return new Promise(r=>release=r);};
  const a=f.app.reviewArchives(),job=f.app.archiveReviewJob,b=f.app.reviewArchives();assert.equal(f.app.archiveReviewJob,job);const outcomes=Promise.allSettled([a,b]);
  await new Promise(r=>setTimeout(r,0));await f.store.transact(s=>s.powers[f.app.powerId].taishiWorkflow=false);
  release(JSON.stringify({changes:[]}));assert((await outcomes).every(r=>r.status==='rejected'));assert.equal(calls,1);assert(!f.app.pendingArchiveReview);assert(!f.app.busy);
});

test('advanced opt-in persists per chat and rejects a stale configuration form',async()=>{
  const f=await setup();f.app.ui.showTaishiAdvanced=()=>{};f.app.openTaishiAdvanced();
  await f.app.saveTaishiWorkflow({workflow:'on'});assert.equal(f.store.read().powers[f.app.powerId].taishiWorkflow,true);
  f.app.openTaishiAdvanced();await f.store.transact(s=>s.powers[f.app.powerId].active=false);
  await assert.rejects(f.app.saveTaishiWorkflow({}));assert.equal(f.store.read().powers[f.app.powerId].taishiWorkflow,true);
});
