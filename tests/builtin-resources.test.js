import test from 'node:test';import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {BUILTIN_RESOURCES} from '../src/builtin-resource-data.js';
import {builtinResources,statusbarResource,assertStatusbarResourceFields,projectResourceStatus,resourcePolicy} from '../src/builtin-resources.js';
import {createPower,inferResources,upgradeResources,hash,emptyState,validateState,canAfford,extractPanelBalances} from '../src/core.js';
import {builtinStatusbar,statusbarPolicy} from '../src/builtin-statusbar.js';
import {creationConfig} from '../src/creation-config.js';
import {managementProfile} from '../src/management-profiles.js';
import {normalizeArchiveBatch,archivePrompt} from '../src/archive-review.js';
import {WorkbenchUI} from '../src/ui.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {memoryPlan} from '../src/archive-memory.js';
const entries=builtinEntries({includeDedicated:true}),power=name=>createPower(entries.find(e=>e.name===name));
const bound=p=>{const g=builtinStatusbar(p).groups.find(g=>g.fields.some(f=>statusbarResource(p,f.id)));return {g,f:g.fields.find(f=>statusbarResource(p,f.id))};};
test('all 131 current sources explicitly reviewed, 13 dedicated resources retain verbatim evidence',()=>{
 assert.equal(BUILTIN_RESOURCES.length,131);const kinds={point:0,energy:0,quota:0};let none=0;
 for(const e of entries){const row=builtinResources(e);assert(row?.reviewed,e.name);for(const r of row.resources){kinds[r.kind]++;assert(e.content.includes(r.evidence),e.name);assert.equal(r.id,'res_'+hash(r.name==='模拟次数'?'今日模拟次数':r.name));}if(!row.resources.length){none++;assert.deepEqual(inferResources(e),[]);}assert.equal(builtinResources({...e,content:e.content+'changed'}),null);}
 assert.deepEqual(kinds,{point:9,energy:2,quota:2});assert.equal(none,118);
 assert.equal(Object.values(power('心渊').resources)[0].name,'心相碎片');assert(!managementProfile(entries.find(e=>e.name==='心渊')).templates.some(t=>t.label.includes('心相碎片')));
});
test('new wallets stay unknown; alias upgrades preserve identity, balance and limits and refuse ambiguous merges',()=>{
 const p=power('人生模拟'),d=Object.values(p.resources)[0];assert.equal(d.balance,null);
 p.resources={legacy:{...d,id:'legacy',name:'可用模拟次数',balance:'3',floor:'1'}};upgradeResources(p);assert.equal(Object.keys(p.resources).length,1);assert.equal(p.resources.legacy.balance,'3');assert.equal(p.resources.legacy.floor,'1');
 p.resources.duplicate={...p.resources.legacy,id:'duplicate'};const before=JSON.stringify(p.resources);upgradeResources(p);assert.equal(JSON.stringify(p.resources),before);assert(resourcePolicy(p).resources[0].conflict);
});
test('ledger resources cannot be written through status archives or cloned as standalone outcomes',()=>{
 for(const name of ['深蓝','心渊','抽奖系统']){const p=power(name),{g,f}=bound(p);assert(!creationConfig(p).records.find(r=>r.id===g.id).fields.some(x=>x.id===f.id));assert(!statusbarPolicy(p).tables.find(r=>r.recordId===g.id).fields.some(x=>x.id===f.id));
 const candidate={type:'record',name:g.title,status:'active',fields:{description:'当前状态'},recordId:g.id,details:{[f.id]:'99'},sourceIndex:-1};const result=normalizeArchiveBatch({changes:[candidate]},p,[],[],'玩家确认余额99');assert(result.issues.length);assert.equal(result.changes.length,0);
 const duplicate=normalizeArchiveBatch({changes:[{type:'record',name:Object.values(p.resources)[0].name,status:'active',fields:{description:'余额99'},sourceIndex:-1}]},p,[],[],'玩家确认余额99');assert(duplicate.issues.length);assert.equal(Object.values(p.resources)[0].balance,null);
 }
});
test('energy descriptions remain qualitative while current/maximum cannot create a second numeric balance',()=>{
 const p=power('无龙心法'),{g,f}=bound(p),raw=value=>({recordId:g.id,details:{[f.id]:value}});assert.doesNotThrow(()=>assertStatusbarResourceFields(p,raw('心能充盈')));assert.throws(()=>assertStatusbarResourceFields(p,raw('30/100')),/唯一|第二份/);Object.values(p.resources)[0].balance='30';assert.throws(()=>assertStatusbarResourceFields(p,raw('心能充盈')),/第二份/);
});
test('energy capacity remains an independently editable original status field when balance is ledger bound',()=>{
 const p=power('念气体系'),{g,f}=bound(p);Object.values(p.resources)[0].balance='30';const capacity=g.fields.find(x=>x.sourceField===f.id);assert(capacity);assert(creationConfig(p).records.find(x=>x.id===g.id).fields.some(x=>x.id===capacity.id));
 const batch=normalizeArchiveBatch({changes:[{type:'record',name:g.title,status:'active',fields:{description:'上限已确认'},recordId:g.id,details:{[capacity.id]:'100'},sourceIndex:-1}]},p,[],[],'玩家确认念气上限100，当前30');assert.deepEqual(batch.issues,[]);assert.equal(batch.changes.length,1);assert.equal(Object.values(p.resources)[0].balance,'30');
});
test('current projection replaces stale status numbers without rewriting saved record or history',()=>{
 const p=power('深蓝'),{g,f}=bound(p),resource=Object.values(p.resources)[0];resource.balance='170';const r={id:'legacy',name:g.title,specific:{recordId:g.id,fields:{[f.id]:'999'},labels:{[f.id]:f.label}},history:[{value:'555'}]};const before=JSON.stringify(r);const projected=projectResourceStatus(p,r);assert.equal(projected.specific.fields[f.id],'170');assert.equal(JSON.stringify(r),before);
 p.archives={legacy:r};const ui=Object.create(WorkbenchUI.prototype);assert(ui.originalStatusbarPanel(p).includes('<dd>170</dd>'));assert(!ui.originalStatusbarPanel(p).includes('<dd>999</dd>'));resource.balance=null;assert(ui.originalStatusbarPanel(p).includes('未确认'));assert.equal(JSON.parse(archivePrompt(p,[],[],'').user).resourceLedger.resources[0].balance,null);
});
test('model current-state input and pinned narrative memory share the ledger projection',()=>{
 const p=power('深蓝'),{g,f}=bound(p);Object.values(p.resources)[0].balance='170';const r=saveArchive(p,{type:'record',name:g.title,status:'active',fields:{description:'当前状态'},specific:{adapterId:'wuku.original_statusbar',recordId:g.id,version:'1.0.0',label:g.title,labels:{[f.id]:f.label},fields:{[f.id]:'999'}}},archiveSource([],'玩家确认的旧快照'));
 const s=emptyState();s.powers[p.id]=p;const packet=memoryPlan(s,[],'',{auto:false,budget:3000,selections:{[p.id+'/'+r.id]:{mode:'pinned'}}}).packet;assert(packet.includes('170'));assert(!packet.includes('999'));
 const current=JSON.parse(archivePrompt(p,[],[],'').user).current.find(row=>row.archiveId===r.id);assert.equal(current.details[f.id],'170');assert.equal(r.specific.fields[f.id],'999');
});
test('negative difference snapshot never expands spending permission or permits other negative currency',()=>{
 const p=power('指数增长'),r=Object.values(p.resources)[0];r.balance='-5';const s=emptyState();s.powers[p.id]=p;assert.doesNotThrow(()=>validateState(s));assert.equal(canAfford(p,{costs:[{kind:'resource',id:r.id,amount:'1'}]}).ok,false);r.floor='1';assert.throws(()=>validateState(s));
 const q=power('深蓝');Object.values(q.resources)[0].balance='-1';const t=emptyState();t.powers[q.id]=q;assert.throws(()=>validateState(t));
});
test('quota numerator and energy current value are read without substituting capacity or auto-refill',()=>{
 for(const [name,label,value]of [['抽奖系统','今日剩余抽奖','2/5'],['念气体系','念气储量','30/100']]){const p=power(name),r=Object.values(p.resources)[0],chat=[{is_user:false,mes:`【${name}】\n${label}：${value}`}];assert.equal(extractPanelBalances(p,chat)[r.id]?.balance,value.split('/')[0]);assert.equal(r.balance,null);}
});
