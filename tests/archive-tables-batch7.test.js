import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,clone,stable,emptyState,validateState} from '../src/core.js';
import {ARCHIVE_TABLE_DEFINITIONS as definitions} from '../src/archive-table-definitions.js';
import {archiveTables,tableTarget,tableForRecord} from '../src/archive-tables.js';
import {creationConfig} from '../src/creation-config.js';
import {builtinStatusbar} from '../src/builtin-statusbar.js';
import {archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {archiveLibraryPage} from '../src/archive-library.js';
const power=name=>createPower(builtinEntries().find(e=>e.name===name));
const raw=(recordId,name,details,extra={})=>({type:'record',recordId,name,status:'active',fields:{description:'正文已确认且可长期调用的真实成果'},details,sourceIndex:-1,...extra});
function save(p,changes){const b=normalizeArchiveBatch({changes},p,[],[],'玩家确认的真实事实');assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((r,i)=>[i,r.id])),[]);return b;}
const wallets=p=>stable({resources:p.resources,assets:p.assets});
const named=(p,name)=>Object.values(p.archives).find(r=>r.name===name);

test('seventh batch adds only four reusable knowledge and growth tables; preceding 34 defaults and 61 compatibility declarations remain',()=>{
 const prior=definitions.slice(0,29),ds=definitions.slice(29,32);assert.equal(prior.flatMap(d=>d.tables).length,34);assert.equal(prior.flatMap(d=>d.retiredTables).length,61);assert.equal(ds.length,3);assert.equal(ds.flatMap(d=>d.tables).length,4);assert.equal(ds.flatMap(d=>d.retiredTables).length,8);assert(ds.every(d=>!d.records));
 for(const d of ds){const p=power(d.name),before=stable(p),request=JSON.parse(archivePrompt(p,[],[]).user);for(const quote of d.sourceQuotes)assert(p.primaryRules.includes(quote),d.name+': '+quote);assert.equal(request.originalStatusbar.source,builtinStatusbar(p).block);for(const g of builtinStatusbar(p).groups)assert(!creationConfig(p).records.find(r=>r.id===g.id).fields.some(f=>f.id==='related_details'));assert.equal(request.longTermTables.tables.length,d.tables.length);for(const t of d.retiredTables)assert(!request.recordSchemas.some(r=>r.id===t.id));assert.equal(stable(p),before);assert.equal(archiveTables({...p,primaryRules:p.primaryRules+'修订'}),null);}
});

