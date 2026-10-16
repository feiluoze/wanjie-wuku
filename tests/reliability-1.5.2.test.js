import test from 'node:test';
import assert from 'node:assert/strict';
import {mmlcBodySelection,MMLC_BODY_BUDGET} from '../src/mmlc-body-selection.js';
import {mmlcBodyRules} from '../src/mmlc-rulebook.js';
import {MMLC_ENTRY} from '../src/mmlc.js';
import {emptyState,createPower,parseJSON} from '../src/core.js';
import {thinkingOptions} from '../src/model-thinking.js';
import {independentFetch} from '../src/model-transport.js';
import {ModelConnection} from '../src/model.js';
import {archiveContextWindow} from '../src/archive-context.js';
import {RuntimeLog} from '../src/runtime-log.js';
import {parseModelResponse} from '../src/model-response.js';
const storage=(limit=Infinity)=>{const values=new Map();return {values,getItem:k=>values.get(k)||null,removeItem:k=>values.delete(k),setItem:(k,v)=>{if(v.length>limit)throw Error('quota');values.set(k,v);}};};
test('MMLC selectors choose relevant original paragraphs within a fixed packet budget',()=>{
 for(const query of ['炼器本命剑阵法','突破金丹元婴','建造玄黄舰队','解析 计算 八卦 九宫 金丹 大罗 炼器 丹药 福地 时间 舰 传承 总档 境界 战斗 跨界 工业 灵宝']){
  const selection=mmlcBodySelection({query});assert(selection.selected.length>0);assert(selection.characters<4200);
  const state=emptyState(),p=createPower(MMLC_ENTRY);state.powers[p.id]=p;
  assert(mmlcBodyRules(state,{ruleQuery:query}).length<=MMLC_BODY_BUDGET);
 }
 assert(mmlcBodySelection({query:'炼器本命剑阵法'}).selected.some(x=>x.uid===8));
 assert(mmlcBodySelection({query:'建造玄黄舰队'}).selected.some(x=>x.uid===12));
 assert.equal(mmlcBodySelection().selected.length,0);
 assert(mmlcBodySelection({query:'继续',chat:[{mes:'正在建造舰船',is_user:false}]}).selected.some(x=>x.uid===12));
});
test('auxiliary context is capped without modifying source messages',()=>{
 const chat=Array.from({length:8},(_,i)=>({mes:String(i).repeat(10000),is_user:false})),before=JSON.stringify(chat);
 const result=archiveContextWindow(chat,8,8);assert.equal(result.reduce((n,r)=>n+r.content.length,0),6000);assert.equal(result.length,3);assert.deepEqual(result.map(r=>r.index),[5,6,7]);assert(result.every(r=>r.excerpt));assert.equal(JSON.stringify(chat),before);
});
test('DeepSeek auto disables thinking and explicit override survives host forwarding',async()=>{
 const settings={model:'deepseek-flash',baseUrl:'https://relay.test/v1'};
 assert.deepEqual(thinkingOptions(settings),{thinking:{type:'disabled'}});assert.equal(thinkingOptions({...settings,thinkingMode:'on'}).thinking.type,'enabled');assert.deepEqual(thinkingOptions({model:'other',baseUrl:'https://relay.test'}),{});
 let body;await independentFetch(async(_,options)=>{body=JSON.parse(options.body);},'https://relay.test/v1/chat/completions',{method:'POST',body:JSON.stringify({model:settings.model,...thinkingOptions(settings)}),headers:{}},{'Content-Type':'application/json'});
 assert.equal(JSON.parse(body.custom_include_body).thinking.type,'disabled');
});
test('empty length response is classified as response and reasoning tokens stay diagnostic',async()=>{
 assert.throws(()=>parseJSON('upstream timeout'),error=>error.jsonDiagnostic?.kind==='missing_object');
 const payload={choices:[{finish_reason:'length',message:{content:'',reasoning_content:'private thought'}}],usage:{prompt_tokens:123,completion_tokens:400,completion_tokens_details:{reasoning_tokens:400}}};
 const parsed=parseModelResponse(payload);assert.equal(parsed.diagnostic.usage.reasoningTokens,400);assert(!JSON.stringify(parsed).includes('private thought'));
 let count=0;const model=new ModelConnection({settings:()=>({mode:'custom',baseUrl:'https://relay.test/v1',model:'deepseek-flash',timeoutSeconds:10}),getKey:()=>'',fetchImpl:async()=>{count++;return {ok:true,status:200,json:async()=>payload};}});
 await assert.rejects(model.request({system:'',user:''}),error=>error.requestStage==='response');assert.equal(count,1);
});
test('diagnostic quota compacts own logs without deleting other storage or in-memory detail',()=>{
 const local=storage(5000);local.setItem('player-chat','keep');const log=new RuntimeLog({storage:local,fallbackStorage:null,scope:()=> 'a|chat'});log.detail=true;const ticket=log.begin('test');log.capture(ticket,'request','x'.repeat(10000));log.failureResponse(ticket,'Bearer secret sk-123456789 failed');
 assert.equal(log.storageFailed,false);assert.equal(log.storageCompacted,true);assert.equal(local.getItem('player-chat'),'keep');assert(log.find(ticket).steps.some(s=>s.content?.length===10000));assert(!JSON.stringify(log.export()).includes('Bearer secret'));
});
test('session fallback survives reload and records no thinking text or credentials',()=>{
 const local=storage(1),session=storage();const log=new RuntimeLog({storage:local,fallbackStorage:session,scope:()=> 'a|chat',secret:()=>['private-key']});const ticket=log.begin('failed');log.failureResponse(ticket,'private-key '+ 'x'.repeat(1000));log.finish(ticket,'失败');assert.equal(log.storageFallback,'session');
 const restored=new RuntimeLog({storage:local,fallbackStorage:session,scope:()=> 'a|chat'});assert.equal(restored.list().length,1);assert.equal(restored.storageFallback,'session');assert(!JSON.stringify(restored.export()).includes('private-key'));restored.clear();assert.equal(JSON.parse(session.getItem(restored.key('a'))).length,0);
});
