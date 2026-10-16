import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {archiveRepairPrompt,applyArchiveRepairResponse} from '../src/archive-repair.js';
const row={type:'record',name:'成果甲',status:'active',fields:{description:'真实资料',unknown:'补充事实'},sourceIndex:-1};
const pending=()=>({data:{changes:[row,{...row,name:'已经有效'}]},issues:[{kind:'成果',index:0,reason:'unknown_field'}],sources:[],playerNote:'玩家确认真实资料'});
test('repair preset sends only rejected raw candidates and locks identity',()=>{
 const f=fixture(),p=pending(),prompt=archiveRepairPrompt(p,f.power,null),input=JSON.parse(prompt.user);
 assert.equal(input.failed.length,1);assert.equal(input.failed[0].candidate.name,'成果甲');assert(!prompt.user.includes('已经有效'));assert(prompt.system.includes('互补资料合并完整保留'));
 const fixed=applyArchiveRepairResponse(p,{repairs:[{index:0,fields:{description:'真实资料；补充事实'},details:{}}]});
 assert.deepEqual(fixed.data.changes[1],p.data.changes[1]);assert.equal(fixed.data.changes[0].name,row.name);assert.equal(p.data.changes[0].fields.unknown,'补充事实');
 assert.throws(()=>applyArchiveRepairResponse(p,{repairs:[{index:1,fields:{},details:{}}]}),/非失败项/);
 assert.throws(()=>applyArchiveRepairResponse(p,{repairs:[{index:0,name:'另一个人',fields:{},details:{}}]}),/身份或来源/);
 assert.throws(()=>applyArchiveRepairResponse(p,{repairs:[{index:0,fields:{},details:{source_profile:'伪造'}}]}),/程序专用/);
});
test('AI repair revalidates rejected fields, leaves valid candidates and archives untouched',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};let calls=0;
 f.app.model.request=async prompt=>{calls++;if(calls===1)return JSON.stringify({changes:[row,{type:'record',name:'有效乙',status:'active',fields:{description:'已成立的事实'},sourceIndex:-1}]});
  assert(prompt.system.includes('专属修复员'));assert(!prompt.user.includes('有效乙'));
  return JSON.stringify({repairs:[{index:0,fields:{description:'真实资料；补充事实'},details:{}}]});};
 await f.app.reviewArchives({values:{playerNote:'玩家确认真实资料与已成立事实'}});
 const p=f.app.pendingArchiveReview,archives=JSON.stringify(f.power.archives);
 await f.app.repairArchiveWithAI();assert.equal(calls,2);assert.equal(f.app.pendingArchiveReview,p);assert.equal(p.issues.length,0,JSON.stringify(p.issues));assert.equal(p.changes.length,2);assert.equal(JSON.stringify(f.power.archives),archives);assert(p.checkpointSaved);
});
test('failed, invalid or cancelled repair preserves pending candidates',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};
 f.app.model.request=async()=>JSON.stringify({changes:[row]});await f.app.reviewArchives({values:{playerNote:'玩家确认真实资料'}});
 const p=f.app.pendingArchiveReview,old=JSON.stringify(p.data);
 f.app.model.request=async()=>JSON.stringify({repairs:[{index:0,name:'篡改身份',fields:{},details:{}}]});
 await assert.rejects(f.app.repairArchiveWithAI(),/身份或来源/);assert.equal(f.app.pendingArchiveReview,p);assert.equal(JSON.stringify(p.data),old);
 f.app.query=async()=>{throw new DOMException('取消','AbortError');};
 await assert.rejects(f.app.repairArchiveWithAI(),{name:'AbortError'});assert.equal(JSON.stringify(p.data),old);
});
test('still-invalid AI correction stays pending and cannot advance progress',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};let calls=0;
 f.app.model.request=async()=>JSON.stringify(++calls===1?{changes:[row]}:{repairs:[{index:0,fields:{unknown:'仍然未映射'},details:{}}]});
 await f.app.reviewArchives({values:{playerNote:'玩家确认真实资料'}});await f.app.repairArchiveWithAI();
 assert(f.app.pendingArchiveReview.issues.length);assert(f.app.pendingArchiveReview.readOnly);assert.equal(Object.keys(f.power.archives||{}).length,0);
});

