import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {databasePromptTrial,DATABASE_PROMPT_STRINGS,DATABASE_PROMPT_TRIAL_ID} from '../src/database-prompt-trial.js';
import {ModelConnection} from '../src/model.js';
import {fixture} from './mvu-fixture.js';
import {completeReview} from './review-response-fixture.js';
import {RuntimeLog} from '../src/runtime-log.js';
const prompt={system:'只输出武库JSON。保留来源、归属与防重复结算。',user:JSON.stringify({task:'核对经营档案变化',sources:[{index:3,content:'正式结算'}],rules:'原词条',current:[{id:'a',name:'已有对象'}],attachedWorldbooks:{books:[]}})};
test('upstream strings are byte-identical to the extraction receipt',async()=>{
 const expected={"system": "ac889eeb098296dd34ae2f6b3b39846236a6b492e82f5656123f9bee7c4f7016", "identity": "b618b3752ee5b254d46ed563f73864bbd541c8e72390de0a251d093af3c2b81e", "acknowledgements": "414e6cae8f82a229d27cb3603582142d10517016e8dea276476cd8aa84690a00", "tail": "2ed33f52552f815668f83b16f318947af14344abf4a3b6b14746056605c9856e"};for(const [key,digest] of Object.entries(expected))assert.equal(createHash('sha256').update(JSON.stringify(DATABASE_PROMPT_STRINGS[key])).digest('hex'),digest);assert.equal(DATABASE_PROMPT_STRINGS.sha256,'46015f633bb7b752cf31e308a07930434a611d1ba374d84d7217562520d552c1');
});
test('upstream eight message roles and original acknowledgements are preserved; task and data slots are lossless',()=>{
 const before=JSON.stringify(prompt),wire=databasePromptTrial(prompt);
 assert.equal(wire.databasePromptTrial,DATABASE_PROMPT_TRIAL_ID);
 assert.deepEqual(wire.messages.map(m=>m.role),['system','assistant','user','assistant','user','assistant','user','user']);
 assert(wire.messages[0].content.includes(DATABASE_PROMPT_STRINGS.identity));assert(wire.messages[0].content.includes('表格数据'));
 for(const [i,j] of [[1,0],[3,1],[5,2]])assert.equal(wire.messages[i].content,DATABASE_PROMPT_STRINGS.acknowledgements[j]);
 assert.equal(wire.messages[7].content,DATABASE_PROMPT_STRINGS.tail);assert.equal(wire.messages[4].content,prompt.system);
 assert.deepEqual({...JSON.parse(wire.messages[2].content),...JSON.parse(wire.messages[6].content)},JSON.parse(prompt.user));
 assert.equal(JSON.stringify(prompt),before);assert.equal(databasePromptTrial(prompt,false),prompt);
});
test('custom API sends exact multi-message wire, unchanged model parameters and one request',async()=>{
 let calls=0,body;const m=new ModelConnection({settings:()=>({mode:'custom',baseUrl:'https://example.test/v1',model:'test',maxTokens:4096,temperature:0.7,timeoutSeconds:10}),getKey:()=>'',fetchImpl:async(_url,r)=>{calls++;body=JSON.parse(r.body);return {ok:true,status:200,json:async()=>({choices:[{message:{content:'{"changes":[]}'},finish_reason:'stop'}]})};}});
 const wire=databasePromptTrial(prompt);assert.equal(await m.request(wire),'{"changes":[]}');assert.equal(calls,1);assert.deepEqual(body.messages,wire.messages);assert.equal(body.max_tokens,4096);assert.equal(body.temperature,0.7);assert.equal(body.stream,false);
});
test('tavern raw path carries message arrays without duplicating system prompt or mutating cached messages',async()=>{
 let calls=0,received;const wire=databasePromptTrial(prompt),before=JSON.stringify(wire.messages),m=new ModelConnection({settings:()=>({mode:'st',timeoutSeconds:10}),context:()=>({generateRaw:async p=>{calls++;received=structuredClone(p);p.prompt[0].content+='host mutation';return '{"changes":[]}';}})});
 assert.equal(await m.request(wire),'{"changes":[]}');assert.equal(calls,1);assert.deepEqual(received.prompt,wire.messages);assert.equal(received.systemPrompt,'');assert.equal(JSON.stringify(wire.messages),before);
});
test('archive stages use one protocol without the legacy table prompt; explicit legacy helper stays available',async()=>{
 const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};await f.store.transact(s=>s.powers[f.app.powerId].taishiWorkflow=true);
 const calls=[];f.app.model.request=async(p,{connection})=>{calls.push({p,task:connection.task});return completeReview(p,connection.task==='taishiSummary'?{message:'无新变化'}:{changes:[]});};
 f.app.runtimeLog=new RuntimeLog({storage:f.storage});f.app.logTask=f.app.runtimeLog.begin('试验');await f.app.reviewArchives({rescan:true});assert.equal(calls.length,3);assert(calls.every(c=>!c.p.messages));assert(calls.every(c=>!c.p.databasePromptTrial));
 f.app.pendingArchiveReview=null;f.app.clearReviewCheckpoint({chatKey:f.app.contextSnapshot().chatKey});calls.length=0;f.app.model.request=async p=>{calls.push({p});return '{}';};await f.app.query({system:'普通操作',user:'{}'},f.app.ensureStable());assert.equal(calls.length,1);assert.equal(calls[0].p.messages,undefined);
});
