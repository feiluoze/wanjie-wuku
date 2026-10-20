import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower} from '../src/core.js';
import {builtinStatusbar,normalizeStatusbarOperation} from '../src/builtin-statusbar.js';
import {normalizeArchiveBatch,applyArchiveChanges,archivePrompt} from '../src/archive-review.js';
import {archiveRepairPrompt,applyArchiveRepairResponse} from '../src/archive-repair.js';
const power=()=>createPower(builtinEntries().find(e=>e.name==='绝对生产力'));
function candidate(p,operation='insert'){
 const g=builtinStatusbar(p).groups[0];return {name:g.title,ownerPowerId:p.id,type:'record',status:'active',recordId:g.id,sourceIndex:-1,operation,fields:{description:'确认生产总览'},details:{[g.fields[0].id]:'测试工坊'}};
}
const normalize=(p,raw)=>normalizeArchiveBatch({changes:[raw]},p,[],[],'玩家确认测试工坊');
test('statusbar insert/update hints update one original row; repeat does not duplicate or add history',()=>{
 const p=power(),raw=candidate(p),before=structuredClone(raw);let b=normalize(p,raw);assert.equal(b.issues.length,0,JSON.stringify(b.issues));applyArchiveChanges(p,b.changes,[],new Map([[0,null]]),[]);
 const original=Object.values(p.archives)[0];
 for(const operation of ['insert','update']){b=normalize(p,{...raw,operation});assert.equal(b.issues.length,0);assert.equal(b.changes[0].id,original.id);applyArchiveChanges(p,b.changes,[],new Map([[0,original.id]]),[]);}
 assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[original.id].history.length,0);assert.deepEqual(raw,before);
});
test('only exact declared original statusbar operations are adapted across all current powers',()=>{
 let groups=0;for(const entry of builtinEntries({includeDedicated:true})){
  const p=createPower(entry),spec=builtinStatusbar(p);if(!spec||spec.disposition==='dedicated')continue;
  for(const g of spec.groups){groups++;const raw={recordId:g.id,operation:'insert'};assert.equal(normalizeStatusbarOperation(p,raw).operation,undefined);assert.equal(raw.operation,'insert');}
 }
 assert(groups>100);
 const p=power();for(const operation of ['delete','clear','replace','transition',null,{},'INSERT'])assert.equal(normalize(p,candidate(p,operation)).issues.length,0);
 const unknown={recordId:'statusbar_unknown',operation:'insert'};assert.deepEqual(normalizeStatusbarOperation(p,unknown),unknown);assert(normalize(p,{...candidate(p),...unknown}).issues.length);
 p.primaryRules+=' changed source';assert.equal(normalizeStatusbarOperation(p,candidate(power())).operation,'insert');
});
test('repair prepares and returns a statusbar candidate without stale operation; revalidation accepts it',()=>{
 const p=power(),raw=candidate(p),pending={data:{changes:[raw]},issues:[{kind:'成果',index:0,reason:'只有已声明长期子表接收 operation'}],sources:[],playerNote:'玩家确认测试工坊'};
 const input=JSON.parse(archiveRepairPrompt(pending,p,null).user);assert.equal(input.failed[0].candidate.operation,undefined);
 const fixed=applyArchiveRepairResponse(pending,{repairs:[{index:0,fields:raw.fields,details:raw.details}]},p);
 assert.equal(fixed.data.changes[0].operation,undefined);assert.equal(normalize(p,fixed.data.changes[0]).issues.length,0);assert.equal(raw.operation,'insert');
 for(const field of ['name','ownerPowerId','type','status','sourceIndex','recordId'])assert.equal(fixed.data.changes[0][field],raw[field]);
});
test('statusbar adaptation never bypasses foreign ownership, wrong archive identity or duplicate-table insert',()=>{
 const p=power(),raw=candidate(p);assert.equal(normalize(p,{...raw,ownerPowerId:'foreign'}).changes.length,0);assert(normalize(p,{...raw,archiveId:'missing'}).issues.length);
 const prompt=JSON.parse(archivePrompt(p,[],[]).user);assert.match(prompt.longTermTables.rules,/主状态栏和所有已启用子表/);assert.match(prompt.originalStatusbar.rules,/不要求operation/);
 const table=prompt.longTermTables.tables[0],schema=prompt.recordSchemas.find(r=>r.id===table.id);const row={type:'record',name:'独立工艺成果',recordId:table.id,status:'active',sourceIndex:-1,operation:'insert',fields:{description:'玩家确认独立工艺成果'},details:{[schema.fields[0].id]:'已确认的工艺'}};
 const batch=normalize(p,row);assert.equal(batch.issues.length,0,JSON.stringify(batch.issues));applyArchiveChanges(p,batch.changes,[],new Map([[0,null]]),[]);const repeat=normalize(p,row);assert.equal(repeat.issues.length,0);assert.equal(repeat.changes.length,1);
});
