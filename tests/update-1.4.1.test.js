import {filterPeopleBatch} from '../src/taishi-people.js';
import {taishiScope} from '../src/taishi-context.js';
import {taishiPerson as memoryPerson} from '../src/taishi-memory.js';
import {RuntimeLog} from '../src/runtime-log.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {createArchiveBatch,archiveBatchSources,advanceArchiveBatch,validateArchiveBatch} from '../src/archive-batch.js';
import {archiveReadText,clone,stable,validateState} from '../src/core.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {archiveSources,normalizeArchiveBatch,archivePrompt} from '../src/archive-review.js';
import {creationConfig} from '../src/creation-config.js';
import {undoArchiveUpdate} from '../src/archive-journal.js';
import {relationLinks,assertRelation} from '../src/taishi-relations.js';
import {worldLinksHTML} from '../src/taishi-world.js';
import {exportModule,validateModuleBackup} from '../src/module-backup.js';

const range={mode:'range',from:1,to:'',floors:2,characters:4000};
const dialogue=mes=>({mes,is_user:false,swipe_id:0});
test('batch planner covers more than 80 floors once, excludes user/system messages and fixes its end',()=>{
 const chat=Array.from({length:200},(_,i)=>i%2?{mes:'用户',is_user:true}:dialogue('第'+i+'层实际成果'));
 const plan=createArchiveBatch(chat,range,archiveReadText);assert.equal(plan.parts.length,50);assert.equal(plan.parts.flat().length,100);assert(!JSON.stringify(plan).includes('实际成果'));
 chat.push(dialogue('新消息不进入原计划'));let read=[];while(plan.cursor<plan.parts.length){const sources=archiveBatchSources(plan,chat,archiveReadText);read.push(...sources.map(s=>s.index));advanceArchiveBatch({archiveBatch:plan},{id:plan.id,cursor:plan.cursor},sources);}assert.equal(new Set(read).size,100);assert.equal(read.at(-1),198);assert.throws(()=>archiveBatchSources(plan,chat,archiveReadText),/完成/);
});
test('long floors split exactly without bisecting settlement opportunities or losing characters',()=>{
 const raw='叙事。'.repeat(1800)+'<WJWK-settle>本轮收益：已掌握术法\n后续机会：尚未选择登山。</WJWK-settle>'+'尾声。'.repeat(1000),chat=[dialogue(raw)];
 const p=createArchiveBatch(chat,range,archiveReadText),pieces=[];for(p.cursor=0;p.cursor<p.parts.length;p.cursor++){const s=archiveBatchSources(p,chat,archiveReadText);pieces.push(...s.map(s=>s.content));assert(s.every(s=>s.length-s.offset<=4000));}assert.equal(pieces.join(''),archiveReadText(raw));assert.equal(pieces.filter(t=>t.includes('<WJWK-settle>')).length,1);assert(pieces.find(t=>t.includes('<WJWK-settle>')).includes('</WJWK-settle>'));
 assert.throws(()=>createArchiveBatch([dialogue('<WJWK-status>'+'字'.repeat(4100)+'</WJWK-status>')],range,archiveReadText),/单个结算/);
});
test('edited swipes, tampered descriptors and stale tokens reject without advancing',()=>{
 const chat=[dialogue('实际成果已建立')],p=createArchiveBatch(chat,range,archiveReadText),sources=archiveBatchSources(p,chat,archiveReadText);assert.throws(()=>advanceArchiveBatch({archiveBatch:p},{id:'wrong',cursor:0},sources));assert.equal(p.cursor,0);chat[0].swipe_id=1;assert.throws(()=>archiveBatchSources(p,chat,archiveReadText),/变化|改写/);assert.throws(()=>validateArchiveBatch({...p,cursor:-1}));
});
function batchFixture(){const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveBatch=()=>{};f.app.ui.showArchiveReview=()=>{};f.ctx.chat=Array.from({length:7},(_,i)=>dialogue('手工测试第'+(i+1)+'层已有独立成果。'));f.calls=[];f.app.model.request=async prompt=>{const body=JSON.parse(prompt.user),s=body.sources[0];f.calls.push(s.index);return JSON.stringify({changes:[{name:'独立成果'+s.index,type:'record',status:'active',fields:{description:s.content},sourceIndex:s.index,quote:s.content}],floorReviews:[{sourceIndex:s.index,status:'reviewed',changeCount:1}]});};return f;}
test('real batch review previews without writing, commit advances only complete batches and undo restores cursor',async()=>{
 const f=batchFixture();await f.app.createArchiveBatch({values:range});const powerId=f.app.powerId;await f.app.runArchiveBatch();assert.deepEqual(f.calls,[0,1]);assert.equal(f.store.read().powers[powerId].archiveBatch.cursor,0);assert.equal(Object.keys(f.store.read().powers[powerId].archives||{}).length,0);
 const pending=f.app.pendingArchiveReview;await f.app.commitArchiveReview(pending,new Map([[0,null]]));assert.equal(f.store.read().powers[powerId].archiveBatch.cursor,0);f.app.pendingArchiveReview=null;
 await f.app.runArchiveBatch();const all=f.app.pendingArchiveReview;await f.app.commitArchiveReview(all,new Map(all.changes.map((c,i)=>[i,c.id])));f.app.pendingArchiveReview=null;assert.equal(f.store.read().powers[powerId].archiveBatch.cursor,1);
 await f.store.transact(s=>undoArchiveUpdate(s,powerId));assert.equal(f.store.read().powers[powerId].archiveBatch.cursor,0);
});
test('continuous batches save each checkpoint, stop on failure and can resume after a reload',async()=>{
 const f=batchFixture();await f.app.createArchiveBatch({values:range});const request=f.app.model.request;f.app.model.request=async (...args)=>{const i=JSON.parse(args[0].user).sources[0].index;if(i===2)throw Error('模拟上游失败');return request(...args);};
 await assert.rejects(f.app.runArchiveBatch(true),/模拟上游失败/);let p=f.store.read().powers[f.app.powerId];assert.equal(p.archiveBatch.cursor,1);assert.equal(Object.keys(p.archives).length,2);f.app.model.request=request;
 const backup=exportModule(f.store.read(),'wuku');assert.equal(validateModuleBackup(backup).state.powers[p.id].archiveBatch.cursor,1);await f.app.runArchiveBatch(true);p=f.store.read().powers[p.id];assert.equal(p.archiveBatch.cursor,p.archiveBatch.parts.length);assert.equal(Object.keys(p.archives).length,7);assert.equal(new Set(Object.values(p.archives).map(r=>r.name)).size,7);
});
test('long-floor prefix progress resumes remaining text without marking the entire floor as reviewed',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveBatch=()=>{};f.app.ui.showArchiveReview=()=>{};f.ctx.chat=[dialogue('已确认事实。'.repeat(1800))];f.app.model.request=async prompt=>{const s=JSON.parse(prompt.user).sources[0];return JSON.stringify({changes:[],floorReviews:[{sourceIndex:s.index,status:'reviewed',changeCount:0}]});};await f.app.createArchiveBatch({values:{...range,floors:1}});await f.app.runArchiveBatch();const pending=f.app.pendingArchiveReview;await f.app.commitArchiveReview(pending,new Map());const p=f.store.read().powers[f.app.powerId];assert(p.archiveReviewed[0].length<archiveReadText(f.ctx.chat[0].mes).length);assert(archiveSources(f.ctx.chat,f.store.read(),p).length);assert.equal(p.archiveBatch.cursor,1);
});
async function linkedFixture(){const f=fixture();await f.app.openTaishi();f.app.ui.showTaishiRelation=()=>{};f.app.ui.showArchive=()=>{};f.ids={};await f.store.transact(s=>{const p=s.powers[f.app.powerId],c=creationConfig(p),add=(name,kind,fields)=>{const d=c.records.find(r=>r.id===kind);return saveArchive(p,{type:'record',name,status:'active',fields:{description:name},specific:{adapterId:c.id,version:c.version,label:d.label,labels:Object.fromEntries(d.fields.map(f=>[f.id,f.label])),recordId:kind,fields}},archiveSource(f.ctx.chat,'测试确认')).id;};f.ids.world=add('海蓝界','world',{overview:'成熟文明'});f.ids.org=add('海商盟','organization',{world:'海蓝界',world_id:f.ids.world,state:'稳定',internal:'议会',pillars:'航路',official_reputation:'合法'});f.ids.a=add('甲船长','companion',{world:'海蓝界',world_id:f.ids.world,organization_id:f.ids.org,position:'船长',relationship:'普通人物'});f.ids.b=add('乙领航','companion',{world:'海蓝界',world_id:f.ids.world,relationship:'普通人物'});});return f;}
const relationValues=f=>({world_id:f.ids.world,subject_id:f.ids.a,target_id:f.ids.b,direction:'单向',state:'信任',cause:'海难救援',evidence:'玩家指定已发生的海难救援',protectRelations:'on'});
test('manual relations reuse stable endpoints, protect changes, undo and survive module backup',async()=>{
 const f=await linkedFixture();f.app.openTaishiRelation();await f.app.saveTaishiRelation(relationValues(f));let p=f.store.read().powers[f.app.powerId],r=relationLinks(p,p.archives[f.ids.a])[0];assert.equal(r.specific.fields.direction,'单向');assert(p.taishiLocks[r.id].includes('state'));assert(worldLinksHTML(p,p.archives[f.ids.b],[],String).includes(r.id));assert(worldLinksHTML(p,p.archives[f.ids.org],[],String).includes(f.ids.a));
 f.app.openTaishiRelation();await f.app.saveTaishiRelation({...relationValues(f),state:'合作'});p=f.store.read().powers[p.id];assert.equal(relationLinks(p,p.archives[f.ids.a]).length,1);assert.equal(p.archives[r.id].history.length,1);assert.equal(p.archives[r.id].specific.fields.state,'合作');assert.equal(validateModuleBackup(exportModule(f.store.read(),'taishi')).state.powers[p.id].taishiLocks[r.id].length,p.taishiLocks[r.id].length);
 const batch=normalizeArchiveBatch({changes:[{archiveId:r.id,name:r.name,type:r.type,status:'ended',fields:{terms:'敌对'},recordId:'relation',details:{state:'敌对'},sourceIndex:-1}]},p,[],f.ctx.chat,'玩家让AI整理');assert.equal(batch.changes.length,0);assert.match(batch.issues[0].reason,/保护/);
 await f.store.transact(s=>undoArchiveUpdate(s,p.id));assert.equal(f.store.read().powers[p.id].archives[r.id].specific.fields.state,'信任');
});
test('relationship direction, endpoint identities and event references are validated; empty reputation remains absent',async()=>{
 const f=await linkedFixture(),p=f.store.read().powers[f.app.powerId],fields={...relationValues(f),world:'海蓝界'};delete fields.protectRelations;assertRelation(p,{specific:{recordId:'relation',fields}});for(const patch of [{target_id:f.ids.a},{event_id:f.ids.a},{direction:'友好+10'},{cause:''},{world_id:'bad'}])assert.throws(()=>assertRelation(p,{specific:{recordId:'relation',fields:{...fields,...patch}}}));assert(!p.archives[f.ids.org].specific.fields.hidden_reputation);
 const input=JSON.parse(archivePrompt(p,[],f.ctx.chat).user);assert(input.recordSchemas.find(r=>r.id==='organization').fields.some(f=>f.id==='internal'));assert(input.recordSchemas.find(r=>r.id==='companion').fields.some(f=>f.id==='position'));
});
test('player joining identity blocks story and AI supplements from silently replacing it',async()=>{
 const f=await linkedFixture();await f.store.transact(s=>s.powers[f.app.powerId].taishiPeople={mode:'all',selected:[],pinned:[],joining:{[f.ids.a]:'npc'}});const p=f.store.read().powers[f.app.powerId];const batch=normalizeArchiveBatch({changes:[{archiveId:f.ids.a,name:'甲',type:'record',status:'active',fields:{description:'成为眷属'},recordId:'companion',details:{relationship:'已缔约'},sourceIndex:-1}]},p,[],f.ctx.chat,'AI整理这位人物的新身份');assert.equal(batch.changes.length,0);assert.match(batch.issues[0].reason,/身份/);validateState(clone(f.store.read()));
});

