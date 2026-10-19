import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,clone,stable,emptyState,validateState} from '../src/core.js';
import {creationConfig} from '../src/creation-config.js';
import {ARCHIVE_TABLE_DEFINITIONS} from '../src/archive-table-definitions.js';
import {archiveTables,tableForRecord} from '../src/archive-tables.js';
import {archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {archiveLibraryPage} from '../src/archive-library.js';
import {builtinStatusbar} from '../src/builtin-statusbar.js';
const power=name=>createPower(builtinEntries().find(e=>e.name===name));
const raw=(id,name,details,extra={})=>({type:'record',recordId:id,name,status:'active',fields:{description:'正文确认且会影响后续的重要事实'},details,sourceIndex:-1,...extra});
function save(p,changes){const b=normalizeArchiveBatch({changes},p,[],[],'玩家确认的真实重要事实');assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((r,i)=>[i,r.id])),[]);return b;}
const wallets=p=>stable({resources:p.resources,assets:p.assets});
const byName=(p,name)=>Object.values(p.archives).find(r=>r.name===name);

test('batch five adds four long-term object tables with no new schemas; previous pruning and original statusbars remain intact',()=>{
 const previous=ARCHIVE_TABLE_DEFINITIONS.slice(0,23),ds=ARCHIVE_TABLE_DEFINITIONS.slice(23,26);assert.equal(previous.flatMap(d=>d.tables).length,26);assert.equal(previous.flatMap(d=>d.retiredTables).length,49);assert.equal(ds.length,3);assert.equal(ds.flatMap(d=>d.tables).length,4);assert.equal(ds.flatMap(d=>d.retiredTables).length,4);assert(ds.every(d=>!d.records));
 for(const d of ds){const p=power(d.name),before=stable(p),cfg=creationConfig(p),request=JSON.parse(archivePrompt(p,[],[]).user);for(const q of d.sourceQuotes)assert(p.primaryRules.includes(q),d.name+': '+q);assert.equal(request.originalStatusbar.source,builtinStatusbar(p).block);assert.equal(request.longTermTables.tables.length,d.tables.length);for(const t of d.tables)assert(cfg.records.some(r=>r.id===t.id));for(const t of d.retiredTables)assert(!request.recordSchemas.some(r=>r.id===t.id));assert.equal(stable(p),before);assert.equal(archiveTables({...p,primaryRules:p.primaryRules+'自定义'}),null);}
});

test('important same-model partners retain separate lives; reconstruction preserves the same identity, abilities and unfinished work',()=>{
 const p=power('心智魔方'),before=wallets(p);
 save(p,[raw('partners','巡海甲',{prototype_source:'同型巡逻舰，对应具现；原舰仍在',identity:'甲独立人格，诞生后曾救援北湾',growth:'已成专业搜救经验',related_details:'舰装已完成耐蚀强化；下一阶段研究已有材料投入，尚未完成'},{operation:'insert'}),raw('partners','巡海乙',{prototype_source:'同型巡逻舰，对应具现',identity:'乙独立人格，参与另一项远行'},{operation:'insert'})]);
 const a=byName(p,'巡海甲'),b=clone(byName(p,'巡海乙')),id=a.id;
 save(p,[raw('partners',a.name,{state:'原躯体毁坏后按最近有效状态重构，已经召回'},{archiveId:id,operation:'update'})]);
 assert.equal(Object.keys(p.archives).length,2);assert.equal(byName(p,'巡海甲').id,id);assert.equal(p.archives[id].specific.fields.growth,'已成专业搜救经验');assert(p.archives[id].specific.fields.related_details.includes('已有材料投入'));assert.deepEqual(byName(p,'巡海乙'),b);assert.equal(wallets(p),before);
 const snapshot=clone(p.archives);save(p,[raw('partners',a.name,{state:'原躯体毁坏后按最近有效状态重构，已经召回'},{archiveId:id,operation:'update'})]);assert.deepEqual(p.archives,snapshot);
});

