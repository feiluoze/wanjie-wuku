import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {clone,createPower,validateState} from '../src/core.js';
import {MMLC_ENTRY} from '../src/mmlc.js';
import {exportModule,mergeModuleBackup,validateModuleBackup} from '../src/module-backup.js';
async function setup(){const f=fixture();await f.app.openTaishi();const s=clone(f.store.read()),m=createPower(MMLC_ENTRY);s.powers[m.id]=m;validateState(s);return {s,w:f.power.id,t:f.app.powerId,m:m.id};}
for(const module of ['wuku','mmlc','taishi'])test(`${module} export and restore excludes the other two modules`,async()=>{
 const {s,w,t,m}=await setup(),ids={wuku:w,taishi:t,mmlc:m},before=clone(s),pack=exportModule(s,module);
 assert.equal(pack.format,'wjwk-module-backup');assert.equal(pack.module,module);
 assert.deepEqual(Object.keys(pack.state.powers),[ids[module]]);
 assert.equal(pack.state.roleLink,null);assert.deepEqual(pack.state.roleWrites,[]);
 assert.deepEqual(s,before,'export must not mutate live state');
 pack.state.powers[ids[module]].name='独立恢复';
 const restored=mergeModuleBackup(s,pack,{currentHashes:['hash']});
 assert.equal(restored.powers[ids[module]].name,'独立恢复');
 for(const [other,id] of Object.entries(ids))if(other!==module)assert.deepEqual(restored.powers[id],s.powers[id],'other module remains byte-for-byte identical');
 assert.equal(restored.id,s.id);assert.equal(restored.syncCursor,s.syncCursor);assert.deepEqual(s,before);
});
test('mixed module files and collisions fail before mutating current state',async()=>{
 const {s,w,t}=await setup(),pack=exportModule(s,'taishi'),before=clone(s);
 pack.state.powers[w]=clone(s.powers[w]);assert.throws(()=>validateModuleBackup(pack),/混入其他模块/);
 const collision=exportModule(s,'taishi');collision.state.powers[w]=collision.state.powers[t];collision.state.powers[w].id=w;delete collision.state.powers[t];for(const r of collision.state.transactions)r.powerId=w;
 assert.throws(()=>mergeModuleBackup(s,collision),/ID与其他模块冲突/);assert.deepEqual(s,before);
});
test('legacy state without memory settings can receive one module independently',async()=>{
 const {s}=await setup(),pack=exportModule(s,'taishi');delete s.archiveMemory;
 const restored=mergeModuleBackup(s,pack);assert(restored.archiveMemory.selections);validateState(restored);
});

test('module backup filters transaction history and refuses pending variable writes',async()=>{
 const {s,w,t}=await setup();
 s.transactions.push({id:'local-w',label:'武库独有历史',changes:['独立事实'],type:'manual',powerId:w,evidence:[],costs:[],effects:[],at:Date.now(),atMessage:1});
 const pack=exportModule(s,'taishi');assert(pack.state.transactions.every(r=>r.powerId===t));assert(!JSON.stringify(pack).includes('武库独有历史'));
 const pending=clone(s);pending.roleWrites=[{status:'pending'}];assert.throws(()=>mergeModuleBackup(pending,pack),/先处理待写回/);assert.equal(pending.roleWrites[0].status,'pending');
 const restored=mergeModuleBackup(s,pack);assert.deepEqual(restored.transactions.filter(r=>r.powerId===w),s.transactions.filter(r=>r.powerId===w));
});
