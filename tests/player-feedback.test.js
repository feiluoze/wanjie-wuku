import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {saveArchive,archiveCurrent,archiveContextCurrent,sceneArchiveContext} from '../src/archives.js';
import {memoryPlan} from '../src/archive-memory.js';
import {playerTimeline} from '../src/player-home.js';
import {clone,hash,storyText,publicPower,buildInjection,canAfford,setAssetRemoved,validateState,managementContextCurrent} from '../src/core.js';
import {WorkbenchUI} from '../src/ui.js';
import {installInjection} from '../src/host.js';
import {rollbackStoryRecords} from '../src/archive-branch.js';

function record(f){return saveArchive(f.power,{type:'research',name:'购药任务',status:'active',fields:{outcome:'旧分支已经买药并治好了病',progress:'完成'}},{type:'story',note:'正文自动更新',anchor:{index:0,swipeId:0,length:storyText(f.ctx.chat[0].mes).length,textHash:hash(storyText(f.ctx.chat[0].mes))}});}
const asset=()=>({id:'asset_test',name:'灵药',kind:'消耗品',description:'一剂灵药',quantity:'1',permanent:false});

test('manual bag removal and restoration preserve quantity, history, money and role variables',async()=>{
 const f=fixture();await f.store.transact(s=>s.powers[f.power.id].assets.asset_test=asset());const before=clone(f.store.read());
 await f.app.action('asset-remove',{id:'asset_test'});let p=f.store.read().powers[f.power.id];assert.equal(p.assets.asset_test.removed,true);assert.equal(p.assets.asset_test.quantity,'1');assert.deepEqual(p.resources,before.powers[p.id].resources);assert.equal(f.replacementCount,0);assert.equal(publicPower(p).assets.asset_test,undefined);assert.equal(f.store.read().transactions.length,before.transactions.length+1);validateState(clone(f.store.read()));
 await f.app.action('asset-restore',{id:'asset_test'});p=f.store.read().powers[p.id];assert.equal(publicPower(p).assets.asset_test.quantity,'1');assert.equal(p.assets.asset_test.removed,false);assert.equal(f.replacementCount,0);
 f.app.mainBusy=true;await assert.rejects(f.app.action('asset-remove',{id:'asset_test'}),/生成/);
});

test('removed assets cannot be spent; zero quantities collapse and removal does not replenish them',()=>{
 const f=fixture(),a=asset();f.power.assets[a.id]=a;const op={costs:[{kind:'asset',id:a.id,amount:'1'}]};assert(canAfford(f.power,op).ok);setAssetRemoved(f.power,a.id,true);assert(!canAfford(f.power,op).ok);setAssetRemoved(f.power,a.id,false);assert(canAfford(f.power,op).ok);
 a.quantity='0';assert.equal(publicPower(f.power).assets[a.id],undefined);setAssetRemoved(f.power,a.id,true);setAssetRemoved(f.power,a.id,false);assert.equal(a.quantity,'0');assert(!canAfford(f.power,op).ok);
 const bad=clone(f.state);bad.powers[f.power.id].assets[a.id]={...a,removed:'yes'};assert.throws(()=>validateState(bad),/移除/);
});

test('bag controls escape names and expose reversible removal with disabled busy buttons',()=>{
 const f=fixture();f.power.assets.asset_test={...asset(),name:'<img onerror=bad>'};const ui=Object.create(WorkbenchUI.prototype);let html=ui.assets(f.power,true);assert(!html.includes('<img'));assert.match(html,/asset-remove/);assert.match(html,/disabled/);setAssetRemoved(f.power,'asset_test',true);html=ui.assets(f.power);assert.match(html,/data-removed-assets/);assert.match(html,/asset-restore/);
});

test('changed, swiped or deleted story sources remain saved but leave timeline, scene and pinned/automatic memory',()=>{
 for(const mutate of [f=>f.ctx.chat[0].mes='重抽后仍未购药',f=>f.ctx.chat[0].swipe_id=1,f=>f.ctx.chat.splice(0,1)]){
  const f=fixture(),r=record(f),id=f.power.id+'/'+r.id;const config={auto:true,budget:10000,selections:{[id]:{mode:'pinned'}}};assert(archiveContextCurrent(r,f.ctx.chat));assert(memoryPlan(f.state,f.ctx.chat,r.name,config).packet.includes('旧分支'));
  mutate(f);assert(archiveCurrent(r,f.ctx.chat));assert(!archiveContextCurrent(r,f.ctx.chat));assert(f.power.archives[r.id]);assert.equal(playerTimeline(f.power,f.ctx.chat).length,0);assert.equal(sceneArchiveContext(f.power,f.ctx.chat).items.length,0);const plan=memoryPlan(f.state,f.ctx.chat,r.name,config);assert.equal(plan.packet,'');assert(plan.omitted.some(v=>/来源/.test(v.reason)));
 }
});

