import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,clone,hash,stable} from '../src/core.js';
import {normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {archiveTables} from '../src/archive-tables.js';
import {archiveLibraryPage} from '../src/archive-library.js';
import {archiveHealth} from '../src/archive-health.js';
import {archiveSyncSummary} from '../src/archive-sync-summary.js';
import {WorkbenchUI} from '../src/ui.js';
import {ModelConnection} from '../src/model.js';
import {fixture} from './mvu-fixture.js';

async function ambiguous(){
 const f=fixture(),p=createPower(builtinEntries().find(e=>e.name==='万界网购'));
 const raw={type:'record',recordId:'orders',name:'铁剑订单',status:'active',sourceIndex:-1,details:{item:'第一笔铁剑'}};
 const b=normalizeArchiveBatch({changes:[raw]},p,[],[],'玩家确认第一笔铁剑订单');applyArchiveChanges(p,b.changes,[],new Map([[0,null]]),[]);
 const first=Object.values(p.archives)[0],second=clone(first);second.id='second-order';second.specific.fields.item='第二笔铁剑';p.archives[second.id]=second;
 await f.store.transact(s=>{s.powers={[p.id]:p};});f.app.powerId=p.id;f.app.refresh();
 const data={changes:[{...raw,details:{progress:'已交付'}}]},playerNote='玩家确认铁剑订单已交付',batch=normalizeArchiveBatch(data,p,[],f.ctx.chat,playerNote),snap=f.app.contextSnapshot();
 f.app.pendingArchiveReview={...batch,powerId:p.id,captured:f.store.capture(),contextHash:hash(stable(snap.hashes)),data,sources:[],playerNote};
 f.app.ui.showArchiveReview=()=>{};return {f,p,first,second};
}
test('explicit listed target stages locally and confirmation updates only the selected archive',async()=>{
 const {f,p,first,second}=await ambiguous(),before=stable(f.store.read().powers[p.id].archives);
 assert.notEqual(f.app.pendingArchiveReview.issues[0].archiveTargets.options[0].summary,f.app.pendingArchiveReview.issues[0].archiveTargets.options[1].summary);
 await f.app.repairArchiveCandidate({index:0,targetArchiveId:second.id,values:{'repair-candidate:0':JSON.stringify({name:'不能夹带修改'})}});
 assert.equal(f.app.pendingArchiveReview.issues.length,0);assert.equal(f.app.pendingArchiveReview.changes.length,1);
 assert.equal(f.app.pendingArchiveReview.changes[0].id,second.id);assert.equal(f.app.pendingArchiveReview.data.changes[0].archiveId,second.id);
 assert.equal(stable(f.store.read().powers[p.id].archives),before);assert.notEqual(first.id,second.id);
 await f.app.commitArchiveReview(f.app.pendingArchiveReview,new Map([[0,second.id]]));
 const saved=f.store.read().powers[p.id].archives;assert.equal(saved[second.id].specific.fields.progress,'已交付');assert.equal(saved[first.id].specific.fields.progress,undefined);assert.equal(Object.keys(saved).length,2);clearTimeout(f.app.roleTimer);
});
test('unlisted targets and identity edits through ordinary field repair remain rejected',async()=>{
 const {f,first}=await ambiguous(),pending=f.app.pendingArchiveReview,original=stable(pending);
 await assert.rejects(f.app.repairArchiveCandidate({index:0,targetArchiveId:'unlisted'}),/同一子表/);
 await assert.rejects(f.app.repairArchiveCandidate({index:0,values:{'repair-candidate:0':JSON.stringify({...pending.issues[0].candidate,archiveId:first.id})}}),/archiveId/);
 assert.equal(stable(pending),original);clearTimeout(f.app.roleTimer);
});
test('a target cannot be applied after the captured chat revision changes',async()=>{
 const {f,first}=await ambiguous();await f.store.transact(s=>{s.syncCursor=0;});
 await assert.rejects(f.app.repairArchiveCandidate({index:0,targetArchiveId:first.id}));clearTimeout(f.app.roleTimer);
});
test('pending totals and filters agree on current and retired tables, ignoring foreign adapters',()=>{
 const p=createPower(builtinEntries().find(e=>e.name==='人间游戏')),spec=archiveTables(p);
 const row=(id,recordId,fields={},adapterId=spec.adapter)=>({id,name:id,type:'record',status:'active',updatedAt:1,fields:{},specific:{adapterId,recordId,fields}});
 p.archives={a:row('a','skill'),b:row('b','quest'),c:row('c','skill',{effect:'已掌握'}),foreign:row('foreign','skill',{},'other.adapter')};
 assert.equal(archiveHealth(p).pending,2);assert.equal(archiveSyncSummary(p).pending,2);assert.equal(archiveSyncSummary(p).retiredPending,1);
 assert.deepEqual(archiveLibraryPage(p,{pending:true}).rows.map(r=>r.id),['a','b']);
 const ui=Object.create(WorkbenchUI.prototype);assert.match(ui.archiveTablesPanel(p,[],false),/待补全 2/);assert.match(ui.syncSummary(p,{}),/含旧档 1 条/);
 assert.equal(archiveSyncSummary(p,{changes:[{specific:{adapterId:'other.adapter',recordId:'skill',fields:{}}}]}).tableCreated,0);
 p.archives.a.specific.fields.effect='后续补全';assert.equal(archiveHealth(p).pending,1);assert.equal(archiveLibraryPage(p,{pending:true}).matched,1);
});
test('budget reports final messages including preset, assistant text and existing message blocks',async()=>{
 let sent,observed;
 const library={version:1,revision:0,presets:[{id:'p',name:'p',blocks:[{id:'extra',name:'extra',kind:'text',role:'system',content:'预设'.repeat(5000),enabled:true},{id:'assistant',name:'assistant',kind:'text',role:'assistant',content:'确认',enabled:true}]}],routes:{archive:'p'}};
 const settings={mode:'st',promptPresetLibrary:library},connection={task:'archive',settings};
 const m=new ModelConnection({context:()=>({generateRaw:async p=>{sent=p;return '{}';}}),settings:()=>settings});
 const input={system:'系统',user:'数据',messages:[{role:'system',content:'原系统'},{role:'user',content:'事实资料'}]};
 await m.request(input,{connection,onRequest:info=>{observed=info;}});
 assert.equal(observed.total,sent.prompt.reduce((sum,p)=>sum+p.content.length,0));assert.equal(observed.assistant,2);assert(observed.total>10000);assert.equal(observed.messages,sent.prompt.length);
 assert.equal(input.messages.length,2);
 // A display callback failure must not prevent generation.
 assert.equal(await m.request(input,{connection,onRequest:()=>{throw Error('display failure');}}),'{}');
});
test('independent connection reports the sent message array and resets counts on each request',async()=>{
 const requests=[],counts=[],settings={mode:'custom',baseUrl:'https://example.invalid/v1',model:'local-test',maxTokens:256};
 const m=new ModelConnection({context:()=>null,settings:()=>settings,getKey:()=>'',fetchImpl:async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,status:200,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{}'}}]})};}});
 for(const text of ['长消息'.repeat(1000),'短'])await m.request({system:'不发送的旧字段',user:'不发送的旧字段',messages:[{role:'system',content:'系统'},{role:'assistant',content:'确认'},{role:'user',content:text}]},{onRequest:info=>counts.push(info)});
 for(let i=0;i<2;i++)assert.equal(counts[i].total,requests[i].messages.reduce((n,m)=>n+m.content.length,0));
 assert.equal(counts[1].total,5);assert(counts[0].total>counts[1].total);
});
