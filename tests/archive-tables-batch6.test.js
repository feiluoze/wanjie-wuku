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
const raw=(recordId,name,details,extra={})=>({type:'record',recordId,name,status:'active',fields:{description:'正文确认的重要长期事实'},details,sourceIndex:-1,...extra});
function save(p,changes){const b=normalizeArchiveBatch({changes},p,[],[],'玩家核对确认的真实事实');assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((r,i)=>[i,r.id])),[]);return b;}
const wallet=p=>stable({resources:p.resources,assets:p.assets});
const byName=(p,name)=>Object.values(p.archives).find(r=>r.name===name);

test('sixth batch reuses four schemas for important independent objects; previous thirty defaults and 53 compatible categories remain',()=>{
 const previous=definitions.slice(0,26),ds=definitions.slice(26,29);assert.equal(previous.flatMap(d=>d.tables).length,30);assert.equal(previous.flatMap(d=>d.retiredTables).length,53);assert.equal(ds.length,3);assert.equal(ds.flatMap(d=>d.tables).length,4);assert.equal(ds.flatMap(d=>d.retiredTables).length,8);assert(ds.every(d=>!d.records));
 for(const d of ds){const p=power(d.name),before=stable(p),request=JSON.parse(archivePrompt(p,[],[]).user);for(const quote of d.sourceQuotes)assert(p.primaryRules.includes(quote));assert.equal(request.originalStatusbar.source,builtinStatusbar(p).block);assert.equal(request.longTermTables.tables.length,d.tables.length);for(const old of d.retiredTables)assert(!request.recordSchemas.some(r=>r.id===old.id));for(const group of builtinStatusbar(p).groups)assert(!creationConfig(p).records.find(r=>r.id===group.id).fields.some(f=>f.id==='related_details'));assert.equal(stable(p),before);assert.equal(archiveTables({...p,primaryRules:p.primaryRules+'修改'}),null);}
});

