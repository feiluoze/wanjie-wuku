import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,stable} from '../src/core.js';
import {statusbarPolicy} from '../src/builtin-statusbar.js';
import {archiveTables,tableTarget} from '../src/archive-tables.js';
import {archiveSources,normalizeArchiveBatch,normalizeArchiveChanges,applyArchiveChanges} from '../src/archive-review.js';
import {assertArchiveOwnership,foreignArchiveOwner} from '../src/archive-ownership.js';
import {settledOwnership,sourceOwnership} from '../src/archive-protocol.js';

const powers=()=>builtinEntries({includeDedicated:true}).map(e=>createPower(e));
function run(p,raw,content,state={powers:{[p.id]:p}}){
 const chat=[{is_user:false,mes:content}],sources=archiveSources(chat,state,p,{rescan:true});
 return {batch:normalizeArchiveBatch({changes:[raw]},p,sources,chat,'',state),chat,sources};
}
function statusCandidate(p){
 const t=statusbarPolicy(p)?.tables.find(t=>t.fields.length);if(!t)return null;
 return {type:'record',name:'AI概括后的展示标题',status:'active',recordId:t.recordId,fields:{description:'当前概况'},details:{[t.fields[0].id]:'当前已确认状态',...(t.keyField?{[t.keyField]:'具体对象甲'}:{})},sourceIndex:0};
}
test('every ordinary built-in uses shared ownership context without coupling canonical status titles to quotes',()=>{
 let count=0;
 for(const p of powers()){
  const raw=statusCandidate(p);if(!raw)continue;count++;
  const quote='当前情况已经确认。',own=`<WJWK-status>【${p.name.split(/[（(]/)[0]}·状态】\n${quote}</WJWK-status>`;
  const good=run(p,{...raw,quote},own);assert.equal(good.batch.issues.length,0,p.name+JSON.stringify(good.batch.issues));assert.equal(good.batch.changes.length,1,p.name);
  const foreign=`<WJWK-status>【其他系统·状态】\n${quote}</WJWK-status>`;
  const bad=run(p,{...raw,quote,ownerPowerId:p.id},foreign);assert.equal(bad.batch.changes.length,0,p.name);assert.equal(bad.batch.issues.length,1,p.name);assert.deepEqual(bad.batch.blockedFloors,[0]);
  assert.throws(()=>normalizeArchiveChanges({changes:[{...raw,quote}]},p,bad.sources,bad.chat),/归属/);
 }
 assert(count>100,count);
});
test('source scope survives multiline receipts, rejects mixed scopes and never treats a qualified place as a power',()=>{
 const quote='物资已经交付。',content=`<WJWK-settle>【甲系统·回执】\n${quote}\n【乙系统·结算】\n另一个对象已完成。</WJWK-settle>`;
 assert.deepEqual(sourceOwnership(content,quote,['甲系统','乙系统']),['甲系统']);
 assert(settledOwnership('<WJWK-settle>【甲系统·结算】\n【青石镇】的物资已交付。</WJWK-settle>','甲系统','物资'));
 assert(!settledOwnership('<WJWK-settle>【甲系统·结算】\n后续机会：物资已交付。</WJWK-settle>','甲系统','物资'));
 assert(!settledOwnership('<WJWK-settle>【甲系统·结算】\n【乙系统·结算】\n物资已交付。</WJWK-settle>','甲系统','物资'));
 assert.deepEqual(sourceOwnership('', '驻留【尽有战界·灰雾旧街】的征伐之影清理哨站。',['挂机']),[]);
 const p={id:'a',name:'甲系统',archives:{}},state={powers:{a:p,b:{id:'b',name:'乙系统'}}};
 assert.throws(()=>assertArchiveOwnership(p,{ownerPowerId:'a'},{state,quote:'【甲系统·结算】甲已完成。【乙系统·结算】乙已完成。',content}),/多个/);
 assert.deepEqual(sourceOwnership(content+content.replace('甲系统','丙系统'),quote,['甲系统']),['甲系统','丙系统']);
});
test('title prefixes do not establish ownership; explicit conflicting evidence still does',()=>{
 const p={id:'a',name:'甲系统',archives:{}},state={powers:{a:p,b:{id:'b',name:'乙系统'}}};
 const raw={name:'乙系统机制观察记录',ownerPowerId:p.id,type:'research'};
 assert.equal(foreignArchiveOwner(raw,p,state),null);
 assert.equal(foreignArchiveOwner({...raw,quote:'【乙系统·回执】已交付'},p,state).id,'b');
 assert.throws(()=>assertArchiveOwnership(p,raw,{state,before:{id:'old'},quote:'结果已完成。',content:'<WJWK-settle>【乙系统·结算】\n结果已完成。</WJWK-settle>'}),/归属/);
});
test('entity table category titles cannot bypass checks by omitting operation; singleton titles remain legal',()=>{
 let checked=0;
 for(const p of powers())for(const t of archiveTables(p)?.tables||[]){
  if(t.kind==='singleton')continue;checked++;
  assert.throws(()=>tableTarget(p,{name:t.label,recordId:t.id,details:{}}),/标题/,p.name+'/'+t.id);
 }
 assert(checked>30);
});
test('same shared mechanism policy supports distinct rule declarations without title or adapter special cases',()=>{
 for(const mechanism of ['征伐之影','勘测分体']){
  const p={id:'p',name:'测试权柄',primaryRules:`只能由${mechanism}形成远征成果。`,archives:{}};
  const quote=`${mechanism}在青石镇完成勘测。`,raw={name:'概括后的远征成果',details:{location:'青石镇'}};
  const options={policy:{requireLink:true,mechanisms:[mechanism]},quote,content:quote};
  assert.doesNotThrow(()=>assertArchiveOwnership(p,raw,options));
  assert.throws(()=>assertArchiveOwnership(p,{...raw,details:{location:'赤沙镇'}},options),/归属/);
  assert.throws(()=>assertArchiveOwnership({...p,primaryRules:'没有该机制'},raw,options),/归属/);
 }
});
test('cross-power updates preserve unique IDs and old data, while foreign source cannot use an existing ID to bypass scope',()=>{
 for(const name of ['万界网购','绝对生产力','源堡','天人骨血','挂机']){
  const p=powers().find(p=>p.name===name),raw=statusCandidate(p),quote='当前情况已经确认。';
  const result=run(p,{...raw,quote},`<WJWK-status>【${name}·状态】\n${quote}</WJWK-status>`);
  assert.equal(result.batch.issues.length,0,name);applyArchiveChanges(p,result.batch.changes,result.sources,new Map([[0,null]]),result.chat);
  const id=Object.keys(p.archives)[0],snapshot=stable(p.archives);
  const retry=run(p,{...raw,archiveId:id,name:'又换了标题',quote},result.chat[0].mes);assert.equal(retry.batch.changes[0].id,id);
  const bad=run(p,{...raw,archiveId:id,quote},`<WJWK-status>【其他系统·状态】\n${quote}</WJWK-status>`);assert.equal(bad.batch.changes.length,0);assert.equal(stable(p.archives),snapshot);
 }
});


test('all built-in status updates survive numbered event titles without guessing a foreign power',()=>{
 let count=0;
 for(const p of powers()){
  const raw=statusCandidate(p);if(!raw)continue;count++;
  const quote='当前容量：106；晋升进展：2/3。';
  const content=`<WJWK-settle>本轮收益：\n1. 【技艺推演·基础构筑】：已经完成推演。\n2. 【回流与环境滋养】：效果已生效。\n状态变化：\n${quote}</WJWK-settle>`;
  const result=run(p,{...raw,quote},content);
  assert.equal(result.batch.changes.length,1,p.name+JSON.stringify(result.batch.issues));
  assert.deepEqual(result.batch.issues,[],p.name);assert.deepEqual(result.batch.blockedFloors,[],p.name);
 }
 assert(count>100,count);
});