test('same place progresses from known coordinate to anchored mark without duplicating a visit or claiming source property',()=>{
 const p=power('旅法师'),before=wallets(p);
 save(p,[raw('places','甲界·苍松谷',{location:'甲界苍松谷',state:'已知有效坐标，尚未锚定'},{operation:'insert'})]);const id=byName(p,'甲界·苍松谷').id;
 save(p,[raw('places','甲界·苍松谷',{state:'已实际锚定永久地印',support:'正文确认建立绿色法术力联系，源地和原有宝物仍留当地'},{archiveId:id,operation:'update'})]);
 save(p,[raw('places','乙界·苍松谷',{location:'乙界的同名地域',state:'另一独立重要联系，已抵达'},{operation:'insert'})]);assert.equal(Object.keys(p.archives).length,2);assert.equal(p.archives[id].specific.fields.location,'甲界苍松谷');assert.equal(wallets(p),before);
 const snap=clone(p.archives);save(p,[raw('places','甲界·苍松谷',{state:'已实际锚定永久地印'},{archiveId:id,operation:'update'})]);assert.deepEqual(p.archives,snap);
});

test('a partial useful spell record is completed on its original ID; an actual independent fusion preserves the sources',()=>{
 const p=power('旅法师'),before=wallets(p);
 save(p,[raw('repertoire','青木护盾',{state:'仅部分结构已知',origin:'甲界实际接触的术式样本',content:'已知木质护盾结构，深层原理未知',use:'已确认可以形成有限构像'},{operation:'insert'})]);const id=byName(p,'青木护盾').id;
 save(p,[raw('repertoire','青木护盾',{state:'正文确认完成转译，可施展',content:'已实际完成木质护盾结构及其能量回路'},{archiveId:id,operation:'update'})]);assert.equal(p.archives[id].specific.fields.origin,'甲界实际接触的术式样本');
 save(p,[raw('repertoire','青木护盾·雷木融合',{state:'已实际形成独立融合术式',origin:'青木护盾和另一已掌握雷术的真实融合',use:'正文已确认可使用的雷木屏障'},{operation:'insert'})]);assert.equal(Object.keys(p.archives).length,2);assert.equal(p.archives[id].status,'active');assert.equal(wallets(p),before);
});

test('an ongoing promise preserves original obligations and future entitlement without a new row for every payment or a second wallet',()=>{
 const p=power('一言为定'),before=wallets(p);
 save(p,[raw('promises','北城·终身护林诺契',{promisor:'北城公开承诺，玩家已经选择参与',terms:'完成首期护林，取得终身每年供养；不要求再次履行初始义务',fulfillment:'首期义务已经真实完成',delivered:'持续权益已成立；下一期尚未到期',costs:'原真实投入及正文确认的独立补益已保存'},{operation:'insert'})]);const id=byName(p,'北城·终身护林诺契').id;
 save(p,[raw('promises','北城·终身护林诺契',{fulfillment:'发诺者已死亡，既成立持续权益照常有效',delivered:'正文确认次年本期供养已到账；未来给付尚未到期'},{archiveId:id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[id].specific.fields.terms,'完成首期护林，取得终身每年供养；不要求再次履行初始义务');assert.equal(wallets(p),before);
 save(p,[raw('promises','南城·独立护林诺契',{promisor:'另一发布来源的独立约定',terms:'另一期真实义务及相同名目的供养',fulfillment:'玩家已选择，尚在履行'},{operation:'insert'})]);assert.equal(Object.keys(p.archives).length,2);
});

test('compatibility categories remain queryable, serializable and updateable without bringing them back into new generation',()=>{
 for(const name of ['心智魔方','旅法师']){const p=power(name),spec=archiveTables(p),before=wallets(p);for(const t of spec.retiredTables){const field=t.fields[0].id;
  const blocked=normalizeArchiveBatch({changes:[raw(t.id,'不应新增',{[field]:'普通过程'},{operation:'insert'})]},p,[],[],'确认');assert.equal(blocked.changes.length,0);assert(blocked.issues.length);
  save(p,[raw(t.id,'旧档·'+t.id,{[field]:'历史真实内容，不删除'})]);const r=byName(p,'旧档·'+t.id);assert(tableForRecord(p,r).updateOnly);save(p,[raw(t.id,r.name,{[field]:'原ID补记真实事实'},{archiveId:r.id,operation:'update'})]);assert(archiveLibraryPage(p).categories.some(([id])=>id.endsWith('/'+t.id)));assert(JSON.parse(archivePrompt(p,[],[]).user).recordSchemas.find(x=>x.id===t.id).updateOnly);
 }const state=emptyState();state.powers[p.id]=p;validateState(JSON.parse(JSON.stringify(state)));assert.equal(wallets(p),before);}
});
