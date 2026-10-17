import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';import {createPower} from '../src/core.js';import {builtinEntries} from '../src/builtin-worldbook.js';import {creationConfig} from '../src/creation-config.js';
import {resolveArchiveCategory,prepareArchiveFields} from '../src/archive-field-input.js';import {normalizeArchiveBatch} from '../src/archive-review.js';import {archiveRepairPrompt} from '../src/archive-repair.js';import {ARCHIVE_FIELDS} from '../src/archives.js';
const power=()=>createPower(builtinEntries().find(e=>e.name==='万物尽头'));
const rows=()=>[
 {name:'二号农场',type:'environment',status:'active',sourceIndex:-1,fields:{location:'平原东部',conditions:'已建成'},details:{location:'平原东部',environment:'灌溉肥沃',time_flow:'高倍加速',access:'仅玩家可进出'}},
 {name:'粮食产线',type:'facility',recordId:'lines',status:'active',sourceIndex:-1,fields:{condition:'持续生产'},details:{goal:'粮食生产',operation:'自动化运转',environment:'肥沃黑土地',time_flow:'高倍加速'}},
 {name:'综合产出库存',type:'record',recordId:'stock',status:'active',sourceIndex:-1,fields:{description:'已有综合库存'},details:{location:'天地仓库',identity:'粮食果蔬与矿物',use:'按需取用'}}
];
test('unchanged mixed candidates normalize without dropping text or turning stock into seeds',()=>{
 const p=power(),data={changes:rows()},before=JSON.stringify(data),batch=normalizeArchiveBatch(data,p,[],[],'玩家确认以上事实');assert.equal(batch.issues.length,0);assert.equal(batch.changes.length,3);assert.equal(JSON.stringify(data),before);
 assert.equal(batch.changes[0].specific.recordId,'areas');assert.equal(batch.changes[1].specific.recordId,'lines');assert(batch.changes[1].patch.condition.includes('肥沃黑土地'));assert(batch.changes[1].patch.condition.includes('高倍加速'));
 assert.equal(batch.changes[2].specific.recordId,'stock');assert(batch.changes[2].patch.description.includes('粮食果蔬与矿物'));assert(batch.changes[2].patch.description.includes('按需取用'));
});
test('category inference refuses ambiguous, unknown, protected, existing or explicit categories',()=>{
 const p=power(),config=creationConfig(p),input=rows()[0];assert.equal(resolveArchiveCategory(input,config).recordId,'areas');
 for(const raw of [{...input,recordId:'stock'},{...input,details:{location:'位置'}},{...input,details:{unrecognized:'未知'}},{...input,details:{source_profile:'伪造'}}])assert.equal(resolveArchiveCategory(raw,config),raw);
 assert.equal(resolveArchiveCategory(input,config,{specific:{recordId:'stock'}}),input);
 const def=config.records.find(r=>r.id==='lines');const prepared=prepareArchiveFields({...rows()[1],details:{goal:'粮食',unrecognized:'未知',source_profile:'伪造',world_id:'fake'}},ARCHIVE_FIELDS,def,config);assert(prepared.held.some(h=>h.key==='unrecognized'));assert(prepared.held.some(h=>h.key==='world_id'));assert.equal(prepared.raw.details.source_profile,'伪造');
 const long=prepareArchiveFields({...rows()[1],fields:{condition:'甲'.repeat(3999)},details:{goal:'粮食',environment:'乙'.repeat(100)}},ARCHIVE_FIELDS,def,config);assert(long.held.length);
});
test('repair schema separates each index, generic type and dedicated fields',()=>{
 const p=power(),pending={data:{changes:rows()},issues:rows().map((_,index)=>({kind:'成果',index})),sources:[]},prompt=archiveRepairPrompt(pending,p),payload=JSON.parse(prompt.user),variants=prompt.archiveSchema.properties.repairs.items.anyOf;
 assert.equal(payload.failed[0].repairContract.recordId,'areas');assert.equal(payload.failed[1].repairContract.recordId,'lines');assert.equal(payload.failed[2].repairContract.recordId,'stock');
 const area=variants.find(v=>v.properties.index.const===0),line=variants.find(v=>v.properties.index.const===1);assert.equal(area.properties.recordId.const,'areas');assert(area.required.includes('recordId'));assert(!area.properties.fields.properties.description);assert(!line.properties.details.properties.environment);assert(!line.properties.details.properties.time_flow);assert(line.properties.details.properties.operation);
});
test('old pending preview can be repaired locally with no model call and saves only after confirmation',async()=>{
 const f=fixture(),p=power();p.id=f.power.id;await f.store.transact(s=>{s.powers[p.id]=p;});f.app.refresh();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};let calls=0;
 f.app.model.request=async()=>{calls++;return JSON.stringify({changes:rows()});};await f.app.reviewArchives({supplement:true,values:{playerNote:'玩家确认这些生产区、产线与库存已经建立'}});const pending=f.app.pendingArchiveReview;
 pending.changes=[];pending.issues=rows().map((r,index)=>({kind:'成果',index,name:r.name,reason:'旧版字段校验未通过'}));pending.readOnly=true;
 f.app.model.request=async()=>{throw Error('本地修复不应调用模型');};await f.app.repairArchiveWithAI();assert.equal(calls,1);assert.equal(pending.issues.length,0);assert.equal(pending.changes.length,3);assert.equal(Object.keys(f.store.read().powers[p.id].archives).length,0);
 await f.app.commitArchiveReview(pending,new Map(pending.changes.map((_,i)=>[i,null])));const saved=Object.values(f.store.read().powers[p.id].archives);assert.equal(saved.length,3);assert.equal(saved.find(r=>r.name==='综合产出库存').specific.recordId,'stock');
});
