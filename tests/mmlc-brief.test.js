import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {MMLC_ID} from '../src/mmlc.js';
import {MMLC_CONFIG} from '../src/mmlc-config.js';
import {mmlcInitialRecords} from '../src/mmlc-controller.js';
import {mmlcBrief,mmlcBriefFacts,mmlcBriefHTML} from '../src/mmlc-brief.js';
import {normalizeArchiveBatch,applyArchiveChanges,archivePrompt} from '../src/archive-review.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {creationPrompt,creationCurrent,normalizeCreation} from '../src/creation.js';
import {clone,stable,validateState} from '../src/core.js';
import {WorkbenchUI} from '../src/ui.js';

async function setup(){const f=fixture();await f.app.action('add-mmlc',{});f.app.settings.mode='st';f.app.ui.closeDialog=()=>{};f.app.ui.showMmlcInitial=()=>{};f.app.ui.showCreation=()=>{};return f;}
function add(p,name,module,details,status='active'){
 const d=MMLC_CONFIG.records.find(x=>x.id===module);
 return saveArchive(p,{type:'record',name,module,status,fields:{description:name+'的已确认情况'},specific:{adapterId:MMLC_CONFIG.id,version:MMLC_CONFIG.version,recordId:module,label:d.label,labels:Object.fromEntries(d.fields.map(x=>[x.id,x.label])),fields:details}},archiveSource([],'玩家确认'));
}

test('initial setup requires explicit consent, preserves all other powers and grants no currency',async()=>{
 const f=await setup(),before=clone(f.store.read()),other=Object.entries(before.powers).find(([id])=>id!==MMLC_ID);
 f.app.openMmlcInitial();await assert.rejects(f.app.applyMmlcInitial({}),/请确认/);
 assert.equal(stable(f.store.read()),stable(before));
 await f.app.applyMmlcInitial({confirm:'on'});const s=f.store.read(),p=s.powers[MMLC_ID];
 assert.equal(Object.keys(p.archives).length,9);assert.equal(Object.values(p.archives).filter(r=>r.module==='arts').length,7);
 assert(Object.values(p.archives).some(r=>r.specific?.fields.realm==='完美筑基'));
 assert.deepEqual(p.resources,{});assert.deepEqual(p.assets,{});assert.equal(p.autoArchiveReview,false);assert.equal(f.replacementCount,0);
 assert.equal(stable(s.powers[other[0]]),stable(other[1]));validateState(clone(s));
 assert.throws(()=>f.app.openMmlcInitial(),/只用于空档案/);
 await assert.rejects(f.app.applyMmlcInitial({confirm:'on'}),/重新打开/);
});

test('initial facts come from six author methods and retain unspecified inventory',()=>{
 const rows=mmlcInitialRecords();assert.equal(rows.length,9);assert.equal(rows.filter(r=>r.details.mastery==='初授即可用').length,6);
 assert.match(rows.find(r=>r.module==='land').details.condition,/具体库存未指定/);
 assert(!rows.some(r=>r.module==='fleet'||r.module==='spirits'));
});

test('new preset fields survive normalization while partial research remains in progress',async()=>{
 const f=await setup(),p=f.store.read().powers[MMLC_ID],note='已发现护盾以高频振动维持，现可施展定向破盾法；完整逆推仍待取得样本。';
 const raw={name:'护盾逆推',type:'research',module:'projects',status:'working',recordId:'projects',fields:{outcome:note},details:{discovery:'护盾以高频振动维持',usable:'定向破盾法',needs:'取得样本'},sourceIndex:-1,quote:note,ruleQuote:p.rules.slice(0,20)};
 const batch=normalizeArchiveBatch({changes:[raw]},p,[],[],note);assert.equal(batch.issues.length,0);
 const [r]=applyArchiveChanges(p,batch.changes,[],new Map([[0,null]]),[]);
 assert.equal(r.status,'working');assert.equal(r.specific.fields.usable,'定向破盾法');
 assert(mmlcBriefFacts(r).some(f=>f.label==='现在能做什么'&&f.value==='定向破盾法'));
 assert.match(archivePrompt(p,[],[]).system,/共同原理/);
});