test('diagnostic redaction cannot break internal ticket lookup when a generated ID resembles a key',()=>{
 const log=new RuntimeLog({storage:{getItem:()=>null,setItem:()=>{}},now:()=>parseInt('ask',36)}),ticket=log.begin('取消测试');log.step(ticket,'已保存批次',{cursor:1});log.finish(ticket,'已取消');const exported=log.export().records[0];assert.equal(exported.steps.length,1);assert.equal(exported.status,'已取消');assert(!exported.id.includes('sk-'));
});

test('cancel during a later batch preserves earlier committed results and an exportable cancellation log',async()=>{
 const f=batchFixture();await f.app.createArchiveBatch({values:range});const request=f.app.model.request;let release,entered;const wait=new Promise(r=>entered=r);f.app.model.request=async (...args)=>{if(JSON.parse(args[0].user).sources[0].index===2){entered();await new Promise(r=>release=r);}return request(...args);};const run=f.app.runArchiveBatch(true);await wait;f.app.cancel();release();await assert.rejects(run,/取消|Abort/);const p=f.store.read().powers[f.app.powerId];assert.equal(p.archiveBatch.cursor,1);assert.equal(Object.keys(p.archives).length,2);assert(f.app.runtimeLog.export().records.some(r=>r.status==='已取消'));
});
test('editing an already saved floor invalidates the remaining plan instead of silently skipping its replacement',()=>{
 const chat=[dialogue('第一层事实'),dialogue('第二层事实')],p=createArchiveBatch(chat,{...range,floors:1},archiveReadText);advanceArchiveBatch({archiveBatch:p},{id:p.id,cursor:0},archiveBatchSources(p,chat,archiveReadText));chat[0].mes='替换第一层';assert.throws(()=>archiveBatchSources(p,chat,archiveReadText),/已变化/);assert.equal(p.cursor,1);
});
test('person-linked relations share the people channel without importing the other person or the full world network',async()=>{
 const f=await linkedFixture();f.app.openTaishiRelation();await f.app.saveTaishiRelation(relationValues(f));const p=f.store.read().powers[f.app.powerId],all=Object.values(p.archives),r=relationLinks(p,p.archives[f.ids.a])[0],scope=taishiScope(p,all,'甲船长');assert(scope.direct.includes(r.id));assert(memoryPerson(r));assert(!scope.direct.includes(f.ids.b));const world=taishiScope(p,all,'海蓝界');assert(!world.direct.includes(r.id));
});

