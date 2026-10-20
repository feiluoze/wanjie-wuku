import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,stable} from '../src/core.js';
import {ARCHIVE_TABLE_DEFINITIONS} from '../src/archive-table-definitions.js';
import {archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {setRecordFrameworks,nativeFramework} from '../src/record-frameworks.js';
import {frameworkChoicesHTML,nativeFrameworkCoverage} from '../src/record-framework-ui.js';
import {WorkbenchUI} from '../src/ui.js';
const entries=builtinEntries(),power=name=>createPower(entries.find(e=>e.name===name));

test('every active native table is actually requested under its matching framework, without a generic duplicate',()=>{
 let count=0;
 for(const definition of ARCHIVE_TABLE_DEFINITIONS)for(const table of definition.tables){
  const p=power(definition.name),framework=nativeFramework(definition,table.id);setRecordFrameworks(p,[framework]);
  const before=stable(p),request=archivePrompt(p,[],[]),payload=JSON.parse(request.user);
  assert(payload.longTermTables.tables.some(t=>t.id===table.id),definition.name+'/'+table.id);
  assert(payload.recordSchemas.some(t=>t.id===table.id));
  assert(!payload.longTermTables.tables.some(t=>t.id==='framework_'+framework));
  assert(request.system.includes('不能用主表长清单代替子表明细'));
  assert(payload.longTermTables.fillDecision.firstRecord.includes('首次记录不要求先有archiveId'));
  assert(payload.longTermTables.fillDecision.existingRecord.includes('同一事实重复提及且无变化'));
  const coverage=nativeFrameworkCoverage(p);assert(coverage.tables.some(t=>t.id===table.id&&t.fields.length));
  const html=frameworkChoicesHTML(p);assert(html.includes(`data-native-table="${table.id}"`));
  assert.equal(stable(p),before);count++;
 }
 assert.equal(count,59);
});

test('a confirmed pre-existing object can first enter an empty generic table, then deepen without duplicating',()=>{
 const p=power('源堡');setRecordFrameworks(p,['regions']);
 const candidate=(operation,details,archiveId)=>({type:'record',recordId:'framework_regions',operation,name:'源堡内田圃',status:'active',fields:{description:'剧情确认早已建成的田圃'},details,sourceIndex:-1,...(archiveId?{archiveId}:{})});
 const save=raw=>{const b=normalizeArchiveBatch({changes:[raw]},p,[],[],'玩家核对这块田圃早已建成');assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((r,i)=>[i,r.id])),[]);};
 save(candidate('insert',{kind:'已经建成的田圃',purpose:'长期种植药材'}));
 const first=Object.values(p.archives)[0];assert(first);assert.equal(first.specific.recordId,'framework_regions');
 save(candidate('update',{inputs:'已修通灌溉水源'},first.id));
 assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[first.id].specific.fields.purpose,'长期种植药材');
 assert.equal(p.archives[first.id].specific.fields.inputs,'已修通灌溉水源');
 const before=stable(p);save(candidate('update',{inputs:'已修通灌溉水源'},first.id));assert.equal(stable(p),before);
 const payload=JSON.parse(archivePrompt(p,[],[]).user),table=payload.longTermTables.tables[0];
 assert(table.update.includes('首次建档'));assert(table.update.includes('尚无对应独立档案'));assert(!table.update.includes('仅更新真实变化'));
});

test('unselected native tables are explained in the chooser but never silently requested or enabled',()=>{
 const p=power('心渊');setRecordFrameworks(p,[]);const before=stable(p),payload=JSON.parse(archivePrompt(p,[],[]).user);
 assert.equal(payload.longTermTables.tables.length,0);assert(!payload.recordSchemas.some(t=>['scars','relics'].includes(t.id)));
 const html=frameworkChoicesHTML(p);assert(html.includes('永久渊痕'));assert(html.includes('重要遗藏与钥痕'));assert(html.includes('未勾选就不自动填写'));
 assert(!html.includes(' checked'));assert.equal(stable(p),before);
});

test('source castle coverage distinguishes native knowledge from generic additions and does not revive retired categories',()=>{
 const p=power('源堡');setRecordFrameworks(p,['regions']);const html=frameworkChoicesHTML(p),coverage=nativeFrameworkCoverage(p);
 assert.deepEqual(coverage.tables.map(t=>t.id),['records']);assert(html.includes('复用自带子表：'));assert(!html.includes('data-native-table="assets"'));
 assert(coverage.tables.every(t=>t.frameworkId==='knowledge'));
 const custom={...p,primaryRules:p.primaryRules+'自定义改写'};assert.equal(nativeFrameworkCoverage(custom).tables.length,0);
 assert(frameworkChoicesHTML(custom).includes('当前规则没有匹配的专属长期子表'));
});

test('native responses save into their declared table and immediately render visible facts, including empty tables',()=>{
 const p=power('心渊');setRecordFrameworks(p,['abilities','assets']);
 const batch=normalizeArchiveBatch({changes:[{type:'record',recordId:'scars',operation:'insert',name:'耐火渊痕<script>',status:'active',fields:{description:'已取得的永久特征'},details:{effect:'火焰灼伤减轻'},sourceIndex:-1}]},p,[],[],'玩家明确确认已取得耐火渊痕');
 assert.deepEqual(batch.issues,[]);applyArchiveChanges(p,batch.changes,[],new Map(batch.changes.map((r,i)=>[i,r.id])),[]);
 const before=stable(p),html=Object.create(WorkbenchUI.prototype).archiveTablesPanel(p,[]);
 assert.equal((html.match(/data-long-term-table=/g)||[]).length,2);assert(html.includes('<tbody>'));assert(html.includes('火焰灼伤减轻'));assert(html.includes('耐火渊痕&lt;script&gt;'));
 assert(html.includes('暂无记录'));assert(!html.includes('wjwk-long-term-more'));assert(!html.includes('<script>'));assert.equal(stable(p),before);
});
