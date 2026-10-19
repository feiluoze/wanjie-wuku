import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importBook,createPower,clone,emptyState,validateState} from '../src/core.js';
import {creationConfig} from '../src/creation-config.js';
import {validateAdapter} from '../src/adapters.js';
import {archiveSources,archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {rollbackStoryRecords} from '../src/archive-branch.js';
import {saveArchive} from '../src/archives.js';
const entries=importBook(JSON.parse(readFileSync(new URL('../data/builtin-worldbook.json',import.meta.url),'utf8')));
const names=['多倍收获系统','代价减免','我全都要','指数增长','质能转换','故事点'];
test('six settlement schemas match original rules, preserve custom versions and expose fact-only policy',()=>{
 for(const name of names){
  const p=createPower(entries.find(e=>e.name===name)),c=creationConfig(p);validateAdapter(c);
  assert(c.records.length>=2,name);assert(c.operations.every(o=>o.kind==='plan'&&p.rules.includes(o.ruleQuote)));
  const prompt=JSON.parse(archivePrompt(p,[],[]).user);assert.match(prompt.settlementPolicy,/不自动修改插件资源账本/);assert.match(prompt.settlementPolicy,/禁止自行选择更大倍率/);
  p.primaryRules+=' 自定义';p.rules=p.primaryRules;assert.equal(creationConfig(p),null);
 }
});
test('all six categories survive confirmation, repeated review and reroll without resource settlement',()=>{
 for(const name of names){
  const p=createPower(entries.find(e=>e.name===name)),state=emptyState();state.powers[p.id]=p;
  const schemas=creationConfig(p).records,chat=[{mes:schemas.map(r=>r.label+'本轮事实。').join('\n'),is_user:false}];
  const sources=archiveSources(chat,state,p),resources=clone(p.resources);
  const raw={changes:schemas.map(r=>({type:'record',name:r.label+'测试对象',status:r.id==='intent'?'planned':r.id==='arrangement'?'working':'active',fields:{description:r.label+'本轮事实。'},recordId:r.id,details:Object.fromEntries(r.fields.map(f=>[f.id,f.id==='balance'?'-12':f.label+'已确认'])),sourceIndex:0,quote:r.label+'本轮事实。'}))};
  const before=clone(p),batch=normalizeArchiveBatch(raw,p,sources,chat);assert.equal(batch.issues.length,0,name);assert.deepEqual(p,before);
  applyArchiveChanges(p,batch.changes,sources,new Map(batch.changes.map((_,i)=>[i,null])),chat);
  const saved=clone(p.archives);assert.equal(Object.keys(saved).length,schemas.length);
  const again=normalizeArchiveBatch(raw,p,sources,chat);assert(again.changes.every(c=>c.id));
  applyArchiveChanges(p,again.changes,sources,new Map(again.changes.map((c,i)=>[i,c.id])),chat);
  assert.deepEqual(p.archives,saved,name+'重复整理应无档案写入');assert.deepEqual(p.resources,resources);validateState(state);
  if(name==='故事点'||name==='指数增长')assert(Object.values(p.archives).every(r=>r.specific.fields.balance===undefined));assert(Object.values(p.resources).every(r=>r.balance===null));
  const manual=saveArchive(p,{name:'玩家保留内容',type:'record',status:'active',fields:{description:'玩家确认'}},{type:'manual',note:'手动修正'});
  chat[0].swipe_id=1;chat[0].mes='新分支无旧事件';rollbackStoryRecords(state,chat);
  assert.deepEqual(Object.keys(p.archives),[manual.id]);assert.deepEqual(p.resources,resources);validateState(state);
 }
});
test('failed candidates do not consume source floor; valid candidates can be retried with stable ids',()=>{
 const p=createPower(entries.find(e=>e.name==='故事点')),state=emptyState();state.powers[p.id]=p;
 const chat=[{mes:'本期入账20点。修正尚未决定。',is_user:false}],sources=archiveSources(chat,state,p);
 const good={type:'record',name:'自身周期一入账',status:'active',fields:{description:'本期入账20点。'},recordId:'income',details:{period:'自身周期一',amount:'20',state:'已入账'},sourceIndex:0,quote:'本期入账20点。'};
 const bad={...good,name:'非法结算',details:{balancePatch:'20'}};
 const batch=normalizeArchiveBatch({changes:[good,bad]},p,sources,chat);assert.equal(batch.issues.length,1);assert.equal(batch.changes.length,1);
 applyArchiveChanges(p,batch.changes,sources,new Map([[0,null]]),chat,{blockedFloors:new Set(batch.blockedFloors)});
 assert.equal(archiveSources(chat,state,p).length,1,'失败候选所在楼层仍可重查');
 const retry=normalizeArchiveBatch({changes:[good]},p,sources,chat);assert(retry.changes[0].id);
 applyArchiveChanges(p,retry.changes,sources,new Map([[0,retry.changes[0].id]]),chat);
 assert.equal(Object.keys(p.archives).length,1);assert.equal(archiveSources(chat,state,p).length,0);validateState(state);
});
