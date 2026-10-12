import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {createPower,emptyState,stable} from '../src/core.js';
import {MMLC_ENTRY} from '../src/mmlc.js';
import {archivePrompt,archiveSources,normalizeArchiveBatch} from '../src/archive-review.js';
import {archivePreset,archiveSummaryPreset,ARCHIVE_PRESET_ID,archiveScopePolicy} from '../src/archive-preset.js';
import {floorCoverage} from '../src/archive-protocol.js';
import {runTaishiWorkflow} from '../src/taishi-workflow.js';
import {creationConfig} from '../src/creation-config.js';

test('ordinary preset routes instructions to system and keeps private source data only in the user payload',()=>{
 const f=fixture();f.power.rules+='\nPRIVATE_RULE_MARKER';f.ctx.chat=[{is_user:false,mes:'PRIVATE_STORY_MARKER<WJWK-settle>本轮收益：工具已交付\n状态变化：学徒 -> 熟练\n后续机会：可选择远行</WJWK-settle><WJWK-status>技能：熟练</WJWK-status>'}];
 const before=stable(f.power),sources=archiveSources(f.ctx.chat,f.state,f.power,{rescan:true}),prompt=archivePrompt(f.power,sources,f.ctx.chat),input=JSON.parse(prompt.user);
 assert.equal(input.preset.id,ARCHIVE_PRESET_ID);assert.equal(input.preset.mode,'narrative');
 assert.deepEqual(input.preset.groups.slice(0,3),['wjwk_role','wjwk_task','wjwk_background']);assert(prompt.system.indexOf('<wjwk_procedure>')<prompt.system.indexOf('<wjwk_output>'));
 assert.doesNotMatch(prompt.system,/PRIVATE_RULE_MARKER|PRIVATE_STORY_MARKER/);assert.match(input.sources[0].settlements[0].facts,/工具已交付/);assert.doesNotMatch(input.sources[0].settlements[0].facts,/远行/);assert.match(input.sources[0].settlements[0].opportunities,/远行/);assert.deepEqual(input.sources[0].statusSnapshots,['技能：熟练']);
 assert(input.responseContract.outputs.includes('floorReviews'));assert(!input.responseContract.outputs.includes('terminalResults'));assert.equal(stable(f.power),before);
});

test('declared generic response can retain multiple achievement types without extra invented keys',()=>{
 const f=fixture();f.ctx.chat=[{is_user:false,mes:'<WJWK-settle>本轮收益：木桥已建成；种植技艺已熟练；互助约定已成立。\n后续机会：可以远行</WJWK-settle>'}];
 const sources=archiveSources(f.ctx.chat,f.state,f.power,{rescan:true}),input=JSON.parse(archivePrompt(f.power,sources,f.ctx.chat).user);
 const changes=[{type:'facility',name:'木桥',fields:{purpose:'通行'}},{type:'skill',name:'种植技艺',fields:{level:'熟练'}},{type:'bond',name:'互助约定',fields:{terms:'互助'}}].map(r=>({...r,status:'active',ownerPowerId:f.power.id,sourceIndex:0}));
 for(const row of changes)assert(Object.keys(row).every(k=>[...input.responseContract.changes.required,...input.responseContract.changes.optional].includes(k)));
 const data={changes,floorReviews:[{sourceIndex:0,status:'reviewed',changeCount:3}]},batch=normalizeArchiveBatch(data,f.power,sources,f.ctx.chat,'',f.state);
 assert.equal(batch.issues.length,0);assert.equal(batch.changes.length,3);assert.equal(floorCoverage(data,sources,batch.changes)[0].status,'reviewed');
});

test('MMLC preset exposes module and dedicated field contract accepted by the real normalizer',()=>{
 const power=createPower(MMLC_ENTRY),state=emptyState();state.powers[power.id]=power;
 const chat=[{is_user:false,mes:'新丹炉已交付，运行正常。'}],sources=archiveSources(chat,state,power,{rescan:true}),prompt=archivePrompt(power,sources,chat,'',{state}),input=JSON.parse(prompt.user);
 assert.equal(input.moduleKind,'mmlc');assert(input.responseContract.changes.optional.includes('module'));assert(!input.responseContract.outputs.includes('guide'));
 const record=input.recordSchemas.find(r=>r.id==='items'),field=record.fields.find(f=>f.id!=='source_profile');
 const raw={type:'record',name:'新丹炉',status:'active',module:'items',recordId:record.id,details:{[field.id]:'运行正常'},fields:{description:'已交付，运行正常'},sourceIndex:0};
 const batch=normalizeArchiveBatch({changes:[raw]},power,sources,chat,'',state);assert.equal(batch.issues.length,0);assert.equal(batch.changes[0].specific.recordId,'items');
});

test('only activated order and design tasks advertise their output arrays',()=>{
 const f=fixture(),base=JSON.parse(archivePrompt(f.power,[],[]).user);
 assert(!base.responseContract.outputs.includes('terminalResults'));assert(!base.responseContract.outputs.includes('creationResults'));
 const active=archivePrompt(f.power,[],[],'',{terminalOrders:[{id:'order'}],creationItems:[{id:'design'}]}),input=JSON.parse(active.user);
 assert(input.responseContract.outputs.includes('terminalResults'));assert(input.responseContract.outputs.includes('creationResults'));assert.match(active.system,/<wjwk_orders>/);assert.match(active.system,/<wjwk_designs>/);
 const note=archivePrompt(f.power,[],[],'已有设施已修复',{terminalOrders:[{id:'order'}],creationItems:[{id:'design'}]});
 const manual=JSON.parse(note.user);assert.equal(manual.taskMode,'supplement');assert(!manual.responseContract.outputs.includes('terminalResults'));assert.doesNotMatch(note.system,/<wjwk_orders>|<wjwk_designs>/);
});

