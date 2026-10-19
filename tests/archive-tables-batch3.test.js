import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,emptyState,clone,stable,validateState} from '../src/core.js';
import {creationConfig} from '../src/creation-config.js';
import {ARCHIVE_TABLE_DEFINITIONS} from '../src/archive-table-definitions.js';
import {archiveTables,archiveTablePolicy} from '../src/archive-tables.js';
import {normalizeArchiveBatch,applyArchiveChanges,archivePrompt} from '../src/archive-review.js';
import {archiveLibraryPage} from '../src/archive-library.js';
const entries=builtinEntries(),power=name=>createPower(entries.find(e=>e.name===name));
const raw=(recordId,name,details,extra={})=>({type:'record',recordId,name,status:'active',fields:{description:'玩家明确确认的实际长期事实'},details,sourceIndex:-1,...extra});
function save(p,changes){const batch=normalizeArchiveBatch({changes},p,[],[],'玩家明确确认的实际事实');assert.deepEqual(batch.issues,[]);return applyArchiveChanges(p,batch.changes,[],new Map(batch.changes.map((r,i)=>[i,r.id])),[]);}
const rows=(p,id)=>Object.values(p.archives).filter(r=>r.specific?.recordId===id);
const snapshot=p=>stable({resources:p.resources,assets:p.assets});
test('batch three adds four exact-rule adapters and six independent tables and nine compatible categories without touching original statusbar schemas',()=>{
 const definitions=ARCHIVE_TABLE_DEFINITIONS.slice(16,20);assert.equal(definitions.length,4);assert.equal(definitions.flatMap(d=>d.tables).length,5);assert(definitions.every(d=>!d.records));
 for(const d of definitions){const p=power(d.name),spec=archiveTables(p),cfg=creationConfig(p),before=stable(p);assert.equal(spec.tables.length,d.tables.length);assert(cfg.records.some(r=>r.id.startsWith('statusbar_')));
  for(const quote of d.sourceQuotes)assert(p.primaryRules.includes(quote),d.name+': '+quote);
  assert.deepEqual(archiveTablePolicy(p).boundaries,d.boundaries);assert.deepEqual(JSON.parse(archivePrompt(p,[],[],'确认').user).longTermTables.sourceQuotes,d.sourceQuotes);
  const page=archiveLibraryPage(p);assert.equal(page.categories.length,d.tables.length);assert.equal(stable(p),before);assert.equal(archiveTables({...p,primaryRules:p.primaryRules+'自定义'}),null);
 }
});
test('equipment keeps independent same-model objects apart and preserves permanent attributes after transfer and repair',()=>{
 const p=power('装备栏'),before=snapshot(p);
 save(p,[raw('equipment','铁剑·北门购得甲',{state:'已挂载',origin:'北门首次购买',location:'本人持有'}),raw('equipment','铁剑·东市购得乙',{state:'已挂载',origin:'东市第二件实物'}),raw('attributes','北门铁剑归身性能',{attack:'锋锐已永久归身',defense:'材料承载已归身',functions:'稳定结构已归身',origin:'北门购得甲',inputs:'外部特殊耗材按实际供给'}),raw('integrations','锋锐防护协同',{components:'既有归身锋锐和防护',effect:'已经形成真实协同'})]);
 const item=rows(p,'equipment')[0],attribute=rows(p,'attributes')[0],initial=clone(attribute);
 save(p,[raw('equipment',item.name,{location:'已出售给工匠，后修复至原有水平'},{archiveId:item.id,operation:'update'})]);
 assert.equal(rows(p,'equipment').length,2);assert.deepEqual(p.archives[attribute.id],initial);assert.equal(attribute.status,'active');
 save(p,[raw('attributes',attribute.name,{functions:'原来源真正新增探知附魔，旧能力保留'},{archiveId:attribute.id,operation:'update'})]);
 assert.equal(rows(p,'attributes').length,1);assert.equal(p.archives[attribute.id].specific.fields.attack,'锋锐已永久归身');assert.equal(snapshot(p),before);
});
test('library loadout and battle effects update in place; ending a battle or recalling a copy never consumes a permanent page',()=>{
 const p=power('图书馆'),before=snapshot(p);
 save(p,[raw('pages','龙鳞核心页',{content:'真实核心防护',origin:'亲自完成压制',growth:'已知初始用法'}),raw('pages','龙息战斗页',{content:'真实龙息技艺',origin:'同次真实胜果'}),raw('loadout','本次选择',{equipped:'核心龙鳞页；战斗龙息页',synergy:'已形成护体龙息'}),raw('copies','弟子甲·龙鳞副本',{holder:'弟子甲',page:'龙鳞核心页·训练版',state:'已赐予'}),raw('copies','弟子甲·龙息副本',{holder:'弟子甲',page:'龙息战斗页·限权版',state:'已赐予'}),raw('combat','北门防卫战',{conflict:'北门连续防卫战',will:'60%',nodes:'30%已用；60%已开放未用',effects:'已治疗友军'})]);
 const pages=clone(rows(p,'pages')),loadout=rows(p,'loadout')[0],battle=rows(p,'combat')[0],copy=rows(p,'copies')[0];
 save(p,[raw('loadout','新配置标题',{equipped:'卸下龙鳞页，其他配置依实际保留',changes:'已造成治疗仍存在'},{operation:'update'}),raw('copies',copy.name,{state:'依明确指令回收，个人成长保留'},{archiveId:copy.id,operation:'update'}),raw('combat',battle.name,{will:'0%',nodes:'本场节点已经结束，不重新开放',effects:'临时页退出；实际治疗和已得馆藏保留'},{archiveId:battle.id,operation:'transition',status:'ended'})]);
 assert.equal(rows(p,'loadout').length,1);assert.equal(rows(p,'loadout')[0].id,loadout.id);assert.equal(rows(p,'copies').length,2);assert.equal(rows(p,'copies')[1].specific.fields.state,'已赐予');assert.deepEqual(rows(p,'pages'),pages);assert.equal(snapshot(p),before);
});
test('one minor source can serve several major systems; rewiring and primary changes preserve original sources and other systems',()=>{
 const p=power('力量构筑'),before=snapshot(p);
 save(p,[raw('minor','残篇炎心',{origin:'实际读到的残篇有效部分',benefit:'已形成独立耐热',structure:'已有热流结构',gaps:'未接触后半篇'}),raw('major','炎体体系',{role:'当前主大源',components:'残篇炎心',connections:'实际护体循环'}),raw('major','锻造体系',{role:'独立可用大源',components:'同一残篇炎心',connections:'实际控温结构'}),raw('plans','炎心后半篇补全',{target:'残篇炎心',available:'既有有效部分',remaining:'仍未接触后半篇',authorization:'本人已经选择'})]);
 const minor=rows(p,'minor')[0],systems=rows(p,'major'),initial=clone(minor);
 save(p,[raw('major',systems[0].name,{role:'已切换为其他大源，固化收益保留'},{archiveId:systems[0].id,operation:'update'}),raw('major',systems[1].name,{role:'当前主大源',connections:'已实际重编控温结构'},{archiveId:systems[1].id,operation:'update'})]);
 assert.equal(rows(p,'major').length,2);assert.deepEqual(p.archives[minor.id],initial);assert.equal(p.archives[systems[0].id].specific.fields.connections,'实际护体循环');assert.equal(rows(p,'plans')[0].status,'active');assert.equal(snapshot(p),before);
});
test('fantasy prototype, manifestation and personal skill have independent lifetimes; reconstruction keeps original and later myth',()=>{
 const p=power('幻想具现'),before=snapshot(p);
 save(p,[raw('prototypes','圣剑·原典甲',{source:'已确认原典甲的稳定认知锚点',core:'已确认核心斩击',versions:'独立原典甲'}),raw('prototypes','圣剑·原典乙',{source:'已确认原典乙',core:'另一真实核心',versions:'独立原典乙'}),raw('manifestations','圣剑甲·当前实体',{prototype_ref:'圣剑·原典甲',form:'完整使用形态',state:'已具现'}),raw('skills','圣剑操作技艺',{source:'真实使用圣剑甲',technique:'首次使用已匹配',growth:'已实际练成独立剑术',state:'已形成自身本领'}),raw('exclusive','圣剑甲·本人专属',{kind:'专属重构',origin:'圣剑原典甲与真实经历',effect:'实际形成的新形态'}),raw('exclusive','守城圣剑·独立新神话',{kind:'独立新神话',origin:'专属剑与真实守城经历',anchor:'已经形成独立辨识锚点'}),raw('links','圣剑联动',{members:'真实存在共同传说联系的原型',state:'实际持续生效',effect:'真实协同'})]);
 const prototypes=clone(rows(p,'prototypes')),skill=clone(rows(p,'skills')[0]),m=rows(p,'manifestations')[0],versions=clone(rows(p,'exclusive'));
 save(p,[raw('manifestations',m.name,{state:'已损毁，原型保留'},{archiveId:m.id,operation:'update'}),raw('links','圣剑联动',{state:'依正文已停止联动'},{operation:'transition',status:'ended'})]);
 save(p,[raw('manifestations',m.name,{state:'已经重新召出',form:'便携形态'},{archiveId:m.id,operation:'update'})]);
 assert.equal(rows(p,'manifestations').length,1);assert.deepEqual(rows(p,'prototypes'),prototypes);assert.deepEqual(rows(p,'exclusive'),versions);assert.deepEqual(rows(p,'skills')[0],skill);assert.equal(snapshot(p),before);
});
test('batch three repeated review is a no-op, invalid fields never leak and serialized state preserves the same identities',()=>{
 for(const name of ['装备栏','图书馆','力量构筑','幻想具现']){const p=power(name),t=archiveTables(p).tables[0],r=raw(t.id,'实际独立对象',{[t.fields[0].id]:'实际已确认内容'},{operation:'insert'});save(p,[r]);const before=clone(p),id=Object.keys(p.archives)[0];save(p,[{...r,operation:'update',archiveId:id}]);assert.deepEqual(p,before);
  const batch=normalizeArchiveBatch({changes:[{...r,operation:'update',archiveId:id,details:{nonexistent:'不应写入'}}]},p,[],[],'确认');assert.equal(batch.changes.length,0);assert(batch.issues.length);assert.deepEqual(p,before);
  const s=emptyState();s.powers[p.id]=p;validateState(JSON.parse(JSON.stringify(s)));assert.equal(Object.keys(s.powers[p.id].archives)[0],id);
 }
});
