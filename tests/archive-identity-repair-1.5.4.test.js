import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {repairArchiveIdentity,applyArchiveRepairResponse,archiveRepairPrompt} from '../src/archive-repair.js';
import {prepareArchiveFields} from '../src/archive-field-input.js';import {ARCHIVE_FIELDS} from '../src/archives.js';
import {createPower} from '../src/core.js';import {builtinEntries} from '../src/builtin-worldbook.js';
const row={name:'真实产线',type:'record',status:'active',archiveId:'invented',sourceIndex:-1,fields:{description:'已建立产线',ownerPowerId:null}};
test('missing archive references resolve by unique current identity or become new candidates without writing data',()=>{
 const f=fixture();assert(!repairArchiveIdentity(row,f.power).archiveId);assert.equal(row.archiveId,'invented');
 f.power.archives={real:{id:'real',name:row.name,type:'record'}};assert.equal(repairArchiveIdentity(row,f.power).archiveId,'real');
 f.power.archives.other={id:'other',name:row.name,type:'record'};assert.throws(()=>repairArchiveIdentity(row,f.power),/不唯一/);
 delete f.power.archives.other;f.power.archives.real.type='facility';assert.throws(()=>repairArchiveIdentity(row,f.power),/类型或模块/);
 assert.throws(()=>repairArchiveIdentity(row,{...f.power,archives:{}},{powers:{other:{id:'other',archives:{invented:{}}}}}),/其他金手指/);
 const valid={...row,archiveId:'real'};assert.equal(repairArchiveIdentity(valid,f.power),valid);
});
test('empty ownership metadata is ignored but explicit conflicting ownership is never discarded',()=>{
 const f=fixture();let out=prepareArchiveFields(row,ARCHIVE_FIELDS);assert.equal(out.held.length,0);assert(!Object.hasOwn(out.raw.fields,'ownerPowerId'));
 const p={data:{changes:[{...row,fields:{...row.fields,ownerPowerId:'foreign'}}]},issues:[{kind:'成果',index:0}],sources:[]};
 assert.throws(()=>applyArchiveRepairResponse(p,{repairs:[{index:0,fields:{description:'已建立'},details:{}}]},f.power),/归属冲突/);
 out=prepareArchiveFields({...row,fields:{description:'事实',ownerPowerId:'foreign'}},ARCHIVE_FIELDS);assert.equal(out.raw.ownerPowerId,'foreign');
});
test('nested location precision is merged but incompatible locations remain conflicts',()=>{
 const out=prepareArchiveFields({type:'environment',fields:{location:'平原西北部'},details:{location:'平原西北部虚空矿脉核心区'}},ARCHIVE_FIELDS);assert.equal(out.raw.fields.location,'平原西北部虚空矿脉核心区');
 assert.throws(()=>prepareArchiveFields({type:'environment',fields:{location:'平原东部'},details:{location:'平原西北部'}},ARCHIVE_FIELDS),/冲突/);
});
test('dedicated repair can correct new candidate category using declared schemas but cannot reclassify existing dedicated archives',()=>{
 const power=createPower(builtinEntries().find(e=>e.name==='万物尽头'));const raw={...row,recordId:'stock',details:{identity:'种源'},ownerPowerId:power.id};
 const p={data:{changes:[raw]},issues:[{kind:'成果',index:0}],sources:[]};const prompt=archiveRepairPrompt(p,power),input=JSON.parse(prompt.user);assert(input.declaredSchemas.some(r=>r.id==='seeds'));assert(prompt.archiveSchema.properties.repairs.items.anyOf.some(v=>v.properties.recordId.const==='stock'));
 const repairs=[{index:0,recordId:'seeds',fields:{description:'已保留种源'},details:{identity:'种源'}}];const fixed=applyArchiveRepairResponse(p,{repairs},power);assert.equal(fixed.data.changes[0].recordId,'seeds');assert(!fixed.data.changes[0].archiveId);
 power.archives={real:{id:'real',name:row.name,type:'record',specific:{recordId:'stock'}}};assert.throws(()=>applyArchiveRepairResponse(p,{repairs},power),/不能改换分类/);
 assert.throws(()=>applyArchiveRepairResponse(p,{repairs:[{...repairs[0],recordId:'invented-category'}]},power),/未声明/);
});
test('eighteen missing-ID candidates repair in one call and save only after confirmation',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};let calls=0;
 const rows=Array.from({length:18},(_,i)=>({...row,name:'产线'+i,archiveId:'invented'+i}));
 f.app.model.request=async()=>{calls++;return JSON.stringify({changes:rows});};await f.app.reviewArchives({supplement:true,values:{playerNote:'玩家确认这18条产线已经建立'}});const p=f.app.pendingArchiveReview;assert.equal(p.changes.length,0);
 f.app.model.request=async prompt=>{calls++;assert.equal(JSON.parse(prompt.user).failed.length,18);return JSON.stringify({repairs:rows.map((r,index)=>({index,fields:{description:'已建立产线'},details:{}}))});};
 await f.app.repairArchiveWithAI();assert.equal(calls,2);assert.equal(p.changes.length,18);assert.equal(p.issues.length,0,JSON.stringify(p.issues));assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,0);
 await f.app.commitArchiveReview(p,new Map(p.changes.map((_,i)=>[i,null])));const saved=f.store.read().powers[f.power.id].archives;assert.equal(Object.keys(saved).length,18);assert(Object.keys(saved).every(id=>!id.startsWith('invented')));
});
