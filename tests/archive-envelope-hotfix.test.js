import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeArchiveEnvelope} from '../src/archive-field-input.js';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower} from '../src/core.js';
import {creationConfig} from '../src/creation-config.js';
import {archiveSources,normalizeArchiveBatch} from '../src/archive-review.js';
import {archiveRepairPrompt,applyArchiveRepairResponse} from '../src/archive-repair.js';
import {RuntimeLog} from '../src/runtime-log.js';
const power=()=>createPower(builtinEntries().find(e=>e.name==='升变之印'));
const candidate=p=>({type:'record',name:'兑换记录',status:'ended',sourceIndex:0,quote:'消耗10000单位金银，获得100点，当前余额185点。',fields:{description:'消耗10000单位金银，获得100点，当前余额185点。',limits:'同一资源不可重复兑换'},specific:{adapterId:creationConfig(p).id,recordId:'points',fields:{balance:'185',input:'10000单位金银',basis:'100单位兑换1点',change:'收入100点'}}});
test('storage envelope and duplicated nested details normalize through full batch without ledger writes',()=>{
 const p=power(),raw=candidate(p);raw.details=structuredClone(raw.specific);const before=JSON.stringify(p),chat=[{is_user:false,mes:raw.quote}],state={powers:{[p.id]:p}};
 const batch=normalizeArchiveBatch({changes:[raw]},p,archiveSources(chat,state,p,{rescan:true}),chat,'',state);
 assert.equal(batch.issues.length,0,JSON.stringify(batch.issues));assert.equal(batch.changes[0].specific.fields.balance,'185');assert.equal(JSON.stringify(p),before);assert(raw.specific);
});
test('wrong adapters, categories, conflicting values and extra operations remain rejected',()=>{
 const p=power(),config=creationConfig(p),raw=candidate(p);
 for(const patch of [{adapterId:'other'},{recordId:'unknown'},{execute:'bad'}])assert.throws(()=>normalizeArchiveEnvelope({...raw,specific:{...raw.specific,...patch}},config));
 assert.throws(()=>normalizeArchiveEnvelope({...raw,recordId:'other'},config),/冲突/);
 assert.throws(()=>normalizeArchiveEnvelope({...raw,details:{balance:'999'}},config),/冲突/);
 const chat=[{is_user:false,mes:raw.quote}],state={powers:{[p.id]:p}},sources=archiveSources(chat,state,p,{rescan:true});
 const batch=normalizeArchiveBatch({changes:[{...raw,specific:{...raw.specific,adapterId:'other'}},raw]},p,sources,chat,'',state);
 assert.equal(batch.issues.length,1);assert.equal(batch.changes.length,1);
 const blocked=normalizeArchiveBatch({changes:[{...raw,execute:'bad'}]},p,sources,chat,'',state);assert.equal(blocked.changes.length,0);
});
test('old failed candidate repair receives declared schema and cannot retain forbidden envelope or alter identity',()=>{
 const p=power(),raw=candidate(p),pending={data:{changes:[raw]},issues:[{kind:'成果',index:0,reason:'档案核对包含不允许的操作字段'}],sources:[{index:0,content:raw.quote}]};
 const input=JSON.parse(archiveRepairPrompt(pending,p).user);assert.equal(input.declaredSchemas[0].id,'points');assert.equal(input.failed[0].candidate.recordId,'points');assert(!input.failed[0].candidate.specific);
 const out=applyArchiveRepairResponse(pending,{repairs:[{index:0,fields:raw.fields,details:raw.specific.fields}]},p);assert(!out.data.changes[0].specific);assert.equal(out.data.changes[0].recordId,'points');assert.equal(out.data.changes[0].name,raw.name);assert(raw.specific);
 assert.throws(()=>applyArchiveRepairResponse(pending,{repairs:[{index:0,recordId:'other',fields:raw.fields,details:{}}]},p),/身份或来源/);
});
test('default validation logs retain redacted reason without candidate facts',()=>{
 const log=new RuntimeLog({storage:{getItem:()=>null,setItem:()=>{}},secret:()=>['private-key']}),ticket=log.begin('核对');
 log.step(ticket,'校验结果',{issues:[{kind:'成果',reason:'档案核对包含不允许的操作字段 private-key',candidate:{private:'正文内容'}}]});
 const text=JSON.stringify(log.list());assert(text.includes('档案核对包含不允许的操作字段'));assert(!text.includes('private-key'));assert(!text.includes('正文内容'));
});
