import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {clone,stable,validateState} from '../src/core.js';
import {creationConfig} from '../src/creation-config.js';
import {archiveSources,normalizeArchiveBatch} from '../src/archive-review.js';
import {timeProduct,appendWorldTime,clockSummary,readWorldClock,completeWorldSetting} from '../src/taishi-clock.js';
import {resolveTaishiLinks} from '../src/taishi-links.js';
import {taishiProjection,taishiScope} from '../src/taishi-context.js';
import {archiveInputRecord} from '../src/archive-input.js';
import {worldForRecord} from '../src/taishi-world.js';
import {protectEvolution} from '../src/taishi-evolution.js';

const interval=(event,extra={})=>({event,main:true,firstSetting:false,baselineYears:'0',resetYears:'0',yearDays:'365',scope:'world',unit:'years',external:'1',rate:'1',...extra});
test('time multiplication uses exact decimals and rejects silent rounding or executable values',()=>{assert.equal(timeProduct('0.1','1000000'),'100000');assert.equal(timeProduct('2.5','0.4'),'1');for(const v of ['1e6','-1','Infinity','<script>'])assert.throws(()=>timeProduct(v,'1'));assert.throws(()=>timeProduct('0.000001','0.000001'));});
test('segmented rates, local time, duplicate receipts and conflicting receipts remain distinct',()=>{
 let s=appendWorldTime(null,interval('第一段',{external:'2',rate:'100'})).state;s=appendWorldTime(s,interval('第二段',{external:'3',rate:'300'})).state;
 assert.equal(clockSummary(s).totalYears,'1100');assert(clockSummary(s).eligible);
 const local=appendWorldTime(s,interval('局部',{scope:'region',regionId:'region-a',rate:'1000000'})).state;assert.equal(clockSummary(local).totalYears,'1100');
 assert(appendWorldTime(s,interval('第二段',{external:'3.0',rate:'300.000'})).duplicate);assert.throws(()=>appendWorldTime(s,interval('第二段',{rate:'301'})),/不同记录/);
});
test('unknown calendars do not invent years, and child clocks cannot grant reset rights',()=>{
 const s=appendWorldTime(null,interval('一日',{unit:'days',yearDays:'',rate:'100'})).state;assert(clockSummary(s).unknown);assert(!clockSummary(s).eligible);
 const child=appendWorldTime(null,interval('子界',{main:false,rate:'10000'})).state;assert(!clockSummary(child).eligible);
});
test('first setting and reset consume one qualified event; fractional-year reset remains exact',()=>{
 let s=appendWorldTime(null,interval('起点',{firstSetting:true,unit:'hours'})).state;assert.equal(clockSummary(s).qualification,'首次设定资格保留');
 s=completeWorldSetting(s,'首次开天已完成').state;assert(!s.firstSetting);assert.equal(clockSummary(s).sinceResetYears,'0');assert.throws(()=>completeWorldSetting(s,'过早改设'),/未满千年/);
 s=appendWorldTime(s,interval('千年之后',{external:'1000'})).state;assert(clockSummary(s).eligible);s=completeWorldSetting(s,'千年改设完成').state;assert(!clockSummary(s).eligible);assert.equal(clockSummary(s).sinceResetYears,'0');
});
async function setup(){const f=fixture();await f.app.openTaishi();f.app.ui.showTaishiClock=()=>{};f.app.ui.showTaishiClockPreview=()=>{};f.app.ui.showTaishiDescent=()=>{};
 await f.store.transact(s=>{const p=s.powers[f.app.powerId],c=creationConfig(p);for(const name of ['海蓝界','赤砂界']){const def=c.records.find(r=>r.id==='world');saveArchive(p,{name,type:'environment',status:'active',fields:{conditions:'玩家确认世界'},specific:{adapterId:c.id,recordId:'world',version:c.version,label:def.label,labels:Object.fromEntries(def.fields.map(f=>[f.id,f.label])),fields:{overview:'成熟文明',stage:'小千世界'}}},archiveSource(f.ctx.chat,'玩家确认世界'));}});const p=f.store.read().powers[f.app.powerId];f.world=Object.values(p.archives).find(r=>r.name==='海蓝界');f.other=Object.values(p.archives).find(r=>r.name==='赤砂界');return f;}
