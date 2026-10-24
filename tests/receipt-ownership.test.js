import test from 'node:test';
import assert from 'node:assert/strict';
import {settledOwnership,sourceOwnership} from '../src/archive-protocol.js';
import {assertArchiveOwnership} from '../src/archive-ownership.js';

test('posted but unclaimed receipts prove ownership, not delivery or completion',()=>{
 for(const name of ['测试权柄','另一种能力']){
  const source=`<WJWK-settle>本轮收益：\n1. 【${name}】分体开启「青石古炉」外围工坊，收录锻造资料 -- [已入账／待提取]\n后续机会：\n2. 【${name}】赤沙古炉已入账</WJWK-settle>`;
  assert(settledOwnership(source,name,'青石古炉'));
  assert(!settledOwnership(source,name,'赤沙古炉'));
  const raw={name:'青石古炉',status:'working',ownerPowerId:'p',details:{location:'异界·青石古炉'}};
  const original=JSON.stringify(raw),quote='分体已占领外围工坊，正在继续探索。';
  assert.doesNotThrow(()=>assertArchiveOwnership({id:'p',name,archives:{}},raw,{
   policy:{requireLink:true,mechanisms:['分体']},quote,content:quote+'\n'+source
  }));
  assert.equal(JSON.stringify(raw),original);
 }
});

test('receipt status alternatives retain plans, pending-only and foreign-owner rejection',()=>{
 for(const status of ['已入账','已入账／待提取','已归档']){
  assert(settledOwnership(`<WJWK-settle>【甲·结算】青石古炉 -- [${status}]</WJWK-settle>`,'甲','青石古炉'));
  for(const prefix of ['尚未','计划','如果','预计']){
   assert(!settledOwnership(`<WJWK-settle>【甲·结算】${prefix}将青石古炉标记为[${status}]</WJWK-settle>`,'甲','青石古炉'));
  }
 }
 for(const source of [
  '<WJWK-settle>【甲·结算】青石古炉 -- [待提取]</WJWK-settle>',
  '<WJWK-status>【甲·状态】青石古炉 -- [已入账]</WJWK-status>',
  '<think><WJWK-settle>【甲·结算】青石古炉 -- [已入账]</WJWK-settle></think>',
  '<WJWK-settle>【乙·结算】青石古炉 -- [已入账]</WJWK-settle>'
 ])assert(!settledOwnership(source,'甲','青石古炉'),source);
});

test('numbered receipts cannot leak an earlier owner into an unknown power or unowned item',()=>{
 const quote='青石古炉资料已归档。';
 for(const item of [`2. 【未接入的能力】${quote}`,`2. ${quote}`]){
  const content=`<WJWK-settle>1. 【甲】其他资料已入账。\n${item}</WJWK-settle>`;
  assert(!settledOwnership(content,'甲','青石古炉'));
  assert.deepEqual(sourceOwnership(content,quote,['甲']),[]);
 }
 const good=`<WJWK-settle>1. 【甲】其他资料已入账。\n2. 【乙】其他资料已归档。\n3. 【甲】${quote}</WJWK-settle>`;
 assert(settledOwnership(good,'甲','青石古炉'));
 assert.deepEqual(sourceOwnership(good,quote,['甲']),['甲']);
});


test('unknown powers require explicit ownership headings; item labels cannot invent one',()=>{
 const quote='青石古炉资料已归档。';
 for(const label of ['未接入的能力·结算','未接入的能力·状态']){
  const content=`<WJWK-settle>1. 【甲】其他资料已入账。\n2. 【${label}】${quote}</WJWK-settle>`;
  assert.deepEqual(sourceOwnership(content,quote,['甲']),['未接入的能力']);
  assert(!settledOwnership(content,'甲','青石古炉'));
  assert.throws(()=>assertArchiveOwnership({id:'a',name:'甲',archives:{}},{ownerPowerId:'a'}, {quote,content}),/归属/);
 }
 // Once an otherwise bare title is a known power, it remains a foreign owner.
 const content=`<WJWK-settle>2. 【乙】${quote}</WJWK-settle>`;
 assert.deepEqual(sourceOwnership(content,quote,['甲','乙']),['乙']);
 assert.throws(()=>assertArchiveOwnership({id:'a',name:'甲',archives:{}},{ownerPowerId:'a'}, {quote,content,state:{powers:{b:{id:'b',name:'乙'}}}}),/归属/);
});

test('section boundaries stop numbered-item ownership in both shared readers',()=>{
 const quote='青石古炉资料已归档。';
 for(const section of ['状态变化：','当前状态:','新增解锁：','本轮收益：']){
  const content=`<WJWK-settle>1. 【甲】其他资料已入账。\n${section}\n${quote}</WJWK-settle>`;
  assert.deepEqual(sourceOwnership(content,quote,['甲']),[],section);
  assert(!settledOwnership(content,'甲','青石古炉'),section);
 }
});

test('mechanism and event labels are not owners for any power',()=>{
 for(const name of ['甲系统','乙权柄','自定义词条']){
  const power={id:'p',name,archives:{}},quotes=['投入能量后取得推演成果。','容量：102 -> 106'];
  const content=`<WJWK-settle>本轮收益：\n1. 【推演·基础构筑】：其他成果已到账\n2. 【回涌与外溢】：${quotes[0]}\n状态变化：\n${quotes[1]}</WJWK-settle>\n<WJWK-status>【${name}·当前记录】\n容量：106</WJWK-status>`;
  for(const quote of quotes){
   assert.deepEqual(sourceOwnership(content,quote,[name]),[]);
   assert.doesNotThrow(()=>assertArchiveOwnership(power,{ownerPowerId:'p'}, {quote,content}));
  }
 }
});


test('explicit block ownership survives event labels and section boundaries',()=>{
 const quote='青石古炉资料已归档。';
 for(const blockOwner of ['甲','未接入能力']){
  const content=`<WJWK-settle>【${blockOwner}·结算】\n1. 【推演与外溢】其他资料已入账。\n状态变化：\n${quote}</WJWK-settle>`;
  assert.deepEqual(sourceOwnership(content,quote,['甲']),[blockOwner]);
  assert.equal(settledOwnership(content,'甲','青石古炉'),blockOwner==='甲');
 }
});
