import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,clone,stable,emptyState,validateState} from '../src/core.js';
import {RECORD_FRAMEWORKS,supportsRecordFrameworks,recommendedFrameworks,frameworkCategory,nativeFramework,setRecordFrameworks,validateRecordFrameworks,withFrameworkRecords} from '../src/record-frameworks.js';
import {FRAMEWORK_CATEGORIES} from '../src/record-framework-categories.js';
import {ARCHIVE_TABLE_DEFINITIONS} from '../src/archive-table-definitions.js';
import {archiveTables,tableTarget,assertTableBatchIdentity} from '../src/archive-tables.js';
import {creationConfig} from '../src/creation-config.js';
import {archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {frameworkChoicesHTML} from '../src/record-framework-ui.js';
import {recordFrameworkMethods} from '../src/record-framework-controller.js';
import {MMLC_ENTRY} from '../src/mmlc.js';
const entries=builtinEntries(),power=name=>createPower(entries.find(e=>e.name===name));
const raw=(recordId,name,details,extra={})=>({type:'record',recordId,name,details,status:'active',fields:{description:'真实且重要的长期事实'},sourceIndex:-1,...extra});
function save(p,rows){const b=normalizeArchiveBatch({changes:rows},p,[],[],'玩家核对实际成立事实');assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((r,i)=>[i,r.id])),[]);}

test('seven templates cover all 114 general built-in powers by exact source; recommendations never select or write state',()=>{
 assert.equal(RECORD_FRAMEWORKS.length,7);assert.equal(Object.keys(FRAMEWORK_CATEGORIES).length,114);
 assert.equal(entries.filter(e=>!e.auxiliary).length,114);
 for(const e of entries.filter(e=>!e.auxiliary)){const p=createPower(e),before=stable(p);assert(supportsRecordFrameworks(p));assert(frameworkCategory(p));assert(recommendedFrameworks(p).length);assert.equal(stable(p),before);assert.equal(p.recordFrameworks,undefined);assert.equal(frameworkCategory({...p,primaryRules:p.primaryRules+'改'}),null);}
 for(const d of ARCHIVE_TABLE_DEFINITIONS)for(const t of d.tables)assert(RECORD_FRAMEWORKS.some(f=>f.id===nativeFramework(d,t.id)),d.name+'/'+t.id);
});

for(const e of entries.filter(e=>!e.auxiliary))test(`${e.name}: player can independently select any template, reuse native fields, save stable records and preserve resources`,()=>{
 for(const framework of RECORD_FRAMEWORKS){const p=createPower(e),before=stable({rules:p.rules,resources:p.resources,assets:p.assets});setRecordFrameworks(p,[framework.id]);
  const spec=archiveTables(p);assert(spec.tables.length);assert(spec.tables.every(t=>t.frameworkId===framework.id));assert.equal(new Set(creationConfig(p).records.map(r=>r.id)).size,creationConfig(p).records.length);
  for(const t of spec.tables){const field=t.fields.find(f=>!t.identityFields?.includes(f.id)).id,details={[field]:'正文确认可后续调用的重要事实',...Object.fromEntries((t.identityFields||[]).map(id=>[id,'明确对象版本甲']))};
   save(p,[raw(t.id,'重要对象·'+t.id,details,{operation:'insert'})]);const row=Object.values(p.archives).find(r=>r.specific.recordId===t.id),snapshot=clone(row);save(p,[raw(t.id,row.name,details,{archiveId:row.id,operation:'update'})]);assert.deepEqual(p.archives[row.id],snapshot);
  }
  assert.equal(stable({rules:p.rules,resources:p.resources,assets:p.assets}),before);
 }
});

test('custom sources receive the same optional templates without name-based built-in authority or added operations',()=>{
 const p=createPower({id:'custom',name:'源堡',content:'这是玩家自己编写的独立空间规则',book:'自定义',entryId:'1'});assert.equal(frameworkCategory(p),null);assert.deepEqual(recommendedFrameworks(p),[]);assert.equal(creationConfig(p),null);
 setRecordFrameworks(p,['regions']);assert.equal(creationConfig(p).operations.length,0);assert.deepEqual(archiveTables(p).tables.map(t=>t.id),['framework_regions']);
 save(p,[raw('framework_regions','小田',{kind:'真实田地',purpose:'已成立的种植用途'},{operation:'insert'})]);
 const state=emptyState();state.powers[p.id]=p;assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))).powers[p.id].recordFrameworks,p.recordFrameworks);
});

