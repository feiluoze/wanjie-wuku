import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {selectBuildArchiveInput} from '../src/archive-input.js';
import {clone} from '../src/core.js';
const packet=text=>({payload:{books:[{name:'书',entries:[{id:'1',title:'本批',content:text}]}]}});
test('setup retains all identities with bounded details, omits redundant single-world scope, and never mutates archives',()=>{
 const records=Array.from({length:450},(_,i)=>({id:'archive_'+i,name:'对象'+i,type:'record',status:'active',fields:{description:'既有设定'.repeat(1000)},specific:{recordId:'organization',fields:{world_id:'root',world:'主星',overview:'已有概况'}},history:[]}));
 const original=clone(records),rows=selectBuildArchiveInput(records,packet(records.map(r=>r.name).join(' ')),{worldId:'root'});assert.equal(rows.length,450);assert(JSON.stringify(rows).length<=80000);assert(rows.some(r=>r.identityOnly));assert.deepEqual(rows.map(r=>r.id),records.map(r=>r.id));assert.deepEqual(records,original);assert(rows.filter(r=>r.identityOnly).every(r=>!r.specific.fields));
});
test('setup identity scope preserves other worlds and rename identities',()=>{
 const records=[{id:'1',name:'新名',type:'record',status:'active',fields:{description:'旧详情'},specific:{recordId:'organization',fields:{world_id:'other'}},history:[{name:'旧名'}]}];let rows=selectBuildArchiveInput(records,packet('无关资料'),{worldId:'root'});assert.equal(rows[0].specific.fields.world_id,'other');assert.deepEqual(rows[0].previousNames,['旧名']);rows=selectBuildArchiveInput(records,packet('旧名'),{worldId:'root'});assert.equal(rows[0].fields.description,'旧详情');
});
test('same name across Taishi categories creates distinct identities while same category reuses original',async()=>{
 const f=fixture();await f.app.openTaishi();const p=f.store.read().powers[f.app.powerId],changes=[{type:'record',name:'银城',status:'active',recordId:'organization',fields:{description:'政权'},details:{overview:'已有政权'},sourceIndex:-1},{type:'record',name:'银城',status:'active',recordId:'available',fields:{description:'资源'},details:{current:'已有资源'},sourceIndex:-1}];
 let b=normalizeArchiveBatch({changes},p,[],f.ctx.chat,'玩家确认已有设定',f.state);assert.equal(b.issues.length,0);assert.equal(b.changes.length,2);const saved=applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((c,i)=>[i,null])),f.ctx.chat);assert.equal(saved.length,2);assert.notEqual(saved[0].id,saved[1].id);
 b=normalizeArchiveBatch({changes},p,[],f.ctx.chat,'玩家确认已有设定',f.state);assert.deepEqual(b.changes.map(c=>c.id),saved.map(r=>r.id));
 const wrong={...changes[0],archiveId:saved[1].id};b=normalizeArchiveBatch({changes:[wrong]},p,[],f.ctx.chat,'玩家确认已有设定',f.state);assert.equal(b.changes.length,0);assert.equal(b.issues.length,1);
});
test('same category still rejects conflicting proposals and does not silently duplicate',async()=>{
 const f=fixture();await f.app.openTaishi();const p=f.store.read().powers[f.app.powerId],row={type:'record',name:'银城',status:'active',recordId:'organization',fields:{description:'政权'},details:{overview:'已有政权'},sourceIndex:-1};const b=normalizeArchiveBatch({changes:[row,{...row,details:{overview:'相反设定'}}]},p,[],f.ctx.chat,'玩家确认已有设定',f.state);assert.equal(b.changes.length,0);assert.equal(b.issues.length,2);
});
