import test from 'node:test';
import assert from 'node:assert/strict';
import {requestWithFallback,transportFailure} from '../src/api-fallback.js';
import {taskConnectionPlan,normalizeTaskFallbacks} from '../src/task-routing.js';
import {fixture} from './mvu-fixture.js';
import {ModelConnection} from '../src/model.js';
import {AIActivity} from '../src/ai-activity.js';
import {RuntimeLog} from '../src/runtime-log.js';
import {WorkbenchUI} from '../src/ui.js';
import {DEFAULT_SETTINGS,saveConnectionProfile,saveTaskRoutes,resolveTaskConnectionPlan,getSettings,saveSettings,deleteConnectionProfile,getConnectionProfiles} from '../src/host.js';
const settings=model=>({...DEFAULT_SETTINGS,mode:'custom',baseUrl:'https://example.test/v1',model});
const profile=(id)=>({...settings(id),id,name:id,apiKey:'private-'+id});
const plan=[profile('a'),profile('b'),profile('c')].map(p=>({settings:p,apiKey:p.apiKey,profileName:p.name,task:'archive'}));

test('fallback is opt-in, ordered, bounded and deduplicates aliases of a billed transport',()=>{
 const base=settings('a'),profiles=[profile('b'),profile('c'),{...profile('b'),id:'alias'}];
 assert.equal(taskConnectionPlan('archive',base,'private-a',profiles).length,1);
 const s={...base,taskFallbacks:{archive:['b','alias']}};
 assert.deepEqual(taskConnectionPlan('archive',s,'private-a',profiles).map(c=>c.settings.model),['a','b']);
 assert.throws(()=>normalizeTaskFallbacks({archive:['b','b']},profiles));
 assert.throws(()=>normalizeTaskFallbacks({archive:['b','c','alias']},profiles));
 assert.throws(()=>normalizeTaskFallbacks({archive:['gone']},profiles));
 assert.throws(()=>normalizeTaskFallbacks({archive:['b']},profiles,{archive:'b'}));
 assert.throws(()=>taskConnectionPlan('archive',{...s,mode:'off'},'',profiles),/关闭/);
});

test('each configured connection is tried at most once; success stops and prompt is not changed',async()=>{
 const calls=[],switched=[];
 const result=await requestWithFallback(plan,async c=>{calls.push(c.profileName);if(c.profileName!=='c')throw transportFailure('http','unavailable',503);return 'answer';},{onSwitch:i=>switched.push(i.kind)});
 assert.equal(result,'answer');assert.deepEqual(calls,['a','b','c']);assert.deepEqual(switched,['http','http']);
 let n=0;await assert.rejects(requestWithFallback(plan,async()=>{n++;throw transportFailure('network','offline');}),/offline/);assert.equal(n,3);
});

test('cancel, context revision, JSON and validation errors never cause another attempt',async()=>{
 for(const error of [new DOMException('cancel','AbortError'),new SyntaxError('bad JSON'),Error('validation failed'),transportFailure('http','bad request',400),transportFailure('http','auth',401)]){
  let n=0;await assert.rejects(requestWithFallback(plan,async()=>{n++;throw error;}));assert.equal(n,1);
 }
 const controller=new AbortController();let n=0;
 await assert.rejects(requestWithFallback(plan,async()=>{n++;controller.abort();throw transportFailure('network','offline');},{signal:controller.signal}),/取消/);assert.equal(n,1);
 let changed=false;n=0;await assert.rejects(requestWithFallback(plan,async()=>{n++;changed=true;throw transportFailure('http','bad gateway',502);},{check:()=>{if(changed)throw Error('revision changed');}}),/revision/);assert.equal(n,1);
});

test('model exposes transport failure classification, not successful but unusable responses',async()=>{
 for(const status of [400,401,403,404,408,429,500,502,503,504]){
  const model=new ModelConnection({settings:()=>settings('x'),getKey:()=>'',fetchImpl:async()=>({ok:false,status})});
  await assert.rejects(model.request({system:'s',user:'u'}),e=>e.httpStatus===status&&e.retryableTransport===[408,429,500,502,503,504].includes(status));
 }
 const invalid=new ModelConnection({settings:()=>settings('x'),getKey:()=>'',fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw SyntaxError('bad');}})});
 await assert.rejects(invalid.request({system:'s',user:'u'}),e=>!e.retryableTransport);
 const offline=new ModelConnection({settings:()=>settings('x'),getKey:()=>'',fetchImpl:async()=>{throw TypeError('network');}});
 await assert.rejects(offline.request({system:'s',user:'u'}),e=>e.transportKind==='network');
});

