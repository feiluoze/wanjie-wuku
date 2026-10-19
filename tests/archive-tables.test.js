import test from 'node:test';import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';import {createPower,emptyState,clone,stable,validateState} from '../src/core.js';
import {ARCHIVE_TABLE_DEFINITIONS} from '../src/archive-table-definitions.js';import {archiveTables,tableTarget,archiveWriteCounts} from '../src/archive-tables.js';import {creationConfig} from '../src/creation-config.js';
import {archiveSources,normalizeArchiveBatch,applyArchiveChanges,archivePrompt} from '../src/archive-review.js';import {createArchiveStaging} from '../src/archive-staging.js';import {reviewHistory} from '../src/archive-history.js';
import {memoryPlan} from '../src/archive-memory.js';import {archiveLibraryPage} from '../src/archive-library.js';import {WorkbenchUI} from '../src/ui.js';import {archiveSource,saveArchive} from '../src/archives.js';
import {fixture} from './mvu-fixture.js';
const entries=builtinEntries(),power=name=>createPower(entries.find(e=>e.name===name));
const raw=(recordId,name,details,extra={})=>({type:'record',recordId,name,status:'active',fields:{description:'玩家确认的长期事实'},details,sourceIndex:-1,...extra});
const local=(p,rows)=>normalizeArchiveBatch({changes:rows},p,[],[],'玩家确认已有事实');
const save=(p,b)=>applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((c,i)=>[i,c.id])),[]);

test('nine exact current powers expose 28 bounded tables and only seven missing record schemas are added',()=>{
 assert.equal(ARCHIVE_TABLE_DEFINITIONS.length,9);assert.equal(ARCHIVE_TABLE_DEFINITIONS.flatMap(d=>d.tables).length,28);assert.equal(ARCHIVE_TABLE_DEFINITIONS.flatMap(d=>d.records||[]).length,7);
 for(const d of ARCHIVE_TABLE_DEFINITIONS){const p=power(d.name),spec=archiveTables(p),cfg=creationConfig(p);assert(spec,d.name);assert.equal(spec.adapter,d.adapter);assert.equal(new Set(cfg.records.map(r=>r.id)).size,cfg.records.length);
  for(const t of spec.tables){assert(t.retain.length>4);assert(t.update.length>8);assert(t.fields.length);assert(!t.fields.some(f=>f.id==='balance'));}
  assert.equal(JSON.parse(archivePrompt(p,[],[],'确认').user).longTermTables.tables.length,spec.tables.length);
  p.primaryRules+=' changed';assert.equal(archiveTables(p),null);
 }
 assert.equal(archiveTables(power('深蓝')),null);
 const p=power('天人骨血');p.adapterBinding={config:{id:'custom.owner',records:[],operations:[]}};assert.equal(archiveTables(p),null);
});

for(const d of ARCHIVE_TABLE_DEFINITIONS)for(const t of d.tables)test(`${d.name}/${t.id}: stable row identity, partial updates, no-op and state persistence`,()=>{
 const p=power(d.name),table=archiveTables(p).tables.find(x=>x.id===t.id),field=table.fields[0].id,wallet=stable(p.resources),name='独立对象甲';
 let b=local(p,[raw(t.id,name,{[field]:'已有明确依据'},{operation:'insert'})]);assert.deepEqual(b.issues,[]);save(p,b);const r=Object.values(p.archives)[0],id=r.id;
 b=local(p,[raw(t.id,r.name,{[field]:'本次已确认深化'},{archiveId:id,operation:'update'})]);assert.deepEqual(b.issues,[]);save(p,b);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[id].history.length,1);
 const before=clone(p.archives);save(p,b);assert.equal(p.archives[id].history.length,1);assert.equal(stable(p.resources),wallet);
 assert.throws(()=>tableTarget(p,{recordId:t.id,name:r.name,operation:'insert'}),/已有对象/);
 b=local(p,[raw(t.id,r.name,{[field]:'本次已确认深化'},{archiveId:id,operation:'transition',status:'ended'})]);assert.deepEqual(b.issues,[]);const saved=save(p,b);assert.equal(p.archives[id].status,'ended');assert.equal(archiveWriteCounts(before,saved,1).ended,1);
 const state=emptyState();state.powers[p.id]=p;validateState(clone(state));
});

