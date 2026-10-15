import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {validateWorldStructure,worldStructurePolicy,prepareStructureImport} from '../src/taishi-structure.js';
import {archivePrompt,normalizeArchiveBatch} from '../src/archive-review.js';
import {planTaishiBuild,assertBuildMatch,buildProgress} from '../src/taishi-build.js';
import {preparePersonSources,attachPersonSources} from '../src/taishi-profile.js';
import {validateState,stable,clone} from '../src/core.js';
import {taishiBrief} from '../src/taishi-brief.js';

async function setup(){
 const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.showTaishiStructure=p=>{f.choice=p;};f.app.ui.closeDialog=()=>{};
 f.app.openAIWorldbooks=async o=>{f.picker=o;};f.app.ui.setTaishiLayout=p=>{f.layout=p;};
 let calls=0;f.app.model.request=async()=>{calls++;throw Error('must not call');};f.calls=()=>calls;
 return f;
}
async function single(){const f=await setup();f.app.openTaishiStructure();await f.app.saveTaishiStructure({mode:'single',worldName:'合流星'});f.power=f.store.read().powers[f.app.powerId];return f;}

test('entry requires a choice before reading books or invoking AI; cancel leaves all archives untouched',async()=>{
 const f=await setup(),before=stable(f.store.read());await f.app.initializeTaishi();
 assert(f.choice);assert.equal(f.picker,undefined);assert.equal(stable(f.store.read()),before);assert.equal(f.calls(),0);
 f.app.taishiStructureDraft=null;await assert.rejects(f.app.saveTaishiStructure({mode:'single',worldName:'合流星'}),/失效/);
 await assert.rejects(f.app.reviewArchives({setupReferences:true}),/先选择/);assert.equal(f.calls(),0);
});

test('single mode seeds one named root and opens the picker, without inventing world contents',async()=>{
 const f=await single(),p=f.power;validateState(f.store.read());
 assert.equal(Object.keys(p.archives).length,1);assert.equal(p.taishiWorldStructure.mode,'single');
 const w=p.archives[p.taishiWorldStructure.worldId];assert.equal(w.name,'合流星');assert.match(w.specific.fields.overview,/待导入/);assert.equal(f.picker.taishiPowerId,p.id);assert.equal(f.layout.mode,'single');assert.equal(f.calls(),0);
 f.app.openTaishiStructure();await f.app.saveTaishiStructure({mode:'single',worldName:'合流星'});
 assert.equal(Object.keys(f.store.read().powers[p.id].archives).length,1,'same named root is reused');
});

test('explicit multi mode seeds no worlds, preserves archives and is distinct from display layout',async()=>{
 const f=await setup();f.app.openTaishiStructure();await f.app.saveTaishiStructure({mode:'multi'});
 const p=f.store.read().powers[f.app.powerId];assert.equal(Object.keys(p.archives).length,0);assert.equal(p.taishiWorldStructure.mode,'multi');
 assert.equal(f.calls(),0);assert(f.picker);
 assert.throws(()=>validateWorldStructure({mode:'single',worldId:'',worldName:''}),/主世界/);
});

test('every setup prompt and batch fingerprint contains the same player-selected structure',async()=>{
 const f=await single(),p=f.power;
 const prompt=archivePrompt(p,[],f.ctx.chat,'设置底稿',{setupReferences:true}),payload=JSON.parse(prompt.user);
 assert.equal(payload.worldStructure.worldId,p.taishiWorldStructure.worldId);assert.match(payload.scopePolicy.boundary,/不要再次判断/);
 const reference={fingerprint:'a'.repeat(16),characters:7,payload:{kind:'worldbooks',books:[{name:'书',entries:[{id:'1',title:'地域',content:'单世界内部的地域'}]}]}};
 const a=planTaishiBuild(reference,p.ruleVersion,p.taishiWorldStructure),b=planTaishiBuild(reference,p.ruleVersion,{mode:'multi',worldId:'',worldName:''});
 assert.notEqual(a.fingerprint,b.fingerprint);assert.throws(()=>assertBuildMatch(buildProgress(a),b),/已变化/);
});

