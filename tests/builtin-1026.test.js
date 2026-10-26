import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {builtinEntries,withBuiltinCatalog} from '../src/builtin-worldbook.js';
import {BUILTIN_WORLDBOOK} from '../src/builtin-worldbook-data.js';
import {createPower,emptyState,clone,stable,validateState,importBook} from '../src/core.js';
import {managementProfile,assertProfileRegistration} from '../src/management-profiles.js';
import {statusbarPolicy} from '../src/builtin-statusbar.js';
import {archiveTables} from '../src/archive-tables.js';
import {creationConfig} from '../src/creation-config.js';
import {archiveSources,normalizeArchiveBatch,applyArchiveChanges,archivePrompt} from '../src/archive-review.js';
import {setRecordFrameworks,nativeFramework,frameworkCategory} from '../src/record-frameworks.js';
import {frameworkChoicesHTML} from '../src/record-framework-ui.js';
import {sourceOwnership} from '../src/archive-protocol.js';
import {assertArchiveOwnership} from '../src/archive-ownership.js';

const names=['诸天盲盒','瓦学弟','始源精灵','骇客','自动填坑','他化自在大法'];
const entries=builtinEntries(),entry=name=>entries.find(e=>e.name===name);
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));

test('1026 additions expose six main powers, one auxiliary and eleven focused tables',()=>{
 assert.equal(names.reduce((n,name)=>n+archiveTables(createPower(entry(name))).tables.length,0),11);
 for(const name of names){
  const e=entry(name),p=createPower(e);assert(e&&!e.auxiliary,name);assert.equal(managementProfile(e).match,'exact');
  assert.equal(managementProfile(e).role,'primary');assert(frameworkCategory(p));assert.equal(Object.keys(p.resources).length,0);
  const spec=archiveTables(p),schema=creationConfig(p);assert(spec.tables.length<=2);assert.equal(schema.operations.length,0);
  assert(spec.tables.every(t=>nativeFramework(spec,t.id)));assert(statusbarPolicy(p).tables.length);
  for(const t of spec.tables)assert(frameworkChoicesHTML(p).includes(t.label));
 }
 const aux=entry('骇客·技术与权能详解');assert(aux.auxiliary);assert.equal(managementProfile(aux).parent,'骇客');
 assert.throws(()=>assertProfileRegistration(aux,[],{}),/辅助规则/);
 const hacker=createPower(entry('骇客'),[aux]);assert(hacker.rules.includes(aux.content));assert.equal(hacker.companions.length,1);
 assert.equal(statusbarPolicy(hacker).tables.length,1);assert.equal(archiveTables(hacker).tables.length,2);
 assert.equal(withBuiltinCatalog(entries).filter(e=>names.includes(e.name)).length,6);
});

test('inline bracket labels form one main table and creative overview remains separate from current work',()=>{
 const wa=statusbarPolicy(createPower(entry('瓦学弟')));assert.equal(wa.tables.length,1);
 assert.deepEqual(wa.tables[0].fields.map(f=>f.label),['首次认母','义母名单','传承清单','传承状态','既得成果','本次结算']);
 const auto=statusbarPolicy(createPower(entry('自动填坑')));assert.equal(auto.tables.length,2);
 assert.equal(auto.tables[0].fields.length,6);assert.equal(auto.tables[1].fields.length,6);
 assert.equal(auto.tables[1].cardinality,'singleton');
});

test('labelled receipt ownership is shared across powers and does not confuse field labels with powers',()=>{
 const quote='传承已经取得，可直接使用。';
 for(const owner of ['瓦学弟','骇客','未接入的其他词条']){
  const source=`<WJWK-settle>【金手指】：${owner}\n${quote}</WJWK-settle>`;
  assert.deepEqual(sourceOwnership(source,quote,['瓦学弟']),[owner]);
  const p=createPower(entry('瓦学弟'));
  if(owner==='瓦学弟')assert.doesNotThrow(()=>assertArchiveOwnership(p,{}, {quote,content:source}));
  else assert.throws(()=>assertArchiveOwnership(p,{}, {quote,content:source}),/归属/);
 }
});

