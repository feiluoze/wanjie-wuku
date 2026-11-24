import {completeReview} from './review-response-fixture.js';
import test from 'node:test';
import strict from 'node:assert/strict';
import { fixture } from './mvu-fixture.js';
import { archiveSources, applyArchiveChanges } from '../src/archive-review.js';
import { normalizeArchiveRange, archiveRangeBounds } from '../src/archive-scope.js';
import { saveArchive } from '../src/archives.js';
import { validateState, clone, chatHashes, hash, stable, createPower, importBook } from '../src/core.js';
const wait=()=>new Promise(r=>setTimeout(r,500));
function response(f,changes=true){return completeReview(null,{changes:changes?[{type:'skill',name:'拂风绵掌',status:'active',fields:{level:'已掌握'},sourceIndex:0,quote:'你已掌握拂风绵掌',ruleQuote:f.power.rules.slice(0,20)}]:[]});}
test('manual rescan rereads reviewed floors without erasing incremental cursors',async()=>{
 const f=fixture(),sources=archiveSources(f.ctx.chat,f.state,f.power);applyArchiveChanges(f.power,[],sources,new Map(),f.ctx.chat);
 strict.equal(archiveSources(f.ctx.chat,f.state,f.power).length,0);strict.equal(archiveSources(f.ctx.chat,f.state,f.power,{rescan:true}).length,1);
 let prompt;f.app.settings.mode='st';f.app.model.request=async p=>{prompt=JSON.parse(p.user);return response(f,false);};f.app.ui.showArchiveReview=()=>{};
 await f.store.transact(next=>{next.powers[f.power.id].archiveReviewed=clone(f.power.archiveReviewed);});await f.app.action('review-archives',{});strict.equal(prompt.sources.length,1);strict.ok(f.app.pendingArchiveReview);
});
test('custom inclusive floor range excludes user/system and does not silently truncate manual ranges',()=>{
 const f=fixture(),chat=Array.from({length:8},(_,i)=>({is_user:i%2===1,mes:`第${i+1}层测试角色正文。`}));
 f.power.archiveReadRange={mode:'range',from:3,to:7,recent:24};strict.deepEqual(archiveSources(chat,f.state,f.power,{rescan:true}).map(s=>s.index),[2,4,6]);
 f.power.archiveReadRange.to=null;strict.equal(archiveRangeBounds(f.power,10).to,10);
 f.power.archiveReadRange={mode:'recent',recent:3,from:1,to:null};strict.deepEqual(archiveSources(chat,f.state,f.power,{rescan:true}).map(s=>s.index),[6]);
 f.power.archiveReadRange.recent=100;strict.throws(()=>archiveSources(Array.from({length:90},()=>({mes:'已经完成了具体事项。'})),f.state,f.power,{rescan:true}),/80条/);
 strict.throws(()=>normalizeArchiveRange({mode:'range',from:7,to:3}),/结束不能早于开始/);
});

