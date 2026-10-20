import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {archivePrompt,archiveSources,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {saveArchive,archiveSource,ARCHIVE_FIELDS} from '../src/archives.js';
import {prepareArchiveFields} from '../src/archive-field-input.js';
import {floorCoverage} from '../src/archive-protocol.js';
import {archiveInputRecord} from '../src/archive-input.js';
import {createArchiveStaging} from '../src/archive-staging.js';
import {WorkbenchUI} from '../src/ui.js';

function setup(){
 const f=fixture();f.ctx.chat=[{is_user:false,mes:'深蓝研究进度65%，矿石40。'},{is_user:false,mes:'深蓝研究进度55%到60%，矿石25到30，独立取得晶体两枚。'}];
 const old=saveArchive(f.power,{type:'research',name:'试验项目',status:'working',fields:{progress:'65%',goal:'原目标',outcome:'矿石40'}},archiveSource([],'玩家确认研究进度65%，矿石40'));
 const sources=archiveSources(f.ctx.chat,f.state,f.power,{rescan:true}).filter(s=>s.index===1);
 const raw={archiveId:old.id,ownerPowerId:f.power.id,type:'research',name:old.name,status:'ended',fields:{progress:'60%',goal:'原目标',outcome:'矿石40；独立新增晶体两枚'},sourceIndex:1,quote:f.ctx.chat[1].mes,uncertainFields:[{section:'fields',field:'progress',reason:'原有65%，本层从55%开始，缺少原因'}]};
 return {...f,old,sources,raw};
}
test('source conflict isolates a field, preserves status and accepts independently supported changes without advancing coverage',()=>{
 const f=setup(),data={changes:[f.raw],floorReviews:[{sourceIndex:1,status:'uncertain',changeCount:1,reason:'研究进度起点冲突'}]};
 const batch=normalizeArchiveBatch(data,f.power,f.sources,f.ctx.chat,'',f.state);
 assert.equal(batch.changes.length,1);assert.equal(batch.changes[0].patch.progress,undefined);assert.equal(batch.changes[0].status,'working');assert.match(batch.issues[0].reason,/原有65%/);assert.deepEqual(batch.blockedFloors,[1]);
 assert.equal(floorCoverage(data,f.sources,batch.changes)[0].reason,'研究进度起点冲突');
 const stage=createArchiveStaging(f.power,{normalize:normalizeArchiveBatch,apply:applyArchiveChanges,chat:f.ctx.chat,state:f.state});stage.accept(data,f.sources[0]);assert.equal(stage.power.archives[f.old.id].fields.outcome,'矿石40');
 applyArchiveChanges(f.power,batch.changes,f.sources,new Map([[0,f.old.id]]),f.ctx.chat,{blockedFloors:new Set(batch.blockedFloors)});
 assert.equal(f.power.archives[f.old.id].fields.progress,'65%');assert.equal(f.power.archives[f.old.id].fields.outcome,'矿石40；独立新增晶体两枚');assert.equal(f.power.archives[f.old.id].status,'working');
 assert.equal(f.raw.fields.progress,'60%');assert(f.raw.uncertainFields);
});
test('all conflicted fields retain diagnostics and no writable empty candidate',()=>{
 const f=setup();f.raw.fields={progress:'60%'};
 const batch=normalizeArchiveBatch({changes:[f.raw]},f.power,f.sources,f.ctx.chat,'',f.state);
 assert.equal(batch.changes.length,0);assert.match(batch.issues[0].reason,/本条字段均待核对/);assert.equal(batch.issues[0].candidate.fields.progress,'60%');
});
test('normal decreases are not inferred to be conflicts or replaced by maximum values',()=>{
 const f=setup();delete f.raw.uncertainFields;f.raw.fields={progress:'60%'};f.raw.status='working';
 f.ctx.chat[1].mes='深蓝研究返工，进度从65%降到60%。';f.sources=archiveSources(f.ctx.chat,f.state,f.power,{rescan:true}).filter(s=>s.index===1);f.raw.quote=f.ctx.chat[1].mes;
 const batch=normalizeArchiveBatch({changes:[f.raw]},f.power,f.sources,f.ctx.chat,'',f.state);assert.deepEqual(batch.issues,[]);assert.equal(batch.changes[0].patch.progress,'60%');
});
test('specific columns and aliases are isolated, invalid conflict metadata cannot bypass validation',()=>{
 const definition={id:'sample',fields:[{id:'stock',label:'库存'},{id:'finding',label:'发现'}]};
 const input={type:'record',recordId:'sample',fields:{},details:{库存:'30',finding:'晶体两枚'},uncertainFields:[{section:'details',field:'stock',reason:'旧值40，起点25'}]};
 const result=prepareArchiveFields(input,ARCHIVE_FIELDS,definition,{records:[definition]});assert.deepEqual(result.raw.details,{finding:'晶体两枚'});assert.equal(result.held[0].value,'30');
 for(const conflict of [{section:'fields',field:'ownerPowerId',reason:'不能绕过归属'},{section:'details',field:'made_up',reason:'未知列'},{section:'details',field:'stock',reason:''}])assert.throws(()=>prepareArchiveFields({...input,uncertainFields:[conflict]},ARCHIVE_FIELDS,definition,{records:[definition]}));
});
test('prompt exposes source chronology, field isolation and optional diagnostics in wire schema',()=>{
 const f=setup(),record=archiveInputRecord({...f.old,source:{anchor:{index:23}}});assert.equal(record.lastSourceIndex,23);
 const prompt=archivePrompt(f.power,f.sources,f.ctx.chat);assert.match(prompt.system,/不能一律取最大值/);assert.match(prompt.system,/同一字段混有可靠与冲突内容/);
 assert(prompt.archiveSchema.properties.floorReviews.items.properties.reason);
 assert(prompt.archiveSchema.properties.changes.items.anyOf.every(v=>v.properties.uncertainFields));
 const missing=floorCoverage({floorReviews:[{sourceIndex:1,status:'reviewed',changeCount:2,reason:'不能覆盖数量校验'}]},f.sources,[])[0];assert.equal(missing.status,'uncertain');assert.equal(missing.reason,'逐层报告与候选数量不一致（仅诊断，不阻止保存）');
});
test('real review controller preserves uncertainty through confirmation and does not mark the conflicted floor read',async()=>{
 const f=setup();await f.store.transact(s=>{s.powers[f.power.id]=structuredClone(f.power);});f.app.refresh();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};
 f.app.model.request=async()=>JSON.stringify({changes:[f.raw],floorReviews:[{sourceIndex:0,status:'reviewed',changeCount:0},{sourceIndex:1,status:'uncertain',changeCount:1,reason:'研究进度起点冲突'}],message:'有效字段可单独保存'});
 await f.app.reviewArchives({rescan:true});const pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,1);assert.equal(pending.floorReviews.find(r=>r.sourceIndex===1).reason,'研究进度起点冲突');
 await f.app.commitArchiveReview(pending,new Map([[0,f.old.id]]));const saved=f.store.read().powers[f.power.id];
 assert.equal(saved.archives[f.old.id].fields.progress,'65%');assert.equal(saved.archives[f.old.id].fields.outcome,'矿石40；独立新增晶体两枚');assert(!saved.archiveReviewed.some(r=>r.index===1));
});
test('review renders concrete unresolved reasons as escaped text',()=>{
 const ui=Object.create(WorkbenchUI.prototype);let html='';ui.dialog=(title,body)=>{html=body;};
 ui.showArchiveReview({changes:[],issues:[],floorReviews:[{floor:26,accepted:0,status:'uncertain',reason:'库存40与30冲突<script>bad()</script>'}],readOnly:true},{name:'测试',archives:{}},[]);
 assert(html.includes('库存40与30冲突'));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
});
