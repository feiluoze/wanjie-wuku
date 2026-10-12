import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewHistory} from '../src/archive-history.js';
import {canonicalFields} from '../src/archive-protocol.js';
import {ARCHIVE_FIELDS,saveArchive,archiveSource} from '../src/archives.js';
import {normalizeArchiveBatch,archiveSources,applyArchiveChanges} from '../src/archive-review.js';
import {fixture} from './mvu-fixture.js';
import {stable,validateState} from '../src/core.js';

test('history sends each source once, preserves old and new independent facts and explicit no-change reports',async()=>{
 const sources=[{index:0},{index:2},{index:4}],seen=[];
 const result=await reviewHistory(sources,async source=>{seen.push(source.index);return {data:{changes:source.index===2?[]:[{name:'事实'+source.index,sourceIndex:source.index}],floorReviews:[{sourceIndex:source.index,status:'reviewed',changeCount:source.index===2?0:1}]}};});
 assert.deepEqual(seen,[0,2,4]);assert.deepEqual(result.data.changes.map(c=>c.name),['事实0','事实4']);assert.equal(result.data.floorReviews.length,3);
});
test('failed historical request retains completed floors, stops remaining requests and never retries',async()=>{
 let calls=0;const result=await reviewHistory([{index:0},{index:2},{index:4}],async source=>{calls++;if(source.index===2)throw Error('offline');return {data:{changes:[{name:'早期事实',sourceIndex:0}],floorReviews:[{sourceIndex:0,status:'reviewed',changeCount:1}]}};});
 assert.equal(calls,2);assert.equal(result.data.changes.length,1);assert.equal(result.data.historyIssues.length,2);assert.equal(result.data.floorReviews.at(-1).status,'uncertain');
 await assert.rejects(reviewHistory([{index:0}],async()=>{throw Error('offline');}),/offline/);
});
test('cancelled history makes no later request and invalid response cannot claim other floors',async()=>{
 let cancelled=false,calls=0;
 await assert.rejects(reviewHistory([{index:0},{index:2}],async()=>{calls++;cancelled=true;return {data:{changes:[]}};},{check:()=>{if(cancelled)throw new DOMException('取消','AbortError');}}),{name:'AbortError'});assert.equal(calls,1);
 const result=await reviewHistory([{index:0}],async()=>({data:{changes:[{sourceIndex:9}]}}));assert.equal(result.data.changes.length,0);assert.equal(result.data.floorReviews[0].status,'uncertain');
});
test('duplicate formatting is harmless, contradictory aliases retain both values for local resolution',()=>{
 assert.deepEqual(canonicalFields({type:'skill',fields:{level:' 精通\r\n',已达程度:'精通'}},ARCHIVE_FIELDS).fields,{level:'精通'});
 const definition={fields:[{id:'state',label:'行动与伤势'}]};
 const raw={type:'record',fields:{state:'暂停'},details:{state:'出征'}};
 let error;try{canonicalFields(raw,ARCHIVE_FIELDS,definition);}catch(e){error=e;}
 assert.equal(error.fieldConflicts[0].key,'details:state');assert.deepEqual([error.fieldConflicts[0].left,error.fieldConflicts[0].right],['出征','暂停']);
 const fixed=canonicalFields(raw,ARCHIVE_FIELDS,definition,{resolutions:{'details:state':'已确认暂停'}});assert.equal(fixed.details.state,'已确认暂停');assert.equal(raw.details.state,'出征');
});
test('chronological same-object updates preserve early fields and separate history before latest state',()=>{
 const f=fixture();f.ctx.chat=[{is_user:false,mes:'工具已交付。'},{is_user:false,mes:'工具已修复。'}];
 const sources=archiveSources(f.ctx.chat,f.state,f.power,{rescan:true});
 const data={changes:[{type:'record',name:'自编工具',status:'active',fields:{description:'已交付'},sourceIndex:0},{type:'record',name:'自编工具',status:'active',fields:{description:'已修复'},sourceIndex:1}]};
 const batch=normalizeArchiveBatch(data,f.power,sources,f.ctx.chat,'',f.state,{chronological:true});assert.equal(batch.changes.length,2);assert.equal(batch.issues.length,0);
 applyArchiveChanges(f.power,batch.changes,sources,new Map([[0,null],[1,null]]),f.ctx.chat);
 const archives=Object.values(f.power.archives);assert.equal(archives.length,1);assert.equal(archives[0].fields.description,'已修复');assert.equal(archives[0].history.length,1);assert.equal(archives[0].history[0].fields.description,'已交付');assert.equal(archives[0].source.anchors.length,2);assert.equal(f.power.archiveReviewed.length,2);
 validateState(f.state);
});
test('conflicting candidate can be repaired without another model request or write before confirmation',async()=>{
 const f=fixture();f.app.settings.mode='st';let calls=0;f.app.ui.showArchiveReview=()=>{};
 f.app.model.request=async()=>{calls++;return JSON.stringify({changes:[{type:'skill',name:'自编语言',status:'active',fields:{level:'精通',已达程度:'熟练'},sourceIndex:0}],floorReviews:[{sourceIndex:0,status:'reviewed',changeCount:1}]});};
 await f.app.reviewArchives({rescan:true});assert.ok(f.app.pendingArchiveReview.issues[0].conflicts);assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,0);
 f.app.repairArchiveConflict({index:'0',values:{'conflict:0:0':'custom','conflict-text:0:0':'玩家确认熟练'}});
 const pending=f.app.pendingArchiveReview;assert.equal(calls,1);assert.equal(pending.changes.length,1);assert.equal(pending.changes[0].patch.level,'玩家确认熟练');assert.deepEqual(pending.blockedFloors,[]);assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,0);
 await f.app.commitArchiveReview(pending,new Map([[0,null]]));assert.equal(Object.values(f.store.read().powers[f.power.id].archives)[0].fields.level,'玩家确认熟练');
});


