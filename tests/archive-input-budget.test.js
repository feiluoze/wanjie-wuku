import test from 'node:test';
import assert from 'node:assert/strict';
import {selectArchiveInput,archiveInputRecord} from '../src/archive-input.js';
import {RuntimeLog} from '../src/runtime-log.js';
import {fixture} from './mvu-fixture.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {archivePrompt,normalizeArchiveChanges,applyArchiveChanges} from '../src/archive-review.js';

const records=()=>Array.from({length:90},(_,i)=>({id:'r'+i,name:'人物_'+i+'_甲',type:'member',status:'active',fields:{role:'职责'+i,condition:'长档案'.repeat(180)},specific:{adapterId:'wuku.primordial_world',recordId:'companion',fields:{world_id:'r0',knowledge:'私人资料'+i+'字'.repeat(500)}},history:i===2?[{name:'旧名云岚'}]:[]}));

test('large narrative input keeps all identities but sends only relevant full records without mutating storage',()=>{
 const rows=records(),before=JSON.stringify(rows),selected=selectArchiveInput(rows,'旧名云岚本轮进行了新行动。',{compact:true});
 assert.equal(selected.length,rows.length);assert(!selected.find(r=>r.id==='r2').identityOnly);assert(!selected.find(r=>r.id==='r0').identityOnly);assert(selected.find(r=>r.id==='r80').identityOnly);assert(!JSON.stringify(selected).includes('私人资料80'));
 assert(JSON.stringify(selected).length<JSON.stringify(rows.map(archiveInputRecord)).length*.25);assert.equal(JSON.stringify(rows),before);assert.equal(new Set(selected.map(r=>r.id)).size,90);
});

test('small archives and full construction or evolution inputs retain all facts',()=>{
 const rows=records();assert.deepEqual(selectArchiveInput(rows,'',{compact:false}),rows.map(archiveInputRecord));assert.deepEqual(selectArchiveInput(rows.slice(0,2),'',{compact:true}),rows.slice(0,2).map(archiveInputRecord));
});

test('production prompt compacts large narrative context and a partial update retains omitted saved facts',()=>{
 const f=fixture();for(let i=0;i<50;i++)saveArchive(f.power,{name:'设施_'+i+'_甲',type:'facility',status:'active',fields:{purpose:'原有功能'+i+'字'.repeat(900),condition:'原有状态'}},archiveSource(f.ctx.chat,'玩家确认'));
 const target=Object.values(f.power.archives)[2],sources=[{index:0,swipeId:0,content:target.name+'已经修复。'}],prompt=JSON.parse(archivePrompt(f.power,sources,f.ctx.chat).user);
 assert(prompt.current.some(r=>r.identityOnly));assert(!prompt.current.find(r=>r.id===target.id).identityOnly);
 const absent=Object.values(f.power.archives)[40],change=normalizeArchiveChanges({changes:[{archiveId:absent.id,name:absent.name,type:'facility',status:'active',fields:{condition:'已维修'},sourceIndex:-1}]},f.power,[],f.ctx.chat,'玩家确认该设施已维修');
 applyArchiveChanges(f.power,change,[],new Map([[0,absent.id]]),f.ctx.chat);assert.equal(f.power.archives[absent.id].fields.purpose,absent.fields.purpose);assert.equal(f.power.archives[absent.id].fields.condition,'已维修');assert.equal(Object.keys(f.power.archives).length,50);
});

test('sanitized validation codes distinguish conflicts, missing IDs and ownership without private text',()=>{
 const log=new RuntimeLog({storage:{getItem:()=>null,setItem:()=>{}}}),ticket=log.begin('诊断');log.step(ticket,'校验结果',{issues:[{kind:'设定冲突',reason:'私密名字：已有现状保留；底稿未覆盖字段'}, {kind:'成果',reason:'私密名字：引用的档案不存在'}, {kind:'成果',reason:'私密名字：归属不明'}, {kind:'逐层核对',reason:'私密名字：未完成一致核对'}]});
 const report=log.export(),codes=report.records[0].steps[0].issues.map(i=>i.code);assert.deepEqual(codes,['conflict','missing_archive','ownership','invalid_source']);assert(!JSON.stringify(report).includes('私密名字'));
});

