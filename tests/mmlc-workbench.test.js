import test from 'node:test';
import assert from 'node:assert/strict';
import {createPower} from '../src/core.js';
import {MMLC_ENTRY} from '../src/mmlc.js';
import {MMLC_CONFIG} from '../src/mmlc-config.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {mmlcRelations,mmlcLinked} from '../src/mmlc-view.js';
import {mmlcBrief} from '../src/mmlc-brief.js';
import {mmlcInventory,mmlcPrinciples,mmlcFocusContext,mmlcOutcomeOptions} from '../src/mmlc-workbench.js';
import {mmlcMethods} from '../src/mmlc-controller.js';
const power=()=>createPower(MMLC_ENTRY);
const add=(p,name,module,fields,status='active')=>{const definition=MMLC_CONFIG.records.find(r=>r.id===module);return saveArchive(p,{name,type:'record',module,status,fields:{description:'已确认的实际情况'},specific:{adapterId:MMLC_CONFIG.id,version:MMLC_CONFIG.version,recordId:module,label:definition.label,labels:Object.fromEntries(definition.fields.map(f=>[f.id,f.label])),fields}},archiveSource([],'玩家确认已有成果'));};
test('explicit relationships retain the same ID after a target is renamed',()=>{
 const p=power(),method=add(p,'催熟法','arts',{principle:'灵植生长规律'}),project=add(p,'灵田改良','projects',{links:'催熟法',stage:'试验中'},'working');
 saveArchive(p,{...method,name:'春生法'},archiveSource([],'玩家确认改名'));
 assert.equal(p.archives[project.id].mmlcRefs.ids[0],method.id);assert(mmlcRelations(p,[]).some(e=>e.from===project.id&&e.to===method.id));
});
test('forward references bind when their actual target is saved later',()=>{
 const p=power(),project=add(p,'研究课题','projects',{links:'试验灵田'},'working'),land=add(p,'试验灵田','land',{condition:'试验运行'});
 assert.deepEqual(p.archives[project.id].mmlcRefs.ids,[land.id]);
});
test('unfinished projects expose their usable output without becoming completed projects',()=>{
 const p=power(),r=add(p,'催熟研究','projects',{usable:'基础催熟法式',needs:'持续供能',stage:'长期试验'},'working');
 assert.equal(mmlcBrief(p,[]).usableProjects[0].id,r.id);assert.equal(p.archives[r.id].status,'working');assert.equal(mmlcFocusContext(p,[],r.id).needs,'持续供能');
});
test('quantity text stays literal and production/delivery never imply a calculated stock',()=>{
 const r={specific:{fields:{quantity:'本批炼制十瓶，已交付六瓶',produced:'十瓶',delivered:'六瓶'}}};
 const facts=mmlcInventory(r);assert(!facts.some(f=>f.label==='当前库存'));assert.equal(facts.find(f=>f.label==='数量原文').value,r.specific.fields.quantity);
});
test('same explicit principle groups methods for display without merging archives',()=>{
 const p=power(),a=add(p,'春生法','arts',{principle:'生长规律',effect:'催芽'}),b=add(p,'秋藏法','arts',{principle:'生长规律',effect:'育种'});
 assert.equal(mmlcPrinciples([a,b]).length,1);assert.equal(Object.keys(p.archives).length,2);
});
test('continuing a project includes explicitly linked methods and facilities through two steps',()=>{
 const p=power(),land=add(p,'试验灵田','land',{condition:'运行中'}),method=add(p,'催熟法','arts',{links:land.name,effect:'催芽'}),project=add(p,'灵田改良','projects',{links:method.name,needs:'稳定性'},'working');
 assert.equal(mmlcLinked(p,[],project.id,{depth:2}).length,2);assert(mmlcFocusContext(p,[],project.id).related.some(r=>r.archiveId===land.id));
});
test('outcome actions require actual research output on a current project',()=>{
 const p=power(),r=add(p,'催熟研究','projects',{usable:'基础催熟法式'},'working');
 assert.equal(mmlcOutcomeOptions(r).length,3);
 assert.equal(mmlcOutcomeOptions({...r,status:'planned'}).length,0);
 assert.equal(mmlcOutcomeOptions({...r,status:'ended'}).length,0);
 assert.equal(mmlcOutcomeOptions({...r,specific:{...r.specific,fields:{stage:'试验中'}}}).length,0);
});
test('using research output opens the requested plan while preserving the source project',()=>{
 const p=power(),r=add(p,'催熟研究','projects',{usable:'基础催熟法式',needs:'稳定供能'},'working'),before=structuredClone(p);
 const controller={powerId:p.id,ensureStable:()=>({state:{powers:{[p.id]:p}},ctx:{chat:[]}}),openCreation:options=>options};
 for(const [kind,section] of [['trial','projects'],['manufacture','items'],['cultivation','body']]){
  const draft=mmlcMethods.continueMmlc.call(controller,r.id,kind);
  assert.equal(draft.section,section);assert.equal(draft.focusId,r.id);assert(draft.goal.includes(r.name));
 }
 assert.deepEqual(p,before);
});
