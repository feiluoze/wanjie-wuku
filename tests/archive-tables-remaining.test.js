import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,clone,stable,emptyState,validateState} from '../src/core.js';
import {ARCHIVE_TABLE_DEFINITIONS as definitions} from '../src/archive-table-definitions.js';
import {archiveTables,tableTarget} from '../src/archive-tables.js';
import {creationConfig} from '../src/creation-config.js';
import {builtinStatusbar} from '../src/builtin-statusbar.js';
import {hash} from '../src/primitives.js';
import {archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';

const plan=JSON.parse(readFileSync(new URL('../docs/长期子表-剩余词条审查.json',import.meta.url),'utf8'));
const power=name=>createPower(builtinEntries({includeDedicated:true}).find(e=>e.name===name));
const raw=(recordId,name,details,extra={})=>({type:'record',recordId,name,status:'active',fields:{description:'玩家核对的重要实际长期事实'},details,sourceIndex:-1,...extra});
function save(p,changes){const b=normalizeArchiveBatch({changes},p,[],[],'玩家核对的真实事实');assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((r,i)=>[i,r.id])),[]);}
const wallets=p=>stable({assets:p.assets,resources:p.resources});

test('complete remaining audit covers every previously unreviewed main entry once and makes no automatic table from an adapter',()=>{
 assert.equal(plan.entries.length,83);assert.equal(new Set(plan.entries.map(e=>e.name)).size,83);
 assert.equal(plan.entries.filter(e=>e.decision==='本轮排除').length,64);assert.equal(plan.entries.filter(e=>e.decision==='专用结构已覆盖').length,1);
 assert.equal(plan.entries.filter(e=>e.decision==='制作').length,18);assert.equal(plan.entries.flatMap(e=>e.tables).length,21);
 for(const e of plan.entries){assert(e.reason.length>15);const p=power(e.name);assert(p);assert.equal(hash(p.primaryRules),e.sourceHash);assert(!definitions.slice(0,32).some(d=>d.name===e.name));
  if(e.decision==='本轮排除')assert.equal(archiveTables(p),null,e.name);
 }
 assert.equal(plan.mainPowers,plan.previousReviewed+plan.entries.length);
 const taishi=plan.entries.find(e=>e.decision==='专用结构已覆盖');assert.equal(creationConfig(power(taishi.name)).records.length,11);assert.equal(archiveTables(power(taishi.name)),null);
 for(const name of ['等价交换','我全都要','多倍收获系统'])assert.equal(archiveTables(power(name)).tables.length,0);
});

const batches=[
 [8,['至高亡灵主宰','攻略系统','奇迹智子'],3,9],
 [9,['万物尽头','文明之光系统','知识荒野'],4,8],
 [10,['抽奖系统','置物栏','完美融合'],4,4],
 [11,['万象神魔图录','早有先例','光之钥'],4,7],
 [12,['源堡','混沌海','永暗之河'],3,9],
 [13,['暗影世界','绝对适应（新版）','生物计算机'],3,9]
];
for(const [batch,names,count,retired] of batches){
 const ds=definitions.filter(d=>names.includes(d.name));if(!ds.length)continue;
 test(`batch ${batch}: exact selected objects, source quotes, hash gates and original statusbar/schema preservation`,()=>{
  assert.equal(ds.length,3);assert.equal(ds.flatMap(d=>d.tables).length,count);assert.equal(ds.flatMap(d=>d.retiredTables).length,retired);
  for(const d of ds){const p=power(d.name),before=stable(p),spec=archiveTables(p),cfg=creationConfig(p),request=JSON.parse(archivePrompt(p,[],[]).user);
   assert(!d.records);assert(d.boundaries.length>=3);for(const q of d.sourceQuotes){assert(q.length>15);assert(p.primaryRules.includes(q),d.name+': '+q);}
   assert.equal(request.originalStatusbar.source,builtinStatusbar(p).block);
   for(const g of builtinStatusbar(p).groups)assert(!cfg.records.find(r=>r.id===g.id).fields.some(f=>f.id==='related_details'));
   const selected=plan.entries.find(e=>e.name===d.name);assert.deepEqual(spec.tables.map(t=>t.id).sort(),selected.tables.map(t=>t.id).sort());
   for(const t of spec.retiredTables){assert(!request.recordSchemas.some(r=>r.id===t.id));assert.throws(()=>tableTarget(p,raw(t.id,'新过程流水',{},{operation:'insert'})),/已收拢/);}
   for(const t of spec.tables)assert(!t.fields.some(f=>f.id==='balance'));
   assert.equal(stable(p),before);assert.equal(archiveTables({...p,primaryRules:p.primaryRules+'修订'}),null);
  }
 });
}

