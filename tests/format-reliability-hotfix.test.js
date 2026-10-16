import test from 'node:test';
import assert from 'node:assert/strict';
import {thinkingOptions} from '../src/model-thinking.js';
import {parseModelResponse} from '../src/model-response.js';
import {ModelConnection} from '../src/model.js';
import {parseJSON,archiveReadText,ARCHIVE_READ_FORMAT,createPower,hash} from '../src/core.js';
import {archiveEvidenceText,ARCHIVE_FIELDS} from '../src/archives.js';
import {prepareArchiveFields} from '../src/archive-field-input.js';
import {normalizeArchiveBatch,archiveSources} from '../src/archive-review.js';
import {builtinEntries} from '../src/builtin-worldbook.js';
test('vendor thinking controls preserve unsupported models and respect explicit modes',()=>{
 assert.deepEqual(thinkingOptions({model:'MiniMax-M2.7-highspeed'}),{reasoning_split:true});
 assert.equal(thinkingOptions({model:'MiniMax-M3'}).thinking.type,'disabled');assert.equal(thinkingOptions({model:'MiniMax-M3',thinkingMode:'on'}).thinking.type,'adaptive');
 assert.equal(thinkingOptions({model:'MiniMax-M3.1-Flash-Preview'}).reasoning_effort,'low');assert(!thinkingOptions({model:'MiniMax-M3.1-Flash-Preview',thinkingMode:'on'}).thinking);
 assert.deepEqual(thinkingOptions({model:'unknown'}),{});
});
test('inline thinking with fake JSON is excluded but literal tags inside final JSON stay intact',()=>{
 const raw='<think>{"fake":true}</think>\n{"changes":[],"message":"<think>literal</think>"}',out=parseModelResponse({choices:[{finish_reason:'stop',message:{content:raw}}]});
 assert.equal(out.diagnostic.reasoningPresent,true);assert(out.diagnostic.reasoningCharacters>0);assert.deepEqual(parseJSON(out.content),{changes:[],message:'<think>literal</think>'});assert.equal(parseJSON(raw).changes.length,0);
 const bad=parseModelResponse({choices:[{message:{content:'<think>unfinished'}}]});assert.match(bad.error,/思考内容/);assert.equal(bad.content,undefined);
});
test('length response is explicit and never accepted or retried; custom vendor overrides survive',async()=>{
 let calls=0,body;const m=new ModelConnection({settings:()=>({mode:'custom',model:'MiniMax-M2.7-highspeed',baseUrl:'https://fixture.invalid/v1',maxTokens:4096,customParameters:'{"reasoning_split":false}'}),getKey:()=>'',fetchImpl:async(_url,opts)=>{calls++;body=JSON.parse(opts.body);return {ok:true,status:200,json:async()=>({choices:[{finish_reason:'length',message:{content:'{"changes":['}}]})};}});
 await assert.rejects(m.request({system:'JSON',user:'facts'}),/4096 tokens/);assert.equal(calls,1);assert.equal(body.reasoning_split,false);
});
test('generic extras are preserved without adapters; mismatched progress remains blocked',()=>{
 const raw={type:'record',fields:{description:'研究进行中',limits:'45%→75%'},details:{progress:'45%→75%',triggerMechanism:'接触后解析'}};
 const saved=JSON.stringify(raw),out=prepareArchiveFields(raw,ARCHIVE_FIELDS);assert.equal(JSON.stringify(raw),saved);assert(out.raw.fields.description.includes('触发依据：接触后解析'));assert(!out.raw.details);assert.equal(out.held.length,0);
 assert.throws(()=>prepareArchiveFields({...raw,fields:{...raw.fields,limits:'50%→75%'}},ARCHIVE_FIELDS),/冲突/);
 const p=createPower(builtinEntries().find(e=>e.name==='天人骨血')),chat=[{is_user:false,mes:'研究进行中，进度45%→75%，接触后解析。'}],state={powers:{[p.id]:p}};
 const b=normalizeArchiveBatch({changes:[{...raw,name:'研究',status:'working',sourceIndex:0,quote:chat[0].mes}]},p,archiveSources(chat,state,p,{rescan:true}),chat,'',state);assert.equal(b.issues.length,0,JSON.stringify(b.issues));assert.equal(b.changes.length,1);
});
test('declared top level fields move without overwriting conflicting values or swallowing operations',()=>{
 const out=prepareArchiveFields({type:'record',fields:{description:'事实'},limits:'限制',execute:'no'},ARCHIVE_FIELDS);assert.equal(out.raw.fields.limits,'限制');assert(!Object.hasOwn(out.raw,'limits'));assert.equal(out.raw.execute,'no');
 assert.throws(()=>prepareArchiveFields({type:'record',fields:{description:'事实',limits:'原值'},limits:'冲突值'},ARCHIVE_FIELDS),/冲突/);
});
test('v3 removes draft and checks while v2 evidence retains historical hashes',()=>{
 const raw='<draft>planning</draft><logic_check>checks</logic_check>正文<!-- plotThink: planning comment --><WJWK-settle>已获得一件物品</WJWK-settle>';
 assert.equal(ARCHIVE_READ_FORMAT,'archive-read-v3');const old=archiveReadText(raw,{legacy:true}),fresh=archiveReadText(raw);assert(old.includes('planning'));assert(!fresh.includes('planning'));assert(!fresh.includes('checks'));assert(!fresh.includes('planning comment'));assert(fresh.includes('已获得一件物品'));assert.equal(hash(archiveEvidenceText(raw,{format:'archive-read-v2'})),hash(old));assert.equal(archiveEvidenceText(raw,{format:ARCHIVE_READ_FORMAT}),fresh);
});
test('literal newlines in JSON strings can be escaped but missing data and ambiguous quotes are never invented',()=>{
 assert.equal(parseJSON('{"text":"第一行\n第二行",}').text,'第一行\n第二行');assert.throws(()=>parseJSON('{"text":"unfinished'));assert.throws(()=>parseJSON('{"text":"bad "quote""}'));
});
