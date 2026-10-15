import test from 'node:test';
import assert from 'node:assert/strict';
import {taishiLayout,taishiLayoutGroups,civilizationForRecord,taishiSearch,readTaishiLayout,saveTaishiLayout} from '../src/taishi-layout.js';
import {taishiDashboard} from '../src/taishi-dashboard.js';
import {taishiFieldControl} from '../src/taishi-layout-ui.js';
import {taishiConfig} from '../src/taishi.js';
import {resolveTaishiLinks} from '../src/taishi-links.js';
import {fixture} from './mvu-fixture.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {creationConfig} from '../src/creation-config.js';
import {stable,validateState} from '../src/core.js';
const row=(id,kind,fields={},name=id)=>({id,name,type:'record',status:'active',fields:{description:'已确认概况'},source:{type:'manual',note:'玩家设定'},specific:{recordId:kind,fields,labels:{}}});
const sample=()=>({id:'p',active:true,archives:Object.fromEntries([
 row('w','world',{},'主世界'),row('other','world',{},'另一世界'),
 row('east','region',{world_id:'w'},'东方大陆'),row('west','region',{world_id:'w'},'西方大陆'),
 row('a','inhabitants',{kind:'civilization',world_id:'w',region_id:'east'},'青岚文明'),row('b','inhabitants',{kind:'civilization',world_id:'w',region_id:'west'},'白塔文明'),
 row('org','organization',{world_id:'w',civilization_id:'a'}),row('person','companion',{world_id:'w',organization_id:'org'}),
 row('resource','available',{world_id:'w',region_id:'west'}),row('shared','available',{world_id:'w'}),row('foreign','event',{world_id:'other'}),row('unknown','event',{})
 ].map(r=>[r.id,r]))});