test('continuing a source keeps its matching prefix, while inherited fields depend on earlier story versions',()=>{
 const f=fixture(),r=record(f);f.ctx.chat[0].mes+=' 后续正文';assert(archiveContextCurrent(r,f.ctx.chat));
 f.ctx.chat.push({is_user:false,mes:'第二层研究进度继续变化'});const updated=saveArchive(f.power,{...r,id:r.id,fields:{...r.fields,progress:'继续'}},{type:'story',note:'后续变化',anchor:{index:1,swipeId:0,length:f.ctx.chat[1].mes.length,textHash:hash(f.ctx.chat[1].mes)}});assert(archiveContextCurrent(updated,f.ctx.chat));f.ctx.chat[0].mes='早期分支改写';assert(!archiveContextCurrent(updated,f.ctx.chat));
});

test('regenerate and swipe exclude the replaced floor before it changes, without deleting settled purchases',async()=>{
 for(const type of ['regenerate','swipe']){
  const f=fixture(),r=record(f);await f.store.transact(s=>{s.powers[f.power.id]=clone(f.power);s.archiveMemory={auto:true,budget:10000,selections:{[f.power.id+'/'+r.id]:{mode:'pinned',token:'feedback_pinned'}}};s.powers[f.power.id].assets.asset_test=asset();});
  f.app.beginArchiveMemory(type);f.app.mainBusy=true;assert.equal(f.app.memoryInjection(f.store.read()),'');assert.equal(f.ctx.chat[0].mes.includes('自编'),true);assert.equal(publicPower(f.store.read().powers[f.power.id]).assets.asset_test.quantity,'1');assert.equal(memoryPlan(f.store.read(),f.ctx.chat,r.name).packet.includes('旧分支'),true);
  f.app.mainBusy=false;assert.equal(f.app.memoryContextChat(),f.ctx.chat);
 }
});

test('story-derived management facts are excluded in both chat and text request hooks during regeneration',async()=>{
 const f=fixture(),handlers=new Map();f.ctx.eventSource={on:(e,fn)=>handlers.set(e,fn),removeListener:e=>handlers.delete(e)};f.ctx.eventTypes={CHAT_COMPLETION_PROMPT_READY:'chat',GENERATE_AFTER_COMBINE_PROMPTS:'plain'};
 const source={type:'story',index:0,swipeId:0,length:storyText(f.ctx.chat[0].mes).length,textHash:hash(storyText(f.ctx.chat[0].mes))};await f.store.transact(s=>{s.powers[f.power.id].managementRecords={r:{id:'r',label:'买药结果',category:'record',value:'旧分支已经治愈',status:'active',source,updatedAt:1}};s.powers[f.power.id].assets.asset_test=asset();});
 assert(managementContextCurrent(f.store.read().powers[f.power.id].managementRecords.r,f.ctx.chat));f.app.beginArchiveMemory('regenerate');f.app.mainBusy=true;
 const bridge=installInjection({context:()=>f.ctx,store:f.store,injectionChat:()=>f.app.memoryContextChat(),extraInjection:s=>f.app.memoryInjection(s)});
 const chat={chat:[{role:'user',content:'重新呈现'}]},plain={prompt:'重新呈现'};handlers.get('chat')(chat);handlers.get('plain')(plain);assert(!JSON.stringify(chat).includes('旧分支已经治愈'));assert(!plain.prompt.includes('旧分支已经治愈'));assert(plain.prompt.includes('一剂灵药'));bridge.cleanup();
});

test('fresh branch review reuses the original ID, clears unsupported old fields and keeps history',async()=>{
 const f=fixture(),r=record(f);await f.store.transact(s=>s.powers[f.power.id]=clone(f.power));f.ctx.chat[0].mes='新的正文：准备寻找药铺，尚未购药。';f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};
 f.app.model.request=async prompt=>{const input=JSON.parse(prompt.user);assert.equal(input.current.length,0);assert(input.staleIdentities.some(v=>v.id===r.id));assert(!prompt.user.includes('旧分支已经买药'));return JSON.stringify({changes:[{archiveId:r.id,name:r.name,type:'research',status:'planned',fields:{goal:'寻找药铺'},sourceIndex:0}]});};
 await f.app.reviewArchives({rescan:true});const pending=f.app.pendingArchiveReview;assert(pending.changes[0].recovery);await f.app.commitArchiveReview(pending,new Map([[0,r.id]]));const saved=f.store.read().powers[f.power.id].archives[r.id];assert.equal(saved.fields.outcome,'');assert.equal(saved.fields.goal,'寻找药铺');assert.equal(saved.history[0].fields.outcome,'旧分支已经买药并治好了病');assert(archiveContextCurrent(saved,f.ctx.chat));validateState(clone(f.store.read()));
});

