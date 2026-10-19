import test from 'node:test';
import assert from 'node:assert/strict';
import {repairKnownKeyQuotes} from '../src/json-final.js';
import {repairRawResponseLocally,responseRepairPrompt,mergeRepairedResponse} from '../src/archive-response-repair.js';
import {archivePrompt,normalizeArchiveBatch,archiveSources} from '../src/archive-review.js';
import {createPower,emptyState} from '../src/core.js';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {builtinStatusbar} from '../src/builtin-statusbar.js';
import {fixture} from './mvu-fixture.js';
const data=()=>({changes:[{name:'成果甲',type:'record',status:'active',fields:{description:'完整的原始资料'},sourceIndex:-1}],floorReviews:[],message:'原消息'});
function sample(){const f=fixture(),value=data();value.guide={summary:'原有规则说明',abilities:[{name:'已有能力',description:'依规则推演完整能力',ruleQuote:f.power.rules.slice(0,16)}]};const schema=archivePrompt(f.power,[],[],'玩家确认成果甲').archiveSchema;const raw=JSON.stringify(value).replace('"description":','"description:');return {f,value,pending:{sources:[],playerNote:'玩家确认成果甲',data:{changes:[],floorReviews:[],rawFailures:[{raw,sourceIndexes:[-1],contract:schema}]}}};}
test('grammar-only repair changes declared object-key quotes and preserves strings, numeric values and nesting',()=>{
 const raw='{"changes":[{"goal: "原值与转义\\\"goal: \\\"不得改变","n":-1.5,"ok":true}],"tail":null}';
 const r=repairKnownKeyQuotes(raw,new Set(['goal']));assert(r);assert.equal(r.repairs,1);assert.equal(r.data.changes[0].goal,'原值与转义"goal: "不得改变');assert.equal(r.data.changes[0].n,-1.5);assert.equal(r.data.changes[0].ok,true);assert.equal(r.data.tail,null);
});
test('unknown keys, duplicate keys, missing values, truncated arrays and ambiguous damage stay unrepaired',()=>{
 for(const raw of ['{"unknown: "值"}','{"goal: "值","goal":"另一值"}','{"goal: }','{"goal: "值"','{"goal: "值",}','{"goal: "值"} trailing'])assert.equal(repairKnownKeyQuotes(raw,new Set(['goal'])),null,raw);
 assert.equal(repairKnownKeyQuotes('{"goal: "值"}',new Set()),null);assert.equal(repairKnownKeyQuotes(' '.repeat(120001),new Set(['goal'])),null);
});
test('damaged early key does not hide later original guide, and repair has zero candidate mutation',()=>{
 const {f,value,pending}=sample(),before=JSON.stringify(pending),prompt=responseRepairPrompt(pending,f.power);assert(JSON.parse(prompt.user).allowedOutputs.includes('guide'));
 const out=repairRawResponseLocally(pending,f.power);assert(out);assert.deepEqual(out.data.changes,value.changes);assert.deepEqual(out.data.guide,value.guide);assert.equal(JSON.stringify(pending),before);assert.equal(out.data.rawFailures.length,0);
 for(const mutate of [v=>v.changes[0].fields.description='新造事实',v=>v.changes[0].ownerPowerId='other',v=>v.guide.abilities[0].description='改写能力',v=>v.terminalResults=[],v=>delete v.guide]){const changed=structuredClone(value);mutate(changed);assert.throws(()=>mergeRepairedResponse(pending,{responses:[{index:0,data:changed}]},f.power));}
});
test('optional progress is preserved only if both originally present and contract-enabled',()=>{
 const {f,value,pending}=sample();value.terminalResults=[{id:'existing',sourceIndex:-1,status:'working'}];const failure=pending.data.rawFailures[0];failure.raw=JSON.stringify(value).replace('"description":','"description:');failure.contract.properties.terminalResults={type:'array'};
 const out=repairRawResponseLocally(pending,f.power);assert.deepEqual(out.data.terminalResults,value.terminalResults);
 const changed=structuredClone(value);changed.terminalResults[0].status='completed';assert.throws(()=>mergeRepairedResponse(pending,{responses:[{index:0,data:changed}]},f.power));delete failure.contract.properties.terminalResults;assert.equal(repairRawResponseLocally(pending,f.power),null);
});
test('controller repairs known key quote locally, keeps guide and requires confirmation before persistence',async()=>{
 const {f,value,pending}=sample();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};let calls=0;f.app.model.request=async()=>{calls++;return pending.data.rawFailures[0].raw;};await f.app.reviewArchives({supplement:true,values:{playerNote:'玩家确认成果甲已建立'}});
 const preview=f.app.pendingArchiveReview;assert.equal(preview.data.rawFailures.length,1);f.app.model.request=async()=>{throw Error('must not call AI for known grammar repair');};await f.app.repairArchiveWithAI();assert.equal(calls,1);assert.equal(preview.issues.length,0);assert.deepEqual(preview.guide.abilities,value.guide.abilities);assert.equal(preview.guide.summary,value.guide.summary);assert.equal(Object.keys(f.store.read().powers[f.power.id].archives||{}).length,0);
 await f.app.commitArchiveReview(preview,new Map([[0,null]]));assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,1);
});
test('idle statusbar is not a new independent object; exploration links exact place and original shadow actor',()=>{
 const p=createPower(builtinEntries().find(e=>e.name==='挂机')),state=emptyState();state.powers[p.id]=p;
 const text='我触动了【挂机】。驻留【测试街区】的征伐之影清理哨站，仍在探索钟楼。<WJWK-status>【挂机·总览】当前行动：探索中</WJWK-status>',chat=[{is_user:false,mes:text}],sources=archiveSources(chat,state,p,{rescan:true});
 const g=builtinStatusbar(p).groups[0],status={name:g.title,type:'record',status:'active',recordId:g.id,details:{[g.fields[0].id]:'探索中'},fields:{description:'当前状态'},sourceIndex:0,quote:'我触动了【挂机】。'};
 const discovery={name:'测试街区哨站与钟楼探索',type:'record',status:'working',recordId:'discoveries',operation:'insert',fields:{description:'哨站已清理，钟楼仍在探索'},details:{location:'测试街区',progress:'哨站已清理，钟楼仍在探索'},sourceIndex:0,quote:'驻留【测试街区】的征伐之影清理哨站，仍在探索钟楼。'};
 const b=normalizeArchiveBatch({changes:[status,discovery]},p,sources,chat);assert.equal(b.issues.length,0,JSON.stringify(b.issues));assert.equal(b.changes.length,2);
 const foreignChat=[{is_user:false,mes:'绝对生产力在测试街区修好了工具。'}],foreignSources=archiveSources(foreignChat,state,p,{rescan:true});const foreign={...discovery,quote:foreignChat[0].mes};assert(normalizeArchiveBatch({changes:[foreign]},p,foreignSources,foreignChat).issues.length);
 const elsewhere={...discovery,details:{...discovery.details,location:'其他街区'}};assert(normalizeArchiveBatch({changes:[elsewhere]},p,sources,chat).issues.length);
});
test('preset contract scopes operations to declared tables and avoids duplicated table-policy paragraphs',()=>{
 const p=createPower(builtinEntries().find(e=>e.name==='挂机')),prompt=archivePrompt(p,[],[]),input=JSON.parse(prompt.user);assert.deepEqual(input.responseContract.operationScope.recordIds,input.longTermTables.tables.map(t=>t.id));assert(!input.responseContract.operationScope.recordIds.some(id=>id.startsWith('statusbar_')));assert(!prompt.system.includes(input.longTermTables.rules));assert(!prompt.system.includes(input.originalStatusbar.rules));assert(prompt.system.includes('<wjwk_wire_check>'));assert(prompt.system.includes(input.responseContract.outputs.join('、')));
});
