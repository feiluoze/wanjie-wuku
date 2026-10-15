import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {normalizeArchiveBatch} from '../src/archive-review.js';
import {inspectArchiveList} from '../src/archive-result-list.js';
import {decodeCheckpoint} from '../src/review-checkpoint.js';
import {planTaishiBuild} from '../src/taishi-build.js';
import {packetObjectCost} from '../src/build-budget.js';
const row=i=>({type:'record',name:'成果'+i,status:'active',fields:{description:'已确认成果'+i},sourceIndex:-1});
test('130 unique candidates survive local segmentation, cross-segment conflicts remain quarantined',()=>{
 const f=fixture(),rows=Array.from({length:130},(_,i)=>row(i));
 let b=normalizeArchiveBatch({changes:rows},f.power,[],f.ctx.chat,'玩家确认资料',f.state);assert.equal(b.changes.length,130);
 rows.push({...row(0),fields:{description:'冲突资料'}});b=normalizeArchiveBatch({changes:rows},f.power,[],f.ctx.chat,'玩家确认资料',f.state);assert.equal(b.changes.length,129);assert.equal(b.issues.length,2);
});
test('list boundary reports exact shape and counts without private values; recognized envelopes adapt',()=>{
 assert.equal(inspectArchiveList({changes:{items:[row(0)]}}).data.changes.length,1);
 assert.equal(inspectArchiveList({changes:row(0)}).data.changes.length,1);
 const bad=inspectArchiveList({changes:{secret:'私密资料'}});assert.equal(bad.issue.diagnostic.code,'changes_not_array');assert.equal(bad.diagnostic.shape,'object');assert(!JSON.stringify(bad).includes('私密资料'));
 const over=inspectArchiveList({changes:Array(4097).fill(row(0))});assert.equal(over.issue.diagnostic.count,4097);assert.equal(over.issue.diagnostic.code,'changes_over_safety_limit');
});
for(const [label,data] of [['malformed list',{changes:{privateValue:'应保留原始内容'}}],['safety bound',{changes:Array(4097).fill(row(0))}],['invalid extra section',{changes:[row(0)],terminalResults:{bad:true}}]])test(label+' retains original result and checkpoint without advancing',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};let calls=0;f.app.model.request=async()=>{calls++;return JSON.stringify(data);};
 await f.app.reviewArchives({values:{playerNote:'玩家确认资料'}});const p=f.app.pendingArchiveReview;assert(p?.readOnly);assert.deepEqual(p.data,data);assert.equal(p.changes.length,0);assert(p.checkpointSaved);
 const snap=f.app.contextSnapshot(),restored=decodeCheckpoint(f.storage.getItem('wanjie-wuku:review-checkpoint:'+snap.chatKey),snap);assert.deepEqual(restored.data,data);assert.equal(calls,1);assert.equal(Object.keys(snap.state.powers[f.app.powerId].archives).length,0);
});
test('130 valid candidates survive checkpoint restore with original indexes',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};f.app.model.request=async()=>JSON.stringify({changes:Array.from({length:130},(_,i)=>row(i))});await f.app.reviewArchives({values:{playerNote:'玩家确认资料'}});
 const s=f.app.contextSnapshot(),r=decodeCheckpoint(f.storage.getItem('wanjie-wuku:review-checkpoint:'+s.chatKey),s);assert.equal(r.changes.length,130);assert.equal(r.changes[129].inputIndex,129);
});
test('dense merged entries split by object budget preserving all characters and legacy fingerprint path',()=>{
 const content=Array.from({length:100},(_,i)=>'【地域】城市'+i+'\n已有明确城市。🌏\n').join(''),ref={fingerprint:'a'.repeat(16),characters:content.length,payload:{kind:'worldbooks',books:[{name:'书',entries:[{id:'1',title:'合并',content}]}]}};
 const plan=planTaishiBuild(ref,'b'.repeat(16)),legacy=planTaishiBuild(ref,'b'.repeat(16),null,{legacy:true});assert(plan.total>legacy.total);assert.notEqual(plan.fingerprint,legacy.fingerprint);assert(plan.chunks.every(c=>packetObjectCost(c.payload.books)<=24));assert.equal(plan.chunks.flatMap(c=>c.payload.books.flatMap(b=>b.entries)).map(e=>e.content).join(''),content);
});