test('controller clock preview writes nothing; confirm persists once and rejects stale windows',async()=>{
 const f=await setup(),before=stable(f.store.read());f.app.openTaishiControl('clock');f.app.previewTaishiClock({...interval('第10层'),main:'on',worldId:f.world.id,external:'2',rate:'500'});assert.equal(stable(f.store.read()),before);
 await f.app.saveTaishiClock();const p=f.store.read().powers[f.app.powerId],clock=readWorldClock(p.archives[f.world.id]);assert(clockSummary(clock).eligible);assert.equal(readWorldClock(p.archives[f.other.id]),null);assert.deepEqual(p.resources,{});
 const checkpoint=stable(f.store.read());f.app.openTaishiControl('clock');f.app.previewTaishiClock({...interval('第10层'),worldId:f.world.id,external:'2.0',rate:'500'});await f.app.saveTaishiClock();assert.equal(stable(f.store.read()),checkpoint);
 f.app.openTaishiControl('clock');await f.store.transact(s=>s.powers[f.app.powerId].active=false);assert.throws(()=>f.app.previewTaishiClock({...interval('新段'),worldId:f.world.id}),/变化/);
});
test('missing or foreign stable references reject; world rename retains links and scope',async()=>{
 const f=await setup(),p=f.store.read().powers[f.app.powerId],specific={fields:{world_id:f.world.id,world:'旧名字'}};resolveTaishiLinks(p,{specific});assert.equal(specific.fields.world,'海蓝界');assert.throws(()=>resolveTaishiLinks(p,{specific:{fields:{world_id:'fake'}}}),/不存在/);
 p.archives[f.world.id].name='海蓝新界';const r={id:'p',name:'守林人',specific:{recordId:'companion',fields:{world_id:f.world.id,world:'海蓝界'}}};assert.equal(worldForRecord(p,r,f.ctx.chat).id,f.world.id);assert(taishiScope(p,[...Object.values(p.archives),r],'守林人').includes(p.archives[f.world.id]));
});
test('descent candidates require an actual registered world, survive save without asset duplication and retract same ID',async()=>{
 const f=await setup(),p=f.store.read().powers[f.app.powerId];f.ctx.chat[0].mes='海蓝界的青岚降界已经展开在城外。';const sources=archiveSources(f.ctx.chat,f.store.read(),p,{rescan:true});
 const row={name:'青岚降界',type:'record',status:'active',fields:{description:'城外真实展开'},recordId:'manifestation',details:{world_id:f.world.id,world:'海蓝界',mode:'局部',anchor:'城外',geometry:'青岚山脉',condition:'已经展开'},sourceIndex:0,quote:f.ctx.chat[0].mes};
 const batch=normalizeArchiveBatch({changes:[row]},p,sources,f.ctx.chat);assert.equal(batch.changes.length,1);assert.equal(creationConfig(p).records.find(r=>r.id==='manifestation').fields.length,11);
 assert.equal(normalizeArchiveBatch({changes:[{...row,details:{...row.details,world_id:'fake'}}]},p,sources,f.ctx.chat).changes.length,0);
 assert.equal(normalizeArchiveBatch({changes:[{...row,recordId:'world',type:'environment',details:{time_state:'{}'}}]},p,sources,f.ctx.chat).changes.length,0);
 const beforeResources=stable(p.resources),beforeWorld=clone(p.archives[f.world.id]);f.app.refresh();
 const captured=f.store.capture();await f.app.commitArchiveReview({captured,powerId:p.id,sources,changes:batch.changes,issues:[]},new Map([[0,null]]));
 const saved=f.store.read().powers[p.id],deployment=Object.values(saved.archives).find(r=>r.specific?.recordId==='manifestation');assert.equal(Object.keys(saved.archives).length,3);assert.deepEqual(saved.archives[f.world.id],beforeWorld);assert.equal(stable(saved.resources),beforeResources);
 f.ctx.chat.push({is_user:false,mes:'海蓝界的青岚降界已经收回，救援队留在外界，原有物资损耗保留。',swipe_id:0});f.app.refresh();
 const updated=f.store.read().powers[p.id],newSources=archiveSources(f.ctx.chat,f.store.read(),updated,{rescan:true});const retract=normalizeArchiveBatch({changes:[{...row,archiveId:deployment.id,status:'ended',sourceIndex:1,quote:f.ctx.chat[1].mes,fields:{description:'已收回，实际损耗与留置保留'},details:{...row.details,mode:'收回',condition:'已经收回',flow:'救援队留在外界，损耗保留'}}]},updated,newSources,f.ctx.chat);assert.equal(retract.changes.length,1);
 await f.app.commitArchiveReview({captured:f.store.capture(),powerId:p.id,sources:newSources,changes:retract.changes,issues:[]},new Map([[0,deployment.id]]));const final=f.store.read().powers[p.id];assert.equal(Object.keys(final.archives).length,3);assert.equal(final.archives[deployment.id].status,'ended');assert.equal(final.archives[deployment.id].history.length,1);assert.deepEqual(final.archives[f.world.id],beforeWorld);assert.equal(stable(final.resources),beforeResources);

});
test('program time JSON never enters ordinary prompt or story projection; provenance does',async()=>{
 const f=await setup(),world=clone(f.world);world.specific.fields.time_state=JSON.stringify(appendWorldTime(null,interval('隐藏程序记录')).state);world.specific.fields.descent='局部展开';world.source.note='AI 建档草案，经玩家确认';const projected=taishiProjection(world),input=archiveInputRecord(world);
 assert(!projected.specific.fields.time_state);assert.equal(projected.specific.fields.descent,'局部展开');assert(!input.specific.fields.time_state);assert.match(input.provenance,/未证明正文执行/);validateState(f.store.read());
});
test('development can include evidenced personal feedback while unrelated feedback is rejected',async()=>{
 const f=await setup(),p=f.store.read().powers[f.app.powerId],world={id:f.world.id,name:f.world.name,type:'environment',status:'active',patch:{},specific:clone(f.world.specific),before:f.world,source:{}},growth={id:null,name:'轮回神通',type:'skill',status:'active',patch:{},specific:{recordId:'growth',fields:{world:f.world.name,kind:'永久神通',basis:'本轮建立独立轮回法则',retained:'已归身'}},source:{}};
 const batch={changes:[world,growth],issues:[]};protectEvolution(batch,p,{worldId:f.world.id,elapsed:1,unit:'years'});assert.equal(batch.changes.length,2);
 const bad={changes:[clone(world),{...clone(growth),specific:{recordId:'growth',fields:{world:f.world.name}}}],issues:[]};protectEvolution(bad,p,{worldId:f.world.id,elapsed:1,unit:'years'});assert.equal(bad.changes.length,1);assert(bad.issues.some(i=>i.kind==='个人反哺'));
});


