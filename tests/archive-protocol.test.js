import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceParts,canonicalFields,floorCoverage,assertSnapshotPatch,assertFactEvidence} from '../src/archive-protocol.js';
import {ARCHIVE_FIELDS,archiveCurrent,saveArchive,archiveSource} from '../src/archives.js';
import {archivePrompt,archiveSources,normalizeArchiveBatch,normalizeArchiveChanges,applyArchiveChanges} from '../src/archive-review.js';
import {resolveArchiveEvidence} from '../src/archive-evidence.js';
import {foreignArchiveOwner} from '../src/archive-ownership.js';
import {CREATION_PRESETS} from '../src/creation-presets.js';
import {RuntimeLog} from '../src/runtime-log.js';
import {fixture} from './mvu-fixture.js';
import {createPower,stable,clone,validateState} from '../src/core.js';
import {completeReview} from './review-response-fixture.js';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {creationConfig} from '../src/creation-config.js';

test('protocol separates planning, receipts, snapshots and unchosen opportunities for any names',()=>{
 const value='<story_driver><nested>规划：将获得仓库</nested></story_driver><combat_driver>预计获胜</combat_driver><acg_think>生成建议</acg_think>实际已经到达港口。<WJWK-settle>本轮收益：\n1. 【甲系统】取得工具一件 -- 已到账\n后续机会：\n前往矿区</WJWK-settle><WJWK-status>【甲系统·总览】\n库存：工具一件</WJWK-status><WJWK-option>立即采矿</WJWK-option>';
 const parts=evidenceParts(value);assert.equal(parts.body,'实际已经到达港口。');assert.match(parts.settlements[0].facts,/工具一件/);assert.doesNotMatch(parts.settlements[0].facts,/前往矿区/);assert.match(parts.settlements[0].opportunities,/前往矿区/);assert.equal(parts.statusSnapshots.length,1);
 assert.equal(evidenceParts('<story_driver>未闭合的规划').body,'');
});
test('separate module protocols use the same evidence path instead of remaining in prose',()=>{
 const parts=evidenceParts('普通事实<MMLC-settle>修行已完成</MMLC-settle><MMLC-state>境界保持不变</MMLC-state><CUSTOM-settle>工具已交付\n下一步：尚未选择</CUSTOM-settle>');
 assert.equal(parts.body,'普通事实');assert.equal(parts.settlements.length,2);assert.equal(parts.settlements[0].protocol,'MMLC-settle');assert.deepEqual(parts.statusSnapshots,['境界保持不变']);assert.doesNotMatch(parts.settlements[1].facts,/尚未选择/);
});