test('dedicated worlds and journey do not receive generic templates; invalid settings fail rather than changing scope',()=>{
 const taishi=createPower(builtinEntries({includeDedicated:true}).find(e=>e.name.startsWith('太始天（完整版'))),journey=createPower(MMLC_ENTRY);
 for(const p of [taishi,journey]){assert(!supportsRecordFrameworks(p));assert.throws(()=>setRecordFrameworks(p,['regions']),/专用结构/);assert(!creationConfig(p).records.some(r=>r.id.startsWith('framework_')));}
 for(const value of [null,{version:2,enabled:[]},{version:1,enabled:['evil']},{version:1,enabled:['regions','regions']},{version:1,enabled:[],extra:true}])assert.throws(()=>validateRecordFrameworks(value));
 const state=emptyState(),p=power('源堡');state.powers[p.id]=p;p.recordFrameworks={version:1,enabled:['unknown']};assert.throws(()=>validateState(state),/框架/);
});

test('closed rows are identity-only in AI input, remain readable and reject explicit and operation-less updates',()=>{
 const p=power('源堡');setRecordFrameworks(p,['regions']);save(p,[raw('framework_regions','旧灵田',{purpose:'重要已成内容'.repeat(50)},{operation:'insert'})]);const row=Object.values(p.archives)[0],before=clone(p.archives);
 setRecordFrameworks(p,[]);const request=JSON.parse(archivePrompt(p,[],[]).user),item=request.current.find(r=>r.archiveId===row.id);assert(item.frameworkDisabled);assert(item.identityOnly);assert(!item.fields);assert(!item.details);assert.equal(item.recordId,'framework_regions');
 for(const operation of [undefined,'update','insert'])assert.throws(()=>tableTarget(p,raw(row.specific.recordId,row.name,{purpose:'非法变化'},{operation,archiveId:row.id})),/未启用/);
 assert.deepEqual(p.archives,before);setRecordFrameworks(p,['regions']);assert.equal(archiveTables(p).tables[0].id,'framework_regions');assert.deepEqual(p.archives,before);
});

test('native and generic copy attempts in the same framework cannot bypass stable identity',()=>{
 const p=power('万界网购');setRecordFrameworks(p,['assets']);save(p,[raw('orders','明确订单甲',{item:'真实订单的商品'},{operation:'insert'})]);
 assert.throws(()=>tableTarget(p,raw('assets','明确订单甲',{item:'重复副本'},{operation:'insert'})),/原分类登记/);
 assert.throws(()=>assertTableBatchIdentity(p,raw('assets','同一对象',{},{operation:'insert'}),[raw('orders','同一对象',{},{operation:'insert'})]),/同一框架/);
});

