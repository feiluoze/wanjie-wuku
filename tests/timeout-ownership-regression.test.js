import test from 'node:test';
import assert from 'node:assert/strict';
import {settledOwnership} from '../src/archive-protocol.js';
import {assertTaishiOwnership} from '../src/taishi-ownership.js';
import {GENERATION_DEFAULTS,REQUEST_TIMEOUT_LIMIT,upgradeTimeoutDefaults,requestTimeoutSeconds,connectionValues} from '../src/preferences.js';
import {getSettings,applyConnectionProfile,resolveTaskConnectionPlan,saveConnectionProfile} from '../src/host.js';
import {ModelConnection} from '../src/model.js';
import {MODULE_ID} from '../src/core.js';
import {fixture} from './mvu-fixture.js';
import {creationConfig} from '../src/creation-config.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {archiveSources,normalizeArchiveBatch} from '../src/archive-review.js';

test('legacy defaults upgrade across account and fallback profiles without changing custom timeouts or secrets',()=>{
 const old={timeoutSeconds:120,apiKey:'private-fixture',connectionProfiles:[{id:'a',timeoutSeconds:120},{id:'b',timeoutSeconds:90},{id:'c',timeoutSeconds:600}],taskFallbacks:{archive:['a']}};
 const next=upgradeTimeoutDefaults(old);
 assert.equal(next.timeoutSeconds,300);assert.deepEqual(next.connectionProfiles.map(p=>p.timeoutSeconds),[300,90,600]);
 assert.equal(old.timeoutSeconds,120);assert.equal(next.apiKey,old.apiKey);assert.deepEqual(next.taskFallbacks,old.taskFallbacks);
 assert.equal(upgradeTimeoutDefaults({...next,timeoutSeconds:120}).timeoutSeconds,120);
});

test('host reads and applies upgraded profiles; an explicit new 120-second setting stays 120',()=>{
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const connection={mode:'custom',baseUrl:'https://offline.invalid/v1',model:'fake',...GENERATION_DEFAULTS,contextMessages:8,timeoutSeconds:120};
 const ctx={userHandle:'timeout-migration-test',extensionSettings:{[MODULE_ID]:{...connection,connectionProfiles:[{id:'old',name:'旧默认',...connection}],taskFallbacks:{archive:['old']}}},saveSettingsDebounced(){}};
 assert.equal(getSettings(ctx).timeoutSeconds,300);
 assert(resolveTaskConnectionPlan('archive',ctx).every(c=>c.settings.timeoutSeconds===300));
 applyConnectionProfile('old',ctx);assert.equal(getSettings(ctx).timeoutSeconds,300);
 saveConnectionProfile({id:'old',name:'旧默认',settings:connection,apiKey:''},ctx);
 assert.equal(getSettings(ctx).timeoutSeconds,120);applyConnectionProfile('old',ctx);assert.equal(getSettings(ctx).timeoutSeconds,120);
 assert.equal(connectionValues({...connection,timeoutSeconds:600}).timeoutSeconds,600);
 assert.throws(()=>connectionValues({...connection,timeoutSeconds:601}),/范围/);
 assert.equal(requestTimeoutSeconds({},'archive'),300);assert.equal(requestTimeoutSeconds({timeoutSeconds:9999},'archive'),REQUEST_TIMEOUT_LIMIT);
});

test('custom and host transports arm the longer default timer without a real AI call',async()=>{
 const original=globalThis.setTimeout,seen=[];globalThis.setTimeout=(fn,ms)=>{seen.push(ms);return original(fn,ms);};
 try{for(const mode of ['custom','st']){
  const model=new ModelConnection({context:()=>({generateRaw:async()=>'{}'}),settings:()=>({mode,baseUrl:'https://offline.invalid/v1',model:'fake'}),getKey:()=>'',fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{}'}}]})})});
  await model.request({system:'test',user:'test'});
 }assert.deepEqual(seen,[300000,300000]);}finally{globalThis.setTimeout=original;}
});

test('formal ownership accepts a titled outcome while excluding plans and other power receipts',()=>{
 const fact='1. 【挂机·探索结算】成功完成遗迹初探 -- 已生效';
 assert(settledOwnership(`<WJWK-settle>${fact}</WJWK-settle>`,'挂机','遗迹初探'));
 for(const source of [
  `<WJWK-settle>后续机会：\n${fact}</WJWK-settle>`,
  `<story_driver><WJWK-settle>${fact}</WJWK-settle></story_driver>`,
  `<WJWK-settle>${fact.replace('挂机','其他系统')}</WJWK-settle>`,
  `<WJWK-settle>${fact.replace('成功完成','计划完成')}</WJWK-settle>`,
  `<WJWK-status>${fact}</WJWK-status>`,
 ])assert.equal(settledOwnership(source,'挂机','遗迹初探'),false,source);
});

async function setup(){
 const f=fixture();await f.app.openTaishi();
 await f.store.transact(s=>{const p=s.powers[f.app.powerId],c=creationConfig(p),def=c.records.find(r=>r.id==='world');saveArchive(p,{name:'青岚界',type:'environment',status:'active',fields:{conditions:'玩家确认世界'},specific:{adapterId:c.id,recordId:'world',version:c.version,label:def.label,labels:Object.fromEntries(def.fields.map(f=>[f.id,f.label])),fields:{overview:'成熟文明'}}},archiveSource(f.ctx.chat,'玩家确认世界'));});
 const p=f.store.read().powers[f.app.powerId],world=Object.values(p.archives).find(r=>r.name==='青岚界');
 return {f,p,world};
}

test('formal receipt plus registered world and prose admits the same-floor outcome through the full validator',async()=>{
 const {f,p,world}=await setup(),name='青岚界基础矿冶改良配方',quote='从太始天青岚界典籍库提取的羊皮纸已经落在掌心。';
 const content=quote+`<WJWK-settle>本轮收益：\n1. 【太始天·调用成果】成功提取并交付${name} -- 已生效\n后续机会：继续研究</WJWK-settle>`;
 f.ctx.chat[0].mes=content;
 const raw={type:'record',name,status:'active',recordId:'available',details:{world_id:world.id},fields:{description:'配方已交付'},quote,sourceIndex:0};
 const batch=normalizeArchiveBatch({changes:[raw]},p,archiveSources(f.ctx.chat,f.store.read(),p,{rescan:true}),f.ctx.chat,'',f.store.read());
 assert.equal(batch.issues.length,0,JSON.stringify(batch.issues));assert.equal(batch.changes.length,1);
 assert.doesNotThrow(()=>assertTaishiOwnership(p,raw,null,quote,content));
 for(const changed of [{...raw,details:{world_id:'missing'}},{...raw,name:'无关成果'},{...raw,recordId:'relation'}])assert.throws(()=>assertTaishiOwnership(p,changed,null,quote,content),/归属/);
 assert.throws(()=>assertTaishiOwnership(p,raw,null,'虚构引用',content),/连续原文/);
 assert.throws(()=>assertTaishiOwnership(p,raw,null,quote,quote),/归属/);
 assert.throws(()=>assertTaishiOwnership(p,raw,null,quote,content.replace('【太始天·调用成果】','【其他系统·调用成果】')),/归属/);
});
