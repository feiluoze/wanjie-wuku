import test from 'node:test';import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';import {createPower,emptyState} from '../src/core.js';import {builtinResources,archiveResource,projectResourceStatus,assertStatusbarResourceFields} from '../src/builtin-resources.js';import {creationConfig} from '../src/creation-config.js';import {normalizeArchiveBatch,archivePrompt} from '../src/archive-review.js';import {saveArchive,archiveSource} from '../src/archives.js';import {memoryPlan} from '../src/archive-memory.js';
import {specializedGroups,statisticsDashboard} from '../src/specialized-records.js';
const powers=builtinEntries().map(e=>createPower(e)).filter(p=>builtinResources(p)?.resources.some(d=>d.legacyBindings?.length));
test('five legacy balance columns are read-only in schema, canonical candidates and exact UI-label candidates',()=>{
 assert.equal(powers.length,5);
 for(const p of powers){const resource=builtinResources(p).resources.find(d=>d.legacyBindings?.length),b=resource.legacyBindings[0],def=creationConfig(p).records.find(r=>r.id===b.recordId);assert(def,p.name);assert(def.fields.length);assert(!def.fields.some(f=>f.id===b.fieldId));assert(archiveResource(p,b.recordId,b.fieldId));
  for(const [recordId,field]of [[b.recordId,b.fieldId],[b.recordLabel,b.fieldLabel]]){const raw={type:'record',name:b.recordLabel,status:'active',recordId,details:{[field]:'999'},fields:{description:'当前状态'},sourceIndex:-1};assert.throws(()=>assertStatusbarResourceFields(p,raw),/第二份数值/);const batch=normalizeArchiveBatch({changes:[raw]},p,[],[],'玩家确认余额999');assert.equal(batch.changes.length,0,p.name);assert(batch.issues.length);}
  assert.equal(Object.values(p.resources)[0].balance,null);
 }
});
test('legacy balances display and inject the ledger value while their historical evidence stays intact',()=>{
 for(const p of powers){const d=builtinResources(p).resources.find(d=>d.legacyBindings?.length),b=d.legacyBindings[0],def=creationConfig(p).records.find(r=>r.id===b.recordId),other=def.fields[0];Object.values(p.resources)[0].balance='170';
  const r=saveArchive(p,{type:'record',name:b.recordLabel,status:'active',fields:{description:'已有收支依据'},specific:{adapterId:creationConfig(p).id,version:'1.0.0',recordId:b.recordId,label:b.recordLabel,labels:{[b.fieldId]:b.fieldLabel,[other.id]:other.label},fields:{[b.fieldId]:'999',[other.id]:'已确认的收支依据'}}},archiveSource([],'旧记录原样保留'));
  const projected=projectResourceStatus(p,r);assert.equal(projected.specific.fields[b.fieldId],'170');assert.equal(projected.specific.fields[other.id],'已确认的收支依据');assert.equal(r.specific.fields[b.fieldId],'999');assert.throws(()=>assertStatusbarResourceFields(p,{archiveId:r.id,details:{[b.fieldId]:'999'}}));
  assert.equal(specializedGroups(p,[]).flatMap(g=>g.records).find(x=>x.id===r.id).specific.fields[b.fieldId],'170');const dashboard=statisticsDashboard(p,[]);if(dashboard)assert(dashboard.sections.flatMap(s=>s.records).filter(x=>x.id===r.id).every(x=>x.specific.fields[b.fieldId]==='170'));
  const s=emptyState();s.powers[p.id]=p;const packet=memoryPlan(s,[],'',{auto:false,budget:4000,selections:{[p.id+'/'+r.id]:{mode:'pinned'}}}).packet;assert(packet.includes('170'));assert(!packet.includes('999'));assert(!JSON.stringify(JSON.parse(archivePrompt(p,[],[],'').user).current).includes('999'));
  const batch=normalizeArchiveBatch({changes:[{archiveId:r.id,type:'record',name:r.name,status:'active',recordId:b.recordId,fields:{description:'已有收支依据'},details:{[other.id]:'新的已确认依据'},sourceIndex:-1}]},p,[],[],'玩家确认新的收支依据');assert.deepEqual(batch.issues,[],p.name);assert.equal(batch.changes.length,1);assert.equal(Object.values(p.resources)[0].balance,'170');
 }
});
