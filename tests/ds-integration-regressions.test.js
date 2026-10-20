import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,clone} from '../src/core.js';
import {normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {tableTarget} from '../src/archive-tables.js';
import {reviewFloorCoverage} from '../src/archive-protocol.js';
import {createArchiveStaging} from '../src/archive-staging.js';
import {fixture} from './mvu-fixture.js';
const power=name=>createPower(builtinEntries().find(e=>e.name===name));

test('a bad detail column retains the valid patch and keeps its issue available for repair',()=>{
 const p=power('天人骨血'),raw={type:'record',recordId:'life_features',name:'耐火皮肤',status:'active',sourceIndex:-1,fields:{description:'已确认永久特征'},details:{effect:'永久耐火性质',misspelled_rank:'列名写错的明细'}};
 const b=normalizeArchiveBatch({changes:[raw]},p,[],[],'玩家确认已有耐火皮肤');
 assert.equal(b.changes.length,1);assert.equal(b.changes[0].specific.fields.effect,'永久耐火性质');assert(!Object.hasOwn(b.changes[0].specific.fields,'misspelled_rank'));
 assert.equal(b.issues.length,1);assert(b.issues[0].candidate);assert.match(b.issues[0].reason,/misspelled_rank/);
 applyArchiveChanges(p,b.changes,[],new Map([[0,null]]),[]);assert.equal(Object.values(p.archives)[0].specific.fields.effect,'永久耐火性质');
 const onlyBad=normalizeArchiveBatch({changes:[{...raw,name:'另一个对象',details:{misspelled_rank:'错列'}}]},p,[],[],'玩家确认');
 assert.equal(onlyBad.issues.length,1);assert.equal(onlyBad.changes.length,0);
});

test('same-name rows require identity, while an explicit target and a unique name still update normally',()=>{
 const p=power('万界网购'),raw={type:'record',recordId:'orders',name:'铁剑订单',status:'active',sourceIndex:-1,details:{item:'第一笔铁剑订单'}};
 const b=normalizeArchiveBatch({changes:[raw]},p,[],[],'玩家确认第一笔订单');applyArchiveChanges(p,b.changes,[],new Map([[0,null]]),[]);
 const a=Object.values(p.archives)[0],other=clone(a);a.updatedAt=1;other.id='another-order';other.updatedAt=2;other.specific.fields.item='第二笔铁剑订单';p.archives[other.id]=other;
 assert.throws(()=>tableTarget(p,{recordId:'orders',name:a.name,details:{progress:'已交付'}}),/多份/);
 assert.equal(tableTarget(p,{recordId:'orders',name:a.name,archiveId:a.id,details:{progress:'已交付'}}).before.id,a.id);
 assert.equal(tableTarget(p,{recordId:'orders',name:a.name,archiveId:other.id,details:{progress:'已交付'}}).before.id,other.id);
 assert.equal(a.specific.fields.item,'第一笔铁剑订单');assert.equal(other.specific.fields.item,'第二笔铁剑订单');
 delete p.archives[other.id];assert.equal(tableTarget(p,{recordId:'orders',name:a.name,details:{progress:'已交付'}}).before.id,a.id);
});

for(const data of [{changes:[]},{changes:[],floorReviews:[{sourceIndex:0,status:'uncertain',changeCount:0,reason:'尚未完成核对'}]},{changes:[],floorReviews:[{sourceIndex:0,status:'reviewed',changeCount:7}]}])test('ordinary reports remain optional and required Taishi coverage retains an unfinished source: '+JSON.stringify(data),()=>{
 const batch=()=>({changes:[],terminalResults:[],creationResults:[],ignoredChanges:[],issues:[],blockedFloors:[]}),sources=[{index:0}];
 const ordinary=batch();reviewFloorCoverage(ordinary,data,sources);assert.deepEqual(ordinary.blockedFloors,[]);assert.deepEqual(ordinary.issues,[]);
 const taishi=batch();reviewFloorCoverage(taishi,data,sources,{required:true});assert.deepEqual(taishi.blockedFloors,[0]);assert.equal(taishi.issues.length,1);
});

test('Taishi controller keeps an explicitly unfinished source, ordinary controller accepts no-report results',async()=>{
 for(const taishi of [false,true]){
  const f=fixture();if(taishi)await f.app.openTaishi();f.app.ui.showArchiveReview=()=>{};f.ctx.chat=[{is_user:false,mes:'海蓝界的研究尚未完成，情况待核对。'}];f.app.settings.mode='st';
  f.app.model.request=async()=>JSON.stringify({changes:[],...(taishi?{floorReviews:[{sourceIndex:0,status:'uncertain',changeCount:0,reason:'尚未完成本层核对'}]}:{}),message:'待核对'});
  const returned=await f.app.reviewArchives({rescan:true}),pending=returned||f.app.pendingArchiveReview;
  assert.deepEqual(pending.blockedFloors,taishi?[0]:[]);assert.equal(pending.issues.length,taishi?1:0);
 }
});

test('unfinished Taishi working copies do not enter the next prompt; ordinary copies need no report',async()=>{
 const f=fixture();await f.app.openTaishi();const taishi=f.store.read().powers[f.app.powerId];
 for(const [p,required] of [[taishi,true],[power('心渊'),false]]){
  let applied=0;const stage=createArchiveStaging(p,{normalize:()=>({changes:[],issues:[],terminalResults:[],creationResults:[]}),apply:()=>applied++});
  stage.accept({changes:[],floorReviews:[{sourceIndex:0,status:'uncertain',changeCount:0}]},{index:0});assert.equal(applied,required?0:1);
  stage.accept({changes:[],floorReviews:[{sourceIndex:1,status:'reviewed',changeCount:0}]},{index:1});assert.equal(applied,required?1:2);
 }
});
