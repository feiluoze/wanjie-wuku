import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,clone,stable,emptyState,validateState} from '../src/core.js';
import {setRecordFrameworks} from '../src/record-frameworks.js';
import {archiveTables,tableTarget} from '../src/archive-tables.js';
import {archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {creationConfig} from '../src/creation-config.js';
import {builtinStatusbar} from '../src/builtin-statusbar.js';
import {archiveLibraryPage} from '../src/archive-library.js';
const power=name=>createPower(builtinEntries().find(e=>e.name===name));
const raw=(recordId,name,details,extra={})=>({type:'record',recordId,name,details,status:'active',fields:{description:'正文确认的重要长期事实'},sourceIndex:-1,...extra});
function save(p,rows){const b=normalizeArchiveBatch({changes:rows},p,[],[],'玩家核对的实际事实');assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((r,i)=>[i,r.id])),[]);}
const funds=p=>stable({resources:p.resources,assets:p.assets});

test('pilot: source castle supports farming, people and its original history without a parallel history schema',()=>{
 const p=power('源堡'),before=funds(p),rules=p.rules,statusbar=builtinStatusbar(p);setRecordFrameworks(p,['regions','members','knowledge']);
 assert.deepEqual(archiveTables(p).tables.map(t=>t.id),['records','framework_members','framework_regions']);
 const request=JSON.parse(archivePrompt(p,[],[]).user);assert(request.recordSchemas.some(r=>r.id==='records'));assert(!request.recordSchemas.some(r=>r.id==='framework_knowledge'));assert(!request.recordSchemas.some(r=>r.id==='assets'));assert.equal(request.originalStatusbar.source,statusbar.block);
 save(p,[raw('framework_regions','东区灵田',{kind:'灵田',purpose:'实际已成的灵药栽培区',inputs:'灌溉水源仍不足',outputs:'正文未确认本期收成',people:'艾琳负责'} ,{operation:'insert'}),raw('framework_members','艾琳',{identity:'已明确任命的独立负责人',role:'负责育种',history:'保留既有研究经历'},{operation:'insert'}),raw('records','旧塔历史',{subject:'旧塔之战',content:'确认的撤退路径',time:'原历史节点'},{operation:'insert'})]);
 const field=Object.values(p.archives).find(r=>r.name==='东区灵田'),manager=clone(Object.values(p.archives).find(r=>r.name==='艾琳'));
 save(p,[raw('framework_regions',field.name,{progress:'正文确认灌溉已建成，原灵田扩建完成',inputs:'稳定水源已接通'},{archiveId:field.id,operation:'update'})]);
 assert.equal(Object.keys(p.archives).length,3);assert.equal(p.archives[field.id].specific.fields.outputs,'正文未确认本期收成');assert.deepEqual(p.archives[manager.id],manager);assert.equal(funds(p),before);assert.equal(p.rules,rules);assert.deepEqual(builtinStatusbar(p),statusbar);
});

test('pilot: war network reuses its industry and military schemas; turning a framework off and back on preserves identities and all facts',()=>{
 const p=power('战争天网');setRecordFrameworks(p,['regions','members']);assert.deepEqual(archiveTables(p).tables.map(t=>t.id),['industry','assets']);
 save(p,[raw('industry','北境工厂',{location:'北境',capacity:'真实已成产线',inputs:'现有供给缺口'},{operation:'insert'}),raw('assets','西线舰队',{scale:'实际编制',recovery:'正在修复'},{operation:'insert'})]);
 const old=clone(p.archives),factory=Object.values(p.archives).find(r=>r.name==='北境工厂');setRecordFrameworks(p,['members']);assert.deepEqual(p.archives,old);assert(archiveLibraryPage(p).categories.some(([id])=>id.endsWith('/industry')));
 const request=JSON.parse(archivePrompt(p,[],[]).user);assert(!request.recordSchemas.some(r=>r.id==='industry'));assert(request.recordSchemas.some(r=>r.id==='assets'));assert.throws(()=>tableTarget(p,raw('industry',factory.name,{inputs:'偷偷改写'},{archiveId:factory.id,operation:'update'})),/未启用/);
 setRecordFrameworks(p,['members','regions']);save(p,[raw('industry',factory.name,{inputs:'正文确认供给恢复'},{archiveId:factory.id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,2);assert.equal(p.archives[factory.id].specific.fields.capacity,'真实已成产线');
 const state=emptyState();state.powers[p.id]=p;const restored=validateState(JSON.parse(JSON.stringify(state)));assert.deepEqual(restored.powers[p.id].recordFrameworks,p.recordFrameworks);assert.deepEqual(restored.powers[p.id].archives,p.archives);
});

test('pilot: a combat power uses optional actual abilities with no invented damage, level, currency or automatic reward',()=>{
 const p=power('绝对命中'),before=funds(p),rules=p.rules;setRecordFrameworks(p,['abilities']);assert.deepEqual(archiveTables(p).tables.map(t=>t.id),['framework_abilities']);
 save(p,[raw('framework_abilities','曲射命中运用',{effect:'实际成功让箭矢绕过掩体命中目标',conditions:'仍须真实箭矢作为载体',growth:'正文确认的新运用，不额外追加冷却'},{operation:'insert'})]);
 const row=Object.values(p.archives)[0];save(p,[raw('framework_abilities',row.name,{growth:'同一运用已有新的实际掌握'},{archiveId:row.id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[row.id].specific.fields.conditions,'仍须真实箭矢作为载体');assert.equal(p.archives[row.id].specific.fields.mastery,undefined);assert.equal(funds(p),before);assert.equal(p.rules,rules);
 setRecordFrameworks(p,[]);const request=JSON.parse(archivePrompt(p,[],[]).user);assert(request.recordSchemas.every(r=>r.id.startsWith('statusbar_')));assert.throws(()=>tableTarget(p,raw('framework_abilities',row.name,{effect:'绕过关闭'},{archiveId:row.id})),/未启用/);
 const bypass=normalizeArchiveBatch({changes:[{type:'skill',name:'绕过框架',status:'active',fields:{effect:'编造能力'},sourceIndex:-1}]},p,[],[],'玩家说明');assert.equal(bypass.changes.length,0);assert.equal(bypass.issues.length,1);
 const group=builtinStatusbar(p).groups[0];save(p,[raw(group.id,group.title,{[group.fields[0].id]:'正文明确的当前在途状态'})]);assert.equal(Object.keys(p.archives).length,2);assert.equal(funds(p),before);
});
