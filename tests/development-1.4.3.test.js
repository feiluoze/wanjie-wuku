import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJSON} from '../src/core.js';
import {fieldDiagnostic} from '../src/archive-protocol.js';
import {ARCHIVE_FIELDS} from '../src/archives.js';
import {RuntimeLog} from '../src/runtime-log.js';
import {fixture} from './mvu-fixture.js';
import {archivePrompt,normalizeArchiveChanges} from '../src/archive-review.js';

test('JSON failures record structural positions without syntax excerpts or private values',()=>{
 for(const raw of ['{"changes": [}, "private":"私密内容"}','{"private":"私密内容']){
  try{parseJSON(raw);assert.fail('must reject');}catch(e){assert(e.jsonDiagnostic);assert.equal(e.jsonDiagnostic.stage,'json_parse');assert(!JSON.stringify(e.jsonDiagnostic).includes('私密内容'));assert(!e.message.includes('私密内容'));if(e.jsonDiagnostic.kind==='syntax')assert(Number.isInteger(e.jsonDiagnostic.offset));else assert(e.jsonDiagnostic.unterminatedString);}
 }
 assert.deepEqual(parseJSON('{"changes":[],}'),{changes:[]});
});

test('default validation diagnostics retain declared field IDs and counts without candidate names or values',()=>{
 const d=fieldDiagnostic({type:'facility',fields:{purpose:'私密文本',私密字段:'秘密',condition:3},details:[]},ARCHIVE_FIELDS),log=new RuntimeLog({storage:{getItem:()=>null,setItem:()=>{}}}),ticket=log.begin('诊断');
 log.step(ticket,'校验结果',{issues:[{kind:'成果',name:'私密人物',reason:'字段错误：私密字段',diagnostic:d}]});const row=log.export().records[0].steps[0].issues[0];assert.deepEqual(row.diagnostic.sections.fields.knownIds,['purpose','condition']);assert.equal(row.diagnostic.sections.fields.unknownCount,1);assert.equal(row.diagnostic.sections.fields.nonTextCount,1);assert.equal(row.diagnostic.sections.details.shape,'array');assert(!JSON.stringify(row).includes('私密'));assert(!JSON.stringify(row).includes('秘密'));
});

test('exact declared category labels and safe integer values normalize without guessing unknown fields',async()=>{
 const f=fixture(),changes=normalizeArchiveChanges({changes:[{type:'设施',name:'试验炉',status:'active',fields:{功能:'供能',容量或规模:3},sourceIndex:-1}]},f.power,[],f.ctx.chat,'玩家确认试验炉已建成');assert.equal(changes[0].type,'facility');assert.equal(changes[0].patch.scale,'3');
 assert.throws(()=>normalizeArchiveChanges({changes:[{type:'设施',name:'试验炉',status:'active',fields:{自造字段:'内容'},sourceIndex:-1}]},f.power,[],f.ctx.chat,'玩家确认'),/字段/);
 await f.app.openTaishi();const p=f.store.read().powers[f.app.powerId],event=normalizeArchiveChanges({changes:[{type:'其他成果',name:'港口封锁',recordId:'事件',status:'ended',fields:{description:'封锁已结束'},details:{当前概况:'封锁已经解除'},sourceIndex:-1}]},p,[],f.ctx.chat,'玩家确认港口封锁已结束');assert.equal(event[0].specific.recordId,'event');
});

test('parse failure captures opt-in raw response before parsing and always keeps sanitized JSON diagnostics',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.model.request=async()=>'{"changes": [}';f.app.runtimeLog=new RuntimeLog({storage:{getItem:()=>null,setItem:()=>{}}});f.app.runtimeLog.detail=true;f.app.logTask=f.app.runtimeLog.begin('测试');
 await assert.rejects(f.app.query({system:'只输出JSON',user:'测试'},f.app.ensureStable()),/JSON 语法/);const steps=f.app.runtimeLog.export().records[0].steps;assert(steps.some(s=>s.phase==='原始返回'));assert(steps.some(s=>s.phase==='JSON诊断'&&s.kind==='syntax'));assert(steps.findIndex(s=>s.phase==='原始返回')<steps.findIndex(s=>s.phase==='请求失败'));
});

test('economic briefing reuses world resources and advanced preview is read-only with public connection labels',async()=>{
 const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';let plans,calls=0;f.app.model.request=async()=>{calls++;throw Error('no request');};f.app.ui.showTaishiAdvanced=(_p,p)=>plans=p;const before=JSON.stringify(f.store.read());f.app.openTaishiAdvanced();assert.equal(calls,0);assert.equal(JSON.stringify(f.store.read()),before);assert.equal(plans.length,4);assert(!JSON.stringify(plans).includes('apiKey'));
 const p=f.store.read().powers[f.app.powerId],prompt=archivePrompt(p,[],f.ctx.chat),data=JSON.parse(prompt.user);assert.match(prompt.system,/经济简报/);assert.match(prompt.system,/世界经济轮廓不等于玩家可支取资源账本/);assert.match(data.recordSchemas.find(r=>r.id==='world').fields.find(f=>f.id==='resources').description,/主要产业/);assert(!data.recordSchemas.some(r=>r.id==='economy'));
});
