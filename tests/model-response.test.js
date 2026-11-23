import test from 'node:test';
import a from 'node:assert/strict';
import {parseModelResponse} from '../src/model-response.js';
import {ModelConnection} from '../src/model.js';
import {requestWithFallback} from '../src/api-fallback.js';
import {responseRepairPrompt} from '../src/archive-response-repair.js';
import {RuntimeLog} from '../src/runtime-log.js';
const settings={mode:'custom',baseUrl:'https://example.test/v1',model:'fixture',timeoutSeconds:10};
test('explicit final text variants are accepted without reasoning or tools',()=>{
 for(const data of [
  {choices:[{message:{content:'{"changes":[]}'}}]},
  {choices:[{text:'{"changes":[]}' }]},
  {choices:[{message:{content:[{type:'text',text:{value:'{"changes":[]}'}}]}}]},
  {object:'response',output:[{type:'reasoning',summary:'private'}, {type:'message',role:'assistant',content:[{type:'output_text',text:'{"changes":[]}'}]}]}
 ])a.equal(parseModelResponse(data).content,'{"changes":[]}');
 const r=parseModelResponse({choices:[{message:{content:[{type:'text',thought:true,text:'private'},{type:'text',text:'final'}]}}]});
 a.equal(r.content,'final');
});
test('empty responses distinguish reasoning, tools, limits, refusals and unknown format',()=>{
 for(const [choice,pattern] of [
  [{message:{reasoning_content:'private'}},/思考/],
  [{message:{tool_calls:[{function:{arguments:'secret'}}]}},/工具/],
  [{finish_reason:'length',message:{content:''}},/输出限制/],
  [{message:{refusal:'private'}},/拒绝/],
  [{message:{content:''}},/空正文/]
 ]){const r=parseModelResponse({choices:[choice]});a.match(r.error,pattern);a.equal(r.content,undefined);a.doesNotMatch(JSON.stringify(r.diagnostic),/private|secret/);}
 a.match(parseModelResponse({unexpected:'private'}).error,/格式/);
 a.match(parseModelResponse({error:{message:'private key'}}).error,/错误对象/);
});
test('failed responses log structural diagnostics by default and never retry a charged request',async()=>{
 let calls=0; const log=new RuntimeLog({storage:null,scope:()=> 'fixture',version:'test'}), ticket=log.begin('test');
 const model=new ModelConnection({settings:()=>settings,getKey:()=> 'credential',fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({choices:[{finish_reason:'length',message:{content:null,reasoning_content:'private original'}}]})};}});
 await a.rejects(model.request({system:'',user:''},{onResponse:d=>log.step(ticket,'接口响应诊断',d)}),/输出限制/);
 a.equal(calls,1);const result=JSON.stringify(log.export());a.match(result,/reasoningPresent/);a.doesNotMatch(result,/private original|credential/);
});
test('invalid JSON and HTTP errors carry diagnostics without exposing response bodies',async()=>{
 for(const [response,format,pattern] of [[{ok:true,status:200,json:async()=>{throw new SyntaxError('private');}},'invalid-json',/完整 JSON/],[{ok:false,status:502},'http-error',/502/]]){
  const rows=[];let calls=0;const m=new ModelConnection({settings:()=>settings,getKey:()=>'',fetchImpl:async()=>{calls++;return response;}});
  await a.rejects(m.request({system:'',user:''},{onResponse:d=>rows.push(d)}),pattern);a.equal(rows[0].format,format);a.equal(calls,1);
 }
});

test('wrapped gateway errors surface their upstream status and only temporary errors retry',async()=>{
 const connection={settings,apiKey:''};
 for(const [status,detail,label,callsExpected] of [
  [503,'This model is currently experiencing high demand.',/渠道繁忙/,3],
  [429,'Token Plan Person monthly quota limit exceeded',/额度不足/,1],
  [524,'error code: 524',/渠道请求超时/,3]
 ]){
  const content=`[API 错误]\nCustom OpenAI endpoint failed with status ${status}: ${detail}`;
  const parsed=parseModelResponse({choices:[{finish_reason:'stop',message:{content}}]});
  a.equal(parsed.content,undefined);
  a.equal(parsed.diagnostic.providerError,true);
  let calls=0;
  const model=new ModelConnection({settings:()=>settings,getKey:()=>'',fetchImpl:async()=>{
   calls++;
   return {ok:true,status:200,json:async()=>({choices:[{finish_reason:'stop',message:{content}}]})};
  }});
  await a.rejects(requestWithFallback([connection],selected=>model.request({system:'',user:''},{connection:selected}),{
   retryDelays:[8,20],wait:async()=>{}
  }),error=>error.httpStatus===status&&error.requestStage==='transport'&&label.test(error.message));
  a.equal(calls,callsExpected);
  a.throws(()=>responseRepairPrompt({data:{rawFailures:[{raw:content}]}},{}),/重查该楼层/);
 }
 const content='{"changes":[],"message":"[API 错误] 是正文的一部分"}';
 a.equal(parseModelResponse({choices:[{message:{content}}]}).content,content);
});