test('layout defaults, stable IDs, world selection and scoped preferences never mutate game archives',()=>{
 const p=sample(),before=stable(p);assert.equal(taishiLayout(p).mode,'multi');delete p.archives.other;
 assert.equal(taishiLayout(p).mode,'single');const l=taishiLayout(p,[],{mode:'single',worldId:'missing',civilizationId:'invalid'});
 assert.equal(l.world.id,'w');assert.equal(l.civilizationId,'');p.archives.w.name='改名';assert.equal(taishiLayout(p,[],{worldId:'w'}).world.name,'改名');
 const values=new Map(),store={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 assert(saveTaishiLayout(store,'account/chat','p',{mode:'single',worldId:'w',civilizationId:'a'}));
 assert.equal(readTaishiLayout(store,'account/chat','p').civilizationId,'a');assert.deepEqual(readTaishiLayout(store,'other/chat','p'),{});
 assert.deepEqual(readTaishiLayout({getItem:()=>'{bad'},'a','p'),{});assert.equal(saveTaishiLayout({setItem(){throw Error('denied');}},'a','p',{}),false);
 const q=sample();taishiLayoutGroups(q,Object.values(q.archives),taishiLayout(q));assert.equal(stable(q),before);
});

test('multi-world and single-world grouping keep other worlds, public assets and unassigned records distinct',()=>{
 const p=sample(),rows=Object.values(p.archives),single=taishiLayout(p,[],{mode:'single',worldId:'w'});
 const groups=taishiLayoutGroups(p,rows,single);assert.deepEqual(groups.map(g=>g.id),['a','b','common','unassigned']);
 assert(groups.find(g=>g.id==='a').rows.some(r=>r.id==='person'));assert(groups.find(g=>g.id==='b').rows.some(r=>r.id==='resource'));
 assert(groups.find(g=>g.id==='common').rows.some(r=>r.id==='shared'));assert(!groups.some(g=>g.rows.some(r=>r.id==='foreign')));
 const multi=taishiLayoutGroups(p,rows,taishiLayout(p));assert.deepEqual(multi.map(g=>g.id),['w','other','unassigned']);assert(multi.find(g=>g.id==='other').rows.some(r=>r.id==='foreign'));
 const none={archives:{x:row('x','event')}};const empty=taishiLayoutGroups(none,Object.values(none.archives),taishiLayout(none));assert.equal(empty.length,1);assert.equal(empty[0].rows.length,1);
});

test('two civilizations on one continent stay separate; shared geography and invalid IDs never guess a civilization',()=>{
 const p=sample();p.archives.b.specific.fields.region_id='east';
 assert.equal(civilizationForRecord(p,row('x','available',{world_id:'w',region_id:'east'})),null);
 assert.equal(civilizationForRecord(p,row('x','available',{world_id:'w',civilization_id:'b'})).id,'b');
 assert.equal(civilizationForRecord(p,row('x','available',{world_id:'w',civilization_id:'missing',region_id:'west'})),null);
 p.archives.a.specific.fields.region_id='';assert.equal(civilizationForRecord(p,p.archives.person).id,'a','cross-region explicit organization membership remains valid');
 const foreign=row('f','inhabitants',{world_id:'other'});p.archives.f=foreign;
 assert.throws(()=>resolveTaishiLinks(p,{specific:{fields:{world_id:'w',civilization_id:'f'}}}),/另一个世界/);
 assert.throws(()=>resolveTaishiLinks(p,{specific:{fields:{world_id:'w',civilization_id:'org'}}}),/类别错误/);
});

test('every classification supports both layouts; compact rows, escaped titles and full search remain available',()=>{
 const p=sample();p.archives.a.name='<img src=x>';p.archives.shared.specific.fields.description='隐藏在完整描述里的关键词';
 const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const helpers={esc,btn:(a,l,_c,_d,attrs='')=>`<button data-action="${a}" ${attrs}>${l}</button>`,empty:s=>`<p>${s}</p>`};
 const ui={savedStatStrip:()=>'',automaticArchiveControls:()=>'<button data-action="player-auto-save">开启自动更新</button>',archiveUpdatePanel:()=>'',memoryStatusPanel:()=>'',creationPanel:()=>''};
 for(const mode of ['multi','single'])for(const section of ['','worlds','civilizations','companions','development','available','growth','descent','other']){
  ui.taishiSection=section;ui.getTaishiLayout=()=>taishiLayout(p,[],{mode,worldId:'w'});
  const html=taishiDashboard(ui,p,false,'off',[],helpers);assert(!html.includes('<img src=x>'));assert.equal((html.match(/data-action="player-auto-save"/g)||[]).length,1);
  if(section==='available'&&mode==='single')assert(html.includes('data-taishi-group="common"'));
 }
 assert.deepEqual(taishiSearch(Object.values(p.archives),'关键词').map(r=>r.id),['shared']);
 const field=taishiFieldControl(p,p.archives.person,{id:'civilization_id',label:'所属文明档案ID',value:''},esc);
 assert(field.includes('<select'));assert(field.includes('&lt;img'));assert(!field.includes('value="f"'));
 assert(taishiConfig().records.find(r=>r.id==='companion').fields.some(f=>f.id==='civilization_id'));
});

test('manual civilization registration uses capture, persists once, and creates no world, resources or AI request',async()=>{
 const f=fixture();await f.app.openTaishi();f.app.ui.getTaishiLayout=p=>taishiLayout(p,f.ctx.chat);f.app.ui.showTaishiCivilization=()=>{};
 await f.store.transact(s=>{const p=s.powers[f.app.powerId],c=creationConfig(p),def=c.records.find(r=>r.id==='world');saveArchive(p,{name:'合流界',type:'environment',status:'active',fields:{conditions:'成熟世界'},specific:{adapterId:c.id,recordId:def.id,version:c.version,label:def.label,labels:Object.fromEntries(def.fields.map(f=>[f.id,f.label])),fields:{overview:'多体系共存'}}},archiveSource(f.ctx.chat,'玩家设定'));});
 let calls=0;f.app.model.request=async()=>{calls++;throw Error('must not call AI');};
 const p=f.store.read().powers[f.app.powerId],world=Object.values(p.archives)[0],resources=stable(p.resources);
 f.app.openTaishiCivilization();await f.app.saveTaishiCivilization({name:'青岚文明',description:'仙道与魔药共同发展的大陆文明',worldId:world.id,regionId:''});
 const state=f.store.read(),after=state.powers[f.app.powerId];validateState(state);
 assert.equal(Object.values(after.archives).filter(r=>r.specific.recordId==='world').length,1);assert.equal(Object.values(after.archives).filter(r=>r.specific.recordId==='inhabitants').length,1);assert.equal(stable(after.resources),resources);assert.equal(calls,0);
 f.app.openTaishiCivilization();await assert.rejects(f.app.saveTaishiCivilization({name:'青岚文明',description:'同名',worldId:world.id}),/同名文明/);
 f.app.openTaishiCivilization();await f.store.transact(s=>s.powers[f.app.powerId].taishiAutonomy=true);
 await assert.rejects(f.app.saveTaishiCivilization({name:'白塔文明',description:'新文明',worldId:world.id}),/变化|版本|失效/);
});