test('manual controller supplies only one floor per call and keeps early facts in the final preview',async()=>{
 const f=fixture();f.ctx.chat=[{is_user:false,mes:'第一件工具已经交付。'},{is_user:false,mes:'第二件工具已经交付。'}];f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};const seen=[];
 f.app.model.request=async prompt=>{const data=JSON.parse(prompt.user);assert.equal(data.sources.length,1);const index=data.sources[0].index;seen.push(index);return JSON.stringify({changes:[{type:'record',name:'独立工具'+index,status:'active',fields:{description:data.sources[0].content},sourceIndex:index}],floorReviews:[{sourceIndex:index,status:'reviewed',changeCount:1}]});};
 await f.app.reviewArchives({rescan:true});assert.deepEqual(seen,[0,1]);const pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,2);assert.equal(pending.floorReviews.filter(r=>r.status==='reviewed').length,2);
 await f.app.commitArchiveReview(pending,new Map([[0,null],[1,null]]));assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,2);assert.equal(f.store.read().powers[f.power.id].archiveReviewed.length,2);
});

test('local field repair cannot bypass conflicting updates for the same object on the same floor',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};
 f.app.model.request=async()=>JSON.stringify({changes:[{type:'skill',name:'同一技能',status:'active',fields:{level:'初学'},sourceIndex:0},{type:'skill',name:'同一技能',status:'active',fields:{level:'精通',已达程度:'熟练'},sourceIndex:0}],floorReviews:[{sourceIndex:0,status:'reviewed',changeCount:2}]});
 await f.app.reviewArchives({rescan:true});const pending=f.app.pendingArchiveReview,before=stable(pending.data),count=pending.changes.length;
 const index=pending.issues.findIndex(i=>i.conflicts?.length);
 assert.throws(()=>f.app.repairArchiveConflict({index:String(index),values:{['conflict:'+index+':0']:'left'}}),/同一对象/);
 assert.equal(stable(pending.data),before);assert.equal(pending.changes.length,count);assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,0);
});
