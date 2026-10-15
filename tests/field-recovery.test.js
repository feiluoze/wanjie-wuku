import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {prepareArchiveFields,unwrapArchiveInput} from '../src/archive-field-input.js';
import {ARCHIVE_FIELDS} from '../src/archives.js';
import {fieldDiagnostic} from '../src/archive-protocol.js';
import {normalizeArchiveBatch} from '../src/archive-review.js';
import {decodeCheckpoint} from '../src/review-checkpoint.js';
const definition={id:'example',fields:[{id:'overview',label:'概况'},{id:'progress',label:'进度'}]};
test('persisted-specific envelope is unwrapped without guessing identities or accepting extra keys',()=>{
 const raw={type:'record',details:{recordId:'example',adapterId:'a',version:'1',fields:{overview:'已确认'}}};
 assert.deepEqual(unwrapArchiveInput(raw).details,{overview:'已确认'});
 assert.equal(unwrapArchiveInput(raw).recordId,'example');
 assert.equal(unwrapArchiveInput({...raw,recordId:'different'}).details.recordId,'example');
 assert.equal(unwrapArchiveInput({...raw,details:{...raw.details,permission:true}}).details.permission,true);
});
test('declared fields route by namespace and simple values preserve exact meaning',()=>{
 const p=prepareArchiveFields({type:'record',fields:{概况:'已确认'},details:{progress:1.5,description:['甲','乙']}},ARCHIVE_FIELDS,definition);
 assert.deepEqual(p.raw.details,{overview:'已确认',progress:'1.5'});assert.equal(p.raw.fields.description,'甲\n乙');assert.equal(p.held.length,0);
});
test('unknown and complex values stay quarantined, never become permissions or guessed fields',()=>{
 const p=prepareArchiveFields({type:'record',fields:{description:'有效资料'},details:{overview:'已确认',custom:{secret:'不应丢弃'},progress:{value:2}}},ARCHIVE_FIELDS,definition);
 assert.equal(p.raw.details.overview,'已确认');assert.equal(p.raw.details.custom,undefined);assert.equal(p.held.length,2);assert.deepEqual(p.held[0].value,{secret:'不应丢弃'});
 assert.throws(()=>prepareArchiveFields({type:'record',fields:{description:'甲',[ARCHIVE_FIELDS.record.description]:'乙'}},ARCHIVE_FIELDS,definition));
});
test('program-only fields remain on the original validator path',()=>{
 const p=prepareArchiveFields({type:'record',details:{source_profile:'伪造',time_state:{clock:9}}},ARCHIVE_FIELDS,definition);
 assert.equal(p.raw.details.source_profile,'伪造');assert.deepEqual(p.raw.details.time_state,{clock:9});
});
test('valid generic fields survive partial rejection, retain original candidate and block floor advancement',()=>{
 const f=fixture(),raw={type:'record',name:'测试成果',status:'active',fields:{description:'已确认',custom_blob:{n:2}},sourceIndex:-1};
 const batch=normalizeArchiveBatch({changes:[raw]},f.power,[],f.ctx.chat,'玩家确认资料',f.state);
 assert.equal(batch.changes.length,1);assert.equal(batch.changes[0].patch.description,'已确认');assert.equal(batch.issues.length,1);assert.equal(batch.issues[0].repairable,true);assert.deepEqual(batch.issues[0].candidate,raw);
});
test('diagnostics expose safe key names and value types without dumping field values',()=>{
 const d=fieldDiagnostic({type:'record',fields:{custom_blob:{private:'private-value'},description:9}},ARCHIVE_FIELDS);
 assert.deepEqual(d.sections.fields.unknownFields,[{key:'custom_blob',type:'object'}]);assert(!JSON.stringify(d).includes('private-value'));
});
test('all rejected response survives refresh; local repair makes a candidate without paid calls',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};let calls=0;
 f.app.model.request=async()=>{calls++;return JSON.stringify({changes:[{type:'record',name:'待核对成果',status:'active',fields:{unknown_field:{text:'真实资料'}},sourceIndex:-1}]});};
 await f.app.reviewArchives({values:{playerNote:'玩家确认真实资料'}});
 const pending=f.app.pendingArchiveReview;assert(pending?.readOnly);assert.equal(pending.changes.length,0);assert(pending.checkpointSaved);
 const snapshot=f.app.contextSnapshot(),key='wanjie-wuku:review-checkpoint:'+snapshot.chatKey;
 const restored=decodeCheckpoint(f.storage.getItem(key),snapshot);assert(restored?.issues[0].candidate);assert(f.storage.getItem(key+':failed'));
 const fixed={...restored.issues[0].candidate,fields:{description:'真实资料'}};
 await f.app.repairArchiveCandidate({index:0,values:{'repair-candidate:0':JSON.stringify(fixed)}});
 assert.equal(calls,1);assert.equal(pending.changes.length,1);assert.equal(pending.issues.length,0);assert.equal(pending.readOnly,false);
});
test('local repair cannot change identity or bypass captured evidence',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};f.app.model.request=async()=>JSON.stringify({changes:[{type:'record',name:'待核对成果',status:'active',fields:{unknown:1},sourceIndex:-1}]});
 await f.app.reviewArchives({values:{playerNote:'玩家确认资料'}});const c=f.app.pendingArchiveReview.issues[0].candidate;
 await assert.rejects(f.app.repairArchiveCandidate({index:0,values:{'repair-candidate:0':JSON.stringify({...c,name:'另一个对象',fields:{description:'真实资料'}})}}),/身份或来源/);
});
