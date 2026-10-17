import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';import {mergeRepairedResponse,repairRawResponseLocally} from '../src/archive-response-repair.js';import {completeReview} from './review-response-fixture.js';
const data=(sourceIndex=-1)=>({changes:['成果甲','成果乙'].map(name=>({name,type:'record',status:'active',sourceIndex,fields:{description:name+'已经建立。'},quote:'成果甲已经建立，成果乙已经建立。',ruleQuote:'原始规则依据'})),floorReviews:sourceIndex<0?[]:[{sourceIndex,status:'reviewed',changeCount:2}],message:'只修格式'});
const broken=value=>JSON.stringify(value).replace(',"ruleQuote":"原始规则依据"','},"ruleQuote":"原始规则依据"');
const pending=raw=>({sources:[],data:{changes:[],floorReviews:[],rawFailures:[{raw,sourceIndexes:[-1]}],historyIssues:[]}});
test('premature object close cannot hide the second candidate from identity validation',()=>{
 const value=data(),p=pending(broken(value)),before=JSON.stringify(p);assert.throws(()=>JSON.parse(p.data.rawFailures[0].raw));const out=mergeRepairedResponse(p,{responses:[{index:0,data:value}]},{archives:{}});assert.equal(out.data.changes.length,2);assert.equal(JSON.stringify(p),before);
 const local=repairRawResponseLocally(p,{archives:{}});assert.deepEqual(local.data.changes,value.changes);assert.equal(local.data.rawFailures.length,0);
});
test('missing object close and escaped punctuation still preserve exact two-item identity inventory',()=>{
 const value=data();value.changes[0].fields.description='括号 } ] { [ 与转义引号 "name":"非成果" 都是正文。';
 const raw=JSON.stringify(value).replace('},{"name":"成果乙"',',{"name":"成果乙"');assert.throws(()=>JSON.parse(raw));const p=pending(raw);assert.equal(mergeRepairedResponse(p,{responses:[{index:0,data:value}]},{archives:{}}).data.changes.length,2);
});
test('new names, missing second record, duplicate replacement, new IDs and foreign floors remain rejected',()=>{
 const value=data(),p=pending(broken(value));
 for(const mutate of [v=>v.changes[1].name='新增成果',v=>v.changes.pop(),v=>v.changes[1].name='成果甲',v=>v.changes[1].archiveId='existing-but-not-original',v=>v.changes[1].sourceIndex=9]){
  const v=structuredClone(value);mutate(v);assert.throws(()=>mergeRepairedResponse(p,{responses:[{index:0,data:v}]},{archives:{'existing-but-not-original':{name:'成果乙'}}}));
 }
 assert.equal(p.data.rawFailures.length,1);
});
test('unclosed arrays and unrelated malformed data do not trigger local fact completion',()=>{
 const p=pending('{"changes":[{"name":"成果甲"');assert.equal(repairRawResponseLocally(p,{archives:{}}),null);assert.throws(()=>mergeRepairedResponse(p,{responses:[{index:0,data:data()}]},{archives:{}}),/边界不完整/);
 const malformed=pending(JSON.stringify(data()).slice(0,-2));assert.equal(repairRawResponseLocally(malformed,{archives:{}}),null);
});
test('local syntax recovery previews two records with no extra model call and confirmation persists them',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};let calls=0;f.app.model.request=async()=>{calls++;return broken(data());};
 await f.app.reviewArchives({supplement:true,values:{playerNote:'玩家确认成果甲和成果乙已经建立'}});const p=f.app.pendingArchiveReview;assert.equal(p.data.rawFailures.length,1);
 f.app.model.request=async()=>{throw Error('不应发出模型请求');};await f.app.repairArchiveWithAI();assert.equal(calls,1);assert.equal(p.changes.length,2);assert.equal(p.issues.length,0);assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,0);
 await f.app.commitArchiveReview(p,new Map([[0,null],[1,null]]));assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,2);
});
test('local recovery leaves unexecuted history floors blocked',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};f.ctx.chat.push({is_user:false,mes:'成果甲已经建立，成果乙已经建立。'},{is_user:false,mes:'后续未经检查的正文。'});let calls=0;
 f.app.model.request=async prompt=>++calls===1?completeReview(prompt):broken(data(1));await f.app.reviewArchives({rescan:true});const p=f.app.pendingArchiveReview;assert.equal(calls,2);assert(p.blockedFloors.includes(2));
 f.app.model.request=async()=>{throw Error('不应重新调用模型');};await f.app.repairArchiveWithAI();assert.equal(calls,2);assert.equal(p.changes.length,2);assert(!p.blockedFloors.includes(1));assert(p.blockedFloors.includes(2));assert(p.issues.some(i=>i.kind==='分层请求'&&i.sourceIndex===2));
});