test('independent orders remain separate; exact title updates, singleton slots and classification boundaries are enforced',()=>{
 const p=power('万界网购');let b=local(p,[raw('orders','铁剑订单·北门首购',{item:'铁剑一柄'}),raw('orders','铁剑订单·北门再购',{item:'铁剑一柄'})]);assert.deepEqual(b.issues,[]);save(p,b);assert.equal(Object.keys(p.archives).length,2);
 const r=Object.values(p.archives)[0];assert.throws(()=>tableTarget(p,{recordId:'assets',archiveId:r.id,name:r.name,operation:'update'}),/同一分类/);
 assert.throws(()=>tableTarget(p,{recordId:'orders',name:'不存在',operation:'update'}),/唯一原对象/);assert.throws(()=>tableTarget(p,{recordId:'orders',name:'坏操作',operation:'delete'}),/不允许删除/);
 assert.throws(()=>tableTarget(p,{recordId:'orders',name:'订单与交付',operation:'insert'}),/具体对象/);
 const seal=power('升变之印');b=local(seal,[raw('slot','孵化任务甲',{task:'已开始甲任务'})]);save(seal,b);b=local(seal,[raw('slot','任意新的标题',{progress:'本次已有进展'})]);assert.equal(b.changes[0].id,Object.keys(seal.archives)[0]);save(seal,b);assert.equal(Object.keys(seal.archives).length,1);
});

test('ambiguous names never merge; old generic rows stay intact; different declared tables may share an object name',()=>{
 const p=power('天人骨血');let b=local(p,[raw('life_features','骨甲',{effect:'已经纳入骨甲'}),raw('life_structures','骨甲',{effect:'已形成统合骨甲'})]);assert.deepEqual(b.issues,[]);save(p,b);assert.equal(Object.keys(p.archives).length,2);
 const old=saveArchive(p,{type:'record',name:'旧通用生命特征',status:'active',fields:{description:'旧档保留'}},archiveSource([],'保留旧来源'));const snapshot=stable(old);
 b=local(p,[raw('life_features',old.name,{effect:'改写旧档'},{operation:'insert'})]);assert(b.issues.length);assert.equal(stable(p.archives[old.id]),snapshot);
 const r=Object.values(p.archives).find(r=>r.specific?.recordId==='life_features');p.archives.copy={...clone(r),id:'copy'};assert.throws(()=>tableTarget(p,{recordId:'life_features',name:r.name,operation:'update'}),/多份/);
});

