import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,stable} from '../src/core.js';
import {archiveTables} from '../src/archive-tables.js';
import {archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {builtinStatusbar} from '../src/builtin-statusbar.js';
import {WorkbenchUI} from '../src/ui.js';
import {ARCHIVE_TABLE_DEFINITIONS as definitions} from '../src/archive-table-definitions.js';
const withdrawn={'升变之印':'branches','天人骨血':'life_structures','败家生财':'spending','万灵图鉴':'shadows','力量构筑':'major','模板':'personal','等价交换':'exchanges','我全都要':'reward_group','多倍收获系统':'retained'};
const power=name=>createPower(builtinEntries().find(e=>e.name===name));
const apply=(p,changes)=>{const b=normalizeArchiveBatch({changes},p,[],[],'玩家确认的实际事实');assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((r,i)=>[i,r.id])),[]);};
test('all 75 historical categories remain accounted for, with 26 defaults and no routes pointing at retired tables',()=>{
 const previous=definitions.slice(0,23);assert.equal(previous.flatMap(d=>d.tables).length,26);assert.equal(previous.flatMap(d=>d.retiredTables).length,49);assert.equal(previous.filter(d=>d.tables.length).length,20);
 for(const d of definitions)for(const old of d.retiredTables)assert(!old.detailTarget||d.tables.some(t=>t.id===old.detailTarget));
});
for(const [name,id] of Object.entries(withdrawn))test(`${name}: withdrawn classification is absent from new requests and never changes original statusbar`,()=>{
 const p=power(name),before=stable(p),spec=archiveTables(p),input=JSON.parse(archivePrompt(p,[],[]).user);
 assert(spec.retiredTables.some(t=>t.id===id));assert(!input.recordSchemas.some(r=>r.id===id));assert(!input.longTermTables.tables.some(t=>t.id===id));assert.equal(input.originalStatusbar.source,builtinStatusbar(p).block);
 const html=Object.create(WorkbenchUI.prototype).archiveTablesPanel(p,[]);assert(!html.includes(`data-long-term-table="${id}"`));assert.equal(stable(p),before);
});
for(const name of ['等价交换','我全都要','多倍收获系统'])test(`${name}: statusbar-only path updates one original row, preserves omitted facts, and renders no empty table block`,()=>{
 const p=power(name),wallet=stable({resources:p.resources,assets:p.assets}),g=builtinStatusbar(p).groups[0],f=g.fields[0].id;
 const row=value=>({type:'record',name:g.title,status:'active',recordId:g.id,details:{[f]:value},sourceIndex:-1});
 apply(p,[row('玩家确认：已有成果等待交付')]);const id=Object.keys(p.archives)[0];apply(p,[row('玩家确认：同一成果已经交付')]);assert.equal(Object.keys(p.archives).length,1);assert.equal(Object.keys(p.archives)[0],id);assert.equal(p.archives[id].history.length,1);
 apply(p,[row('玩家确认：同一成果已经交付')]);assert.equal(p.archives[id].history.length,1);assert.equal(stable({resources:p.resources,assets:p.assets}),wallet);assert.equal(Object.create(WorkbenchUI.prototype).archiveTablesPanel(p,[]),'');
 assert(Object.create(WorkbenchUI.prototype).originalStatusbarPanel(p).includes('已经交付'));
});
test('power construction uses native named major-detail rows; switching one system never overwrites another or its shared minor source',()=>{
 const p=power('力量构筑'),group=builtinStatusbar(p).groups.find(g=>g.cardinality==='per-object'),key=group.keyField,field=group.fields.find(f=>f.id!==key).id;
 apply(p,[{type:'record',name:'残篇炎心',status:'active',recordId:'minor',details:{origin:'亲自取得残篇有效部分',benefit:'已独立生效耐热'},sourceIndex:-1}]);const minor=stable(Object.values(p.archives)[0]);
 const row=(name,value)=>({type:'record',name,status:'active',recordId:group.id,details:{[key]:name,[field]:value},sourceIndex:-1});
 apply(p,[row('炎体体系','共享残篇炎心，已形成护体循环'),row('锻造体系','共享残篇炎心，已形成控温循环')]);const before=Object.values(p.archives).find(r=>r.specific.recordId===group.id&&r.specific.fields[key]==='锻造体系');const id=before.id;
 apply(p,[row('炎体体系','原体系已深化，仍共享同一小源')]);assert.equal(Object.keys(p.archives).length,3);assert.equal(stable(p.archives[id]),stable(before));assert.equal(stable(Object.values(p.archives).find(r=>r.specific.recordId==='minor')),minor);assert(!Object.values(p.archives).some(r=>r.specific.recordId==='major'));
});