test('a corrupt computed clock cannot overwrite a valid stored checkpoint',async()=>{
 const f=await setup();f.app.openTaishiControl('clock');f.app.previewTaishiClock({...interval('实际记录'),main:'on',worldId:f.world.id});await f.app.saveTaishiClock();const before=stable(f.store.read());
 await assert.rejects(f.store.transact(s=>{const w=s.powers[f.app.powerId].archives[f.world.id],clock=readWorldClock(w);clock.receipts[0].internal='999';w.specific.fields.time_state=JSON.stringify(clock);}),/换算不一致/);assert.equal(stable(f.store.read()),before);
});


test('long-running time records compact exactly while controller history prevents old event replay',async()=>{
 let s=null;for(let i=0;i<50;i++)s=appendWorldTime(s,interval('事件'+i,{unit:'hours',external:'24',rate:'365'})).state;assert.equal(clockSummary(s).totalYears,'50');assert.equal(s.receipts.length,8);
 const f=await setup();for(let i=0;i<12;i++){f.app.openTaishiControl('clock');f.app.previewTaishiClock({...interval('登记'+i),main:'on',worldId:f.world.id});await f.app.saveTaishiClock();}
 const before=stable(f.store.read());f.app.openTaishiControl('clock');f.app.previewTaishiClock({...interval('登记0'),worldId:f.world.id});assert(f.app.taishiControlDraft.preview.duplicate);await f.app.saveTaishiClock();assert.equal(stable(f.store.read()),before);
});
