import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelConnection} from '../src/model.js';
const settings={mode:'custom',baseUrl:'https://provider.test/v1',model:'chosen-model',timeoutSeconds:10};
const context=()=>({getRequestHeaders:()=>({'X-CSRF-Token':'local-csrf','Content-Type':'application/json'})});
const prompt={system:'系统格式',user:'本次事实'};

test('model discovery uses same-origin backend, draft key and CSRF without storing host secrets',async()=>{
 const calls=[],model=new ModelConnection({context,settings:()=>settings,getKey:()=> 'saved-plugin-key',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({data:[{id:'chosen-model'}]})};}});
 assert.deepEqual(await model.listModels({baseUrl:settings.baseUrl,apiKey:'draft-key'}),['chosen-model']);
 const {url,options}=calls[0],body=JSON.parse(options.body);
 assert.equal(url,'/api/backends/chat-completions/status');assert.equal(options.method,'POST');assert.equal(options.headers['X-CSRF-Token'],'local-csrf');assert.equal(options.credentials,'same-origin');
 assert.equal(body.custom_url,settings.baseUrl);assert.equal(body.chat_completion_source,'custom');assert.equal(JSON.parse(body.custom_include_headers).Authorization,'Bearer draft-key');
 assert(!url.includes('draft-key'));assert(!Object.hasOwn(body,'secret_id'));assert(!Object.hasOwn(options.headers,'Authorization'));
});

test('independent generation preserves explicit model, messages and key, without touching primary connection',async()=>{
 const before=JSON.stringify(settings),calls=[],model=new ModelConnection({context,settings:()=>settings,getKey:()=> 'plugin-key',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>({choices:[{message:{content:'{"changes":[]}'},finish_reason:'stop'}]})};}});
 assert.equal(await model.request(prompt),'{"changes":[]}');const body=JSON.parse(calls[0].options.body);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/backends/chat-completions/generate');assert.equal(body.model,'chosen-model');assert.equal(body.stream,false);
 assert.deepEqual(body.messages,[{role:'system',content:prompt.system},{role:'user',content:prompt.user}]);assert.equal(JSON.parse(body.custom_include_headers).Authorization,'Bearer plugin-key');assert.equal(JSON.stringify(settings),before);
});

test('empty plugin key explicitly overrides any backend saved custom key',async()=>{
 let body;const model=new ModelConnection({context,settings:()=>settings,getKey:()=>'',fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>({data:[{id:'m'}]})};}});
 await model.listModels({baseUrl:settings.baseUrl});assert.equal(JSON.parse(body.custom_include_headers).Authorization,'');
});

test('backend provider error cannot trigger a browser generation replay',async()=>{
 let calls=0;const model=new ModelConnection({context,settings:()=>({...settings,baseUrl:'https://provider.test'}),getKey:()=>'',fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({error:{message:'upstream failed'}})};}});
 await assert.rejects(model.request(prompt),/错误对象/);assert.equal(calls,1);
});

test('backend session and upstream discovery failures have distinct safe messages',async()=>{
 for(const [response,expected]of [[{ok:false,status:403},/登录与会话/],[{ok:true,json:async()=>({error:true})},/上游模型列表/]]){
  const model=new ModelConnection({context,getKey:()=> 'private-secret',fetchImpl:async()=>response});
  await assert.rejects(model.listModels({baseUrl:settings.baseUrl}),e=>expected.test(e.message)&&!e.message.includes('private-secret'));
 }
});

test('backend cancellation forwards the signal and never switches to direct transport',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const model=new ModelConnection({context,settings:()=>settings,getKey:()=>'',fetchImpl:async(url,options)=>{calls++;assert(url.startsWith('/api/'));assert(options.signal.aborted);throw new DOMException('stop','AbortError');}});
 await assert.rejects(model.request(prompt,{signal:controller.signal}),/取消/);assert.equal(calls,1);
});