test('account fallback settings survive stale forms; deleting profiles cleans only references',async()=>{
 const f=fixture();globalThis.localStorage=f.storage;
 const a=saveConnectionProfile({name:'主',settings:settings('a'),apiKey:'private-a'},f.ctx),b=saveConnectionProfile({name:'备',settings:settings('b'),apiKey:'private-b'},f.ctx);
 const stale=getSettings(f.ctx);saveTaskRoutes({archive:a},f.ctx,{archive:[b]});
 await saveSettings({...stale,theme:'night'},f.ctx);f.ctx.chatId='next';
 assert.deepEqual(resolveTaskConnectionPlan('archive',f.ctx).map(c=>c.settings.model),['a','b']);
 assert(!JSON.stringify(getSettings(f.ctx)).includes('private-'));assert(!JSON.stringify(f.store.read()).includes('taskFallbacks'));
 assert.throws(()=>saveTaskRoutes({archive:a},f.ctx,{archive:[a]}));assert.deepEqual(getSettings(f.ctx).taskFallbacks.archive,[b]);
 deleteConnectionProfile(b,f.ctx);assert.deepEqual(getSettings(f.ctx).taskFallbacks.archive,[]);
});

test('query switches real transport, preserves snapshot and reports actual backup without secrets',async()=>{
 const f=fixture();globalThis.localStorage=f.storage;
 const a=saveConnectionProfile({name:'主',settings:settings('a'),apiKey:'private-a'},f.ctx),b=saveConnectionProfile({name:'备',settings:settings('b'),apiKey:'private-b'},f.ctx);
 saveTaskRoutes({archive:a},f.ctx,{archive:[b]});f.app.settings=getSettings(f.ctx);
 const seen=[],calls=[];f.app.aiActivity=new AIActivity(s=>seen.push(s));f.app.runtimeLog=new RuntimeLog({storage:f.storage,scope:()=>f.app.store.capture().chatKey});f.app.logTask=f.app.runtimeLog.begin('test');
 f.app.model=new ModelConnection({settings:()=>f.app.settings,getKey:()=>'',fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);calls.push({model:body.model,messages:body.messages,key:options.headers.Authorization});return body.model==='a'?{ok:false,status:502}:{ok:true,status:200,json:async()=>({choices:[{message:{content:'{"message":"done"}'}}]})};}});
 const before=JSON.stringify(f.app.store.read());
 const result=await f.app.aiActivity.run('test',()=>f.app.query({system:'s',user:'{}'},f.app.contextSnapshot(),{task:'archive'}));
 assert.equal(result.data.message,'done');assert.deepEqual(calls.map(c=>c.model),['a','b']);assert.deepEqual(calls[0].messages,calls[1].messages);assert.equal(calls[1].key,'Bearer private-b');
 assert.equal(JSON.stringify(f.app.store.read()),before);assert.equal(f.app.busy,false);
 assert.match(seen.at(-1).connections.archive,/备.*b.*备用1/);
 const log=JSON.stringify(f.app.runtimeLog.export());assert.match(log,/切换备用API/);assert(!log.includes('private-'));assert(!JSON.stringify(seen).includes('private-'));
 // A returned invalid JSON is not a transport failure and does not consume a backup.
 let n=0;f.app.model.request=async()=>{n++;return '{bad';};
 await assert.rejects(f.app.query({system:'s',user:'{}'},f.app.contextSnapshot(),{task:'archive'}));assert.equal(n,1);
});

test('settings expose ordered backups inside optional details without leaking profile credentials',()=>{
 const ui=Object.create(WorkbenchUI.prototype);let html;ui.dialog=(_title,body)=>html=body;ui.modal={querySelector:()=>null};
 ui.showSettings({...settings('a'),taskFallbacks:{archive:['b']}},{profiles:[{id:'b',name:'备用',model:'b',mode:'custom'}]});
 assert.match(html,/name="fallback1:archive"/);assert.match(html,/name="fallback2:archive"/);assert.match(html,/备用请求可能另计费用/);assert.match(html,/不使用/);
});


test('actual timeout is eligible, but user abort cannot advance the fallback chain',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const model=new ModelConnection({settings:()=>({...settings('x'),timeoutSeconds:10}),getKey:()=>'',fetchImpl:async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))});
 const pending=model.request({system:'s',user:'u'});const rejected=assert.rejects(pending,e=>e.transportKind==='timeout'&&e.retryableTransport===true);
 t.mock.timers.tick(10000);await rejected;
 const controller=new AbortController();let calls=0;
 const running=requestWithFallback(plan,async c=>{calls++;return model.request({system:'s',user:'u'},{signal:controller.signal,connection:c});},{signal:controller.signal});
 const cancelled=assert.rejects(running,/取消/);controller.abort();await cancelled;assert.equal(calls,1);
});