test('manifestation recall keeps independent results and borrowing never creates a permanent power',()=>{
 const p=createPower(entry('他化自在大法')),quote='剑修化身完成救援，随后收回；救出的村民与取得的地图仍然留存。';
 const chat=[{is_user:false,mes:`<WJWK-status>【他化自在大法·状态】\n${quote}</WJWK-status>`}],state=emptyState();state.powers[p.id]=p;
 const sources=archiveSources(chat,state,p,{rescan:true});
 const raw={type:'record',recordId:'avatars',name:'剑修化身·救援组',status:'ended',fields:{description:'化身已收回，真实成果保留'},details:{state:'已收回',outcomes:'救出村民，地图仍留在本体手中'},sourceIndex:0,quote};
 const b=normalizeArchiveBatch({changes:[raw]},p,sources,chat,'',state);assert.deepEqual(b.issues,[]);
 applyArchiveChanges(p,b.changes,sources,new Map([[0,null]]),chat);
 const saved=Object.values(p.archives)[0];assert.equal(saved.status,'ended');assert.equal(saved.specific.fields.outcomes,raw.details.outcomes);
 assert.equal(Object.keys(p.archives).length,1);assert.equal(Object.keys(p.resources).length,0);
 assert.equal(statusbarPolicy(p).tables[0].fields.length,5);validateState(clone(state));
});

test('manifestation author text is kept intact',{skip:!process.env.WJWK_AVATAR_TEXT},()=>{
 const original=readFileSync(process.env.WJWK_AVATAR_TEXT,'utf8').replace(/^\uFEFF/,'');
 assert.equal(entry('他化自在大法').content,original);
});

for(const name of names)test(name+': initial review and later changes update main and every native table without duplicate objects',()=>{
 const p=createPower(entry(name)),state=emptyState();state.powers[p.id]=p;
 const status=statusbarPolicy(p).tables[0],spec=archiveTables(p),funds=stable(p.resources);
 const quote='具体对象已建立，重要内容已经确认。';const chat=[{is_user:false,mes:`<WJWK-status>【${name}·状态】\n${quote}</WJWK-status>`}];
 const sources=archiveSources(chat,state,p,{rescan:true});
 const rows=[{recordId:status.recordId,name:status.name,details:{[status.fields[0].id]:'已确认当前状态'}},...spec.tables.map(t=>({recordId:t.id,name:'独立对象·'+t.id,details:{[t.fields[0].id]:'实际依据甲'}}))].map(r=>({...r,type:'record',status:'active',fields:{description:'已确认的重要事实'},sourceIndex:0,quote}));
 const normalize=changes=>normalizeArchiveBatch({changes},p,sources,chat,'',state);
 let b=normalize(rows);assert.deepEqual(b.issues,[],name);assert.equal(b.changes.length,rows.length);
 applyArchiveChanges(p,b.changes,sources,new Map(b.changes.map((_,i)=>[i,null])),chat);
 const originalIds=Object.keys(p.archives),before=stable(p.archives);
 b=normalize(rows);applyArchiveChanges(p,b.changes,sources,new Map(b.changes.map((r,i)=>[i,r.id])),chat);
 assert.equal(stable(p.archives),before,'repeat must not add history or records');
 const changed=rows.map(r=>({...r,details:Object.fromEntries(Object.keys(r.details).map(k=>[k,'真实后续变化乙']))}));
 b=normalize(changed);assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,sources,new Map(b.changes.map((r,i)=>[i,r.id])),chat);
 assert.deepEqual(Object.keys(p.archives),originalIds);assert.equal(stable(p.resources),funds);validateState(clone(state));
 const input=JSON.parse(archivePrompt(p,sources,chat,'').user);assert(input.originalStatusbar);assert.equal(input.longTermTables.tables.length,spec.tables.length);
 // Player selection reuses native schemas and can stop all subtable updates without deleting records.
 const framework=nativeFramework(spec,spec.tables[0].id);setRecordFrameworks(p,[framework]);
 const selected=archiveTables(p);assert(selected.tables.every(t=>t.frameworkId===framework));assert(selected.tables.some(t=>t.id===spec.tables[0].id));
 setRecordFrameworks(p,[]);assert.equal(archiveTables(p).tables.length,0);assert.deepEqual(Object.keys(p.archives),originalIds);validateState(clone(state));
});

test('the original author package remains byte-for-byte rule text after import',{skip:!process.env.WJWK_1026_BOOK},()=>{
 const author=importBook(read(process.env.WJWK_1026_BOOK));assert.equal(author.length,5);
 for(const e of author)assert.equal(entry(e.name).content,e.content,e.name);
 assert.equal(BUILTIN_WORLDBOOK.updates[0].entries.length,5);assert.equal(BUILTIN_WORLDBOOK.updates.at(-1).entries.length,1);
});
