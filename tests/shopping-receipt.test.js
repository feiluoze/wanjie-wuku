import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,emptyState} from '../src/core.js';
import {creationConfig} from '../src/creation-config.js';
import {prepareArchiveFields} from '../src/archive-field-input.js';
import {ARCHIVE_FIELDS} from '../src/archives.js';
import {shoppingReceipt} from '../src/shopping-receipt.js';
import {fixture} from './mvu-fixture.js';

const entry=builtinEntries().find(row=>row.name==='万界网购');
const evidence='这一轮成交并交付了补给物资。';
const reply=after=>({is_user:false,mes:`${evidence}\n<WJWK-settle>\n【万界网购】兑换点余额：100 -> 105（本轮净增五点）\n</WJWK-settle>\n<WJWK-status>\n【万界网购】\n兑换点余额：${after}\n</WJWK-status>`});

test('declared order quote survives alongside the top-level source excerpt',()=>{
 const power=createPower(entry),config=creationConfig(power),definition=config.records.find(r=>r.id==='orders');
 const data={type:'record',name:'采购补给',recordId:'orders',quote:evidence,details:{quote:'30兑换点',payment:'21兑换点'}};
 const {raw,held}=prepareArchiveFields(data,ARCHIVE_FIELDS,definition,config);
 assert.equal(raw.quote,evidence);
 assert.equal(raw.details.quote,'30兑换点');
 assert.deepEqual(held,[]);
 assert.throws(()=>prepareArchiveFields(data,ARCHIVE_FIELDS,null,config),/引用字段内容冲突/);
});

test('shopping balances require a matching latest settlement and panel and respect MVU bindings',()=>{
 const power=createPower(entry),state=emptyState(),resource=Object.values(power.resources)[0];
 resource.balance='100';
 assert.equal(shoppingReceipt(state,power,[reply(105)],[0]).after,'105');
 assert.equal(shoppingReceipt(state,power,[reply(106)],[0]),null);
 assert.equal(shoppingReceipt(state,power,[reply(105),{mes:'继续。'}],[0]),null);
 resource.balance='99';assert.equal(shoppingReceipt(state,power,[reply(105)],[0]),null);
 resource.balance='100';state.roleLink={bindings:{[power.id+':'+resource.id]:'/余额'}};
 assert.equal(shoppingReceipt(state,power,[reply(105)],[0]),null);
});

test('archive and narrative sync settle the same points once regardless of which runs first',async()=>{
 for(const first of ['archive','sync']){
  const f=fixture(),power=createPower(entry),resource=Object.values(power.resources)[0];resource.balance='100';
  f.app.settings.mode='st';f.ctx.chat[0]=reply(105);
  await f.store.transact(next=>{
   next.powers={[power.id]:power};next.syncCursor=0;next.historyAnchor=[];
   Object.assign(power,{archiveStart:0,autoArchiveReview:true,autoArchiveSave:true,autoArchiveStart:0});
  });
  f.app.powerId=power.id;f.app.refresh();
  f.app.model.request=async({user})=>{
   const input=JSON.parse(user);
   if(input.newNarrative){
    assert.equal(input.shoppingReceiptFloors.length,1);
    return JSON.stringify({events:[{powerId:power.id,label:'剧情收支',ruleQuote:power.rules.slice(0,20),evidence:[evidence],ready:true,costs:[{kind:'resource',id:resource.id,amount:'35'}],effects:[{type:'resource_credit',id:resource.id,amount:'40'}]}]});
   }
   return JSON.stringify({changes:[],floorReviews:[{sourceIndex:0,status:'reviewed',changeCount:0}],message:''});
  };
  const archive=()=>f.app.reviewArchives({powerId:power.id,silent:true,autoSave:true,automatic:true});
  if(first==='archive'){await archive();await f.app.sync(true);}else{await f.app.sync(true);await archive();}
  const saved=f.store.read();
  assert.equal(saved.powers[power.id].resources[resource.id].balance,'105');
  assert.equal(saved.transactions.filter(row=>row.shoppingReceipt).length,1);
 }
});