test('home automatic update switch disables both review and save, including queued confirmation-mode work',async()=>{
 const f=fixture();f.app.settings.mode='st';await f.store.transact(n=>{n.powers[f.power.id].autoArchiveReview=true;n.powers[f.power.id].autoArchiveSave=false;});let calls=0;f.app.reviewArchives=async()=>{calls++;};
 f.app.schedulePlayerReview('normal');clearTimeout(f.app.playerReviewTimer);f.app.playerReviewTimer=null;await f.app.togglePlayerAutoSave();const p=f.store.read().powers[f.power.id];strict.equal(p.autoArchiveReview,false);strict.equal(p.autoArchiveSave,false);await f.app.runPlayerReview();strict.equal(calls,0);
 f.app.schedulePlayerReview('normal');strict.equal(f.app.playerAutoQueued,null);await f.app.togglePlayerAutoSave();strict.equal(f.store.read().powers[f.power.id].autoArchiveReview,true);strict.equal(f.store.read().powers[f.power.id].autoArchiveSave,true);
});
test('configured range persists chat locally and validates imported settings',async()=>{
 const f=fixture();f.app.ui.showArchiveRange=()=>{};f.app.openArchiveRange();await f.app.saveArchiveRange({values:{mode:'range',from:'1',to:'',recent:'6'}});
 strict.deepEqual(f.store.read().powers[f.power.id].archiveReadRange,{mode:'range',from:1,to:null,recent:24});validateState(clone(f.store.read()));
 const bad=clone(f.store.read());bad.powers[f.power.id].archiveReadRange.to=0;strict.throws(()=>validateState(bad));
});
test('busy automatic task is retained, duplicate events coalesce and quiet creates no task',async()=>{
 const f=fixture();f.app.settings.mode='st';await f.store.transact(n=>{n.powers[f.power.id].autoArchiveReview=true;});let calls=0;f.app.reviewArchives=async()=>{calls++;};
 f.app.schedulePlayerReview('quiet');strict.equal(f.app.playerAutoQueued,undefined);f.app.busy=true;f.app.schedulePlayerReview('normal');f.app.schedulePlayerReview('normal');await wait();strict.equal(calls,0);strict.ok(f.app.playerAutoQueued);
 f.app.busy=false;f.app.refresh();await wait();strict.equal(calls,1);f.app.schedulePlayerReview('normal');await wait();strict.equal(calls,1);
});
test('explicit automatic save persists validated changes and advances sources without confirmation',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.model.request=async()=>response(f);await f.app.togglePlayerAutoSave();strict.equal(f.store.read().powers[f.power.id].autoArchiveSave,true);
 f.app.schedulePlayerReview('normal');await wait();const p=f.store.read().powers[f.power.id];strict.equal(Object.values(p.archives).length,1);strict.equal(p.archiveReviewed.length,1);strict.equal(f.app.pendingArchiveReview,null);strict.equal(f.replacementCount,0);
});
test('existing review-only mode never silently becomes automatic save',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.model.request=async()=>response(f);await f.store.transact(n=>{n.powers[f.power.id].autoArchiveReview=true;});f.app.schedulePlayerReview('normal');await wait();strict.ok(f.app.pendingArchiveReview);strict.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,0);
});
test('single-floor review reuses the reply after an archive write and waits on a concurrent target edit',async()=>{
 for(const overlap of [false,true]){
  const f=fixture();f.app.settings.mode='st';
  const source={type:'manual',note:'玩家登记'};
  await f.app.togglePlayerAutoSave();
  let target;
  if(overlap)await f.store.transact(next=>{
   target=saveArchive(next.powers[f.power.id],{name:'拂风绵掌',type:'skill',status:'working',fields:{level:'练习中'}},source).id;
  });
  let calls=0;
  f.app.model.request=async()=>{
   calls++;
   await f.store.transact(next=>{
    saveArchive(next.powers[f.power.id],overlap?{id:target,name:'拂风绵掌',type:'skill',status:'working',fields:{level:'玩家刚更新的进度'}}:
     {name:'独立手记',type:'record',status:'active',fields:{description:'玩家刚保存的记录'}},source);
   });
   return response(f);
  };
  await f.app.reviewArchives({silent:true,automatic:true,autoSave:true});
  const p=f.store.read().powers[f.power.id];
  strict.equal(calls,1);
  strict.equal(p.archiveReviewed.length,overlap?0:1);
  if(overlap){
   strict.equal(p.archives[target].fields.level,'玩家刚更新的进度');
   strict.match(f.app.pendingArchiveReview.message,/整理期间更新过/);
  }else strict.equal(Object.keys(p.archives).length,2);
 }
});
test('combined updates keep valid members, retry only missing members and abandon a broken format for the round',async()=>{
 for(const scenario of ['complete','partial','wrong_floor','wrong_count','unusable','invalid_json','retry_failed']){
  const f=fixture();f.app.settings.mode='st';
  const allInvalid=['unusable','invalid_json'].includes(scenario);
  if(allInvalid)f.ctx.chat.push({is_user:false,mes:'另一层剧情已经明确结束。'});
  const other=createPower(importBook({entries:{2:{comment:'第二种能力',content:'记录剧情中明确完成的另一类成果。'}}},'自编规则')[0]);
  await f.store.transact(next=>{
   next.powers[other.id]=other;
   for(const power of Object.values(next.powers))Object.assign(power,{
    autoArchiveReview:true,autoArchiveSave:true,autoArchiveStart:0,archiveAuto:{every:1,context:0,combine:true}
   });
  });
  const calls=[];
  f.app.model.request=async prompt=>{
   const input=JSON.parse(prompt.user);
   strict.equal(input.sources.length,1);
   const answer={changes:[],message:'',floorReviews:[{sourceIndex:input.sources[0].index,status:'reviewed',changeCount:0}]};
   if(!input.entries){
    calls.push(['single',input.ownership.currentPower.id,input.sources[0].index]);
    if(scenario==='retry_failed')throw Object.assign(Error('temporary outage'),{retryableTransport:true});
    return JSON.stringify(answer);
   }
   calls.push(['combined']);
   strict.equal(input.entries.length,2);
   strict.ok(input.entries.every(entry=>!Object.hasOwn(entry.input,'sources')));
   if(scenario==='invalid_json')return 'broken';
   if(scenario==='unusable')return JSON.stringify(answer);
   if(scenario==='wrong_floor')return JSON.stringify({entry1:answer,entry2:{...answer,floorReviews:[{...answer.floorReviews[0],sourceIndex:99}]}});
   if(scenario==='wrong_count')return JSON.stringify({entry1:answer,entry2:{...answer,floorReviews:[{...answer.floorReviews[0],changeCount:99}]}});
   return JSON.stringify(scenario==='complete'?{entry1:answer,entry2:answer}:{entry1:answer});
  };
  f.app.schedulePlayerReview('normal');
  clearTimeout(f.app.playerReviewTimer);f.app.playerReviewTimer=null;
  await f.app.runPlayerReview();
  const powers=f.store.read().powers;
  strict.equal(calls.filter(([kind])=>kind==='combined').length,1,scenario);
  strict.equal(calls.length,allInvalid?5:scenario==='complete'?1:2,scenario);
  if(calls.length===2)strict.deepEqual(calls[1],['single',other.id,0]);
  strict.equal(powers[f.power.id].archiveReviewed.length,allInvalid?2:1,scenario);
  strict.equal(powers[other.id].archiveReviewed.length,allInvalid?2:scenario==='retry_failed'?0:1,scenario);
 }
});
test('automatic parse failures do not advance sources or loop API calls and manual can retry',async()=>{
 const f=fixture();f.app.settings.mode='st';let calls=0;f.app.model.request=async()=>{calls++;return 'not JSON';};await f.app.togglePlayerAutoSave();f.app.schedulePlayerReview('normal');await wait();strict.equal(f.store.read().powers[f.power.id].archiveReviewed.length,0);f.app.schedulePlayerReview('normal');await wait();strict.equal(calls,1);
 strict.ok(f.app.pendingArchiveReview.data.rawFailures.length);f.app.pendingArchiveReview=null;f.app.clearReviewCheckpoint();f.app.ui.showArchiveReview=()=>{};f.app.model.request=async()=>{calls++;return response(f);};await f.app.action('review-archives',{});strict.equal(calls,2);strict.ok(f.app.pendingArchiveReview);
});
test('queued task is discarded on chat switch; invalid automatic save setting rejects',async()=>{
 const f=fixture();f.app.settings.mode='st';await f.store.transact(n=>{n.powers[f.power.id].autoArchiveReview=true;});let calls=0;f.app.reviewArchives=async()=>calls++;
 f.app.schedulePlayerReview('normal');f.ctx.chatId='another';await wait();strict.equal(calls,0);
 const bad=clone(f.state);bad.powers[f.power.id].autoArchiveSave='yes';strict.throws(()=>validateState(bad),/自动保存设置/);
});
test('local persistence failure cannot install automatic archive progress',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.model.request=async()=>response(f);await f.app.togglePlayerAutoSave();f.ctx.saveChat=undefined;f.store.storageImpl.setItem=()=>{throw Error('quota');};
 await strict.rejects(()=>f.app.reviewArchives({silent:true,autoSave:true}),/未提交/);strict.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,0);strict.equal(f.store.read().powers[f.power.id].archiveReviewed.length,0);
});
test('queued latest generation survives an in-flight older analysis',async()=>{
 const f=fixture();f.app.settings.mode='st';await f.store.transact(n=>{n.powers[f.power.id].autoArchiveReview=true;});let release,calls=0;
 f.app.reviewArchives=async()=>{calls++;if(calls===1)await new Promise(r=>release=r);};f.app.schedulePlayerReview('normal');await wait();strict.equal(calls,1);
 f.ctx.chat.push({is_user:false,mes:'新的角色正文已经完成。'});f.app.schedulePlayerReview('normal');strict.ok(f.app.playerAutoQueued);release();await wait();strict.equal(calls,2);
});
