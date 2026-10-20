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
  assert.deepEqual(sourceOwnership(content,quote,['甲']),item.includes('【')?['未接入的能力']:[]);
 }
 const good=`<WJWK-settle>1. 【甲】其他资料已入账。\n2. 【乙】其他资料已归档。\n3. 【甲】${quote}</WJWK-settle>`;
 assert(settledOwnership(good,'甲','青石古炉'));
 assert.deepEqual(sourceOwnership(good,quote,['甲']),['甲']);
});
