import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {creationConfig} from '../src/creation-config.js';
import {saveArchive,archiveSource,findArchiveObject} from '../src/archives.js';
import {archivePrompt,archiveSources,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {runTaishiWorkflow} from '../src/taishi-workflow.js';
import {taishiFillPolicy,taishiSnapshotField,taishiTableRows} from '../src/taishi-fill.js';
import {requestWithFallback,transportFailure} from '../src/api-fallback.js';
import {ModelConnection} from '../src/model.js';
import {emptyPromptLibrary,importPromptPreset} from '../src/prompt-presets.js';
import {validateState,stable} from '../src/core.js';
import {archiveInputRecord} from '../src/archive-input.js';
import {fieldSourceIndex} from '../src/archive-stale.js';
import {completeReview} from './review-response-fixture.js';
import {archiveRepairPrompt,applyArchiveRepairResponse} from '../src/archive-repair.js';

async function setup(){
 const f=fixture();await f.app.openTaishi();const state=f.store.read(),p=state.powers[f.app.powerId],c=creationConfig(p);
 const add=(name,kind,fields)=>{const d=c.records.find(r=>r.id===kind);return saveArchive(p,{name,type:kind==='world'?'environment':'record',status:'active',fields:kind==='world'?{conditions:'已确认世界'}:{description:'已确认档案'},specific:{adapterId:c.id,recordId:kind,version:c.version,label:d.label,labels:Object.fromEntries(d.fields.map(f=>[f.id,f.label])),fields}},archiveSource([],'玩家确认设定'));};
 const world=add('海蓝界','world',{overview:'群岛文明'});return {...f,state,p,c,add,world};
}
const rp=sourceIndex=>({sourceIndex,status:'reviewed',changeCount:0});
test('every Taishi entry has a source-specific fill contract and protected historical columns',async()=>{
 const f=await setup();f.ctx.chat=[{is_user:false,mes:'海蓝界正在发展。'}];
 const sources=archiveSources(f.ctx.chat,f.state,f.p,{rescan:true});
 for(const mode of ['narrative','worldbook','draft','evolution','supplement']){
  const policy=taishiFillPolicy(mode,f.c.records);assert.equal(policy.mode,mode);assert.equal(policy.tables.length,f.c.records.length);assert(policy.tables.find(t=>t.recordId==='event').kind==='history');assert.equal(policy.tables.find(t=>t.recordId==='companion').snapshotFields.includes('core_memory'),false);
 }
 const prompt=archivePrompt(f.p,sources,f.ctx.chat),input=JSON.parse(prompt.user);assert.equal(input.fillPolicy.mode,'narrative');assert.match(prompt.system,/wjwk_taishi_fill/);
 f.p.taishiAutonomy=true;
 for(const [expected,note,options]of [['worldbook','',{setupReferences:true}],['draft','新人物草案',{taishiDraft:{kind:'companion',joining:'npc'}}],['evolution','',{taishiEvolution:{worldId:f.world.id,elapsed:1,unit:'days'}}],['supplement','玩家明确补充',{}]])assert.equal(JSON.parse(archivePrompt(f.p,[],f.ctx.chat,note,options).user).fillPolicy.mode,expected);
 for(const [kind,key,allowed]of [['companion','progress',true],['companion','core_memory',false],['companion','abilities',false],['event','result',false],['growth','result',false]])assert.equal(taishiSnapshotField({specific:{adapterId:'wuku.primordial_world',recordId:kind}},'details',key),allowed);
});
test('same-name people are distinct across registered worlds and ambiguous lookup never merges them',async()=>{
 const f=await setup(),other=f.add('白塔界','world',{overview:'另一世界'});
 const a=f.add('云岚','companion',{world_id:f.world.id,world:f.world.name,profile:'海蓝灵植师'}),b=f.add('云岚','companion',{world_id:other.id,world:other.name,profile:'白塔学者'});
 assert.notEqual(a.id,b.id);assert.equal(findArchiveObject(f.p,'云岚',undefined,'companion',other.id).id,b.id);assert.throws(()=>findArchiveObject(f.p,'云岚',undefined,'companion'),/多个档案/);
 f.ctx.chat=[{is_user:false,mes:'白塔界的云岚已完成典籍整理。'}];const sources=archiveSources(f.ctx.chat,f.state,f.p,{rescan:true});
 const batch=normalizeArchiveBatch({changes:[{name:'云岚',type:'record',status:'active',recordId:'companion',fields:{description:'白塔学者'},details:{world_id:other.id,action:'已完成典籍整理'},sourceIndex:0,quote:f.ctx.chat[0].mes}]},f.p,sources,f.ctx.chat,'',f.state);
 assert.deepEqual(batch.issues,[]);assert.equal(batch.changes[0].id,b.id);assert.equal(a.specific.fields.profile,'海蓝灵植师');validateState(f.state);
});
test('stale Taishi state is ignored while an old independent memory survives and retains field-level provenance',async()=>{
 const f=await setup(),person=f.add('云岚','companion',{world_id:f.world.id,world:f.world.name,progress:'起步'});
 f.ctx.chat=[{is_user:false,mes:'海蓝界云岚修行进度60%，记住了救助村民的经历。'},{is_user:false,mes:'海蓝界云岚修行进度70%。'}];const sources=archiveSources(f.ctx.chat,f.state,f.p,{rescan:true});
 const raw=i=>({archiveId:person.id,name:person.name,type:'record',status:'active',recordId:'companion',fields:{description:'已确认档案'},details:{progress:i?'70%':'60%'},sourceIndex:i,quote:f.ctx.chat[i].mes});
 for(const i of [0,1]){const b=normalizeArchiveBatch({changes:[raw(i)]},f.p,[sources[i]],f.ctx.chat,'',f.state);assert.deepEqual(b.issues,[]);applyArchiveChanges(f.p,b.changes,[sources[i]],new Map([[0,person.id]]),f.ctx.chat);}
 const change={...raw(0),details:{progress:'60%',core_memory:'救助村民的经历'},staleFields:[{section:'details',field:'progress',reason:'已被后层70%取代'}]};
 const b=normalizeArchiveBatch({changes:[change]},f.p,[sources[0]],f.ctx.chat,'',f.state);assert.deepEqual(b.issues,[]);assert.equal(b.changes[0].specificPatch.progress,undefined);assert.equal(b.changes[0].specificPatch.core_memory,'救助村民的经历');
 applyArchiveChanges(f.p,b.changes,[sources[0]],new Map([[0,person.id]]),f.ctx.chat);const r=f.p.archives[person.id];assert.equal(r.specific.fields.progress,'70%');assert.equal(archiveInputRecord(r).fieldSourceIndexes.details.progress,1);
 change.staleFields=[{section:'details',field:'core_memory',reason:'不能丢弃历史记忆'}];const bad=normalizeArchiveBatch({changes:[change]},f.p,[sources[0]],f.ctx.chat,'',f.state);assert(bad.issues.length);assert.equal(bad.ignoredChanges.length,0);
});
test('specialist counts cannot cancel one another and concrete unresolved reasons survive merging',async()=>{
 const p={system:'fill',user:JSON.stringify({sources:[{index:0}],current:[],recordSchemas:[{id:'world',fields:[]},{id:'companion',fields:[]}]})};
 const out=await runTaishiWorkflow(p,async(_,role)=>({changes:[],floorReviews:[{sourceIndex:0,status:'reviewed',changeCount:role==='taishiWorld'?1:-1,reason:'未核对人口'}]}));
 assert.equal(out.floorReviews[0].status,'uncertain');assert.match(out.floorReviews[0].reason,/未核对人口/);assert.equal(out.workflowState.stages.taishiWorld.status,'failed');assert.equal(out.workflowState.stages.taishiSummary.attempts,0);
});
test('one uncertain floor does not erase valid acknowledgements from another floor',async()=>{
 const p={system:'fill',user:JSON.stringify({sources:[{index:0},{index:2}],current:[],recordSchemas:[]})};
 const out=await runTaishiWorkflow(p,async(_,role)=>({changes:[],floorReviews:[{sourceIndex:0,status:role==='taishiWorld'?'uncertain':'reviewed',changeCount:0,reason:'人口缺少可靠来源'},rp(2)]}),{parallel:false});
 assert.equal(out.floorReviews[0].status,'uncertain');assert.match(out.floorReviews[0].reason,/人口缺少可靠来源/);assert.equal(out.floorReviews[1].status,'reviewed');assert(out.workflowIssues.every(i=>i.sourceIndex===0));
});
test('summary failure is a warning, valid facts and floor acknowledgements can be saved immediately',async()=>{
 const f=await setup();await f.store.transact(s=>{s.powers[f.p.id]=f.p;s.powers[f.p.id].taishiWorkflow=true;});f.app.refresh();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};
 f.ctx.chat=[{is_user:false,mes:'海蓝界群岛议会已经成立。'}];let calls=0;
 f.app.model.request=async(p,{connection})=>{calls++;if(connection.task==='taishiSummary')throw Error('摘要临时失败');return completeReview(p,{changes:connection.task==='taishiWorld'?[{archiveId:f.world.id,name:f.world.name,type:'environment',status:'active',fields:{conditions:'群岛议会已经成立'},recordId:'world',details:{era:'议会时代'},sourceIndex:0,quote:f.ctx.chat[0].mes}]:[]});};
 await f.app.reviewArchives();const pending=f.app.pendingArchiveReview;assert.equal(calls,3);assert.deepEqual(pending.issues,[]);assert.equal(pending.data.workflowWarnings.length,1);assert.match(pending.message,/基础摘要/);
 await f.app.commitArchiveReview(pending,new Map([[0,f.world.id]]));assert.equal(f.store.read().powers[f.p.id].archiveReviewed[0].index,0);
});
test('actual wire retries and subsequent stage resume share one three-attempt budget',async()=>{
 const p={system:'fill',user:JSON.stringify({sources:[],recordSchemas:[]})},plan=[{settings:{mode:'custom'}}];let calls=0;
 const invoke=async(_p,role,budget)=>requestWithFallback(plan,async()=>{calls++;if(role==='taishiWorld')throw transportFailure('network','断线');return {changes:[],floorReviews:[]};},{retryDelays:[1,1],wait:async()=>{},maxAttempts:budget.remainingAttempts,onAttempt:c=>{if(c.attempt>1)budget.onExtraAttempt();}});
 const out=await runTaishiWorkflow(p,invoke,{parallel:false});assert.equal(out.workflowState.stages.taishiWorld.attempts,3);assert.equal(calls,4);
 await assert.rejects(runTaishiWorkflow(p,invoke,{resume:out.workflowState,retryRole:'taishiWorld'}),/上限/);assert.equal(calls,4);
});
test('advanced task presets are applied to each real model request without replacing the fill input',async()=>{
 const lib=emptyPromptLibrary(),seen=[];
 for(const role of ['taishiWorld','taishiPeople','taishiSummary']){const p=importPromptPreset(JSON.stringify({prompts:[{identifier:'prefix',content:'PRESET_'+role,role:'system'}]}));lib.presets.push(p);lib.routes[role]=p.id;}
 const settings={mode:'custom',baseUrl:'https://model.test/v1',model:'test',promptPresetLibrary:lib};
 const model=new ModelConnection({settings:()=>settings,getKey:()=>'',fetchImpl:async(_url,opts)=>{const b=JSON.parse(opts.body);seen.push(b);return {ok:true,status:200,json:async()=>({choices:[{message:{content:seen.length===3?'\u007b"message":"候选摘要"\u007d':'\u007b"changes":[],"floorReviews":[]\u007d'}}]})};}});
 const p={system:'FILL_CONTRACT',user:JSON.stringify({sources:[],current:[],recordSchemas:[]})};
 await runTaishiWorkflow(p,async(prompt,role)=>JSON.parse(await model.request(prompt,{connection:{task:role,settings}})),{parallel:false});
 assert.equal(seen.length,3);for(let i=0;i<3;i++)assert(seen[i].messages.some(m=>m.content==='PRESET_'+['taishiWorld','taishiPeople','taishiSummary'][i]));assert(seen[0].messages.some(m=>m.content.includes('FILL_CONTRACT')));
});
test('table and current overview are projections of one archive and do not reveal embedded source documents',async()=>{
 const f=await setup();f.world.specific.fields.source_profile='PRIVATE_REFERENCE';const before=stable(f.p),rows=taishiTableRows([f.world]);assert(!JSON.stringify(rows).includes('PRIVATE_REFERENCE'));assert.equal(rows[0].facts.find(f=>f.id==='overview').value,'群岛文明');assert.equal(stable(f.p),before);
 f.world.specific.fields.overview='议会文明';assert.equal(taishiTableRows([f.world])[0].facts.find(f=>f.id==='overview').value,'议会文明');
});
test('adopted development linked to a story-time floor never masquerades as extracted narrative evidence',async()=>{
 const f=await setup();f.world.source={type:'story',anchor:{index:8},note:'玩家采用正文历时的发展候选（AI创作）'};
 assert.equal(taishiTableRows([f.world])[0].source,'已采用发展候选');assert.equal(fieldSourceIndex(f.world,'details','overview'),null);
});
test('repair carries the same source contract and releases only actually corrected held values',async()=>{
 const f=await setup(),raw={archiveId:f.world.id,name:f.world.name,type:'environment',status:'active',recordId:'world',fields:{conditions:'矛盾旧值'},details:{overview:'旧概况'},sourceIndex:-1,uncertainFields:[{section:'fields',field:'conditions',reason:'与当前记录不一致'}]};
 const pending={data:{changes:[raw],floorReviews:[]},issues:[{kind:'成果',index:0,reason:'字段冲突'}],sources:[],playerNote:'玩家补充议会时代'};
 const input=JSON.parse(archiveRepairPrompt(pending,f.p,null).user);assert.equal(input.fillPolicy.mode,'supplement');assert.equal(input.current[0].archiveId,f.world.id);
 const repair=fields=>applyArchiveRepairResponse(pending,{repairs:[{index:0,fields,details:{overview:'旧概况'}}]},f.p).data.changes[0];
 assert(repair({conditions:'矛盾旧值'}).uncertainFields);assert.equal(repair({conditions:'玩家补充议会时代'}).uncertainFields,undefined);assert.equal(repair({}).uncertainFields,undefined);assert.equal(raw.fields.conditions,'矛盾旧值');
});
