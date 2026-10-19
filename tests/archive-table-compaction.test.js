import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,emptyState,stable,clone,validateState} from '../src/core.js';
import {creationConfig} from '../src/creation-config.js';
import {ARCHIVE_TABLE_DEFINITIONS} from '../src/archive-table-definitions.js';
import {archiveTables,tableTarget,tableForRecord} from '../src/archive-tables.js';
import {archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {archiveLibraryPage} from '../src/archive-library.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {normalizeSpecific} from '../src/specialized-records.js';
import {builtinStatusbar} from '../src/builtin-statusbar.js';
import {WorkbenchUI} from '../src/ui.js';
const entries=builtinEntries(),power=name=>createPower(entries.find(e=>e.name===name));
function legacy(p,t){const field=creationConfig(p).records.find(r=>r.id===t.id).fields[0].id;
 return saveArchive(p,{type:'record',name:'旧记录·'+t.id,status:'active',fields:{description:'用户旧版真实档案，不能自动合并或删除'},specific:normalizeSpecific({recordId:t.id,details:{[field]:'旧字段保留'}},p)},archiveSource([],'旧版本已保存'));
}
function commit(p,changes){const b=normalizeArchiveBatch({changes},p,[],[],'玩家明确确认的实际事实');assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((r,i)=>[i,r.id])),[]);}
test('all twenty powers are reviewed: 67 previous categories become 26 independent tables and 41 compatible categories',()=>{
 const previous=ARCHIVE_TABLE_DEFINITIONS.slice(0,20);assert.equal(previous.length,20);assert.equal(previous.flatMap(d=>d.tables).length,26);assert.equal(previous.flatMap(d=>d.retiredTables).length,41);
 for(const d of ARCHIVE_TABLE_DEFINITIONS){const p=power(d.name),spec=archiveTables(p),ids=new Set([...d.tables,...d.retiredTables].map(t=>t.id));assert.equal(ids.size,d.tables.length+d.retiredTables.length);assert(d.tables.length<=3);
  for(const r of spec.retiredTables)if(r.detailTarget)assert(spec.tables.some(t=>t.id===r.detailTarget));
  assert(builtinStatusbar(p));assert(!spec.tables.some(t=>t.kind==='singleton'),'current configurations belong in original statusbars');
 }
});
for(const d of ARCHIVE_TABLE_DEFINITIONS)for(const t of d.retiredTables)test(`${d.name}/${t.id}: no new insert contract, old category remains readable and explicitly updateable`,()=>{
 const p=power(d.name),wallet=stable(p.resources),before=stable(p);
 assert.throws(()=>tableTarget(p,{recordId:t.id,name:'新过程记录',operation:'insert'}),/已收拢/);assert.equal(stable(p),before);
 const prompt=JSON.parse(archivePrompt(p,[],[]).user);assert(!prompt.recordSchemas.some(r=>r.id===t.id));assert(prompt.longTermTables.consolidation.some(r=>r.recordId===t.id));
 const r=legacy(p,t),field=Object.keys(r.specific.fields)[0],snapshot=clone(p.archives);
 assert(tableForRecord(p,r).updateOnly);assert(archiveLibraryPage(p).categories.some(([id])=>id.endsWith('/'+t.id)));
 const withOld=JSON.parse(archivePrompt(p,[],[]).user);assert(withOld.recordSchemas.find(x=>x.id===t.id).updateOnly);assert.deepEqual(p.archives,snapshot);
 commit(p,[{type:'record',name:r.name,archiveId:r.id,recordId:t.id,operation:'update',status:'active',fields:{description:r.fields.description},details:{[field]:'旧对象已确认的新事实'},sourceIndex:-1}]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[r.id].specific.fields[field],'旧对象已确认的新事实');assert.equal(p.archives[r.id].history.length,1);assert.equal(stable(p.resources),wallet);
 const state=emptyState();state.powers[p.id]=p;validateState(JSON.parse(JSON.stringify(state)));
});
test('new equipment stores permanent properties and integration on its source object without multiplying rows',()=>{
 const p=power('装备栏'),before=stable({assets:p.assets,resources:p.resources});
 const r={type:'record',name:'北门铁剑甲',recordId:'equipment',operation:'insert',status:'active',fields:{description:'已正式挂载的独立铁剑'},details:{state:'已挂载',origin:'北门购买的具体实物',related_details:'攻击锋锐、防御承载永久归身；已成锋锐防护统合'},sourceIndex:-1};commit(p,[r]);const id=Object.keys(p.archives)[0];
 commit(p,[{...r,archiveId:id,operation:'update',details:{location:'实体已转让，已归身成果继续保留'}}]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[id].specific.fields.related_details,r.details.related_details);assert.equal(p.archives[id].specific.fields.state,'已挂载');assert.equal(stable({assets:p.assets,resources:p.resources}),before);
 const html=Object.create(WorkbenchUI.prototype).archiveTablesPanel(p,[]);assert.equal((html.match(/data-long-term-table=/g)||[]).length,1);assert(!html.includes('data-long-term-table="attributes"'));
});
test('original statusbar schemas remain untouched and carry current configurations instead of new singleton subtables',()=>{
 for(const name of ['图书馆','生命球','挂机','模板','每日情报']){const p=power(name),row=builtinStatusbar(p),cfg=creationConfig(p);for(const g of row.groups){const r=cfg.records.find(r=>r.id===g.id);if(!r)continue;assert(!r.fields.some(f=>f.id==='related_details'));}
  const prompt=JSON.parse(archivePrompt(p,[],[]).user);assert(prompt.originalStatusbar.tables.length);assert(prompt.longTermTables.consolidation.some(t=>t.target==='原文状态栏'));
 }
});
test('legacy response grammar without operation remains compatible; new prompts only propose compact independent records',()=>{
 const p=power('装备栏');commit(p,[{type:'record',recordId:'attributes',name:'旧协议已确认归身',status:'active',fields:{description:'旧格式真实事实'},details:{attack:'旧格式明确的永久锋锐'},sourceIndex:-1}]);
 assert.equal(Object.keys(p.archives).length,1);assert.equal(archiveTables(p).tables.length,1);assert(archiveLibraryPage(p).categories.some(([id])=>id.endsWith('/attributes')));
});