test('changing viewpoint, severing contact and returning preserve each important self and local life without guessed background progress',()=>{
 const p=power('同时穿越'),before=wallet(p);
 save(p,[raw('selves','仙道界·青岚之我',{world:'仙道界，青岚门内门弟子',view:'当前关注',experience:'已在当地建立师徒关系',direction:'已授权研究剑阵，仍未完成'},{operation:'insert'}),raw('selves','星海界·维修师之我',{world:'星海界，轨道站维修师',view:'已建立联系',experience:'已掌握该站真实维修知识'},{operation:'insert'})]);const a=byName(p,'仙道界·青岚之我'),b=byName(p,'星海界·维修师之我'),id=a.id;
 save(p,[raw('selves',a.name,{view:'当地被隔绝，保留原自我印记'},{archiveId:id,operation:'update'}),raw('selves',b.name,{view:'当前关注'},{archiveId:b.id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,2);assert.equal(p.archives[id].specific.fields.world,'仙道界，青岚门内门弟子');assert.equal(p.archives[id].specific.fields.direction,'已授权研究剑阵，仍未完成');assert.equal(p.archives[id].status,'active');
 save(p,[raw('selves',a.name,{view:'正文确认已经重建联系'},{archiveId:id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,2);assert.equal(byName(p,a.name).id,id);assert.equal(wallet(p),before);
});

test('an important factory remains one node through cross-world isolation and reconnection; unchanged repeat has no history',()=>{
 const p=power('战争天网'),before=wallet(p);
 save(p,[raw('industry','甲界·北湾船坞',{location:'甲界北湾',capacity:'正文确认每期只能完成一艘护卫舰',orders:'维修旧舰并维持现有生产线',connection:'已建立运输与通讯联系'},{operation:'insert'})]);const id=byName(p,'甲界·北湾船坞').id;
 save(p,[raw('industry','甲界·北湾船坞',{connection:'运输通讯暂时隔绝，原有指令继续'},{archiveId:id,operation:'update'})]);assert.equal(p.archives[id].status,'active');assert.equal(p.archives[id].specific.fields.capacity,'正文确认每期只能完成一艘护卫舰');
 save(p,[raw('industry','甲界·北湾船坞',{connection:'正文确认恢复联系；失联期间产量未核对，不补算'},{archiveId:id,operation:'update'})]);const snap=clone(p.archives);save(p,[raw('industry','甲界·北湾船坞',{connection:'正文确认恢复联系；失联期间产量未核对，不补算'},{archiveId:id,operation:'update'})]);assert.deepEqual(p.archives,snap);
 save(p,[raw('industry','乙界·北湾船坞',{location:'乙界，另一座真实基地',orders:'已实际建成的补给节点'},{operation:'insert'})]);assert.equal(Object.keys(p.archives).length,2);assert.equal(wallet(p),before);
});

test('a dual-role industrial platform cannot be duplicated across the two active categories, even in one response',()=>{
 const p=power('战争天网');save(p,[raw('industry','北湾武装船坞',{location:'甲界',capacity:'真实生产能力及现有防御火力'},{operation:'insert'})]);const before=stable(p);
 assert.throws(()=>tableTarget(p,raw('assets','北湾武装船坞',{capabilities:'同一船坞的防御火力'},{operation:'insert'})),/原 recordId/);assert.equal(stable(p),before);
 const q=power('战争天网'),b=normalizeArchiveBatch({changes:[raw('industry','轨道城',{location:'甲界轨道',capacity:'已实际形成的工业'},{operation:'insert'}),raw('assets','轨道城',{capabilities:'同一城市的火力'},{operation:'insert'})]},q,[],[],'确认');assert.equal(b.changes.length,1);assert.equal(b.issues.length,1);assert.match(b.issues[0].reason,/互斥分类/);
});

test('war asset damage and repair update original deployment and explicit available units without regenerating lost assets',()=>{
 const p=power('战争天网'),before=wallet(p);save(p,[raw('assets','北线无人编队',{scale:'共12架；可用10架；待修2架',capabilities:'已确认侦察和护航',deployment:'北线护航'},{operation:'insert'})]);const id=byName(p,'北线无人编队').id;
 save(p,[raw('assets','北线无人编队',{scale:'正文确认维修完成，可用12架',deployment:'已调往南线'},{archiveId:id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[id].specific.fields.capabilities,'已确认侦察和护航');assert.equal(wallet(p),before);
});

test('a key herd member returns as the same member and retains delivered permanent contribution and qualification usage',()=>{
 const p=power('牧群'),before=wallet(p);save(p,[raw('members','深谷巨魔甲',{origin:'正文确认由本人真实击杀并完成放牧',abilities:'巨魔再生',state:'已独立行动，保留神智',growth:'已形成永久耐寒',related_details:'本人已永久取得巨魔再生；成员一次复生资格已用，本人独立储备已消耗，不因重归重置'},{operation:'insert'})]);const id=byName(p,'深谷巨魔甲').id;
 save(p,[raw('members','深谷巨魔甲',{state:'成员再次死亡，本源已保存'},{archiveId:id,operation:'update'})]);save(p,[raw('members','深谷巨魔甲',{state:'正文确认同一成员已重归，恢复可恢复状态'},{archiveId:id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[id].specific.fields.growth,'已形成永久耐寒');assert(p.archives[id].specific.fields.related_details.includes('资格已用'));assert.equal(wallet(p),before);
 const snap=clone(p.archives);save(p,[raw('members','深谷巨魔甲',{state:'正文确认同一成员已重归，恢复可恢复状态'},{archiveId:id,operation:'update'})]);assert.deepEqual(p.archives,snap);
});

test('all eight old categories remain searchable and patchable by original ID, without restoring their empty schemas in new prompts',()=>{
 for(const name of ['同时穿越','战争天网','牧群']){const p=power(name),before=wallet(p);for(const t of archiveTables(p).retiredTables){const field=t.fields[0].id;
  assert.throws(()=>tableTarget(p,raw(t.id,'普通流水',{[field]:'不应新建'},{operation:'insert'})),/已收拢/);
  save(p,[raw(t.id,'旧档·'+t.id,{[field]:'真实旧事实，不自动删除或迁移'})]);const r=byName(p,'旧档·'+t.id);assert(tableForRecord(p,r).updateOnly);save(p,[raw(t.id,r.name,{[field]:'正文确认的新状态'},{archiveId:r.id,operation:'update'})]);assert(archiveLibraryPage(p).categories.some(([id])=>id.endsWith('/'+t.id)));assert(JSON.parse(archivePrompt(p,[],[]).user).recordSchemas.find(x=>x.id===t.id).updateOnly);
 }const state=emptyState();state.powers[p.id]=p;validateState(JSON.parse(JSON.stringify(state)));assert.equal(wallet(p),before);}
});
