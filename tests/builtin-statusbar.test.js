import test from 'node:test';import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';import {builtinStatusbar,statusbarTarget} from '../src/builtin-statusbar.js';import {creationConfig} from '../src/creation-config.js';import {createPower,clone,validateState,emptyState} from '../src/core.js';import {normalizeArchiveBatch,applyArchiveChanges,archivePrompt} from '../src/archive-review.js';import {currentOverview} from '../src/current-overview.js';import {WorkbenchUI} from '../src/ui.js';
const entries=builtinEntries({includeDedicated:true});
test('every current builtin is reviewed; declared headings and fields have verbatim current sources',()=>{
 let count=0,groups=0;for(const e of entries){const p=createPower(e),s=builtinStatusbar(p);if(!s)continue;count++;for(const g of s.groups){groups++;assert(g.sourceKind==='list'?s.block.includes('- '+g.fields[0].label+'：'):e.content.includes('【'+g.title+'】'));assert(g.fields.length>0&&g.fields.length<=16);assert.equal(new Set(g.fields.map(f=>f.id)).size,g.fields.length);for(const f of g.fields){const source=f.sourceField?g.fields.find(x=>x.id===f.sourceField):f;assert(source);assert(e.content.includes(source.label+'：')||e.content.includes(source.label+':')||e.content.includes('【'+source.label+'】'));if(f.sourceField)assert(source.description.includes('上限'));}}p.primaryRules=e.content+'\ncustom changed';assert.equal(builtinStatusbar(p),null);}
 assert.equal(entries.length,131);assert.equal(count,118);assert.equal(groups,128);
 for(const name of ['代价减免','本我完满宝诰','万界武库通用选项栏','万界武库思维链（无状态栏和回执版）'])assert.equal(builtinStatusbar(createPower(entries.find(e=>e.name===name))),null);
});
test('status main table updates its singleton across name variants; repeat preserves history and old object archives',()=>{
 const p=createPower(entries.find(e=>e.name==='败家生财')),g=builtinStatusbar(p).groups[0],coin=g.fields.find(f=>f.label==='主要余额').id;
 const proposal=(value,name='随意名称')=>({changes:[{type:'record',name,status:'active',fields:{description:'不使用这段作第二份总览'},recordId:g.id,details:{[coin]:value},sourceIndex:-1}]});
 let b=normalizeArchiveBatch(proposal('170文'),p,[],[],'玩家确认铜钱170文');assert.equal(b.issues.length,0,JSON.stringify(b.issues));applyArchiveChanges(p,b.changes,[],new Map([[0,null]]),[]);let r=Object.values(p.archives)[0];const id=r.id;assert.equal(r.name,g.title);assert.equal(r.history.length,0);
 b=normalizeArchiveBatch(proposal('180文','另一种名称'),p,[],[],'玩家确认铜钱180文');assert.equal(b.changes[0].id,id);applyArchiveChanges(p,b.changes,[],new Map([[0,id]]),[]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[id].history.length,1);assert.equal(p.archives[id].specific.fields[coin],'180文');
 b=normalizeArchiveBatch(proposal('180文'),p,[],[],'玩家确认铜钱180文');applyArchiveChanges(p,b.changes,[],new Map([[0,id]]),[]);assert.equal(p.archives[id].history.length,1);assert.equal(currentOverview(p,[]).counts.active,0);
 const state=emptyState();state.powers[p.id]=p;validateState(clone(state));
 const other=clone(p.archives[id]);other.id='other';p.archives.other=other;assert.throws(()=>statusbarTarget(p,{recordId:g.id,type:'record'}),/多条主记录/);assert.equal(statusbarTarget(p,{recordId:g.id,type:'record',archiveId:'other'}).before.id,'other');
});
test('original policy is sent to model; current values display without placeholders or inference',()=>{
 const p=createPower(entries.find(e=>e.name==='天人骨血')),s=builtinStatusbar(p),g=s.groups[0],config=creationConfig(p);assert(config.records.some(r=>r.id===g.id));const prompt=archivePrompt(p,[],[],'玩家确认状态');const input=JSON.parse(prompt.user);assert.equal(input.originalStatusbar.source,s.block);assert(prompt.system.includes('wjwk_original_statusbar'));assert.equal(input.originalStatusbar.mode,'original-statusbar-first');
 const ui=Object.create(WorkbenchUI.prototype);let html=ui.originalStatusbarPanel(p);assert(html.includes('其余状态尚未核对'));assert(!html.includes('<dd>0</dd>'));assert(!html.includes('<dd>常态</dd>'));
 p.primaryRules+='changed';assert.equal(ui.originalStatusbarPanel(p),'');
});

test('raw template values are rejected instead of inventing current state',()=>{
 const p=createPower(entries.find(e=>e.name==='败家生财')),g=builtinStatusbar(p).groups[0],f=g.fields[0];
 const b=normalizeArchiveBatch({changes:[{type:'record',name:g.title,status:'active',fields:{description:'状态'},recordId:g.id,details:{[f.id]:f.description},sourceIndex:-1}]},p,[],[],'玩家未确认余额');assert(b.issues.length);assert.equal(b.changes.length,0);assert.equal(Object.keys(p.archives||{}).length,0);
});

test('original list sections and named detail blocks retain their distinct shapes',()=>{
 const sign=createPower(entries.find(e=>e.name==='签到'));assert(builtinStatusbar(sign).groups.some(g=>g.title==='最近签到'&&g.fields.length===1));
 const p=createPower(entries.find(e=>e.name==='力量构筑')),g=builtinStatusbar(p).groups.find(g=>g.cardinality==='per-object');assert(g?.keyField);
 for(const name of ['甲大源','乙大源']){const batch=normalizeArchiveBatch({changes:[{type:'record',name,status:'active',fields:{description:'已有'},recordId:g.id,details:{[g.keyField]:name},sourceIndex:-1}]},p,[],[],'玩家确认'+name+'已构筑');assert.equal(batch.issues.length,0,JSON.stringify(batch.issues));applyArchiveChanges(p,batch.changes,[],new Map([[0,null]]),[]);}
 assert.equal(Object.keys(p.archives).length,2);const ui=Object.create(WorkbenchUI.prototype),html=ui.originalStatusbarPanel(p);assert(html.includes('甲大源')&&html.includes('乙大源'));assert(!html.includes('主记录重复'));
});
