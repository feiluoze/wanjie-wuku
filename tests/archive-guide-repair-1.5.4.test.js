import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {mergeRepairedResponse,responseRepairPrompt} from '../src/archive-response-repair.js';
import {normalizePlayerGuide} from '../src/player-guide.js';
const guideFor=power=>({summary:'规则中的能力说明。',abilities:Array.from({length:7},(_,i)=>({name:'能力'+i,description:'原有能力方向'+i,ruleQuote:power.rules.slice(0,16)}))});
function sample(power){
 const guide=guideFor(power),data={changes:[],floorReviews:[],message:'本层无成果',guide};
 const raw=JSON.stringify(data).replace('},{"name":"能力1"','},"name":"能力1"');
 return {data,raw,pending:{sources:[],data:{changes:[],rawFailures:[{raw,sourceIndexes:[-1],contract:{type:'object',properties:{changes:{type:'array'},floorReviews:{type:'array'},message:{type:'string'},guide:{type:'object'}}}}],floorReviews:[]}}};
}
test('seven original guide abilities survive format repair without becoming archive objects',()=>{
 const f=fixture(),s=sample(f.power);assert.throws(()=>JSON.parse(s.raw));
 const before=JSON.stringify(s.pending),out=mergeRepairedResponse(s.pending,{responses:[{index:0,data:s.data}]},f.power);
 assert.equal(out.data.changes.length,0);assert.equal(out.data.guide.abilities.length,7);assert.equal(out.data.rawFailures.length,0);assert.equal(JSON.stringify(s.pending),before);
 assert(JSON.parse(responseRepairPrompt(s.pending,f.power).user).allowedOutputs.includes('guide'));
});
test('repair rejects unrequested guides, omitted abilities, new names, fake quotes and settlement commands',()=>{
 const f=fixture();
 for(const mutate of [s=>delete s.pending.data.rawFailures[0].contract.properties.guide,s=>delete s.data.guide,s=>s.data.guide.abilities.pop(),s=>s.data.guide.abilities[0].name='新增能力',s=>s.data.guide.abilities[0].ruleQuote='不在规则中的任意引用',s=>s.data.guide.abilities[0].description='擅自改写的效果',s=>s.data.terminalResults=[]]){
  const s=sample(f.power);mutate(s);const before=JSON.stringify(s.pending);assert.throws(()=>mergeRepairedResponse(s.pending,{responses:[{index:0,data:s.data}]},f.power));assert.equal(JSON.stringify(s.pending),before);
 }
 const s=sample(f.power);s.data.changes=[{name:'能力0',sourceIndex:-1}];assert.throws(()=>mergeRepairedResponse(s.pending,{responses:[{index:0,data:s.data}]},f.power),/新增或更名/);
});
test('repaired guide is previewed then persisted only on explicit confirmation',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};const s=sample(f.power);let calls=0;
 f.app.model.request=async()=>{calls++;return s.raw;};
 await f.app.reviewArchives({supplement:true,values:{playerNote:'玩家确认当前尚无新增成果'}});
 const pending=f.app.pendingArchiveReview;assert.equal(pending.data.rawFailures.length,1);
 f.app.model.request=async()=>{calls++;return JSON.stringify({responses:[{index:0,data:s.data}]});};
 await f.app.repairArchiveWithAI();assert.equal(calls,2);assert.equal(pending.guide.abilities.length,7);assert.equal(pending.issues.length,0,JSON.stringify(pending.issues));assert.equal(pending.readOnly,false);assert(!f.store.read().powers[f.power.id].playerGuide);
 await f.app.commitArchiveReview(pending,new Map());assert.equal(f.store.read().powers[f.power.id].playerGuide.abilities.length,7);assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,0);
});
test('guide limit remains bounded and every ability retains verbatim rule evidence',()=>{
 const f=fixture(),guide=guideFor(f.power);assert.equal(normalizePlayerGuide(guide,f.power).abilities.length,7);guide.abilities=Array(13).fill(guide.abilities[0]);assert.throws(()=>normalizePlayerGuide(guide,f.power));
});