// Real domain distinctions are retained in partial updates. No test pretends that the
// archive layer can prove the truth or importance of model-generated prose.
const scenarios=[
 ['至高亡灵主宰','members','古墓工匠',{origin:'真实复起的同一工匠',abilities:'保存千年锻造经验',state:'原身体毁坏，待归队'},{state:'正文确认重构归队，延续原经历'}],
 ['攻略系统','people','林岚',{identity:'真实同行者',affinity:'当前已回落至旧阶段',related_details:'旧阈值已领取：60；已得护心术永久保留'},{affinity:'正文确认回升到60，旧奖励不重领'}],
 ['奇迹智子','groups','北境测绘集群',{scale:'正文确认独立成员一组',location:'北境峡谷',loss:'真实损失三名成员'},{task:'聚合为新的测绘结构，原损失尚未补齐'}],
 ['万物尽头','lines','高温合金产线',{goal:'稳定制造既定合金',inputs:'实际投入原料与能源',gaps:'仍缺高温炉内衬'},{operation:'真实完成修复后恢复原产线运行'}],
 ['万物尽头','seeds','耐寒药草种源',{identity:'真实保留的育种群',reserved:'现有母株与种子',location:'北区种源库'},{use:'继续用于原药草繁育，产出不是另一份母株'}],
 ['文明之光系统','communities','河谷城邦',{territory:'真实持续治理的河谷地区',foundation:'已稳定运行的水利制度',related_details:'黄金时代已锚定；首项水利工程已成立'},{stage:'遭外来冲击进入修复，既有制度仍然成立'}],
 ['知识荒野','knowledge','潮汐文明航路档案',{content:'已收入的重要航路及原理',origin:'正文确认收入的文明档案',scope:'明确的原文明海域，不包含私人心智'},{growth:'新增真实校正的星位对应，旧航路仍保留'}],
 ['抽奖系统','curios','返航符·真实一批',{rule:'原规则允许返航',remaining:'2份',origin:'正文确认取得的实体符'},{remaining:'1份，正文确认实际使用一份'}],
 ['抽奖系统','privileges','恒定夜视',{effect:'已取得夜视',origin:'真实第一次抽取'},{growth:'再次取得同核心特权后已实际进化为微光辨色'}],
 ['置物栏','record','古铜镜',{original:'原物仍在栏内',mapped:'已永久归身的观照收益',mapping_history:'原已成立最高映射保持'},{original:'原物已取出并正常使用，永久收益不回退'}],
 ['完美融合','products','青璃融合主体',{current:'稳定可用的第一形态',identity:'核心自我青璃，既有旅行经历延续',origin:'已真实参与融合的原有材料'},{current:'同一主体稳定深化为第二形态'}],
 ['万象神魔图录','archetypes','赤鸾残页',{state:'真实已得残页，未完全征服',identity:'赤鸾原型',knowledge:'仅已知的核心羽纹'},{knowledge:'正文确认补全尾羽纹，仍有未知'}],
 ['万象神魔图录','generals','赤羽战将',{state:'原躯体毁灭',origin:'已正式降现的独立战将',abilities:'已得赤火能力'},{state:'正文确认以同一身份再次降现'}],
 ['早有先例','precedent','北门开城先例',{event:'真实发生的开城事件',result:'闭锁城门曾经开启',limits:'不自动包含无关的心智控制'},{correspondence:'已确认可援引的新对应场景，仍是原历史'}],
 ['光之钥','tracks','河谷旧现实·版本甲',{identity:'真实旧轨迹版本甲',node:'正文确认曾发生的北门节点',content:'旧现实的关系和事件，不是当前额外资产'},{use:'保留旧轨迹供以后回接，当前现实已改变'}],
 ['源堡','records','旧塔之战档案',{subject:'真实旧塔之战',time:'原历史节点',content:'已取得的事件信息，尚非实物再现'},{changes:'补全已确认的参与者信息，仍未知部分不编造'}],
 ['混沌海','creations','白瓷生命',{state:'已真实成立的独立生命',nature:'保有原身份与经历',abilities:'已得光泽调节能力'},{state:'同一造物完成真实强化，仍是原生命'}],
 ['永暗之河','residents','守灯人',{state:'真实亡者，已留烙印',basis:'已存本人死亡烙印',identity:'同一位守灯人'},{state:'正文确认由已存烙印归还，不新增另一人'}],
 ['暗影世界','beings','影鸦',{state:'已经正式归属',identity:'独立影鸦，非受咒外人',core:'核心痕迹仍在'},{state:'正文确认沿原痕迹回归，保持身份'}],
 ['绝对适应（新版）','resistances','主动真空适应',{exposure:'未先受击，主动选择即已实际成立',adaptation:'永久适应真空'},{adaptation:'原真空适应持续有效，正文确认范围深化'}],
 ['生物计算机','model','河谷局部模型',{subject:'原河谷模型',scope:'实际已形成的局部范围',limits:'北部数据未知，未来洪水仍为可能'},{result:'新观测校正已确认事实，不将预测写成已发生'}]
];
for(const [name,id,title,initial,patch] of scenarios){
 if(!definitions.some(d=>d.name===name))continue;
 test(`${name}/${id}: meaningful durable distinctions survive updates, repeated save and another object`,()=>{
  const p=power(name),wallet=wallets(p);save(p,[raw(id,title,initial,{operation:'insert'})]);const row=Object.values(p.archives)[0],archiveId=row.id;
  save(p,[raw(id,title,patch,{archiveId,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);
  for(const [key,value] of Object.entries(initial))if(!(key in patch))assert.equal(p.archives[archiveId].specific.fields[key],value,key);
  for(const [key,value] of Object.entries(patch))assert.equal(p.archives[archiveId].specific.fields[key],value,key);
  const snapshot=clone(p.archives);save(p,[raw(id,title,patch,{archiveId,operation:'update'})]);assert.deepEqual(p.archives,snapshot);
  save(p,[raw(id,title+'·真实独立对象乙',initial,{operation:'insert'})]);assert.equal(Object.keys(p.archives).length,2);assert.deepEqual(p.archives[archiveId],snapshot[archiveId]);
  assert.equal(wallets(p),wallet);const state=emptyState();state.powers[p.id]=p;validateState(JSON.parse(JSON.stringify(state)));
 });
}
