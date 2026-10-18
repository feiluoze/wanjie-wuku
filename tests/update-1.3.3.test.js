import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importBook,createPower,clone,emptyState,validateState} from '../src/core.js';
import {creationConfig} from '../src/creation-config.js';
import {validateAdapter} from '../src/adapters.js';
import {archiveLibraryPage} from '../src/archive-library.js';
import {saveArchive} from '../src/archives.js';
import {archiveSources,archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {rollbackStoryRecords} from '../src/archive-branch.js';

const entries=importBook(JSON.parse(readFileSync(new URL('../data/builtin-worldbook.json',import.meta.url),'utf8')));
const power=name=>createPower(entries.find(e=>e.name===name));
test('six new adapters are version matched, distinct and classify actual facts separately from plans',()=>{
 for(const name of ['早有先例','生物计算机','大贤者','人间游戏','道途','描述改写']){
  const p=power(name),config=creationConfig(p);assert.ok(config,name);validateAdapter(config);
  assert(config.records.length>=3);assert(config.dashboard.sections.length===config.records.filter(r=>!r.id.startsWith('statusbar_')).length);
  assert(config.operations.every(o=>p.rules.includes(o.ruleQuote)));
  p.primaryRules+=' changed';p.rules=p.primaryRules;assert.equal(creationConfig(p),null);
 }
 assert.deepEqual(creationConfig(power('早有先例')).records.filter(r=>!r.id.startsWith('statusbar_')).map(r=>r.id),['precedent','invocation','new_history']);
});
test('80 independent precedents survive normalization, review, repeated review and pagination',()=>{
 const p=power('早有先例'),state=emptyState();state.powers[p.id]=p;
 const chat=[{mes:'先例列表：'+Array.from({length:80},(_,i)=>`事件${i}确曾完成。`).join(''),is_user:false}];
 const sources=archiveSources(chat,state,p);
 const raw={changes:Array.from({length:80},(_,i)=>({type:'record',name:`事件${i}的先例`,status:'active',fields:{description:`事件${i}确曾完成。`},recordId:'precedent',details:{event:`事件${i}`,result:'确曾完成'},sourceIndex:0,quote:`事件${i}确曾完成。`}))};
 const before=clone(p);const batch=normalizeArchiveBatch(raw,p,sources,chat);assert.equal(batch.changes.length,80);assert.equal(batch.issues.length,0);assert.deepEqual(p,before);
 applyArchiveChanges(p,batch.changes,sources,new Map(batch.changes.map((_,i)=>[i,null])),chat);
 assert.equal(Object.keys(p.archives).length,80);validateState(state);
 const again=normalizeArchiveBatch(raw,p,sources,chat);assert(again.changes.every(c=>c.id));
 applyArchiveChanges(p,again.changes,sources,new Map(again.changes.map((c,i)=>[i,c.id])),chat);assert.equal(Object.keys(p.archives).length,80);
 const seen=new Set();for(let page=0;page<4;page++){const data=archiveLibraryPage(p,{page});assert.equal(data.rows.length,20);for(const r of data.rows)seen.add(r.id);}assert.equal(seen.size,80);
 assert.equal(archiveLibraryPage(p,{query:'事件79的先例'}).matched,1);
 assert.equal(archiveLibraryPage(p,{category:'wuku.precedent/invocation'}).matched,0);
 assert.equal(archiveLibraryPage(p,{page:100}).page,3);
 assert.match(archivePrompt(p,sources,chat).user,/不只保留最近几条/);
 assert.equal(normalizeArchiveBatch({changes:Array(257).fill(raw.changes[0])},p,sources,chat).changes.length,1,'overflow is grouped locally and identical facts remain deduplicated');
 const manual=saveArchive(p,{name:'手动先例',type:'record',status:'active',fields:{description:'玩家确认'}},{type:'manual',note:'手工记录'});
 chat[0].swipe_id=1;chat[0].mes='新分支没有发生这些事件。';const rolled=rollbackStoryRecords(state,chat);assert.equal(rolled.removed,80);assert.equal(Object.keys(p.archives).length,1);assert(p.archives[manual.id]);
});
test('library filters never mutate facts, include old generic archives and safely return hostile text',()=>{
 const p=power('早有先例');saveArchive(p,{name:'<img src=x>',type:'record',status:'planned',fields:{description:'旧档案内容'}},{type:'manual',note:'玩家确认'});
 const before=clone(p),data=archiveLibraryPage(p,{category:'legacy',status:'planned',query:'旧档案'});
 assert.equal(data.rows.length,1);assert.equal(data.rows[0].name,'<img src=x>');assert.deepEqual(p,before);
});

test('all six schemas retain every object category and state through the real review/save pipeline',()=>{
 for(const name of ['早有先例','生物计算机','大贤者','人间游戏','道途','描述改写']){
  const p=power(name),state=emptyState();state.powers[p.id]=p;
  const definitions=creationConfig(p).records;
  const chat=[{mes:definitions.map(r=>r.label+'测试事实已在正文中明确。').join('\n'),is_user:false}];
  const sources=archiveSources(chat,state,p),resources=clone(p.resources);
  const changes=definitions.map(r=>({type:'record',name:r.label+'独立对象',status:r.id==='intent'?'planned':r.id==='quest'||r.id==='parallel'?'working':'active',fields:{description:r.label+'测试事实已在正文中明确。'},recordId:r.id,details:Object.fromEntries(r.fields.map(f=>[f.id,f.label+'已确认文本'])),sourceIndex:0,quote:r.label+'测试事实已在正文中明确。'}));
  const batch=normalizeArchiveBatch({changes},p,sources,chat);assert.equal(batch.issues.length,0,name);assert.equal(batch.changes.length,definitions.length);
  applyArchiveChanges(p,batch.changes,sources,new Map(batch.changes.map((_,i)=>[i,null])),chat);
  assert.deepEqual(Object.values(p.archives).map(r=>r.specific.recordId),definitions.map(r=>r.id));
  assert.deepEqual(Object.values(p.archives).map(r=>r.status),changes.map(r=>r.status));
  assert.deepEqual(p.resources,resources);validateState(state);
 }
});