test('misclassified worlds become regions with root IDs and exact selected provenance, through the actual validator',async()=>{
 const f=await single(),p=f.power,root=p.taishiWorldStructure.worldId;
 const content='云海大陆与高天神庭是合流星内的地域，保有各自文明。';
 const ref={payload:{books:[{name:'所选世界书',entries:[{id:'x',title:'山海与层域',content,part:1}]}]}};
 const data={changes:['云海大陆','高天神庭'].map(name=>({type:'environment',name,status:'active',recordId:'world',fields:{conditions:'已有地理与文明'},details:{overview:'依附于主星的完整地域',geography:'山海与城邦',abilities:'仙道与魔药共同发展'},settingRefs:[{book:'所选世界书',id:'x',part:1}],sourceIndex:-1}))};
 const before=stable(data),mapped=prepareStructureImport(data,p);assert.equal(stable(data),before);assert.equal(mapped.converted,2);
 const prepared=preparePersonSources(mapped.data,ref),batch=normalizeArchiveBatch(prepared.data,p,[],f.ctx.chat,'玩家选择单世界设定底稿',f.store.read());attachPersonSources(batch,prepared);
 assert.equal(batch.issues.length,0,JSON.stringify(batch.issues));assert.equal(batch.changes.length,2);
 for(const c of batch.changes){assert.equal(c.specific.recordId,'region');assert.equal(c.specific.fields.world_id,root);assert.equal(c.specific.fields.abilities,'仙道与魔药共同发展');assert.equal(JSON.parse(c.specific.fields.source_profile)[0].content,content);}
 const rejected=normalizeArchiveBatch(preparePersonSources(data,ref).data,p,[],f.ctx.chat,'玩家补充',f.store.read());assert.equal(rejected.changes.length,0);assert(rejected.issues.every(i=>/单世界/.test(i.reason)),'ordinary and stale paths cannot bypass the structure guard');
 const multi=clone(p);multi.taishiWorldStructure={mode:'multi',worldId:'',worldName:''};assert.equal(prepareStructureImport(data,multi).converted,0);
});

test('the root world is always updated by its stable ID; old world identities are not silently reclassified',async()=>{
 const f=await single(),p=f.power,id=p.taishiWorldStructure.worldId;
 const mapped=prepareStructureImport({changes:[{recordId:'world',name:'合流星',details:{overview:'新设定'}}]},p).data.changes[0];assert.equal(mapped.archiveId,id);
 p.archives.old={id:'old',name:'曾误建的世界',specific:{recordId:'world',fields:{}}};
 const old={recordId:'world',archiveId:'old',name:'曾误建的世界',details:{}};
 assert.equal(prepareStructureImport({changes:[old]},p).data.changes[0].recordId,'world');
 const result=normalizeArchiveBatch({changes:[{...old,type:'environment',status:'active',fields:{conditions:'旧资料'},sourceIndex:-1}]},p,[],f.ctx.chat,'补充',f.store.read());assert(result.issues.some(i=>/单世界/.test(i.reason)));
});

test('report text is visible in an editorial layout; duplicate roles and abilities appear once without mutating sources',()=>{
 const rows=[{id:'profile',value:'负责城邦守备的学者',label:'简介'},{id:'role',value:'守备学者',label:'身份'},{id:'role',value:'守备学者',label:'身份'},{id:'abilities',value:'符文、药剂与护卫术',label:'能力'},{id:'combat_style',value:'符文，药剂与护卫术',label:'战斗'},{id:'action',value:'正在研究已有典籍',label:'行动'},{id:'unknown',value:'必须保留的资料',label:'补充'}];
 const before=stable(rows),esc=s=>String(s??'').replaceAll('<','&lt;');
 const html=taishiBrief({name:'学者',specific:{recordId:'companion'}},rows,esc);
 assert(html.includes('wjwk-report-masthead'));assert(html.includes('wjwk-report-grid'));assert(html.includes('is-current'));assert.equal(html.split('守备学者').length-1,1);assert(html.includes('必须保留的资料'));assert.equal(stable(rows),before);
 assert(!html.includes('<details class="wjwk-brief-card"'));
});

test('brief deduplication preserves distinct numeric values and supplementary generic details',()=>{
 const html=taishiBrief({name:'人物',specific:{recordId:'companion',fields:{role:'学者'}}},[{id:'role',label:'旧职责',value:'学者，曾负责远行队'},{id:'role',label:'职责',value:'学者'},{id:'a',label:'甲',value:'1.5'},{id:'b',label:'乙',value:'15'},{id:'c',label:'丙',value:'-15'}],s=>String(s));
 assert(html.includes('1.5'));assert(html.includes('>15<'));assert(html.includes('-15'));assert(html.includes('曾负责远行队'));
});
