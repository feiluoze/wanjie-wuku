import test from 'node:test';
import assert from 'node:assert/strict';
import {requestWithFallback,transportFailure,providerFailure,retryDelay} from '../src/api-fallback.js';
import {ModelConnection} from '../src/model.js';
import {fixture} from './mvu-fixture.js';
import {DEFAULT_SETTINGS} from '../src/host.js';
const settings={...DEFAULT_SETTINGS,mode:'custom',baseUrl:'https://example.test/v1',model:'test'};
const plan=[{settings,profileName:'test',task:'archive'}];
const busy=()=>providerFailure({providerError:true,providerMessage:'Service Unavailable',httpStatus:200,textCharacters:0},'temporary');
test('temporary provider error with HTTP 200 is retryable, permanent and ambiguous errors are not',()=>{
 assert.equal(busy().retryableTransport,true);
 for(const message of ['insufficient_quota Service Unavailable','invalid_api_key','context_length_exceeded','Unsupported model','余额不足','unknown error',''])assert.notEqual(providerFailure({providerError:true,providerMessage:message},message).retryableTransport,true);
 assert.notEqual(providerFailure({providerError:true,providerMessage:'Service Unavailable',textCharacters:12},'error').retryableTransport,true);
});
test('automatic retry has a single total budget of three, fixed delays and unchanged input',async()=>{
 const delays=[],attempts=[];let calls=0;
 const result=await requestWithFallback(plan,async c=>{calls++;attempts.push(c);if(calls<3)throw busy();return 'valid';},{retryDelays:[8000,20000],wait:async ms=>delays.push(ms)});
 assert.equal(result,'valid');assert.equal(calls,3);assert.deepEqual(delays,[8000,20000]);assert.equal(attempts[2].retry,2);
 calls=0;await assert.rejects(requestWithFallback(plan,async()=>{calls++;throw busy();},{retryDelays:[8000,20000],wait:async()=>{}}));assert.equal(calls,3);
 calls=0;await assert.rejects(requestWithFallback(plan,async()=>{calls++;throw busy();}));assert.equal(calls,1);
 const backups=[...plan,{...plan[0],profileName:'backup'}];calls=0;
 await assert.rejects(requestWithFallback(backups,async()=>{calls++;throw busy();},{retryDelays:[8000,20000],wait:async()=>{}}));assert.equal(calls,3);
});
test('cancellation and state changes during backoff prevent another request',async()=>{
 for(const mode of ['cancel','context']){const controller=new AbortController();let changed=false,calls=0;
 await assert.rejects(requestWithFallback(plan,async()=>{calls++;throw busy();},{signal:controller.signal,retryDelays:[8000,20000],check:()=>{if(changed)throw Error('context changed');},wait:async()=>{if(mode==='cancel')controller.abort();else changed=true;}}));assert.equal(calls,1);}
 const controller=new AbortController();const pending=retryDelay(20000,controller.signal);controller.abort();await assert.rejects(pending,{name:'AbortError'});
});
test('never reruns a pending Tavern raw generation or retries JSON/validation failures',async()=>{
 for(const [connections,error]of [[[{settings:{mode:'st'}}],transportFailure('timeout','timeout')],[plan,SyntaxError('JSON')],[plan,Error('validation')]]){let calls=0;await assert.rejects(requestWithFallback(connections,async()=>{calls++;throw error;},{retryDelays:[8000,20000],wait:async()=>{}}));assert.equal(calls,1);}
});
test('actual model classifies temporary success errors, but does not retry quota HTTP errors',async()=>{
 for(const [status,message,retryable]of [[200,'Service Unavailable',true],[429,'insufficient_quota',false],[503,'invalid_api_key',false]]){
 const model=new ModelConnection({settings:()=>settings,getKey:()=>'',fetchImpl:async()=>({ok:status===200,status,json:async()=>({error:{message}})})});
 await assert.rejects(model.request({system:'s',user:'u'}),e=>Boolean(e.retryableTransport)===retryable);
 }
});
test('query integration retries only automatic requests; no partial storage writes and no retry after invalid JSON',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();f.app.settings=settings;let calls=0;const bodies=[];
 f.app.model=new ModelConnection({settings:()=>settings,getKey:()=>'',fetchImpl:async(_url,opts)=>{calls++;bodies.push(opts.body);return {ok:true,status:200,json:async()=>calls===1?{error:{message:'Service Unavailable'}}:{choices:[{message:{content:'{"message":"done"}'}}]}};}});
 const before=JSON.stringify(f.store.read());
 const pending=f.app.query({system:'s',user:'{}'},f.app.contextSnapshot(),{task:'archive',retryTransient:true});
 for(let i=0;i<40&&calls<1;i++)await Promise.resolve();
 // Drain the response parsing before advancing the backoff timer.
 for(let i=0;i<40;i++)await Promise.resolve();
 assert.equal(calls,1);assert.equal(JSON.stringify(f.store.read()),before);t.mock.timers.tick(8000);
 const result=await pending;assert.equal(result.data.message,'done');assert.equal(calls,2);assert.equal(bodies[0],bodies[1]);assert.equal(JSON.stringify(f.store.read()),before);
 calls=0;f.app.model.request=async()=>{calls++;return '{bad';};await assert.rejects(f.app.query({system:'s',user:'{}'},f.app.contextSnapshot(),{task:'archive',retryTransient:true}));assert.equal(calls,1);
});