test('MMLC long-term archives are current snapshots and cannot clear known facts by omission',()=>{
 const source='到达港口。<MMLC-settle>本轮新产出：灵材两份</MMLC-settle><MMLC-state>境界：筑基</MMLC-state><MMLC-archive>旧库存：灵材十份</MMLC-archive>';
 const parts=evidenceParts(source);assert.equal(parts.body,'到达港口。');assert.deepEqual(parts.statusSnapshots,['境界：筑基','旧库存：灵材十份']);assert.equal(parts.settlements.length,1);assert.doesNotMatch(parts.settlements[0].facts,/十份/);
 assert.throws(()=>assertSnapshotPatch({fields:{description:'已保存灵材十份'}},{description:'暂无'},{},'旧库存：暂无','<MMLC-archive>旧库存：暂无</MMLC-archive>'),/快照不能/);
 assert.doesNotThrow(()=>assertFactEvidence('旧库存：灵材十份',source));
 const f=fixture();f.ctx.chat[0].mes=source;const prompt=archivePrompt(f.power,archiveSources(f.ctx.chat,f.state,f.power),f.ctx.chat),input=JSON.parse(prompt.user);assert.deepEqual(input.sources[0].statusSnapshots,parts.statusSnapshots);assert.doesNotMatch(input.sources[0].content,/旧库存/);assert.match(prompt.system,/总档.*旧库存/);
});
test('prompt uses structured evidence and does not require floor reports for ordinary powers',()=>{
 const f=fixture();f.ctx.chat[0].mes+='<story_driver>规划不应发送</story_driver><WJWK-settle>实际取得甲成果</WJWK-settle>';
 const sources=archiveSources(f.ctx.chat,f.state,f.power),stamp=stable(sources),p=JSON.parse(archivePrompt(f.power,sources,f.ctx.chat).user);
 assert.doesNotMatch(JSON.stringify(p.sources),/规划不应发送/);assert.match(p.sources[0].settlements[0].facts,/甲成果/);assert.equal(p.responseContract.floorReviews,undefined);assert.equal(stable(sources),stamp);
 const old=saveArchive(f.power,{type:'record',name:'已有档案',status:'active',fields:{description:'玩家确认'}},archiveSource(f.ctx.chat,'已有记录'));assert.equal(archiveCurrent(old,f.ctx.chat),true);
});
test('all declared adapters accept dedicated IDs and Chinese labels in the correct namespace',()=>{
 let count=0;
 for(const adapter of CREATION_PRESETS)for(const definition of adapter.records){
  const input={type:'record',recordId:definition.id,fields:Object.fromEntries(definition.fields.filter(f=>f.id!=='source_profile').map(f=>[f.label,'实际确认的值']))};
  const normalized=canonicalFields(input,ARCHIVE_FIELDS,definition);
  for(const field of definition.fields.filter(f=>f.id!=='source_profile')){
   if(Object.values(ARCHIVE_FIELDS.record).includes(field.label))assert.ok(Object.values(normalized.fields).includes('实际确认的值'));
   else assert.equal(normalized.details[field.id],'实际确认的值');
  }
  const explicit=canonicalFields({type:'record',fields:{description:'确认的简介'},details:Object.fromEntries(definition.fields.filter(f=>f.id!=='source_profile').map(f=>[f.label,'已确认']))},ARCHIVE_FIELDS,definition);
  for(const field of definition.fields.filter(f=>f.id!=='source_profile'))assert.equal(explicit.details[field.id],'已确认');
  assert.ok(Object.keys(normalized.fields).length);count++;
 }
 assert.ok(count>100);
});
test('field normalization never guesses unknown keys or silently resolves contradictory aliases',()=>{
 assert.throws(()=>canonicalFields({type:'skill',fields:{随意新增字段:'值'}},ARCHIVE_FIELDS),/不在声明中/);
 assert.throws(()=>canonicalFields({type:'skill',fields:{level:'甲',已达程度:'乙'}},ARCHIVE_FIELDS),/冲突/);
 const r=canonicalFields({type:'skill',fields:{已达程度:'精通'}},ARCHIVE_FIELDS);assert.deepEqual(r.fields,{level:'精通'});
});
test('unique evidence repairs a wrong valid floor; ambiguity never defaults to latest',()=>{
 const sources=[{index:2,content:'甲事件已经完成。'},{index:8,content:'乙事件已经完成。'}];
 assert.equal(resolveArchiveEvidence(8,'甲事件已经完成',sources).index,2);
 for(const index of [undefined,null,999,'bad'])assert.throws(()=>resolveArchiveEvidence(index,'不明引用',sources),/来源楼层/);
 assert.throws(()=>resolveArchiveEvidence(undefined,'共同事实',[{index:2,content:'共同事实'},{index:8,content:'共同事实'}]),/来源楼层/);
 assert.equal(resolveArchiveEvidence(2,'对事实的概括',sources).index,2);
});
test('all ordinary powers reject explicitly foreign protocol headings even with a false owner declaration',()=>{
 const a={id:'alpha',name:'甲系统',archives:{}},b={id:'beta',name:'乙系统（完整版）',archives:{}},state={powers:{alpha:a,beta:b}};
 assert.equal(foreignArchiveOwner({name:'某成果',ownerPowerId:a.id,quote:'【乙系统·回执】已经交付'},a,state).id,b.id);
 assert.equal(foreignArchiveOwner({name:'乙系统物资交付',ownerPowerId:a.id},a,state),null); // Display prefixes do not establish ownership.
 assert.equal(foreignArchiveOwner({name:'甲系统的乙系统研究',quote:'【甲系统】自身研究'},a,state),null);
});
test('missing floor reports do not block valid changes or force re-reading earlier floors',()=>{
 const f=fixture();f.ctx.chat.push({is_user:true,mes:'继续'},{is_user:false,mes:'第二件工具已交付。'});
 const sources=archiveSources(f.ctx.chat,f.state,f.power),raw={type:'record',name:'第二件工具',status:'active',fields:{description:'已交付'},sourceIndex:2};
 const changes=normalizeArchiveChanges({changes:[raw]},f.power,sources,f.ctx.chat),report=floorCoverage({floorReviews:[{sourceIndex:2,status:'reviewed',changeCount:1}]},sources,changes);
 assert.deepEqual(report.map(r=>r.status),['reviewed','reviewed']);
 const before=stable(f.power.resources);applyArchiveChanges(f.power,changes,sources,new Map([[0,null]]),f.ctx.chat);
 assert.deepEqual(f.power.archiveReviewed.map(r=>r.index),[0,2]);assert.equal(stable(f.power.resources),before);validateState(f.state);
});
test('missing floor reports are accepted; inconsistent optional reports are diagnostic only',()=>{
 const sources=[{index:3,content:'普通叙事'}];assert.equal(floorCoverage({changes:[]},sources,[])[0].status,'reviewed');
 for(const rows of [[{sourceIndex:3,status:'reviewed',changeCount:1}],[{sourceIndex:3,status:'reviewed',changeCount:0},{sourceIndex:3,status:'reviewed',changeCount:0}]])assert.equal(floorCoverage({floorReviews:rows},sources,[])[0].status,'uncertain');
 assert.equal(floorCoverage({floorReviews:[{sourceIndex:3,status:'reviewed',changeCount:0}]},sources,[])[0].status,'reviewed');
});
test('snapshot omissions cannot clear historical facts; explicit narrative corrections remain possible',()=>{
 const before={fields:{description:'曾取得一件工具'},specific:{fields:{result:'已完成一项事件'}}};
 assert.throws(()=>assertSnapshotPatch(before,{description:'暂无'},{} ,'当前成果：暂无','<WJWK-status>当前成果：暂无</WJWK-status>'),/快照不能/);
 assert.throws(()=>assertSnapshotPatch(before,{}, {result:'无'},'当前成果：暂无','<WJWK-status>当前成果：暂无</WJWK-status>'),/快照不能/);
 assert.doesNotThrow(()=>assertSnapshotPatch(before,{description:'暂无'},{} ,'工具已消耗，当前持有暂无。','工具已消耗，当前持有暂无。<WJWK-status>当前成果：暂无</WJWK-status>'));
});
test('quotes solely from planning or unchosen opportunities cannot establish a saved fact',()=>{
 const source='<story_driver>预计取得稀有工具</story_driver><WJWK-settle>本轮收益：取得普通工具\n后续机会：前往东部矿区</WJWK-settle>';
 for(const quote of ['预计取得稀有工具','前往东部矿区'])assert.throws(()=>assertFactEvidence(quote,source),/不能作为/);
 assert.doesNotThrow(()=>assertFactEvidence('取得普通工具',source));
 assert.doesNotThrow(()=>assertFactEvidence('前往东部矿区','已经前往东部矿区。'+source));
});
test('declared adapters retain valid generic facts without guessing a dedicated category',()=>{
 const f=fixture(),p=createPower(builtinEntries().find(e=>e.name==='挂机'));
 assert.ok(creationConfig(p));f.state.powers[p.id]=p;f.ctx.chat[0].mes='挂机已记录旧通用条目的实际任务进展。';
 const data={changes:[{type:'record',name:'旧通用条目',status:'active',fields:{description:'内容'},sourceIndex:0,quote:f.ctx.chat[0].mes}]};
 const batch=normalizeArchiveBatch(data,p,archiveSources(f.ctx.chat,f.state,p),f.ctx.chat,'',f.state,{strictProtocol:true});
 assert.equal(batch.changes.length,1);assert.equal(batch.issues.length,0);assert.equal(batch.changes[0].specific,undefined);
 const invalid=normalizeArchiveBatch({changes:[{...data.changes[0],recordId:'invented',details:{state:'内容'}}]},p,archiveSources(f.ctx.chat,f.state,p),f.ctx.chat,'',f.state,{strictProtocol:true});
 assert.equal(invalid.changes.length,0);assert.equal(invalid.issues.length,1);
 const valid={...data.changes[0],recordId:'shadow',fields:{'行动与伤势':'已部署'}};
 const good=normalizeArchiveBatch({changes:[valid]},p,archiveSources(f.ctx.chat,f.state,p),f.ctx.chat,'',f.state,{strictProtocol:true});
 assert.equal(good.issues.length,0);assert.equal(good.changes[0].specific.fields.state,'已部署');
});
test('partial automatic review saves valid facts without a floor-report gate',async()=>{
 const f=fixture();f.ctx.chat.push({is_user:false,mes:'另一个已完成事实。'});f.app.settings.mode='st';
 await f.store.transact(s=>Object.assign(s.powers[f.power.id],{autoArchiveReview:true,autoArchiveSave:true,autoArchiveStart:0}));
 let calls=0;f.app.model.request=async()=>{calls++;return JSON.stringify({changes:[{type:'record',name:'新事实',status:'active',fields:{description:'已完成'},sourceIndex:1}]});};
 f.app.schedulePlayerReview('normal');clearTimeout(f.app.playerReviewTimer);f.app.playerReviewTimer=null;await f.app.runPlayerReview();
 assert(calls>=1);const p=f.store.read().powers[f.power.id];assert(Object.values(p.archives).some(r=>r.name==='新事实'));assert.match(f.app.archiveAutoStatus[f.power.id],/已保存/);
});
test('default diagnostics export counts and codes without character names or quoted prose',()=>{
 const log=new RuntimeLog({storage:null});const ticket=log.begin('测试');
 log.step(ticket,'校验结果',{accepted:1,issues:[{kind:'成果',name:'私密角色',quote:'私密剧情句子',reason:'档案字段无效'}],skippedOwnership:[{name:'私密名字',ownerName:'私密势力'}]});
 const value=JSON.stringify(log.export());assert.doesNotMatch(value,/私密/);assert.match(value,/invalid_fields/);
});


test('a rejected candidate only blocks its uniquely resolved floor',()=>{
 const f=fixture();f.ctx.chat.push({is_user:true,mes:'继续'},{is_user:false,mes:'第二件工具已交付。'});
 const sources=archiveSources(f.ctx.chat,f.state,f.power);
 const batch=normalizeArchiveBatch({changes:[{type:'record',name:'字段错误候选',status:'active',fields:{invalid:'值'},sourceIndex:2,quote:'第二件工具已交付。'}]},f.power,sources,f.ctx.chat,'',f.state);
 assert.equal(batch.issues.length,1);assert.deepEqual(batch.blockedFloors,[2]);
 const unknown=normalizeArchiveBatch({changes:[{type:'record',name:'来源不明候选',status:'active',fields:{invalid:'值'},sourceIndex:999,quote:'无法唯一定位的引用'}]},f.power,sources,f.ctx.chat,'',f.state);
 assert.deepEqual(unknown.blockedFloors,sources.map(s=>s.index));
});
