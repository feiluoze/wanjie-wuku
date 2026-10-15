import test from 'node:test';
import assert from 'node:assert/strict';
import {inferSettingRefs} from '../src/setting-references.js';
import {preparePersonSources,attachPersonSources} from '../src/taishi-profile.js';
import {fixture} from './mvu-fixture.js';
import {normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {creationConfig} from '../src/creation-config.js';
const packet={payload:{books:[{name:'合并书',entries:[{id:'g1',title:'【地域】大陆·地域与城镇',part:2,offset:3000,content:'续文\n## 七冠诸国\n\n【地域】七冠诸国\n现有王国。\n\n## 林海\n\n【地域】林海\n森林。'},{id:'g1',title:'【地域】大陆·地域与城镇',part:3,offset:6000,content:'森林资料续文。'}]}]}};
test('merged typed internal headings resolve exact objects, including current continuation parts',()=>{
 const refs=inferSettingRefs({name:'七冠诸国',recordId:'region'},packet);assert.equal(refs.length,2);assert.equal(refs[0].id,'g1');
 const prepared=preparePersonSources({changes:[{name:'林海',recordId:'region'}]},packet),batch={changes:[{name:'林海',inputIndex:0,specific:{recordId:'region',fields:{},labels:{}}}],issues:[]};attachPersonSources(batch,prepared);
 const originals=JSON.parse(batch.changes[0].specific.fields.source_profile);assert.equal(originals.length,2);assert.equal(originals[1].content,'森林资料续文。');
});
test('mentions, wrong types and headings outside this exact batch cannot supply ownership',()=>{
 const refs={payload:{books:[{name:'合并书',entries:[{id:'1',content:'## 邻城\n路过七冠诸国。\n【人物】林海\n名字相同的人。',title:'地域合并',part:2}]}]}};
 assert.deepEqual(inferSettingRefs({name:'七冠诸国',recordId:'region'},refs),[]);assert.deepEqual(inferSettingRefs({name:'林海',recordId:'region'},refs),[]);
 assert.throws(()=>inferSettingRefs({name:'林海',recordId:'region'},{payload:{books:[...packet.payload.books,{name:'另书',entries:[{id:'2',title:'合并条目',content:'【地域】林海\n另一个同名地区'}]}]}}),/多个同名/);
});
async function setup(){const f=fixture();await f.app.openTaishi();f.power=f.store.read().powers[f.app.powerId];return f;}
function organization(f,name){const d=creationConfig(f.power).records.find(r=>r.id==='organization');return {type:'record',name,status:'active',recordId:'organization',fields:{description:'已建立的组织'},details:{[d.fields.find(x=>!x.id.endsWith('_id')&&x.id!=='world').id]:'已有依据的组织资料'},sourceIndex:-1};}
const person=ref=>({type:'member',name:'测试人物',status:'active',recordId:'companion',fields:{role:'组织成员'},details:{profile:'有明确设定的人物',organization_id:ref},sourceIndex:-1});
test('person can refer to one valid organization in same batch; save orders target first and writes its real ID',async()=>{
 const f=await setup(),data={changes:[person('星塔学院'),organization(f,'星塔学院')]},batch=normalizeArchiveBatch(data,f.power,[],f.ctx.chat,'玩家确认这些已有设定',f.state);
 assert.equal(batch.issues.length,0);assert.equal(batch.changes.length,2);assert.equal(batch.changes[0].pendingLinks[0].targetInputIndex,1);assert.equal(batch.changes[0].specific.fields.organization_id,undefined);
 const saved=applyArchiveChanges(f.power,batch.changes,[],new Map([[0,null],[1,null]]),f.ctx.chat);const org=saved.find(r=>r.specific.recordId==='organization'),p=saved.find(r=>r.specific.recordId==='companion');assert.equal(p.specific.fields.organization_id,org.id);assert(!JSON.stringify(p).includes('targetInputIndex'));
});
test('deselecting required organization stops before any write',async()=>{
 const f=await setup(),batch=normalizeArchiveBatch({changes:[person('星塔学院'),organization(f,'星塔学院')]},f.power,[],f.ctx.chat,'玩家确认已有设定',f.state),before=JSON.stringify(f.power);
 assert.throws(()=>applyArchiveChanges(f.power,batch.changes,[],new Map([[0,null]]),f.ctx.chat),/同时接受关联组织/);assert.equal(JSON.stringify(f.power),before);
});
test('invalid or fabricated organizations cannot be promoted; valid person content survives with pending issue',async()=>{
 const f=await setup(),batch=normalizeArchiveBatch({changes:[person('fabricated_organization_id')]},f.power,[],f.ctx.chat,'玩家确认人物已有设定',f.state);
 assert.equal(batch.changes.length,1);assert.equal(batch.issues.length,1);assert.equal(batch.changes[0].specific.fields.organization_id,undefined);assert.equal(batch.issues[0].candidate.details.organization_id,'fabricated_organization_id');
});
test('conflicting same-person organization links stay conflicts instead of choosing one',async()=>{
 const f=await setup(),batch=normalizeArchiveBatch({changes:[person('星塔学院'),person('林地议会'),organization(f,'星塔学院'),organization(f,'林地议会')]},f.power,[],f.ctx.chat,'玩家确认已有设定',f.state);
 assert(!batch.changes.some(c=>c.name==='测试人物'));assert(batch.issues.length>=2);
});
test('cyclic organization dependencies stop before any write',async()=>{
 const f=await setup(),a=organization(f,'甲议会'),b=organization(f,'乙议会');a.details.organization_id=b.name;b.details.organization_id=a.name;
 const batch=normalizeArchiveBatch({changes:[a,b]},f.power,[],f.ctx.chat,'玩家确认已有设定',f.state),before=JSON.stringify(f.power);
 assert.equal(batch.issues.length,0);assert.throws(()=>applyArchiveChanges(f.power,batch.changes,[],new Map([[0,null],[1,null]]),f.ctx.chat),/形成循环/);assert.equal(JSON.stringify(f.power),before);
});
test('a rejected target does not invalidate valid person fields or leave a phantom dependency',async()=>{
 const f=await setup(),target={...organization(f,'星塔学院'),status:'invalid'},batch=normalizeArchiveBatch({changes:[person('星塔学院'),target]},f.power,[],f.ctx.chat,'玩家确认已有设定',f.state);
 assert.equal(batch.changes.length,1);assert.equal(batch.changes[0].pendingLinks,undefined);assert(batch.issues.some(i=>/关联组织未通过/.test(i.reason)));
});

test('cross-segment organization dependency keeps global index and saves actual ID atomically',async()=>{
 const f=await setup(),filler=Array.from({length:128},(_,i)=>({type:'record',name:'普通档案'+i,status:'active',fields:{description:'已确认资料'},sourceIndex:-1}));
 const batch=normalizeArchiveBatch({changes:[person('跨段学院'),...filler,organization(f,'跨段学院')]},f.power,[],f.ctx.chat,'玩家确认已有设定',f.state);
 assert.equal(batch.changes.length,130);assert.equal(batch.changes[0].pendingLinks[0].targetInputIndex,129);
 const before=JSON.stringify(f.power);assert.throws(()=>applyArchiveChanges(f.power,batch.changes,[],new Map([[0,null]]),f.ctx.chat),/同时接受关联组织/);assert.equal(JSON.stringify(f.power),before);
 const saved=applyArchiveChanges(f.power,batch.changes,[],new Map(batch.changes.map((c,i)=>[i,null])),f.ctx.chat);assert.equal(saved.find(r=>r.name==='测试人物').specific.fields.organization_id,saved.find(r=>r.name==='跨段学院').id);
});
