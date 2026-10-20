import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {archiveSources,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {fieldSourceIndex} from '../src/archive-stale.js';
import {floorCoverage} from '../src/archive-protocol.js';

function setup(){
 const f=fixture();f.ctx.chat=[{is_user:false,mes:'深蓝试验进度60%，独立取得晶体两枚。'},{is_user:false,mes:'深蓝试验进度70%，原目标不变。'}];
 const sources=archiveSources(f.ctx.chat,f.state,f.power,{rescan:true});
 const make=(index,archiveId)=>({archiveId,ownerPowerId:f.power.id,type:'research',name:'试验项目',status:'working',fields:{goal:'原目标',progress:index?'70%':'60%'},sourceIndex:index,quote:f.ctx.chat[index].mes});
 let batch=normalizeArchiveBatch({changes:[make(0)]},f.power,[sources[0]],f.ctx.chat,'',f.state);assert.deepEqual(batch.issues,[]);
 applyArchiveChanges(f.power,batch.changes,[sources[0]],new Map([[0,null]]),f.ctx.chat);
 const id=Object.keys(f.power.archives)[0];batch=normalizeArchiveBatch({changes:[make(1,id)]},f.power,[sources[1]],f.ctx.chat,'',f.state);assert.deepEqual(batch.issues,[]);applyArchiveChanges(f.power,batch.changes,[sources[1]],new Map([[0,id]]),f.ctx.chat);
 const raw={...make(0,id),staleFields:[{section:'fields',field:'progress',reason:'旧快照已被后层70%取代'}]};
 const data={changes:[raw],floorReviews:[{sourceIndex:0,status:'reviewed',changeCount:1}],message:'旧状态已核对并自动跳过'};
 return {...f,sources,id,raw,data};
}
test('verified older snapshot becomes a counted no-op without conflicts or overwriting the current record',()=>{
 const f=setup(),before=JSON.stringify(f.power.archives),batch=normalizeArchiveBatch(f.data,f.power,[f.sources[0]],f.ctx.chat,'',f.state);
 assert.deepEqual(batch.issues,[]);assert.equal(batch.changes.length,0);assert.equal(batch.ignoredChanges.length,1);
 const coverage=floorCoverage(f.data,[f.sources[0]],batch.changes,[],[],batch.ignoredChanges);assert.equal(coverage[0].status,'reviewed');assert.equal(coverage[0].accepted,0);
 assert.equal(JSON.stringify(f.power.archives),before);assert.equal(f.raw.fields.progress,'60%');
});
test('independent omitted reward survives stale progress filtering',()=>{
 const f=setup();f.raw.fields.outcome='晶体两枚';const batch=normalizeArchiveBatch(f.data,f.power,[f.sources[0]],f.ctx.chat,'',f.state);
 assert.deepEqual(batch.issues,[]);assert.equal(batch.changes.length,1);assert.equal(batch.changes[0].patch.progress,undefined);assert.equal(batch.changes[0].patch.outcome,'晶体两枚');
 applyArchiveChanges(f.power,batch.changes,[f.sources[0]],new Map([[0,f.id]]),f.ctx.chat);assert.equal(f.power.archives[f.id].fields.progress,'70%');assert.equal(f.power.archives[f.id].fields.outcome,'晶体两枚');
 assert.equal(fieldSourceIndex(f.power.archives[f.id],'fields','progress'),1);
});
test('last record source is insufficient for an unchanged column, manual state or rewritten branch',()=>{
 const f=setup();assert.equal(fieldSourceIndex(f.power.archives[f.id],'fields','goal'),0);
 f.raw.staleFields=[{section:'fields',field:'goal',reason:'不能仅凭记录最后楼层忽略'}];
 let batch=normalizeArchiveBatch(f.data,f.power,[f.sources[0]],f.ctx.chat,'',f.state);assert.equal(batch.ignoredChanges.length,0);assert.match(batch.issues[0].reason,/无法确认/);
 f.raw.staleFields=[{section:'fields',field:'progress',reason:'旧快照'}];f.ctx.chat[1].mes='改写'+f.ctx.chat[1].mes;
 batch=normalizeArchiveBatch(f.data,f.power,[f.sources[0]],f.ctx.chat,'',f.state);assert.equal(batch.ignoredChanges.length,0);assert(batch.issues.length);
 const g=setup();g.power.archives[g.id].source={type:'manual',note:'玩家手动更正'};
 batch=normalizeArchiveBatch(g.data,g.power,[g.sources[0]],g.ctx.chat,'',g.state);assert.equal(batch.ignoredChanges.length,0);assert(batch.issues.length);
});
test('uncertain acknowledgements and unverified counts are never promoted merely because an old snapshot was skipped',()=>{
 const f=setup();f.data.floorReviews[0].status='uncertain';const batch=normalizeArchiveBatch(f.data,f.power,[f.sources[0]],f.ctx.chat,'',f.state);
 assert.equal(floorCoverage(f.data,[f.sources[0]],[],[],[],batch.ignoredChanges)[0].status,'uncertain');
 f.data.floorReviews[0].status='reviewed';f.data.floorReviews[0].changeCount=2;assert.equal(floorCoverage(f.data,[f.sources[0]],[],[],[],batch.ignoredChanges)[0].status,'uncertain');
});
test('automatic controller clears a fully checked stale floor with no manual conflict handling or extra model calls',async()=>{
 const f=setup();await f.store.transact(s=>{s.powers[f.power.id]={...structuredClone(f.power),autoArchiveReview:true,autoArchiveSave:true,autoArchiveStart:0};});f.app.refresh();f.app.settings.mode='st';let calls=0;
 f.app.model.request=async()=>{calls++;return JSON.stringify({...f.data,floorReviews:[...f.data.floorReviews,{sourceIndex:1,status:'reviewed',changeCount:0}]});};
 const before=JSON.stringify(f.store.read().powers[f.power.id].archives);
 await f.app.reviewArchives({rescan:true,autoSave:true,automatic:true});
 const saved=f.store.read().powers[f.power.id];assert.equal(calls,1);assert.equal(f.app.pendingArchiveReview,null);assert.equal(JSON.stringify(saved.archives),before);assert(saved.archiveReviewed.some(r=>r.index===0));
});