function historyFixture(){
 const p=power('天人骨血'),state=emptyState();state.powers[p.id]=p;
 const chat=[{is_user:false,mes:'天人骨血已从真实龙鳞纳入耐热鳞甲，能够抵御烈火。'},{is_user:false,mes:'天人骨血耐热鳞甲再次深化，耐热范围扩展，仍由原鳞甲承担。'}];
 return {p,state,chat,sources:archiveSources(chat,state,p,{rescan:true})};
}
test('historical working copy exposes earlier candidates without provisional IDs; final confirmation folds patches into one row',async()=>{
 const {p,state,chat,sources}=historyFixture(),initial=stable(p),stage=createArchiveStaging(p,{normalize:normalizeArchiveBatch,apply:applyArchiveChanges,chat,state});let calls=0;
 const result=await reviewHistory(sources,async s=>{
  const input=JSON.parse(stage.prompt(archivePrompt(stage.power,[s],chat)).user);calls++;
  if(s.index===1){assert.equal(input.current.length,1);assert.equal(input.current[0].archiveId,undefined);assert.equal(input.current[0].pendingInBatch,true);assert.equal(input.current[0].details.effect,'能够抵御烈火');}
  return {data:{changes:[raw('life_features','耐热鳞甲',s.index?{change:'耐热范围扩展'}:{origin:'真实龙鳞',effect:'能够抵御烈火'},{operation:s.index?'update':'insert',sourceIndex:s.index,quote:s.content})],floorReviews:[{sourceIndex:s.index,status:'reviewed',changeCount:1}]}};
 },{stage:(data,s)=>stage.accept(data,s)});
 assert.equal(calls,2);assert.equal(stable(p),initial);assert.equal(result.data.changes[1].operation,undefined);assert(!JSON.stringify(result.data).includes(Object.keys(stage.power.archives||{})[0]));
 const b=normalizeArchiveBatch(result.data,p,sources,chat,'',state,{chronological:true});assert.deepEqual(b.issues,[]);
 const saved=applyArchiveChanges(p,b.changes,sources,new Map(b.changes.map((c,i)=>[i,c.id])),chat);assert.equal(saved.length,2);assert.equal(Object.keys(p.archives).length,1);const r=Object.values(p.archives)[0];assert.equal(r.specific.fields.effect,'能够抵御烈火');assert.equal(r.specific.fields.change,'耐热范围扩展');assert.equal(r.history.length,1);assert.deepEqual(archiveWriteCounts({},saved,2),{operations:2,objects:1,created:1,updated:0,ended:0,unchanged:0});validateState(state);
});

test('real review controller sends the working view, keeps the preview isolated and commits one row with both floor patches',async()=>{
 const f=fixture(),p=power('天人骨血');f.state.powers={[p.id]:p};f.app.powerId=p.id;f.ctx.chat=[{is_user:false,mes:'天人骨血已经取得永久耐火皮肤，来源于真实火蜥蜴样本。'},{is_user:false,mes:'天人骨血耐火皮肤本次已深化，耐热范围扩展。'}];f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};f.app.refresh();let calls=0;
 f.app.model.request=async prompt=>{const data=JSON.parse(prompt.user),source=data.sources[0];assert.equal(data.sources.length,1);if(calls){assert(data.batchWorkingView);assert(data.current.some(r=>r.name==='耐火皮肤'&&r.pendingInBatch&&!r.archiveId));}calls++;return JSON.stringify({changes:[raw('life_features','耐火皮肤',source.index?{change:'耐热范围扩展'}:{effect:'永久耐火皮肤',origin:'真实火蜥蜴样本'},{operation:source.index?'update':'insert',sourceIndex:source.index,quote:f.ctx.chat[source.index].mes})],floorReviews:[{sourceIndex:source.index,status:'reviewed',changeCount:1}],message:'候选待确认'});};
 await f.app.reviewArchives({rescan:true});assert.equal(calls,2);assert.equal(Object.keys(f.store.read().powers[p.id].archives||{}).length,0);const pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,2);assert.deepEqual(pending.issues,[]);
 const result=await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,i)=>[i,c.id]))),saved=f.store.read().powers[p.id];assert.equal(Object.keys(saved.archives).length,1);assert.equal(Object.values(saved.archives)[0].specific.fields.change,'耐热范围扩展');assert.equal(result.counts.objects,1);assert.equal(result.counts.operations,2);assert.equal(f.replacementCount,0);
});