test('reroll cleanup actually deletes branch-created archives and memory pins, preserving money and manual data',async()=>{
 const f=fixture(),r=record(f);const manual=saveArchive(f.power,{type:'record',name:'手动登记',status:'active',fields:{description:'明确保存的个人设定'}},{type:'manual',note:'玩家手动登记'});
 await f.store.transact(s=>{s.powers[f.power.id]=clone(f.power);s.powers[f.power.id].assets.asset_test=asset();s.archiveMemory={auto:true,budget:3000,selections:{[f.power.id+'/'+r.id]:{mode:'pinned',token:'branch_pin'}}};s.powers[f.power.id].lastArchiveUpdate={at:1,automatic:true,arrangements:0,sourceIndices:[0],records:[{id:r.id,signature:'a'.repeat(16),kind:'created'}]};});
 const before=clone(f.store.read());f.ctx.chat[0].mes='重抽：此前结果从未发生';const result=await f.app.cleanupStoryRecords();assert.equal(result.removed,1);const s=f.store.read(),p=s.powers[f.power.id];assert.equal(p.archives[r.id],undefined);assert(p.archives[manual.id]);assert.deepEqual(p.resources,before.powers[p.id].resources);assert.deepEqual(p.assets,before.powers[p.id].assets);assert.deepEqual(s.transactions,before.transactions);assert.equal(s.archiveMemory.selections[f.power.id+'/'+r.id],undefined);assert.equal(p.lastArchiveUpdate,undefined);validateState(clone(s));
});

test('reroll restores the last valid version instead of deleting an older manually established object',()=>{
 const f=fixture();const baseline=saveArchive(f.power,{type:'research',name:'药物研究',status:'planned',fields:{goal:'寻找药方'}},{type:'manual',note:'玩家登记计划'});
 saveArchive(f.power,{...baseline,id:baseline.id,status:'active',fields:{goal:'寻找药方',outcome:'旧分支获得成品'}},{...record(f).source});
 f.ctx.chat[0].swipe_id=1;const result=rollbackStoryRecords(f.state,f.ctx.chat);assert.equal(result.restored,1);assert.equal(result.removed,1);assert.equal(f.power.archives[baseline.id].status,'planned');assert.equal(f.power.archives[baseline.id].fields.outcome,'');assert.equal(f.power.archives[baseline.id].history.length,0);validateState(clone(f.state));
});

test('MESSAGE_SWIPED hooks remove invalid records; interrupted generation defers mutation until finished',async()=>{
 const f=fixture(),r=record(f),handlers=new Map();await f.store.transact(s=>s.powers[f.power.id]=clone(f.power));f.ctx.eventTypes={MESSAGE_SWIPED:'swiped'};f.ctx.eventSource={on:(name,fn)=>handlers.set(name,fn),removeListener:()=>{}};f.app.attachChatHooks();
 f.ctx.chat[0].swipe_id=1;f.app.mainBusy=true;await handlers.get('swiped')();assert(f.store.read().powers[f.power.id].archives[r.id]);f.app.mainBusy=false;await handlers.get('swiped')();assert.equal(f.store.read().powers[f.power.id].archives[r.id],undefined);
});

test('GENERATION_ENDED deletes rerolled records and stopping an unchanged generation retains them',async()=>{
 const f=fixture(),r=record(f),handlers=new Map();await f.store.transact(s=>s.powers[f.power.id]=clone(f.power));f.ctx.eventTypes={GENERATION_ENDED:'ended',GENERATION_STOPPED:'stopped'};f.ctx.eventSource={on:(name,fn)=>handlers.set(name,fn),removeListener:()=>{}};f.app.attachChatHooks();
 f.app.mainBusy=true;await handlers.get('stopped')();assert(f.store.read().powers[f.power.id].archives[r.id]);
 f.app.mainBusy=true;f.ctx.chat[0].mes='重生成后，没有此前的结果';await handlers.get('ended')();assert.equal(f.store.read().powers[f.power.id].archives[r.id],undefined);
});

test('cleanup persistence failure cannot partially delete records; stale content still stays out of prompts',async()=>{
 const f=fixture(),r=record(f);await f.store.transact(s=>s.powers[f.power.id]=clone(f.power));f.ctx.chat[0].mes='重抽后的另一条分支';f.ctx.saveChat=undefined;f.storage.setItem=()=>{throw Error('quota');};
 await assert.rejects(f.app.cleanupStoryRecords(),/未提交/);const s=f.store.read();assert(s.powers[f.power.id].archives[r.id]);assert.equal(memoryPlan(s,f.ctx.chat,r.name,{auto:true,budget:3000,selections:{}}).packet,'');
});
