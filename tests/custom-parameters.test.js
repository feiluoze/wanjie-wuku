import test from 'node:test';
import assert from 'node:assert/strict';
import {customRequestParameters,normalizeCustomParameters} from '../src/model-parameters.js';
import {ModelConnection} from '../src/model.js';
import {DEFAULT_SETTINGS,saveConnectionProfile,applyConnectionProfile,getSettings,getConnectionProfiles} from '../src/host.js';
import {taskConnection,taskConnectionPlan} from '../src/task-routing.js';
import {connectionValues} from '../src/preferences.js';
const json=JSON.stringify({thinking:{type:'disabled'},reasoning_effort:'low',top_p:0.9,extra_body:{provider:{options:[1,true,null]}}});
const settings={...DEFAULT_SETTINGS,mode:'custom',baseUrl:'https://provider.invalid/v1',model:'deepseek-flash',thinkingMode:'on',customParameters:json};
test('nested JSON parameters round-trip without mutating input or accepting non-object formats',()=>{
 assert.deepEqual(customRequestParameters(normalizeCustomParameters(json)),JSON.parse(json));assert.equal(normalizeCustomParameters('   '),'');assert.equal(normalizeCustomParameters('{}'),'');
 for(const value of ['[]','null','3','"text"','{"top_p":}','top_p: 0.9'])assert.throws(()=>customRequestParameters(value),/JSON/);
 assert.throws(()=>customRequestParameters(' '.repeat(16001)),/16000/);
 assert.throws(()=>customRequestParameters('{"x":1e999}'),/数值/);
 assert.throws(()=>customRequestParameters('{"__proto__":{"polluted":true}}'),/对象键/);
 assert.throws(()=>customRequestParameters('{"extra_body":{"constructor":{}}}'),/对象键/);assert.equal({}.polluted,undefined);
});
test('routing, credentials, messages and stream remain owned by explicit settings',()=>{
 for(const key of ['messages','model','stream','headers','api_key','custom_include_body','custom_url','chat_completion_source','reverse_proxy'])assert.throws(()=>customRequestParameters(JSON.stringify({[key]:false})),/不能覆盖/);
 assert.equal(connectionValues(settings).customParameters,normalizeCustomParameters(json));
});
test('standalone independent request merges user parameters after defaults with one request',async()=>{
 let sent,count=0,diagnostic;const model=new ModelConnection({settings:()=>settings,getKey:()=>'',fetchImpl:async(_url,options)=>{count++;sent=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({choices:[{message:{content:'{"changes":[]}'},finish_reason:'stop'}]})};}});
 const before=JSON.stringify(settings);await model.request({system:'format',user:'facts'},{onResponse:value=>diagnostic=value});assert.equal(count,1);assert.equal(JSON.stringify(settings),before);
 assert.equal(sent.thinking.type,'disabled');assert.equal(sent.top_p,0.9);assert.equal(sent.reasoning_effort,'low');assert.deepEqual(sent.extra_body,JSON.parse(json).extra_body);assert.equal(sent.stream,false);assert.equal(sent.messages[1].content,'facts');assert.equal(diagnostic.requestedThinking,'disabled');assert.equal(diagnostic.customParameterCount,4);
});
test('backend merge receives arbitrary nested provider parameters, not just DeepSeek thinking',async()=>{
 let sent;const model=new ModelConnection({context:()=>({getRequestHeaders:()=>({'X-CSRF-Token':'local'})}),settings:()=>({...settings,customParameters:JSON.stringify({temperature:0.2,max_tokens:4096,response_format:{type:'json_object'},extra_body:{vendor:{mode:'fast'}}})}),getKey:()=>'',fetchImpl:async(url,options)=>{assert.equal(url,'/api/backends/chat-completions/generate');sent=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({choices:[{message:{content:'{}'}}]})};}});
 await model.request({system:'',user:''});const merged=JSON.parse(sent.custom_include_body);assert.equal(merged.temperature,0.2);assert.equal(merged.max_tokens,4096);assert.equal(merged.response_format.type,'json_object');assert.equal(merged.extra_body.vendor.mode,'fast');assert(!Object.hasOwn(merged,'messages'));assert(!Object.hasOwn(merged,'model'));assert(!Object.hasOwn(merged,'stream'));
});
test('invalid runtime configuration fails locally before any network call or fallback',async()=>{
 let requests=0;const model=new ModelConnection({settings:()=>({...settings,customParameters:'{"thinking":'}),getKey:()=>'',fetchImpl:async()=>{requests++;throw Error('must not send');}});
 await assert.rejects(model.request({system:'',user:''}),error=>error.requestStage==='preflight');assert.equal(requests,0);
});
test('parameters persist per profile, clear explicitly, and stay out of metadata and chat data',()=>{
 const ctx={userHandle:'custom-parameters-test',extensionSettings:{},saveSettingsDebounced(){}};
 const a=saveConnectionProfile({name:'A',settings,apiKey:'key-a'},ctx),b=saveConnectionProfile({name:'B',settings:{...settings,customParameters:'{"top_p":0.2}'},apiKey:'key-b'},ctx);
 applyConnectionProfile(a,ctx);assert.deepEqual(JSON.parse(getSettings(ctx).customParameters),JSON.parse(json));applyConnectionProfile(b,ctx);assert.equal(JSON.parse(getSettings(ctx).customParameters).top_p,0.2);
 assert(!JSON.stringify(getConnectionProfiles(ctx)).includes('customParameters'));
 saveConnectionProfile({id:b,name:'B',settings:{...settings,customParameters:''},apiKey:'key-b'},ctx);assert.equal(getSettings(ctx).customParameters,'');
 assert.equal(connectionValues({...settings,customParameters:''},settings).customParameters,'');
});
test('task-specific and fallback profiles never inherit another connection custom parameters',()=>{
 const current={...settings,taskRoutes:{archive:'old'},taskFallbacks:{archive:['backup']}};
 const profiles=[{id:'old',name:'Legacy',mode:'custom',baseUrl:'https://old.invalid',model:'old'}, {id:'backup',name:'B',mode:'custom',baseUrl:'https://backup.invalid',model:'b',customParameters:'{"top_p":0.3}'}];
 assert.equal(taskConnection('archive',current,'key',profiles).settings.customParameters,'');const plan=taskConnectionPlan('archive',current,'key',profiles);assert.equal(plan[1].settings.customParameters,profiles[1].customParameters);
});
test('ST connection keeps host controls and does not forward independent parameters',async()=>{
 let input;const model=new ModelConnection({settings:()=>({...settings,mode:'st'}),context:()=>({generateRaw:async options=>{input=options;return '{}';}})});await model.request({system:'format',user:'facts'});assert(!JSON.stringify(input).includes('extra_body'));assert(!JSON.stringify(input).includes('thinking'));
});
