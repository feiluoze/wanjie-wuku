import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './mvu-fixture.js';
import {saveArchive,archiveSource,sceneArchiveContext} from '../src/archives.js';
import {memoryPlan} from '../src/archive-memory.js';
import {archivePrompt,archiveSources,normalizeArchiveChanges,applyArchiveChanges} from '../src/archive-review.js';
import {rollbackStoryRecords} from '../src/archive-branch.js';
import {creationPrompt} from '../src/creation.js';
import {clone,hash,storyText,stable} from '../src/core.js';
import {taishiScope,taishiProjection,TAISHI_KNOWLEDGE_POLICY} from '../src/taishi-context.js';

async function setup(){
 const f=fixture();await f.app.openTaishi();f.state=clone(f.store.read());f.power=f.state.powers[f.app.powerId];
 const add=(name,type,kind,fields,source=archiveSource(f.ctx.chat,'玩家建档'))=>saveArchive(f.power,{name,type,status:'active',fields:{[type==='member'?'role':'conditions']:'已有职责与环境'},specific:{adapterId:'wuku.primordial_world',recordId:kind,version:'1.2.0',label:kind,fields,labels:Object.fromEntries(Object.keys(fields).map(k=>[k,k]))}},source);
 f.world=add('海蓝界','environment','world',{overview:'海商文明',clock:'第九年'});
 f.other=add('赤砂界','environment','world',{overview:'异界专属秘密轮廓'});
 f.person=add('云岚','member','companion',{world:'海蓝界',location:'灵圃',role:'灵植师',action:'采集',knowledge:'已知：亲历灵圃受损；未知：仓库密码；误信：听商人说赤潮已退',goals:'秘密目标标记',social:'秘密社交标记',recent_memory:'私人近期标记',settled_memory:'私人沉淀标记',core_memory:'私人核心标记'});
 f.stranger=add('砂舟','member','companion',{world:'赤砂界',action:'异界人物行动标记'});
 f.config={auto:true,budget:12000,selections:{}};return f;
}

test('event preset reuses existing fields for causes, history and rumors without extra configuration',async()=>{
 const f=await setup(),prompt=archivePrompt(f.power,[],f.ctx.chat),payload=JSON.parse(prompt.user),event=payload.recordSchemas.find(r=>r.id==='event');
 assert.match(prompt.system,/事件、历史与信息边界/);assert.match(prompt.system,/有人传说某事只证明传播发生/);assert.match(prompt.system,/事件结束不代表成果失去/);assert.match(event.fields.find(f=>f.id==='overview').description,/明确起因/);assert.match(event.fields.find(f=>f.id==='result').description,/传闻/);
 assert(!payload.recordSchemas.some(r=>['rumor','legend','history'].includes(r.id)));
});

test('event progress and closure preserve one identity and revert with its source without changing uninformed people',async()=>{
 const f=await setup();f.ctx.chat[0].mes='海蓝界港口封锁已经开始。';
 const event=saveArchive(f.power,{name:'港口封锁',type:'record',status:'working',fields:{description:'封锁进行中'},specific:{adapterId:'wuku.primordial_world',version:'1.4.2',recordId:'event',label:'事件',labels:{world_id:'所属世界ID',world:'所属世界',overview:'当前概况',result:'实际结果'},fields:{world_id:f.world.id,world:'海蓝界',overview:'港口开始封锁',result:'封锁仍在进行'}}},archiveSource(f.ctx.chat,'玩家确认事件已开始'));
 const knowledge=f.power.archives[f.person.id].specific.fields.knowledge;
 f.ctx.chat.push({is_user:false,swipe_id:0,mes:'海蓝界港口封锁已解除，货运恢复。'});const sources=archiveSources(f.ctx.chat,f.state,f.power);
 const rows=[{archiveId:event.id,type:'record',name:event.name,status:'ended',fields:{description:'封锁结束'},recordId:'event',details:{result:'封锁解除，货运恢复'},sourceIndex:f.ctx.chat.length-1,quote:'海蓝界港口封锁已解除，货运恢复。'}];
 const changes=normalizeArchiveChanges({changes:rows},f.power,sources,f.ctx.chat);applyArchiveChanges(f.power,changes,sources,new Map([[0,event.id]]),f.ctx.chat);
 const again=normalizeArchiveChanges({changes:rows},f.power,sources,f.ctx.chat);applyArchiveChanges(f.power,again,sources,new Map(again.map((c,i)=>[i,c.id])),f.ctx.chat);
 assert.equal(Object.values(f.power.archives).filter(r=>r.specific?.recordId==='event').length,1);assert.equal(f.power.archives[event.id].history.length,1);assert.equal(f.power.archives[event.id].status,'ended');assert.equal(f.power.archives[f.person.id].specific.fields.knowledge,knowledge);
 f.ctx.chat.pop();rollbackStoryRecords(f.state,f.ctx.chat);assert.equal(f.power.archives[event.id].status,'working');assert.equal(f.power.archives[event.id].specific.fields.result,'封锁仍在进行');
});

test('explicit world or person names select their world; unknown scope sends no automatic global overview',async()=>{
 const f=await setup();for(const query of ['去海蓝界看看','找云岚说话']){
  const plan=memoryPlan(f.state,f.ctx.chat,query,f.config);assert(plan.packet.includes('海商文明'));assert.equal(plan.packet.includes('云岚'),query.includes('云岚'));assert(!plan.packet.includes('异界专属'));assert(!plan.packet.includes('砂舟'));assert(plan.omitted.some(r=>/范围/.test(r.reason)));
 }
 assert.equal(memoryPlan(f.state,f.ctx.chat,'继续旅行',f.config).packet,'');
 const scope=taishiScope(f.power,Object.values(f.power.archives),'海蓝界和赤砂界');assert(scope.includes(f.world)&&scope.includes(f.stranger));
 assert.equal(taishiScope(fixture().power,[],'海蓝界'),null);
});