test('source castle legacy assets resume updates in their selected framework instead of being copied to a generic table',()=>{
 const p=power('源堡');save(p,[raw('assets','旧王冠',{identity:'真实独立王冠',state:'封存在源堡'})]);const row=Object.values(p.archives)[0];setRecordFrameworks(p,['assets']);const request=JSON.parse(archivePrompt(p,[],[]).user);assert(request.recordSchemas.find(r=>r.id==='assets').updateOnly);
 save(p,[raw('assets',row.name,{state:'已实际交还原持有人'},{archiveId:row.id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[row.id].specific.fields.identity,'真实独立王冠');assert.throws(()=>tableTarget(p,raw('framework_assets',row.name,{nature:'副本'},{operation:'insert'})),/原分类登记/);
});

test('choice markup escapes source names and supports all-off without forced recommendations',()=>{
 const p=power('源堡');setRecordFrameworks(p,[]);const html=frameworkChoicesHTML({...p,name:'<img onerror=alert(1)>'});assert.equal((html.match(/type="checkbox"/g)||[]).length,7);assert(!html.includes(' checked'));assert(!html.includes('<img'));assert(html.includes('原状态栏'));assert(html.includes('正文记忆'));
});

test('reserved generic IDs never override custom adapter fields and an invalid existing binding cannot gain a fallback',()=>{
 const p=power('源堡');setRecordFrameworks(p,['regions']);assert.throws(()=>withFrameworkRecords({id:'custom.test',records:[{id:'framework_regions',fields:[]}]},p),/保留分类名/);
 assert.equal(withFrameworkRecords(null,{...p,adapterBinding:{}}),null);
 const custom={...power('源堡'),adapterBinding:{config:{records:[{id:'framework_regions',fields:[]}]}}};assert.throws(()=>setRecordFrameworks(custom,['regions']),/保留分类名/);assert.equal(custom.recordFrameworks,undefined);
});

test('choices are independent for each power and survive export and restore without changing archive data or rule text',()=>{
 const p=power('源堡'),q=power('绝对命中'),state=emptyState();state.powers[p.id]=p;state.powers[q.id]=q;setRecordFrameworks(p,['regions']);setRecordFrameworks(q,[]);const old=stable(q);
 setRecordFrameworks(p,['knowledge','members']);assert.equal(stable(q),old);const restored=validateState(JSON.parse(JSON.stringify(state)));assert.deepEqual(restored.powers[p.id].recordFrameworks.enabled,['members','knowledge']);assert.deepEqual(restored.powers[q.id].recordFrameworks.enabled,[]);assert.equal(restored.powers[p.id].rules,p.rules);
});

test('output schema agrees with player selection and only permits explicit updates of matching old generic rows',()=>{
 const p=power('源堡');save(p,[{type:'member',name:'旧负责人',status:'active',fields:{role:'原有职责'},sourceIndex:-1}]);const row=Object.values(p.archives)[0];setRecordFrameworks(p,['members']);let prompt=archivePrompt(p,[],[]),variants=prompt.archiveSchema.properties.changes.items.anyOf;
 const generic=variants.filter(v=>!v.properties.recordId);assert.equal(generic.length,1);assert.equal(generic[0].properties.type.const,'member');assert(generic[0].required.includes('archiveId'));assert.deepEqual(generic[0].properties.archiveId.enum,[row.id]);
 setRecordFrameworks(p,[]);prompt=archivePrompt(p,[],[]);assert(prompt.archiveSchema.properties.changes.items.anyOf.every(v=>v.properties.recordId));assert(JSON.parse(prompt.user).current.find(r=>r.archiveId===row.id).frameworkDisabled);
 const custom=createPower({id:'custom_empty',name:'无主表规则',content:'独立自定义能力正文',entryId:'1'});setRecordFrameworks(custom,[]);assert.equal(archivePrompt(custom,[],[]).archiveSchema.properties.changes.maxItems,0);
});

test('asset frameworks cannot create a second currency record or mutate the resource ledger',()=>{
 const p=power('升变之印'),currency=Object.values(p.resources)[0];assert(currency);currency.balance='100';setRecordFrameworks(p,['assets']);const t=archiveTables(p).tables[0],before=stable(p.resources);
 const batch=normalizeArchiveBatch({changes:[raw(t.id,currency.name,{[t.fields[0].id]:'100'},{operation:'insert'})]},p,[],[],'玩家说明');assert.equal(batch.changes.length,0);assert(batch.issues.some(i=>i.reason.includes('唯一账本')));assert.equal(stable(p.resources),before);
});

function controller(){
 const p=power('源堡'),state=emptyState();state.powers[p.id]=p;
 const app={...recordFrameworkMethods,powerId:p.id,ui:{showRecordFrameworks(){},closeDialog(){}},refresh(){},notice(){},ensureStable(){return {state,chatKey:'chat-a'};},store:{async transact(fn,{captured}){assert.equal(captured.revision,state.revision,'档案版本已变化');assert.equal(captured.chatKey,'chat-a','聊天已变化');const next=clone(state);fn(next);validateState(next);Object.assign(state,next);state.revision++;}}};return {app,state,p};
}
async function withForm(enabled,fn){const prior=globalThis.FormData;globalThis.FormData=class{getAll(){return enabled;}};try{return await fn({form:{elements:{'framework-selection':{value:'1'}}}});}finally{globalThis.FormData=prior;}}
test('settings save is chat/power scoped, blocks pending jobs and rejects stale revisions without deleting archives',async()=>{
 const {app,state,p}=controller();app.openRecordFrameworks();await withForm(['regions'],d=>app.saveRecordFrameworks(d));assert.deepEqual(state.powers[p.id].recordFrameworks.enabled,['regions']);
 app.pendingArchiveReview={};assert.throws(()=>app.openRecordFrameworks(),/当前整理候选/);app.pendingArchiveReview=null;app.openRecordFrameworks();state.revision++;
 await withForm(['members'],d=>assert.rejects(app.saveRecordFrameworks(d),/档案版本已变化/));assert.deepEqual(state.powers[p.id].recordFrameworks.enabled,['regions']);assert.equal(app.committing,false);
 app.openRecordFrameworks();app.powerId='other';await withForm([],d=>assert.rejects(app.saveRecordFrameworks(d),/词条已切换/));assert.deepEqual(state.powers[p.id].recordFrameworks.enabled,['regions']);
});