test('worldbook region duplicate related is AI-repaired and same batch can finish',async()=>{
 const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.showTaishiBuild=()=>{};f.app.ui.showTaishiStructure=()=>{};f.app.ui.showAIWorldbooks=()=>{};f.app.ui.showArchiveReview=()=>{};f.app.ui.setTaishiLayout=()=>{};
 f.app.openTaishiStructure();await f.app.saveTaishiStructure({mode:'single',worldName:'主星'});
 f.ctx.loadWorldInfo=async()=>({entries:{1:{uid:1,comment:'【地域】迷雾诸洲',content:'【地域】迷雾诸洲\n所属世界：主星。存在安居庭与归名神庭。'}}});
 await f.store.transact(s=>{s.powers[f.app.powerId].taishiBuildReferences={mode:'manual',books:[{name:'书',entryIds:['1']}]};});
 const bad={type:'environment',recordId:'region',name:'迷雾诸洲',status:'active',sourceIndex:-1,fields:{conditions:'已存在',related:'安居庭'},details:{world:'主星',overview:'既有地域',related:'归名神庭'}};
 let calls=0;f.app.model.request=async prompt=>{calls++;if(calls===1)return JSON.stringify({changes:[bad,{type:'record',recordId:'available',name:'可用知识',status:'active',sourceIndex:-1,fields:{description:'已有知识'},details:{current:'已有知识'}}]});
 const input=JSON.parse(prompt.user);assert.equal(input.referencePacket.books.length,1);assert(!input.attachedWorldbooks);assert.equal(input.failed.length,1);assert.equal(input.failed[0].candidate.name,'迷雾诸洲');
 return JSON.stringify({repairs:[{index:0,fields:{conditions:'已存在',related:'安居庭；归名神庭'},details:{world:'主星',overview:'既有地域'},settingRefs:[{book:'书',id:'1'}]}]});};
 await f.app.initializeTaishi();await f.app.runTaishiBuild();assert(f.app.pendingArchiveReview.issues[0].conflicts.length);
 const first=f.app.pendingArchiveReview;await f.app.commitArchiveReview(first,new Map(first.changes.map((c,i)=>[i,c.id])));assert.equal(f.app.pendingArchiveReview.data.changes.length,1);
 await f.app.repairArchiveWithAI();const pending=f.app.pendingArchiveReview;assert.equal(pending.issues.length,0,JSON.stringify(pending.issues));assert(pending.changes[0].specific.fields.source_profile);
 await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,i)=>[i,c.id])));
 assert.equal(f.store.read().powers[f.app.powerId].taishiBuild.next,1);assert.equal(calls,2);
});
import {WorkbenchUI} from '../src/ui.js';
test('repair action is visible before technical details and states API cost',()=>{
 const ui=Object.create(WorkbenchUI.prototype);let html='';ui.dialog=(title,body)=>{html=body;};
 ui.showArchiveReview({...pending(),changes:[],floorReviews:[],terminalResults:[],creationResults:[],readOnly:true},{name:'测试',archives:{}},[]);
 assert(html.includes('data-action="repair-archive-ai"'));assert(html.includes('消耗 API'));assert(html.indexOf('repair-archive-ai')<html.indexOf('查看未通过的条目'));
});

test('ordinary repair ignores empty optional references, preserves originals and blocks real or malformed source changes',()=>{
 const f=fixture(),p=pending();p.data.changes[0]={...p.data.changes[0],settingRefs:[{book:'原引用',id:'1'}]};
 for(const refs of [[],null,undefined]){
  const result=applyArchiveRepairResponse(p,{repairs:[{index:0,fields:{description:'真实资料；补充事实'},details:{},settingRefs:refs}]});
  assert.deepEqual(result.data.changes[0].settingRefs,p.data.changes[0].settingRefs);assert.equal(result.attempted.length,1);
 }
 for(const refs of [[{book:'其他书',id:'2'}],{},'',false])assert.throws(()=>applyArchiveRepairResponse(p,{repairs:[{index:0,fields:{description:'真实资料'},details:{},settingRefs:refs}]}),/普通整理不能更换世界书来源/);
 const payload=archiveRepairPrompt(p,f.power);assert.equal(JSON.parse(payload.user).setupReferences,false);assert(!payload.system.includes('"settingRefs"'));assert(payload.system.includes('必须省略 settingRefs'));
 p.setupReferences=true;const prompt=archiveRepairPrompt(p,f.power,{payload:{books:[{name:'书',entries:[]}]}});assert.equal(JSON.parse(prompt.user).setupReferences,true);assert(prompt.system.includes('settingRefs:[{book,id,part}]'));
});
test('AI ordinary repair with empty reference placeholder revalidates successfully without writing archives',async()=>{
 const f=fixture();f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};let calls=0;
 f.app.model.request=async()=>JSON.stringify(++calls===1?{changes:[row]}:{repairs:[{index:0,fields:{description:'真实资料；补充事实'},details:{},settingRefs:[]}]});
 await f.app.reviewArchives({values:{playerNote:'玩家确认真实资料与补充事实'}});const old=JSON.stringify(f.store.read().powers[f.app.powerId].archives);
 await f.app.repairArchiveWithAI();assert.equal(calls,2);assert.equal(f.app.pendingArchiveReview.issues.length,0);assert.equal(f.app.pendingArchiveReview.changes.length,1);assert(!Object.hasOwn(f.app.pendingArchiveReview.data.changes[0],'settingRefs'));assert.equal(JSON.stringify(f.store.read().powers[f.app.powerId].archives),old);
});
