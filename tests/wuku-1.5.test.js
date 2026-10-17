import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,roleOperation} from './mvu-fixture.js';
import {archivePrompt} from '../src/archive-review.js';
import {archiveInputRecord} from '../src/archive-input.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {clone,normalizeOperation,applyOperation,hash,stable} from '../src/core.js';
import {receiptStatus} from '../src/receipt-status.js';
import {WorkbenchUI} from '../src/ui.js';
test('large ordinary supplement runs query, previews, saves a partial patch and never changes balances',async()=>{
 const f=fixture();f.app.powerId=f.power.id;f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};
 await f.store.transact(s=>{const p=s.powers[f.power.id];for(let i=0;i<350;i++)saveArchive(p,{name:'设施编号'+i+'甲',type:'facility',status:'active',fields:{purpose:'既有功能'+String(i)+'字'.repeat(800),condition:'正常'}},archiveSource(f.ctx.chat,'玩家登记'));});
 const original=clone(f.store.read()),power=original.powers[f.power.id],target=Object.values(power.archives)[10];let calls=0,wire;
 assert(JSON.stringify(Object.values(power.archives).map(archiveInputRecord)).length>120000);
 f.app.model.request=async prompt=>{calls++;wire=JSON.parse(prompt.user);return JSON.stringify({changes:[{archiveId:target.id,name:target.name,type:'facility',status:'active',fields:{condition:'已修复'},sourceIndex:-1}]});};
 await f.app.reviewArchives({supplement:true,values:{playerNote:target.name+'已修复。'}});
 assert.equal(calls,1);assert(wire.current.length===350);assert(!wire.current.find(r=>r.archiveId===target.id).identityOnly);assert(wire.current.some(r=>r.identityOnly));assert(JSON.stringify(wire).length<120000);
 assert.deepEqual(f.store.read(),original);const pending=f.app.pendingArchiveReview;assert.equal(pending.issues.length,0,JSON.stringify(pending.issues));
 await f.app.commitArchiveReview(pending,new Map([[0,target.id]]));const p=f.store.read().powers[f.power.id];
 assert.equal(p.archives[target.id].fields.condition,'已修复');assert.equal(p.archives[target.id].fields.purpose,target.fields.purpose);assert.equal(Object.keys(p.archives).length,350);assert.deepEqual(p.resources,power.resources);assert.deepEqual(p.assets,power.assets);
});
test('many explicitly relevant records still fit a bounded detail budget without editing their fields',()=>{
 const f=fixture();for(let i=0;i<90;i++)saveArchive(f.power,{name:'试验台'+i+'甲',type:'facility',status:'active',fields:{purpose:'字'.repeat(3500)}},archiveSource(f.ctx.chat,'登记'));
 const before=JSON.stringify(f.power),note=Object.values(f.power.archives).map(r=>r.name).join('、');const p=archivePrompt(f.power,[],f.ctx.chat,note);
 assert(p.inputCharacters.current<=80000);assert(JSON.parse(p.user).current.some(r=>r.identityOnly));assert.equal(JSON.stringify(f.power),before);
});
test('preflight overlong rules and malformed response have distinct stages and preserve the state',async()=>{
 const f=fixture();const before=clone(f.store.read());assert.throws(()=>archivePrompt({...f.power,rules:'字'.repeat(130000)},[],[], '补充已有事实'),e=>e.requestStage==='preflight'&&e.message.includes('尚未调用模型'));
 f.app.settings.mode='st';f.app.model.request=async()=>'{"changes":[';
 await assert.rejects(f.app.query({system:'s',user:'{}'},f.app.contextSnapshot()),e=>e.requestStage==='response');assert.deepEqual(f.store.read(),before);
 f.app.model.request=async()=>{throw Error('固定网络失败');};await assert.rejects(f.app.query({system:'s',user:'{}'},f.app.contextSnapshot()),e=>e.requestStage==='transport');assert.deepEqual(f.store.read(),before);
});
test('all malformed effects and nonpositive costs reject before any debit even outside a transaction wrapper',()=>{
 for(const invalid of [{type:'asset_grant',name:'结果',kind:'物资',description:'实际物资',quantity:'bad',permanent:false},{type:'resource_credit',id:'missing',amount:'1'},{type:'field_set',key:'__proto__',label:'状态',value:'值'},{type:'unsupported'}]){
  const f=fixture(),s=f.store.read(),p=s.powers[f.power.id],op=normalizeOperation(roleOperation(f),p,s,hash(stable([])));op.effects=[invalid];const before=clone(s);assert.throws(()=>applyOperation(s,op,hash(stable([])),[]));assert.deepEqual(s,before);
 }
 const f=fixture(),s=f.store.read(),op=normalizeOperation(roleOperation(f),s.powers[f.power.id],s,hash(stable([])));op.costs[0].amount='-1';const before=clone(s);assert.throws(()=>applyOperation(s,op,hash(stable([])),[]));assert.deepEqual(s,before);
});
test('confirmed execution and duplicate retry debit once and keep narrative independently waiting',async()=>{
 const f=fixture();f.app.powerId=f.power.id;f.app.settings.mode='st';f.app.model.request=async()=>JSON.stringify({operations:[roleOperation(f)]});await f.app.generate();const op=clone(f.app.selected);assert(op);
 await f.app.execute({story:'later'});let s=f.store.read();assert.equal(s.transactions.length,1);assert.equal(s.narrativeActions.length,1);assert.equal(Object.values(s.powers[f.power.id].resources)[0].balance,'0');
 const before=clone(s);f.app.selected=op;await f.app.execute({story:'later'});s=f.store.read();assert.equal(s.transactions.length,1);assert.equal(s.narrativeActions.length,1);assert.deepEqual(s.powers,before.powers);
 assert.deepEqual(receiptStatus(s,s.transactions[0]).stages,['账本已结算','正文待承接']);
});
test('two concurrent confirmation clicks cannot debit or deliver twice',async()=>{
 const f=fixture();f.app.powerId=f.power.id;f.app.settings.mode='st';f.app.model.request=async()=>JSON.stringify({operations:[roleOperation(f)]});await f.app.generate();
 const outcomes=await Promise.allSettled([f.app.execute({story:'later'}),f.app.execute({story:'later'})]);const s=f.store.read();
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(s.transactions.length,1);assert.equal(s.narrativeActions.length,1);assert.equal(Object.values(s.powers[f.power.id].assets).length,1);assert.equal(Object.values(s.powers[f.power.id].resources)[0].balance,'0');
});
test('existing asset starts a goal without model calls or state writes and rejects removed or other module records',async()=>{
 const f=fixture();f.app.powerId=f.power.id;await f.store.transact(s=>{s.powers[f.power.id].assets.a={id:'a',name:'已有掌法',kind:'能力',description:'已有力量',permanent:true,quantity:'1'};});const before=clone(f.store.read());let calls=0;f.app.model.request=async()=>{calls++;};f.app.prepareAssetGoal('a');assert.match(f.app.ui.goal,/已有掌法/);assert.match(f.app.ui.goal,/不将它作为消耗品/);assert.equal(f.app.ui.tab,'operations');assert.equal(calls,0);assert.deepEqual(f.store.read(),before);assert.throws(()=>f.app.prepareAssetGoal('not-present'));
});
test('receipt stages distinguish ledger, pending variables and narration; inventory help is folded',()=>{
 const tx={id:'x',type:'operation'},s={roleWrites:[{id:'x',status:'pending'}],narrativeActions:[{id:'x',status:'waiting'}]};assert.deepEqual(receiptStatus(s,tx),{stages:['账本已结算','角色待同步','正文待承接'],pendingRole:true});
 const f=fixture(),ui=Object.create(WorkbenchUI.prototype);f.power.assets={a:{id:'a',name:'已掌握能力',kind:'能力',description:'完整说明'.repeat(60),quantity:'1',permanent:true}};const html=ui.assets(f.power);assert.match(html,/能力与永久所得/);assert.match(html,/data-action="asset-goal"/);assert.match(html,/<details><summary>完整效果/);assert.match(html,/登记与使用说明/);
});