test('brief and engineering relations preserve identity, status and actual quantities',async()=>{
 const f=await setup(),p=f.store.read().powers[MMLC_ID];
 const method=add(p,'空间定位','arts',{principle:'稳定坐标',mastery:'已验证',derivatives:'传送定位与远航导航'});
 const project=add(p,'传送阵建设','projects',{discovery:'已验证定位',usable:'阵法图纸',needs:'完成阵眼',links:method.name},'working');
 const item=add(p,'定位阵眼','items',{quantity:'两件',links:project.name});
 add(p,'相似定位','arts',{effect:'独立方法'});const before=stable(p),brief=mmlcBrief(p,[]);
 assert.equal(brief.ongoing[0].id,project.id);assert.deepEqual([...brief.links.get(project.id)].sort(),[method.id,item.id].sort());assert.equal(stable(p),before);
 const ui=Object.create(WorkbenchUI.prototype);ui.mmlcView='brief';ui.view={state:f.store.read()};ui.mmlcSection='projects';
 const html=ui.management(f.store.read(),p,false,'st',null,[]);
 assert.match(html,/成果脉络/);assert.match(html,/两件|定位阵眼/);assert.match(html,/仍待解决/);assert.match(html,/图纸/);
 assert.equal(project.status,'working');assert.equal(item.specific.fields.quantity,'两件');assert.equal(stable(p),before);
});

test('selected continuation brings focus and explicit linked knowledge without calling AI or writing',async()=>{
 const f=await setup();let id,linkedId;
 await f.store.transact(n=>{const p=n.powers[MMLC_ID],r=add(p,'电磁传导','arts',{principle:'已掌握传导规律',derivatives:'雷法与电磁精炼'});linkedId=r.id;id=add(p,'精炼研究','projects',{outcome:'验证温控工艺',links:r.name},'working').id;});
 let calls=0;f.app.query=async()=>{calls++;throw Error('no AI');};const before=stable(f.store.read());
 f.app.continueMmlc(id);assert.equal(f.app.creationRequest.focusId,id);assert.equal(stable(f.store.read()),before);assert.equal(calls,0);
 const p=f.store.read().powers[MMLC_ID],spec=creationPrompt(p,[], '改善纯度','projects',null,id),input=JSON.parse(spec.prompt.user);
 assert.equal(input.current[0].id,id);assert(input.current.some(r=>r.id===linkedId));assert.match(input.current.find(r=>r.id===linkedId).specific.fields.principle,/传导规律/);
 const item=normalizeCreation({title:'研究方案',content:'沿既有温控工艺改良',conditions:'等待实际验证',ruleQuote:input.rules.slice(0,20)},p,{goal:'改善纯度',operationId:'projects',sources:spec.sources});
 assert(creationCurrent(item,p,[]));p.archives[linkedId].specific.fields.principle='已更新';assert(!creationCurrent(item,p,[]));
});

test('brief presents cultivation and suppresses duplicate facts without losing full archive',async()=>{
 const f=await setup(),p=f.store.read().powers[MMLC_ID],body=add(p,'本体','body',{realm:'金丹',body:'身神协调',soul:'身神协调',progress:'专修空间'});
 assert.deepEqual(mmlcBriefFacts(body).map(x=>x.value),['金丹','身神协调','专修空间']);assert.equal(body.specific.fields.soul,'身神协调');
 const ui=Object.create(WorkbenchUI.prototype);ui.mmlcView='brief';ui.view={state:f.store.read()};const html=ui.management(f.store.read(),p,false,'off',null,[]);
 for(const label of ['本体修行','新近参悟','正在推进','最新交付'])assert(html.includes(label));
 assert.match(html,/data-action="mmlc-continue"[^>]*disabled/);assert.match(html,/<details class="wjwk-mmlc-directory">/);
});
