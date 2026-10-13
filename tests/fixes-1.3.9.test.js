import {builtinEntries} from '../src/builtin-worldbook.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {clone,validateState,parseJSON,createPower} from '../src/core.js';
import {saveArchive,archiveSource,saveArchiveUpdate,archiveUpdateSummary} from '../src/archives.js';
import {archiveSources,normalizeArchiveBatch,archivePrompt} from '../src/archive-review.js';
import {completeReview} from './review-response-fixture.js';

test('repeated chronological object updates save and reload one final summary with full history',async()=>{
 const f=fixture();f.ctx.chat=[{is_user:false,mes:'工具交付。'},{is_user:false,mes:'工具修复。'}];f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};
 f.app.model.request=async prompt=>{const p=JSON.parse(prompt.user),s=p.sources[0];return completeReview(prompt,{changes:[{name:'工具',type:'record',status:'active',fields:{description:s.content},sourceIndex:s.index}]});};
 await f.app.reviewArchives({rescan:true});const pending=f.app.pendingArchiveReview;await f.app.commitArchiveReview(pending,new Map([[0,null],[1,null]]));
 const p=f.store.read().powers[f.power.id];assert.equal(p.lastArchiveUpdate.records.length,1);assert.equal(Object.values(p.archives)[0].history.length,1);assert.equal(archiveUpdateSummary(p,f.ctx.chat).rows.length,1);assert.equal(p.lastArchiveUpdate.records[0].kind,'created');
});
test('legacy duplicate and broken summary references recover without changing archives, malformed facts still reject',()=>{
 const f=fixture(),r=saveArchive(f.power,{name:'成果',type:'record',status:'active',fields:{description:'真实情况'}},archiveSource(f.ctx.chat,'人工记录'));saveArchiveUpdate(f.power,{},[r],[],{chat:f.ctx.chat});
 f.power.lastArchiveUpdate.records.push(clone(f.power.lastArchiveUpdate.records[0]),{id:'missing',signature:'bad',kind:'updated'});const facts=clone(f.power.archives);validateState(f.state);assert.deepEqual(f.power.archives,facts);assert.equal(f.power.lastArchiveUpdate.records.length,1);assert.match(f.power.archiveSummaryRecovery,/摘要/);
 f.power.archives[r.id].status='invalid';assert.throws(()=>validateState(f.state),/身份或状态/);
});
test('summary supports more than 64 unique results without rejecting otherwise valid archives',()=>{
 const f=fixture(),saved=[];for(let i=0;i<70;i++)saved.push(saveArchive(f.power,{name:'对象'+i,type:'record',status:'active',fields:{description:'已记录'}},archiveSource(f.ctx.chat,'手动核对')));
 saveArchiveUpdate(f.power,{},saved,[],{chat:f.ctx.chat});validateState(f.state);assert.equal(f.power.lastArchiveUpdate.records.length,70);
});
test('transactions reject invalid facts before storage and leave prior checkpoint readable',async()=>{
 const f=fixture(),before=clone(f.store.read());await assert.rejects(f.store.transact(s=>{s.powers[f.power.id].archives={bad:{status:'invalid'}};}));assert.deepEqual(f.store.read(),before);
});
async function taishi(){const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};return f;}
test('external world and encountered NPC cannot enter taishi, even with forged owner or paraphrased admission',async()=>{
 const f=await taishi(),p=f.store.read().powers[f.app.powerId];f.ctx.chat[0].mes='玩家抵达外界，遇见一名旅人。';const sources=archiveSources(f.ctx.chat,f.store.read(),p,{rescan:true});
 for(const quote of ['玩家抵达外界，遇见一名旅人。','旅人已正式加入太始天。']){const batch=normalizeArchiveBatch({changes:[{name:'旅人',type:'member',status:'active',fields:{role:'同行者'},ownerPowerId:p.id,sourceIndex:0,quote}]},p,sources,f.ctx.chat);assert.equal(batch.changes.length,0);assert.match(batch.issues[0].reason,/归属/);}
});
test('real taishi admission survives validation but new objects require preview instead of automatic save',async()=>{
 const f=await taishi();f.ctx.chat[0].mes='太始天已纳入澄明界。';f.app.model.request=async prompt=>completeReview(prompt,{changes:[{name:'澄明界',type:'environment',status:'active',fields:{conditions:'已纳入'},recordId:'world',details:{stage:'成熟'},sourceIndex:0,quote:f.ctx.chat[0].mes}]});
 await f.app.reviewArchives({automatic:true,autoSave:true,silent:true});const pending=f.app.pendingArchiveReview;assert.equal(pending.changes.length,1);assert.equal(Object.keys(f.store.read().powers[f.app.powerId].archives).length,0);await f.app.commitArchiveReview(pending,new Map([[0,null]]));assert.equal(Object.keys(f.store.read().powers[f.app.powerId].archives).length,1);
});
test('registered-world relations allow new local objects, absent or invented world IDs reject',async()=>{
 const f=await taishi(),p=f.store.read().powers[f.app.powerId],world=saveArchive(p,{name:'澄明界',type:'environment',status:'active',fields:{conditions:'已纳入'},specific:{adapterId:'wuku.primordial_world',recordId:'world',version:'1.2.0',label:'世界',fields:{stage:'成熟'},labels:{stage:'阶段'}}},archiveSource(f.ctx.chat,'玩家建立'));
 f.ctx.chat[0].mes='澄明界的守林人正在照料树林。';const sources=archiveSources(f.ctx.chat,f.store.read(),p,{rescan:true});
 const row={name:'守林人',type:'member',status:'working',fields:{role:'当地居民'},recordId:'companion',details:{world_id:world.id,world:'澄明界'},sourceIndex:0,quote:f.ctx.chat[0].mes};
 assert.equal(normalizeArchiveBatch({changes:[row]},p,sources,f.ctx.chat).changes.length,1);row.details.world_id='fake';assert.equal(normalizeArchiveBatch({changes:[row]},p,sources,f.ctx.chat).changes.length,0);
});
test('prompt drops duplicated evidence and original fragments but retains every current fact field',()=>{
 const f=fixture(),r=saveArchive(f.power,{name:'对象',type:'record',status:'active',fields:{description:'当前事实'}},archiveSource(f.ctx.chat,'人工'));r.source.quote='重复引文'.repeat(600);r.source.anchors=[];
 const prompt=archivePrompt(f.power,[],f.ctx.chat),input=JSON.parse(prompt.user);assert.equal(input.current[0].fields.description,'当前事实');assert.equal(input.current[0].source,undefined);assert.equal(prompt.inputCharacters.current,JSON.stringify(input.current).length);assert(!prompt.user.includes('重复引文'));
});