test('new narrative relations use evidenced existing endpoints instead of requiring an invented relation title in prose',async()=>{
 const f=await linkedFixture(),p=f.store.read().powers[f.app.powerId],quote='甲船长在海难中救下乙领航，乙领航开始信任甲船长。';f.ctx.chat[0].mes=quote;const sources=archiveSources(f.ctx.chat,f.store.read(),p,{rescan:true});const raw={type:'bond',name:'甲船长与乙领航救援关系',status:'active',fields:{participants:'甲船长、乙领航',terms:'信任'},recordId:'relation',details:{world_id:f.ids.world,subject_id:f.ids.b,target_id:f.ids.a,direction:'单向',state:'信任',cause:'海难救援',evidence:quote},sourceIndex:0,quote};const batch=normalizeArchiveBatch({changes:[raw]},p,sources,f.ctx.chat);assert.equal(batch.issues.length,0);assert.equal(batch.changes.length,1);p.taishiPeople={mode:'selected',selected:[],pinned:[],joining:{}};filterPeopleBatch(batch,p);assert.equal(batch.changes.length,0);
});

test('a new appointment preserves the independently confirmed identity without requiring the model to repeat its prefix',async()=>{
 const f=await linkedFixture();await f.store.transact(s=>{const p=s.powers[f.app.powerId],r=p.archives[f.ids.a];p.taishiPeople={mode:'all',selected:[],pinned:[],joining:{[r.id]:'encounter'}};r.fields.role='玩家计划相遇；尚未缔约；船长';});const p=f.store.read().powers[f.app.powerId],batch=normalizeArchiveBatch({changes:[{archiveId:f.ids.a,name:'甲船长',type:'record',status:'active',fields:{description:'就任盟主'},recordId:'companion',details:{position:'盟主'},sourceIndex:-1}]},p,[],f.ctx.chat,'我确认已就任');assert.equal(batch.changes.length,1);
 const {assertTaishiClaims}=await import('../src/taishi-relations.js');const raw={fields:{role:'盟主'},details:{position:'盟主'}};assertTaishiClaims(p,raw,p.archives[f.ids.a],batch.changes[0].specific);assert.equal(raw.fields.role,'玩家计划相遇；尚未缔约；盟主');
});