test('invalid/uncertain floor and cancellation cannot affect the official archive or leak a working copy into another run',async()=>{
 for(const mode of ['invalid','missing-report','wrong-count','duplicate-report','uncertain']){
  const {p,state,chat,sources}=historyFixture(),initial=stable(p),stage=createArchiveStaging(p,{normalize:normalizeArchiveBatch,apply:applyArchiveChanges,chat,state});
  const data={changes:[raw('life_features','耐热鳞甲',mode==='invalid'?{unknown:'错误列'}:{effect:'能够抵御烈火'},{sourceIndex:0,quote:sources[0].content})],floorReviews:mode==='missing-report'?[]:[{sourceIndex:0,status:mode==='uncertain'?'uncertain':'reviewed',changeCount:mode==='wrong-count'?7:1}]};if(mode==='duplicate-report')data.floorReviews.push({...data.floorReviews[0]});
  stage.accept(data,sources[0]);assert.equal(Object.keys(stage.power.archives||{}).length,0,mode);assert.equal(stable(p),initial);assert.equal(Object.keys(createArchiveStaging(p,{normalize:normalizeArchiveBatch,apply:applyArchiveChanges,chat,state}).power.archives||{}).length,0);
 }
 const {p,state,chat,sources}=historyFixture(),initial=stable(p),stage=createArchiveStaging(p,{normalize:normalizeArchiveBatch,apply:applyArchiveChanges,chat,state});let stop=false;
 await assert.rejects(reviewHistory(sources,async s=>({data:{changes:[raw('life_features','耐热鳞甲',{effect:'能够抵御烈火'},{sourceIndex:s.index,quote:s.content})],floorReviews:[{sourceIndex:s.index,status:'reviewed',changeCount:1}]}}),{stage:(data,s)=>{const result=stage.accept(data,s);stop=true;return result;},check:()=>{if(stop)throw new DOMException('取消','AbortError');}}),{name:'AbortError'});assert.equal(stable(p),initial);
});

test('late insert of an earlier proposed object is rejected even in final chronological validation',()=>{
 const {p,state,chat,sources}=historyFixture(),data={changes:sources.map(s=>raw('life_features','耐热鳞甲',{effect:'已经取得'},{operation:'insert',sourceIndex:s.index,quote:s.content}))};
 const b=normalizeArchiveBatch(data,p,sources,chat,'',state,{chronological:true});assert.equal(b.changes.length,1);assert.equal(b.issues.length,1);assert.match(b.issues[0].reason,/前层/);
});

test('event tables stay queryable but do not auto-inject repeated receipt memory; explicit memory remains available',()=>{
 const p=power('败家生财'),b=local(p,[raw('spending','买粮支出',{outgoing:'支付100银',refund:'补回100银'}),raw('wealth','家产',{kind:'银币',current:'实际持有120银'})]);assert.deepEqual(b.issues,[]);save(p,b);
 const s=emptyState();s.powers[p.id]=p;const r=Object.values(p.archives).find(r=>r.specific.recordId==='spending'),config={auto:true,budget:12000,selections:{}};
 let plan=memoryPlan(s,[],'买粮支出 家产',config);assert(!plan.included.some(x=>x.id===p.id+'/'+r.id));assert(!plan.packet.includes('支付100银'));assert(plan.packet.includes('家产'));
 config.selections[p.id+'/'+r.id]={mode:'pinned'};plan=memoryPlan(s,[],'',config);assert(plan.packet.includes('支付100银'));
});

test('empty tables can be opened before first record; table browser filters independently and escapes user content',()=>{
 const p=power('心渊'),categories=archiveLibraryPage(p).categories;assert(categories.some(([id])=>id.endsWith('/scars')));assert.equal(archiveLibraryPage(p,{category:creationConfig(p).id+'/scars'}).matched,0);
 const b=local(p,[raw('scars','<script>渊痕</script>',{effect:'耐热'}),raw('relics','钥痕',{kind:'权限'},{status:'ended'})]);save(p,b);
 assert.equal(archiveLibraryPage(p,{category:creationConfig(p).id+'/scars',query:'耐热'}).matched,1);assert.equal(archiveLibraryPage(p,{status:'ended'}).matched,1);
 const ui=Object.create(WorkbenchUI.prototype);ui.view={power:p};const html=ui.archiveTablesPanel(p,[]);assert(html.includes('data-category='));assert(html.includes('长期档案'));assert(!html.includes('<script>'));const card=ui.archiveCard(Object.values(p.archives)[0],[],false,true);assert(card.includes('&lt;script&gt;'));assert(card.includes('永久效果'));
});
