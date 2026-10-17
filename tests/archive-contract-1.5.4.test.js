import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';import {hash,stable} from '../src/core.js';import {archivePrompt} from '../src/archive-review.js';import {archiveFormatOptions,wireArchiveRecord} from '../src/archive-contract.js';import {encodeCheckpoint,decodeCheckpoint} from '../src/review-checkpoint.js';
import {mergeRepairedResponse} from '../src/archive-response-repair.js';import {ModelConnection} from '../src/model.js';import {WorkbenchUI} from '../src/ui.js';
const row={name:'成果甲',type:'record',status:'active',fields:{description:'玩家确认成果甲已建立'},sourceIndex:-1};
const bad='{"changes":[{"name":"成果甲","type":"record","status":"active","fields":{"description":"玩家确认成果甲已建立"},"sourceIndex":-1}],"message":"broken';
test('wire uses one canonical identity and dedicated field shape, leaving stored records untouched',()=>{
 const r={id:'a',type:'record',name:'甲',fields:{description:'事实'},specific:{adapterId:'adapter',recordId:'points',fields:{balance:'85'}}},before=JSON.stringify(r),out=wireArchiveRecord(r);assert.equal(out.archiveId,'a');assert.equal(out.recordId,'points');assert.equal(out.details.balance,'85');assert(!out.specific);assert(!out.id);assert.equal(JSON.stringify(r),before);
 const f=fixture(),prompt=archivePrompt(f.power,[],f.ctx.chat,'玩家确认事实');assert.equal(prompt.databasePromptTrial,false);assert(!prompt.messages);assert(prompt.archiveSchema.properties.changes);assert.equal(prompt.archiveSchema.additionalProperties,false);
 const variants=prompt.archiveSchema.properties.changes.items.anyOf;assert(variants.every(v=>!v.properties.details));assert(variants.every(v=>!v.properties.specific));
});
test('provider format is opt-in except verified official endpoint; custom parameter remains authoritative',async()=>{
 const schema={type:'object'},prompt={system:'JSON',user:'facts',archiveSchema:schema};assert.deepEqual(archiveFormatOptions({baseUrl:'https://relay.test',archiveOutputMode:'auto'},prompt),{});assert.equal(archiveFormatOptions({baseUrl:'https://api.deepseek.com/v1'},prompt).response_format.type,'json_object');assert.equal(archiveFormatOptions({archiveOutputMode:'schema'},prompt).response_format.json_schema.schema,schema);assert.deepEqual(archiveFormatOptions({archiveOutputMode:'json'},{}),{});
 let body;const m=new ModelConnection({settings:()=>({mode:'custom',model:'fixture',baseUrl:'https://relay.test/v1',archiveOutputMode:'schema',customParameters:'{"response_format":{"type":"json_object"}}'}),getKey:()=>'',fetchImpl:async(_url,o)=>{body=JSON.parse(o.body);return {ok:true,status:200,json:async()=>({choices:[{message:{content:'{}'},finish_reason:'stop'}]})};}});await m.request(prompt);assert.equal(body.response_format.type,'json_object');
});
test('syntax failure survives refresh; explicit AI repair sends original reply, not entire archive, then validates before saving',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};let calls=0;f.app.model.request=async()=>{calls++;return bad;};
 await f.app.reviewArchives({supplement:true,values:{playerNote:'玩家确认成果甲已建立'}});const pending=f.app.pendingArchiveReview;assert.equal(calls,1);assert.equal(pending.changes.length,0);assert.equal(pending.data.rawFailures[0].raw,bad);assert(pending.checkpointSaved);
 const restored=decodeCheckpoint(encodeCheckpoint(pending,null),f.app.contextSnapshot());assert(restored.data.rawFailures[0].raw===bad);
 f.app.model.request=async p=>{calls++;assert(p.system.includes('JSON格式修复员'));assert.equal(JSON.parse(p.user).failed[0].raw,bad);assert(!JSON.parse(p.user).rules);return JSON.stringify({responses:[{index:0,data:{changes:[row],floorReviews:[],message:'只修格式'}}]});};
 await f.app.repairArchiveWithAI();assert.equal(calls,2);assert.equal(pending.data.rawFailures.length,0);assert.equal(pending.issues.length,0,JSON.stringify(pending.issues));assert.equal(pending.changes.length,1);assert.equal(Object.keys(f.store.read().powers[f.power.id].archives||{}).length,0);
 await f.app.commitArchiveReview(pending,new Map([[0,null]]));assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,1);
});
test('format repair cannot add names, new source floors, fake IDs, or settlement commands',()=>{
 const f=fixture(),pending={data:{changes:[],rawFailures:[{raw:bad,sourceIndexes:[-1]}],floorReviews:[]}};
 for(const change of [{...row,name:'新增对象'},{...row,sourceIndex:9},{...row,archiveId:'fake'}])assert.throws(()=>mergeRepairedResponse(pending,{responses:[{index:0,data:{changes:[change],floorReviews:[]}}]},f.power));
 assert.throws(()=>mergeRepairedResponse(pending,{responses:[{index:0,data:{changes:[row],floorReviews:[],operations:[]}}]},f.power));assert.equal(pending.data.rawFailures.length,1);
});
test('failed or unresolved format repair keeps original bytes and never schedules another model call',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};f.app.model.request=async()=>bad;await f.app.reviewArchives({supplement:true,values:{playerNote:'玩家确认成果甲已建立'}});const pending=f.app.pendingArchiveReview,old=JSON.stringify(pending.data);let calls=0;
 f.app.model.request=async()=>{calls++;return JSON.stringify({responses:[],message:'无法无损恢复'});};await f.app.repairArchiveWithAI();assert.equal(calls,1);assert.equal(JSON.stringify(pending.data),old);
 f.app.model.request=async()=>{calls++;return 'broken again';};await assert.rejects(f.app.repairArchiveWithAI());assert.equal(calls,2);assert.equal(JSON.stringify(pending.data),old);
});
test('format repair button is shown for raw failures without requiring players to edit JSON',()=>{
 const ui=Object.create(WorkbenchUI.prototype);let html='';ui.dialog=(_title,body)=>html=body;ui.showArchiveReview({data:{changes:[],rawFailures:[{raw:bad}]},issues:[{kind:'分层请求',name:'格式',reason:'失败'}],changes:[],sources:[],readOnly:true},{name:'测试',archives:{}},[]);assert(html.includes('repair-archive-ai'));assert(html.includes('消耗 API'));
});
import {completeReview} from './review-response-fixture.js';
test('layered reply failure preserves earlier floor and unexecuted floors; repair cannot advance the unexecuted tail',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};f.ctx.chat.push({is_user:false,mes:'成果甲已经建立。'},{is_user:false,mes:'后续正文未检查。'});let calls=0;
 const repairedRow={...row,sourceIndex:1,quote:'成果甲已经建立。'};
 f.app.model.request=async p=>{calls++;return calls===1?completeReview(p):JSON.stringify({changes:[repairedRow]}).slice(0,-1);};
 await f.app.reviewArchives({rescan:true});const pending=f.app.pendingArchiveReview;assert.equal(calls,2);assert.equal(pending.data.rawFailures.length,1);assert(pending.blockedFloors.includes(2));
 f.app.model.request=async()=>{calls++;return JSON.stringify({responses:[{index:0,data:{changes:[repairedRow],floorReviews:[{sourceIndex:1,status:'reviewed',changeCount:1}],message:'本段修复'}}]});};
 await f.app.repairArchiveWithAI();assert.equal(calls,3);assert.equal(pending.changes.length,1);assert(pending.blockedFloors.includes(2));assert(!pending.blockedFloors.includes(1));assert(pending.issues.some(i=>i.kind==='分层请求'&&i.sourceIndex===2));
 await f.app.commitArchiveReview(pending,new Map([[0,null]]));const reviewed=f.store.read().powers[f.power.id].archiveReviewed;assert(reviewed.some(r=>r.index===1));assert(!reviewed.some(r=>r.index===2));
});

test('compatible 1.5.3 pending previews survive upgrade without relaxing capture checks',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};f.app.model.request=async()=>JSON.stringify({changes:[row]});await f.app.reviewArchives({supplement:true,values:{playerNote:'玩家确认成果甲已建立'}});
 const envelope=JSON.parse(encodeCheckpoint(f.app.pendingArchiveReview,null));envelope.payload.version='1.5.3';envelope.digest=hash(stable(envelope.payload));const snapshot=f.app.contextSnapshot();const restored=decodeCheckpoint(JSON.stringify(envelope),snapshot);assert(restored.protocolUpgraded);assert.equal(restored.changes.length,1);
 const stale={...snapshot,state:{...snapshot.state,revision:snapshot.state.revision+1}};assert.equal(decodeCheckpoint(JSON.stringify(envelope),stale),null);
});
