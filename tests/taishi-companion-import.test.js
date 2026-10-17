import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {clone} from '../src/core.js';
import {WorkbenchUI} from '../src/ui.js';
import {archivePrompt} from '../src/archive-review.js';
test('companion worldbook entry opens without AI, selection is explicit and stays independent',async()=>{
 const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';
 f.app.ui.showAIWorldbooks=()=>{};f.app.ui.readReferenceChoices=()=>new Map();
 f.ctx.getWorldInfoNames=()=>['人物设定'];f.ctx.loadWorldInfo=async()=>({entries:{8:{uid:8,comment:'【人物】云岚',content:'云岚是一位照料药圃的灵植师。'}}});
 const before=clone(f.store.read());let calls=0;f.app.model.request=async()=>{calls++;throw Error('unexpected');};
 await f.app.openAIWorldbooks({taishiPowerId:f.app.powerId,companionImport:true});
 await f.app.referenceBook('人物设定');const d=f.app.referenceDraft;
 assert.deepEqual(d.config.books[0].entryIds,[]);assert.deepEqual(f.store.read(),before);assert.equal(calls,0);
 f.app.ui.readReferenceChoices=()=>new Map([['人物设定',['8']]]);
 let request;f.app.reviewArchives=async options=>{request=options;};
 await f.app.saveAIWorldbooks();
 assert.equal(request.taishiDraft.joining,'direct');assert.equal(request.taishiDraft.kind,'companion');
 assert.equal(request.referenceBatch.characters,'云岚是一位照料药圃的灵植师。'.length);
 assert.deepEqual(f.store.read(),before);assert.equal(calls,0);assert.equal(f.app.referenceDraft,null);
});
test('empty companion selection retains the picker and makes no request',async()=>{
 const f=fixture();await f.app.openTaishi();f.app.ui.showAIWorldbooks=()=>{};f.app.ui.readReferenceChoices=()=>new Map();
 await f.app.openAIWorldbooks({taishiPowerId:f.app.powerId,companionImport:true});
 let requested=false;f.app.reviewArchives=async()=>{requested=true;};await f.app.saveAIWorldbooks();
 assert.match(f.app.referenceDraft.error,/请选择/);assert.equal(requested,false);
});
test('companion picker clearly labels the paid action and does not claim to save shared settings',()=>{
 const ui=Object.create(WorkbenchUI.prototype);let title,html;ui.dialog=(t,h)=>{title=t;html=h;};
 ui.showAIWorldbooks({taishiPowerId:'p',companionImport:true,loading:false,config:{mode:'manual',books:[]},loaded:new Map(),names:[]},null);
 assert.match(title,/录入眷属/);assert.match(html,/生成眷属候选（消耗 API）/);assert.match(html,/确认保存才加入/);
});
test('single person import on a large archive carries bounded relevant details and all identities',async()=>{
 const f=fixture();await f.app.openTaishi();const state=clone(f.store.read()),power=state.powers[f.app.powerId];power.archives={};
 for(let i=0;i<400;i++){
  const name=i===399?'云岚':'已有对象'+i;
  power.archives['large_'+i]={id:'large_'+i,type:'member',name,status:'active',fields:{role:'已确认职责'},source:{type:'manual',note:'固定测试资料'},history:[],specific:{adapterId:'wuku.primordial_world',recordId:'companion',fields:{profile:'已有设定内容'.repeat(450),appearance:'已有外貌内容'.repeat(300),source_profile:'不应重复发送'.repeat(1000)}}};
 }
 const before=JSON.stringify(power),referenceBatch={payload:{books:[{name:'人物书',entries:[{title:'【人物】云岚',content:'云岚是一位灵植师。'.repeat(700)}]}]}};
 const prompt=archivePrompt(power,[],f.ctx.chat,'从所选世界书录入云岚',{state,referenceBatch,taishiDraft:{kind:'companion',joining:'direct'}}),payload=JSON.parse(prompt.user);
 assert(prompt.user.length<120000);assert.equal(payload.current.length,400);
 assert(payload.current.find(r=>r.archiveId==='large_399').details.profile);
 assert(payload.current.find(r=>r.archiveId==='large_0').identityOnly);
 assert.deepEqual(payload.recordSchemas.map(r=>r.id),['companion']);
 assert(!prompt.user.includes('不应重复发送'));assert.equal(JSON.stringify(power),before);
 assert.match(payload.readingPolicy,/不创作补全/);
});
test('picker runs the actual query and validation chain; references retained and joining requires save',async()=>{
 const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';
 f.app.ui.showAIWorldbooks=()=>{};f.app.ui.showArchiveReview=()=>{};f.app.ui.readReferenceChoices=()=>new Map();
 f.ctx.getWorldInfoNames=()=>['人物设定'];f.ctx.loadWorldInfo=async()=>({entries:{8:{uid:8,comment:'【人物】云岚',content:'云岚是一位照料药圃的灵植师。'},9:{uid:9,comment:'另一人物',content:'不得夹带的未选人物。'}}});
 await f.store.transact(s=>{s.aiWorldbooks={mode:'manual',books:[{name:'不应读取的共享参考',entryIds:['99']}]};});
 const before=clone(f.store.read());let calls=0,wire;
 f.app.model.request=async prompt=>{calls++;wire=JSON.parse(prompt.user);return JSON.stringify({changes:[{name:'云岚',type:'member',status:'active',fields:{role:'灵植师'},recordId:'companion',details:{profile:'云岚是一位照料药圃的灵植师。'},sourceIndex:-1,settingRefs:[{book:'人物设定',id:'8',part:1}]}]});};
 await f.app.openAIWorldbooks({taishiPowerId:f.app.powerId,companionImport:true});await f.app.referenceBook('人物设定');
 f.app.ui.readReferenceChoices=()=>new Map([['人物设定',['8']]]);await f.app.saveAIWorldbooks();
 assert.equal(calls,1);assert.equal(wire.attachedWorldbooks.books.length,1);assert.equal(wire.attachedWorldbooks.books[0].entries.length,1);
 assert.equal(wire.attachedWorldbooks.books[0].name,'人物设定');assert(!JSON.stringify(wire).includes('不得夹带'));
 const pending=f.app.pendingArchiveReview;assert(pending);assert.equal(pending.issues.length,0,JSON.stringify(pending.issues));assert.equal(pending.changes.length,1);
 assert.match(pending.changes[0].specific.fields.source_profile,/云岚是一位照料药圃/);
 assert.equal(pending.taishiDraft.joining,'direct');assert.deepEqual(f.store.read(),before);
 await f.app.commitArchiveReview(pending,new Map([[0,null]]));const p=f.store.read().powers[f.app.powerId],person=Object.values(p.archives).find(r=>r.name==='云岚');
 assert(person);assert.equal(p.taishiPeople.joining[person.id],'direct');assert.match(person.specific.fields.source_profile,/云岚是一位照料药圃/);
 // A previously registered ordinary person must upgrade through this same explicit entrance.
 await f.store.transact(s=>{const p=s.powers[f.app.powerId];p.taishiPeople.joining[person.id]='npc';p.archives[person.id].specific.fields.relationship='普通人物；未缔约';p.archives[person.id].fields.role='灵植师';});
 f.app.model.request=async()=>{calls++;return JSON.stringify({changes:[{archiveId:person.id,name:'云岚',type:'member',status:'active',fields:{role:'灵植师'},recordId:'companion',details:{profile:'云岚是一位照料药圃的灵植师。'},sourceIndex:-1,settingRefs:[{book:'人物设定',id:'8',part:1}]}]});};
 f.app.ui.readReferenceChoices=()=>new Map();await f.app.openAIWorldbooks({taishiPowerId:f.app.powerId,companionImport:true});await f.app.referenceBook('人物设定');f.app.ui.readReferenceChoices=()=>new Map([['人物设定',['8']]]);await f.app.saveAIWorldbooks();
 const again=f.app.pendingArchiveReview;assert.equal(again.issues.length,0,JSON.stringify(again.issues));
 assert.equal(f.store.read().powers[f.app.powerId].taishiPeople.joining[person.id],'npc');
 await f.app.commitArchiveReview(again,new Map([[0,person.id]]));const updated=f.store.read().powers[f.app.powerId];
 assert.equal(Object.values(updated.archives).filter(r=>r.name==='云岚').length,1);assert.equal(updated.taishiPeople.joining[person.id],'direct');assert.match(updated.archives[person.id].specific.fields.relationship,/确认/);assert.equal(calls,2);
});