test('JSON trailing commas repair only punctuation; strings stay exact and incomplete data rejects',()=>{
 assert.deepEqual(parseJSON('{"a":"保留,}","b":[1,2,],}'),{a:'保留,}',b:[1,2]});
 assert.throws(()=>parseJSON('{"a":[1,'));
 assert.throws(()=>parseJSON('{"a":notJSON}'));
});

test('idle scope excludes unrelated learning and borrowed space, accepts explicit task output and rejects category names',()=>{
 const f=fixture(),p=createPower(builtinEntries().find(e=>e.name==='挂机'));f.state.powers[p.id]=p;
 const run=(name,text)=>{f.ctx.chat[0].mes=text;return normalizeArchiveBatch({changes:[{name,type:'record',status:'active',fields:{description:text},quote:text,sourceIndex:0}]},p,archiveSources(f.ctx.chat,f.state,p,{rescan:true}),f.ctx.chat);};
 assert.equal(run('语言','玩家通过观察学会语言。').changes.length,0);
 assert.equal(run('随身洞天','玩家借用漫漫长路的随身洞天。').changes.length,0);
 assert.equal(run('赤铜','挂机任务已取得赤铜。').changes.length,1);
 assert.equal(run('探索、事件与首通','挂机已记录探索、事件与首通。').changes.length,0);
});
