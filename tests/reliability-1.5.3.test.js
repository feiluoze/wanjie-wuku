import test from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeLog,trimRuntimeLogs,LOG_RETENTION} from '../src/runtime-log.js';
import {installAIActivity} from '../src/ai-activity.js';
import {fixture} from './mvu-fixture.js';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,chatHashes,clone} from '../src/core.js';
import {archiveSources,normalizeArchiveBatch} from '../src/archive-review.js';
import {WorkbenchUI} from '../src/ui.js';
import {parseModelResponse} from '../src/model-response.js';
import {ModelConnection} from '../src/model.js';
const memory=()=>{const map=new Map();return {map,getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('sync with no new narrative logs skipped, never calls model or reports success',async()=>{
 const f=fixture(),seen=[];f.app.settings.mode='st';f.app.runtimeLog=new RuntimeLog({storage:memory(),scope:()=> 'test|a'});f.app.ui.setAIActivity=x=>seen.push(x);let calls=0;f.app.model.request=async()=>{calls++;return '{}';};
 const r=await f.app.sync();assert.equal(r.skipped,true);assert.equal(calls,0);assert.equal(f.app.runtimeLog.list()[0].status,'未执行');assert.equal(seen.at(-1).status,'skipped');assert.match(seen.at(-1).phase,/未调用AI/);
});
test('sync preview is pending, later confirmation updates original log to saved and commits once',async()=>{
 const f=fixture();f.app.settings.mode='st';f.ctx.chat.push({is_user:false,mes:'你完成一次试炼，但尚未领取任何奖励。'});f.app.runtimeLog=new RuntimeLog({storage:memory(),scope:()=> 'test|a'});f.app.model.request=async()=>JSON.stringify({events:[],message:'没有新增收益'});
 await f.app.sync();assert.equal(f.app.runtimeLog.list()[0].status,'待确认');assert(f.app.pendingSync);await f.app.applySync();assert.equal(f.app.runtimeLog.list()[0].status,'未更新');assert.equal(f.app.pendingSync,null);assert.equal(f.store.read().syncCursor,2);await assert.rejects(f.app.applySync(),/预览已经失效/);
});
test('unrelated pending archive cannot relabel a successful independent task',async()=>{
 class App{async generate(){return {};}}installAIActivity(App.prototype);const a=new App();a.pendingArchiveReview={};a.runtimeLog=new RuntimeLog({storage:memory()});a.store={read:()=>({powers:{}})};await a.generate();assert.equal(a.runtimeLog.list()[0].status,'成功');
});
test('retention removes expired successful logs and keeps recent failures before old successes',()=>{
 const now=Date.now(),rows=Array.from({length:55},(_,i)=>({id:String(i),status:i<5?'失败':'成功',startedAt:now-i*100,steps:[]}));rows.unshift({id:'expired',status:'失败',startedAt:now-8*86400000,steps:[]});trimRuntimeLogs(rows,now);assert.equal(rows.length,40);assert(!rows.some(r=>r.id==='expired'));assert.equal(rows.filter(r=>r.status==='失败').length,5);
});
test('byte budget compacts verbose content and never touches chat storage',()=>{
 const store=memory();store.setItem('player-chat','keep');const log=new RuntimeLog({storage:store,scope:()=> 'a|b'});log.detail=true;
 for(let i=0;i<5;i++){const t=log.begin('verbose');log.capture(t,'返回','字'.repeat(100000));log.finish(t,'成功');}
 const saved=store.getItem(log.key('a'));assert(new TextEncoder().encode(saved).length<=LOG_RETENTION.bytes);assert.equal(store.getItem('player-chat'),'keep');assert(log.list().some(r=>r.detailOmitted));
});
test('oversized single diagnostic is bounded while final task status remains writable',()=>{
 const store=memory(),log=new RuntimeLog({storage:store});const t=log.begin('large');log.step(t,'large',{items:Array(150).fill('x'.repeat(10000))});log.finish(t,'失败','test');assert(new TextEncoder().encode(store.getItem(log.key(log.account()))).length<=LOG_RETENTION.bytes);assert.equal(log.list()[0].status,'失败');
});
test('declared points record echoed as type is normalized, while unknown types are still rejected',()=>{
 const p=createPower(builtinEntries().find(e=>e.name==='升变之印')),chat=[{is_user:false,mes:'本轮实际支付15点升变点；当前升变点余额85。'}],state={powers:{[p.id]:p}},sources=archiveSources(chat,state,p,{rescan:true});
 const raw={type:'points',recordId:'points',name:'本次升变支出',status:'ended',fields:{input:'支付15点',basis:'已完成升变',change:'-15'},details:{input:'支付15点',basis:'已完成升变',change:'-15'},sourceIndex:0,quote:chat[0].mes,ruleQuote:p.rules.slice(0,20)};
 const before=JSON.stringify(p.resources),b=normalizeArchiveBatch({changes:[raw]},p,sources,chat,'',state);assert.equal(b.issues.length,0);assert.equal(b.changes[0].type,'record');assert.equal(b.changes[0].specific.fields.input,'支付15点');assert.equal(JSON.stringify(p.resources),before);
 const bad=normalizeArchiveBatch({changes:[{...raw,type:'madeup'}]},p,sources,chat,'',state);assert.equal(bad.changes.length,0);assert(bad.issues.length);
});
test('known 100 balance and candidate 85 are counted and selectable, without silently overwriting ledger',async()=>{
 const ui=Object.create(WorkbenchUI.prototype);let html;ui.dialog=(_title,value)=>html=value;const p={name:'测试',id:'p',resources:{r:{id:'r',name:'点数',balance:'100',floor:'0'}}};ui.showBaseline(p,{r:{balance:'85',source:'第2层',evidence:'余额85'}});assert.match(html,/找到 1 项余额候选/);assert.match(html,/采用聊天候选 85/);assert.match(html,/value="100"/);assert.equal(p.resources.r.balance,'100');
 const f=fixture(),field={value:'100',readOnly:false};await f.app.action('adopt-balance-candidate',{form:{elements:{namedItem:()=>field}},input:'balance:r',value:'85'});assert.equal(field.value,'85');assert.equal(p.resources.r.balance,'100');
});
test('tool calls with a short non-JSON message are not accepted as final prose, and requests disable them',async()=>{
 const payload={choices:[{finish_reason:'tool_calls',message:{content:'I will use the tool',tool_calls:[{function:{arguments:'private'}}]}}]};const result=parseModelResponse(payload);assert.match(result.error,/工具调用/);assert.equal(result.content,undefined);assert(!JSON.stringify(result).includes('private'));
 let body;const m=new ModelConnection({settings:()=>({mode:'custom',model:'deepseek-v4.1-flash-free',baseUrl:'https://proxy.invalid/v1'}),fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return {ok:true,status:200,json:async()=>payload};},getKey:()=>''});await assert.rejects(m.request({system:'JSON',user:'facts'}),/工具调用/);assert.equal(body.tool_choice,'none');
});

test('changed narrative invalidates a returned response without applying any old result',async()=>{
 const f=fixture();f.app.settings.mode='st';f.ctx.chat.push({is_user:false,mes:'新事实尚未核对。'});f.app.runtimeLog=new RuntimeLog({storage:memory()});f.app.model.request=async()=>{f.ctx.chat[1].mes+='正文已修改。';return JSON.stringify({events:[]});};
 await assert.rejects(f.app.sync(),error=>error.name==='ContextChangedError'&&error.requestStage==='context');assert.equal(f.app.runtimeLog.list()[0].status,'已作废');assert.equal(f.app.pendingSync,null);
});