test('Taishi worldbook, draft and evolution use separate procedures without narrative-only extraction constraints',async()=>{
 const f=fixture();await f.app.openTaishi();const power=f.store.read().powers[f.app.powerId];power.taishiAutonomy=true;
 power.archives.world={id:'world',name:'海蓝界',type:'environment',specific:{recordId:'world',fields:{}}};
 const cases=[['worldbook',{setupReferences:true}],['draft',{taishiDraft:{kind:'companion',joining:'npc'}}],['evolution',{taishiEvolution:{worldId:'world',elapsed:1,unit:'years'}}]];
 for(const [mode,options] of cases){
  const prompt=archivePrompt(power,[],[],'玩家确认本次任务',options),input=JSON.parse(prompt.user);
  assert.equal(input.taskMode,mode);assert.equal(input.preset.mode,mode);assert.deepEqual(input.responseContract.outputs,['changes','floorReviews','message']);assert.doesNotMatch(prompt.system,/插件只归档已有事实，不执行结算/);assert.doesNotMatch(input.readingPolicy,/settlements.facts 是本轮/);
  assert.equal(input.responseContract.changes.optional.includes('settingRefs'),mode==='worldbook');
 }
});

test('specialist preset limits schemas and outputs and retains region, organization and event ownership',async()=>{
 const f=fixture();await f.app.openTaishi();const power=f.store.read().powers[f.app.powerId];
 const prompt=archivePrompt(power,[],[]);let worldIds,peopleIds;
 const result=await runTaishiWorkflow(prompt,async(p,role)=>{
  const input=JSON.parse(p.user);
  if(role==='taishiSummary'){assert.match(p.system,/<wjwk_output>/);assert(!('rules' in input));return {message:'暂无新增'};}
  assert.deepEqual(input.responseContract.outputs,['changes','floorReviews','message']);assert.equal(input.explainRules,false);assert.match(p.system,/<wjwk_specialist>/);
  if(role==='taishiWorld')worldIds=input.recordSchemas.map(r=>r.id);else peopleIds=input.recordSchemas.map(r=>r.id);
  assert.deepEqual(input.specialist.recordIds,input.recordSchemas.map(r=>r.id));return {changes:[],floorReviews:[]};
 });
 for(const id of ['region','organization','event']){assert(creationConfig(power).records.some(r=>r.id===id));assert(worldIds.includes(id));}
 assert(!worldIds.includes('companion'));assert.deepEqual(peopleIds,['companion']);assert.equal(result.workflowIssues.length,0);
});

test('task preset activates no extra calls or provider-specific roleplay and summary cannot claim persistence',()=>{
 const preset=archivePreset({taskMode:'narrative',explainRules:false});assert.doesNotMatch(preset.system,/<wjwk_guide>|VOID|3000字|预填充|EJS|RFC 6902/);
 const prompt=archiveSummaryPreset([{name:'原始候选'}],['有未解决问题']),input=JSON.parse(prompt.user);assert.equal(input.preset.mode,'summary');assert.deepEqual(input.changes,[{name:'原始候选'}]);assert.match(prompt.system,/未保存时不能声称已写入/);
});


test('generic mechanism scope precedes extraction and does not treat storage categories as ownership',()=>{
 const f=fixture();f.power.rules='每日记录一次成功交付的情报。';
 f.ctx.chat=[{is_user:false,mes:'<WJWK-settle>本轮收益：普通学习掌握语言；在另一能力的空间整理工具；每日情报已成功交付。\n后续机会：可以练习</WJWK-settle>'}];
 const sources=archiveSources(f.ctx.chat,f.state,f.power,{rescan:true}),prompt=archivePrompt(f.power,sources,f.ctx.chat),input=JSON.parse(prompt.user);
 assert.equal(input.scopePolicy.kind,'power-mechanism');
 assert.match(prompt.system,/不整理角色全部经历/);
 assert.match(prompt.system,/一份回执可含多个词条/);
 assert.match(prompt.system,/只写ownerPowerId也不证明归属/);
 assert.match(prompt.system,/分类缺失与归属缺失是两回事/);
 assert.match(prompt.system,/不要求玩家亲自获得收益/);
 assert.match(prompt.system,/已确认在本任务范围内/);
 assert(prompt.system.indexOf('<wjwk_scope>')<prompt.system.indexOf('<wjwk_procedure>'));
 // Preserve evidence for the model to distinguish ordinary skill/tool use from actual receipt.
 assert.match(input.sources[0].settlements[0].facts,/普通学习掌握语言/);
 assert.match(input.sources[0].settlements[0].facts,/每日情报已成功交付/);
 assert.doesNotMatch(input.sources[0].settlements[0].facts,/可以练习/);
 assert.match(prompt.system,/不按语言、空间等名称设置黑名单/);
 assert.match(prompt.system,/只输出实际变化的字段/);
});

test('scope contracts preserve world state, cultivation assets and explicit non-story tasks',()=>{
 assert.equal(archiveScopePolicy({moduleKind:'taishi'}).kind,'world-state');
 assert.match(archiveScopePolicy({moduleKind:'taishi'}).boundary,/不要求每条世界事实都由金手指触发/);
 assert.equal(archiveScopePolicy({moduleKind:'mmlc'}).kind,'cultivation-state');
 assert.match(archiveScopePolicy({moduleKind:'mmlc'}).boundary,/道场、设施、物资/);
 for(const taskMode of ['supplement','worldbook','draft','evolution']){
  const payload={taskMode,moduleKind:'wuku'};
  assert.equal(archiveScopePolicy(payload).kind,taskMode);
  assert.doesNotMatch(archivePreset(payload).system,/<wjwk_scope>/);
 }
});
