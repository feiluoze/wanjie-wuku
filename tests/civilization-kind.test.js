import test from 'node:test';
import assert from 'node:assert/strict';
import {isCivilizationRecord,classifyInhabitantInput} from '../src/taishi-civilization-kind.js';
import {taishiLayout,civilizationForRecord,taishiLayoutGroups} from '../src/taishi-layout.js';
import {preparePersonSources} from '../src/taishi-profile.js';
import {taishiConfig} from '../src/taishi.js';
const row=(id,recordId,name,fields={})=>({id,name,type:'record',status:'active',fields:{},source:{type:'manual',note:'玩家设定'},specific:{recordId,fields}});
function sample(){const rows=[row('w','world','世界'),row('plate','region','维尔萨兰',{world_id:'w'}),row('forest','region','月翳古林',{world_id:'w',region_id:'plate'}),row('trees','inhabitants','树人',{world_id:'w',region_id:'forest'}),row('fairies','inhabitants','妖精',{world_id:'w',location:'维尔萨兰·月翳古林'}),row('c','inhabitants','维尔萨兰奇幻文明',{world_id:'w',region_id:'plate'}),row('org','organization','古树议会',{world_id:'w',location:'维尔萨兰·月翳古林'}),row('person','companion','居民甲',{world_id:'w',organization_id:'org'})];return {archives:Object.fromEntries(rows.map(r=>[r.id,r]))};}
test('legacy screenshot populations stay stored but only civilization roots enter navigation',()=>{
 const p=sample(),before=JSON.stringify(p),layout=taishiLayout(p);
 assert.deepEqual(layout.civilizations.map(r=>r.name),['维尔萨兰奇幻文明']);assert.equal(JSON.stringify(p),before);
 assert.equal(civilizationForRecord(p,p.archives.trees)?.id,'c');assert.equal(civilizationForRecord(p,p.archives.fairies)?.id,'c');assert.equal(civilizationForRecord(p,p.archives.person)?.id,'c');
 const groups=taishiLayoutGroups(p,Object.values(p.archives),layout);assert(groups.find(g=>g.id==='c').rows.some(r=>r.id==='trees'));assert(p.archives.trees);
});
test('explicit kinds support arbitrary civilization names and override misleading names',()=>{
 assert(isCivilizationRecord(row('c','inhabitants','Arcanum',{kind:'civilization'})));
 assert(!isCivilizationRecord(row('p','inhabitants','部落文明',{kind:'population'})));
 assert(!isCivilizationRecord(row('p','inhabitants','树人')));
});
test('worldbook headings authorize civilization only for the named subject',()=>{
 const packet={payload:{books:[{entries:[{content:'## 【文明】维尔萨兰奇幻文明\n族群包括树人、妖精与居民。'}]}]}};
 const data={changes:[{recordId:'inhabitants',name:'维尔萨兰奇幻文明',details:{}},{recordId:'inhabitants',name:'树人',details:{kind:'civilization'}}]};
 const prepared=preparePersonSources(data,packet);assert.equal(prepared.data.changes[0].details.kind,'civilization');assert.equal(prepared.data.changes[1].details.kind,'population');assert.equal(data.changes[1].details.kind,'civilization');
 const continuing={recordId:'inhabitants',name:'Arcanum',details:{}};classifyInhabitantInput(continuing,packet,{archives:{a:row('a','inhabitants','Arcanum',{kind:'civilization'})}});assert.equal(continuing.details.kind,'civilization');
});
test('late civilization arrival groups prior records without mutating them or requesting AI',()=>{
 const p=sample();delete p.archives.c;assert.equal(civilizationForRecord(p,p.archives.trees),null);
 p.archives.c=row('c','inhabitants','维尔萨兰奇幻文明',{kind:'civilization',world_id:'w',location:'太始星·维尔萨兰'});
 const before=JSON.stringify(p);assert.equal(civilizationForRecord(p,p.archives.trees)?.id,'c');assert.equal(JSON.stringify(p),before);
});
test('ambiguous, invalid, foreign and cyclic geography never fabricates a civilization link',()=>{
 const p=sample();p.archives.other=row('other','inhabitants','另一文明',{kind:'civilization',world_id:'w',region_id:'plate'});assert.equal(civilizationForRecord(p,p.archives.trees),null);
 p.archives.trees.specific.fields.civilization_id='missing';assert.equal(civilizationForRecord(p,p.archives.trees),null);delete p.archives.trees.specific.fields.civilization_id;
 p.archives.plate.specific.fields.region_id='forest';assert.equal(civilizationForRecord(p,p.archives.trees),null);
 p.archives.foreign=row('foreign','world','异界');p.archives.other.specific.fields.world_id='foreign';assert.equal(civilizationForRecord(p,p.archives.trees)?.id,'c');
});
test('schema declares kinds and population parent link without another player setup form',()=>{
 const def=taishiConfig().records.find(r=>r.id==='inhabitants');assert(def.fields.some(f=>f.id==='kind'));assert(def.fields.some(f=>f.id==='civilization_id'));
});
