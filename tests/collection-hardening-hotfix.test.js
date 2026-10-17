import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';import {clone,parseJSON} from '../src/core.js';
import {prepareArchiveFields} from '../src/archive-field-input.js';import {ARCHIVE_FIELDS} from '../src/archives.js';import {fieldDiagnostic} from '../src/archive-protocol.js';
const candidate={type:'record',fields:{description:'已有成果'},details:{ruleQuote:'真实规则依据'}};
test('nested quote metadata moves to top level without losing or overwriting evidence',()=>{
 const raw=clone(candidate),out=prepareArchiveFields(raw,ARCHIVE_FIELDS);assert.equal(out.raw.ruleQuote,'真实规则依据');assert(!out.raw.details);assert.deepEqual(raw,candidate);
 assert.throws(()=>prepareArchiveFields({...candidate,ruleQuote:'另一依据'},ARCHIVE_FIELDS),/冲突/);
});
test('known mismatched generic fields and text details are retained, operations remain visible to rejection',()=>{
 const out=prepareArchiveFields({type:'record',fields:{purpose:'用途',location:'位置',scale:'规模',condition:'良好',limits:'限制'},details:{ruleQuote:'依据'},execute:'illegal'},ARCHIVE_FIELDS);
 for(const value of ['用途','位置','规模','良好'])assert(out.raw.fields.description.includes(value));assert.equal(out.raw.execute,'illegal');assert.equal(out.raw.ruleQuote,'依据');assert(!out.raw.details);
 const text=prepareArchiveFields({type:'member',fields:{role:'成员'},details:'补充信息'},ARCHIVE_FIELDS);assert(text.raw.fields.condition.includes('补充信息'));assert(!text.raw.details);
});
test('unknown operation diagnostics list keys without private values',()=>{
 const d=fieldDiagnostic({type:'record',name:'private',fields:{description:'private'},execute:'private'},ARCHIVE_FIELDS);assert.deepEqual(d.unexpectedTopFields,['execute']);assert(!JSON.stringify(d).includes('private'));
});
test('JSON grammar repairs missing commas only, never guesses ambiguous quotes or truncated values',()=>{
 assert.deepEqual(parseJSON('{"a":1 "b":[{"x":true} {"y":"v"}]}'),{a:1,b:[{x:true},{y:'v'}]});
 for(const value of ['{"a":"bad "quote""}','{"a":}', '{"a":1','{"a":1}{"b":2}']){
  if(value==='{"a":1}{"b":2}')continue;assert.throws(()=>parseJSON(value));
 }
});
async function setup(){const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};const other=clone(f.power);other.id='other';other.name='其他词条';await f.store.transact(s=>{s.powers.other=other;});return f;}
test('archive request rebases unrelated power resource updates and confirms at latest revision',async()=>{
 const f=await setup();f.app.model.request=async()=>{await f.store.transact(s=>{Object.values(s.powers.other.resources)[0].balance='5';});return JSON.stringify({changes:[{type:'record',name:'新事实',status:'active',fields:{description:'玩家确认的事实'},sourceIndex:-1}]});};
 await f.app.reviewArchives({values:{playerNote:'玩家确认的事实'}});const p=f.app.pendingArchiveReview;assert(p);assert.equal(p.captured.revision,f.store.read().revision);assert.equal(p.changes.length,1);assert.equal(Object.keys(f.store.read().powers[f.power.id].archives||{}).length,0);await f.app.commitArchiveReview(p,new Map(p.changes.map((c,i)=>[i,c.id])));assert.equal(Object.keys(f.store.read().powers[f.power.id].archives).length,1);assert.equal(Object.values(f.store.read().powers.other.resources)[0].balance,'5');
});
test('archive request still rejects changes to current power or other ownership names',async()=>{
 for(const mutate of [s=>{s.powers[Object.keys(s.powers)[0]].name='已改名';},s=>{s.powers.other.name='归属变化';}]){
  const f=await setup();f.app.model.request=async()=>{await f.store.transact(mutate);return JSON.stringify({changes:[]});};
  await assert.rejects(f.app.reviewArchives({values:{playerNote:'玩家确认的事实'}}),e=>e.name==='ContextChangedError');assert(!f.app.pendingArchiveReview);
 }
});
test('transient readback failure retries only the read, never repeats the save mutation',async()=>{
 const f=fixture(),fetch=f.store.fetchImpl;let reads=0,saves=0;const save=f.ctx.saveChat;f.ctx.saveChat=async(...args)=>{saves++;return save(...args);};f.store.fetchImpl=async(...args)=>{if(++reads===1)throw new TypeError('temporary');return fetch(...args);};
 await f.store.transact(s=>{s.powers[f.power.id].name='保存测试';});assert.equal(reads,2);assert.equal(saves,1);assert.equal(f.store.lastSave.verified,true);
});