test('an important skill deepens on its original ID and keeps confirmed effect and limits; no missing level is invented',()=>{
 const p=power('人间游戏'),before=wallets(p);save(p,[raw('skill','引水术',{effect:'能精细引导已接触水流',limits:'正文确认尚不能控冰',growth:'已在真实灌溉中掌握'},{operation:'insert'})]);const id=named(p,'引水术').id;assert.equal(p.archives[id].specific.fields.level,undefined);
 save(p,[raw('skill','引水术',{growth:'实践中已经形成多股水流的稳定控制'},{archiveId:id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[id].specific.fields.effect,'能精细引导已接触水流');assert.equal(p.archives[id].specific.fields.limits,'正文确认尚不能控冰');assert.equal(p.archives[id].specific.fields.level,undefined);const snap=clone(p.archives);save(p,[raw('skill','引水术',{growth:'实践中已经形成多股水流的稳定控制'},{archiveId:id,operation:'update'})]);assert.deepEqual(p.archives,snap);assert.equal(wallets(p),before);
});

test('parallel professions retain independent features while skill and profession identities remain separate',()=>{
 const p=power('人间游戏'),before=wallets(p);save(p,[raw('profession','炼金师',{features:'真实已得精密配方协调',progress:'已形成职业，继续深化'},{operation:'insert'}),raw('profession','边境游侠',{features:'已得追踪与野外生存特性'},{operation:'insert'}),raw('skill','炼金师',{effect:'正文独立命名的配药专长，区别于职业整体'},{operation:'insert'})]);
 const jobs=Object.values(p.archives).filter(r=>r.specific.recordId==='profession'),alchemist=jobs.find(r=>r.name==='炼金师'),ranger=clone(jobs.find(r=>r.name==='边境游侠'));
 save(p,[raw('profession','炼金师',{progress:'当前重点已转为研究，原职业特性持续有效'},{archiveId:alchemist.id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,3);assert.deepEqual(p.archives[ranger.id],ranger);assert.equal(p.archives[alchemist.id].specific.fields.features,'真实已得精密配方协调');assert.equal(p.archives[alchemist.id].status,'active');assert.equal(wallets(p),before);
});

test('new main-overview focus never deletes or copies a previously learned skill or profession',()=>{
 const p=power('人间游戏');save(p,[raw('skill','锻造',{effect:'已掌握锻造工艺'},{operation:'insert'}),raw('profession','工匠',{features:'真实工匠特性'},{operation:'insert'})]);const existing=clone(p.archives),group=builtinStatusbar(p).groups[0],field=group.fields.find(f=>f.label==='当前成长').id;
 save(p,[raw(group.id,group.title,{[field]:'本人现在主要探索遗迹，旧有掌握仍然成立'})]);assert.equal(Object.keys(p.archives).length,3);for(const [id,row] of Object.entries(existing))assert.deepEqual(p.archives[id],row);
});

test('a reusable partial principle can be saved and corrected without claiming the unknown or creating a physical prototype',()=>{
 const p=power('大贤者'),before=wallets(p);save(p,[raw('verified','导热晶格规律',{principle:'已证成局部导热通路',evidence:'真实检测两种样本所得',application:'可用于已理解部分的散热设计',limits:'整体结构仍有未知；未制造设备'},{operation:'insert'})]);const id=named(p,'导热晶格规律').id;
 save(p,[raw('verified','导热晶格规律',{application:'已有局部原理现可复用于散热和热流监测',limits:'新证据确认高温范围仍需另测；没有实物原型'},{archiveId:id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[id].specific.fields.principle,'已证成局部导热通路');assert.equal(p.archives[id].specific.fields.evidence,'真实检测两种样本所得');assert.equal(wallets(p),before);const snap=clone(p.archives);save(p,[raw('verified','导热晶格规律',{application:'已有局部原理现可复用于散热和热流监测'},{archiveId:id,operation:'update'})]);assert.deepEqual(p.archives,snap);
});

test('production mastery survives changed needs and cross-world adaptation without turning know-how into product inventory',()=>{
 const p=power('绝对生产力'),before=wallets(p);save(p,[raw('mastery','精密船体焊接',{knowledge:'已真实掌握船体材料与焊接工艺',ability:'本人可实际进行精密焊接',scope:'原世界合金船体'},{operation:'insert'})]);const id=named(p,'精密船体焊接').id;
 save(p,[raw('mastery','精密船体焊接',{scope:'正文已确认适配新世界材料，原合金工艺仍然掌握'},{archiveId:id,operation:'update'})]);save(p,[raw('mastery','草药培育',{knowledge:'另一个已确认需求落实的真实知识',ability:'本人已经具备草药培育能力'},{operation:'insert'})]);assert.equal(Object.keys(p.archives).length,2);assert.equal(p.archives[id].specific.fields.ability,'本人可实际进行精密焊接');assert.equal(p.archives[id].status,'active');assert.equal(wallets(p),before);assert(!Object.values(p.archives).some(r=>r.specific.recordId==='products'));
});

test('old tasks, rewards, research and production categories retain IDs, fields, searches and patches without returning to empty new prompts',()=>{
 for(const name of ['人间游戏','大贤者','绝对生产力']){const p=power(name),before=wallets(p);for(const t of archiveTables(p).retiredTables){const field=t.fields[0].id;assert.throws(()=>tableTarget(p,raw(t.id,'不应新建普通流水',{[field]:'普通事件'},{operation:'insert'})),/已收拢/);
  save(p,[raw(t.id,'旧档·'+t.id,{[field]:'旧版已经确认的真实事实'})]);const r=named(p,'旧档·'+t.id);assert(tableForRecord(p,r).updateOnly);save(p,[raw(t.id,r.name,{[field]:'沿原ID补记真实变化'},{archiveId:r.id,operation:'update'})]);assert(archiveLibraryPage(p).categories.some(([id])=>id.endsWith('/'+t.id)));assert(JSON.parse(archivePrompt(p,[],[]).user).recordSchemas.find(x=>x.id===t.id).updateOnly);
 }const state=emptyState();state.powers[p.id]=p;validateState(JSON.parse(JSON.stringify(state)));assert.equal(wallets(p),before);}
});