test('automatic projection keeps per-person known unknown and rumor sources but omits all private memories',async()=>{
 const f=await setup(),before=stable(f.power),plan=memoryPlan(f.state,f.ctx.chat,'云岚',f.config);
 assert(plan.packet.includes(f.person.specific.fields.knowledge));assert(plan.packet.includes('不是角色共同知识'));assert(plan.packet.includes('传闻保留传闻身份与来源'));
 for(const word of ['私人近期标记','私人沉淀标记','私人核心标记','秘密目标标记','秘密社交标记'])assert(!plan.packet.includes(word));
 assert.equal(stable(f.power),before);assert(!('history' in taishiProjection(f.person)));
});

test('explicit next and pinned may send full private fields as narrator data; people pins do not opt into memory',async()=>{
 const f=await setup();f.power.taishiPeople={mode:'selected',selected:[],pinned:[f.stranger.id],joining:{[f.stranger.id]:'direct'}};
 assert(!memoryPlan(f.state,f.ctx.chat,'海蓝界',f.config).packet.includes('砂舟'));
 for(const mode of ['next','pinned']){
  const config={...f.config,auto:false,selections:{[f.power.id+'/'+f.person.id]:{mode,token:'test'}}},p=memoryPlan(f.state,f.ctx.chat,'赤砂界',config);
  assert(p.packet.includes('私人核心标记'));assert(p.packet.includes('仍不向其他角色公开'));assert(!p.packet.includes('异界专属'));
 }
 const excluded={...f.config,selections:{[f.power.id+'/'+f.person.id]:{mode:'exclude'}}};assert(!memoryPlan(f.state,f.ctx.chat,'海蓝界',excluded).packet.includes('灵植师'));
});

test('scope and explicit memory cannot reintroduce a rerolled source',async()=>{
 const f=await setup(),body=storyText(f.ctx.chat[0].mes);
 f.person=saveArchive(f.power,{...f.person,fields:{role:'旧分支人物独有标记'}},{type:'story',anchor:{index:0,swipeId:0,length:body.length,textHash:hash(body)}});
 f.ctx.chat[0].swipe_id=1;const config={...f.config,selections:{[f.power.id+'/'+f.person.id]:{mode:'pinned'}}};
 const plan=memoryPlan(f.state,f.ctx.chat,'海蓝界',config);assert(!plan.packet.includes('旧分支人物独有标记'));assert(plan.omitted.some(r=>/来源/.test(r.reason)));
 assert(!sceneArchiveContext(f.power,f.ctx.chat,'海蓝界').items.some(r=>r.id===f.person.id));
});

test('scene context and creation prompts use the same projection without rehydrating private fields',async()=>{
 const f=await setup(),scene=sceneArchiveContext(f.power,f.ctx.chat,'云岚');
 assert(scene.items.some(r=>r.id===f.person.id));assert(scene.excludedScopeCount===2);assert.equal(scene.omittedCount,0);assert(!JSON.stringify(scene).includes('私人核心标记'));
 const result=creationPrompt(f.power,f.ctx.chat,'请云岚修复海蓝界灵圃'),payload=JSON.parse(result.prompt.user);
 assert(payload.current.some(r=>r.id===f.person.id&&r.informationBoundary));assert(!result.prompt.user.includes('私人核心标记'));assert(!result.prompt.user.includes('异界人物行动标记'));
 assert.equal(result.sources[f.person.id],hash(stable(f.person)));assert(payload.contextSummary.informationPolicy);
});

test('basic and advanced share the knowledge policy and schema with the expanded person setting contract',async()=>{
 const f=await setup(),prompt=archivePrompt(f.power,[],f.ctx.chat,'继续世界发展');
 assert(prompt.system.includes(TAISHI_KNOWLEDGE_POLICY));const input=JSON.parse(prompt.user);assert.equal(input.informationPolicy,TAISHI_KNOWLEDGE_POLICY);
 const fields=input.recordSchemas.find(r=>r.id==='companion').fields;assert.equal(fields.length,31);assert(fields.find(r=>r.id==='knowledge').description.includes('获知途径'));
 assert(input.current.some(r=>r.id===f.person.id&&r.specific.fields.core_memory==='私人核心标记')); // Archive maintenance still sees full player data.
});

test('compact feedback obeys budget and keeps whole records; legacy non-Taishi feedback is unchanged',async()=>{
 const f=await setup();f.world.specific.fields.overview='海商文明'.repeat(1000);const small=memoryPlan(f.state,f.ctx.chat,'海蓝界',{...f.config,taishi:{world:{auto:true,budget:750},people:{auto:true,budget:750}}});assert(small.packet.length<=750);assert(small.omitted.some(r=>/预算/.test(r.reason)));
 const legacy=fixture();saveArchive(legacy.power,{name:'药圃',type:'environment',status:'active',fields:{conditions:'传统概况保持'}},archiveSource(legacy.ctx.chat,'手工'));
 assert(memoryPlan(legacy.state,legacy.ctx.chat,'',f.config).packet.includes('传统概况保持'));
});

