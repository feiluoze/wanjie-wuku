import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,stable,clone,emptyState,validateState} from '../src/core.js';
import {creationConfig} from '../src/creation-config.js';
import {ARCHIVE_TABLE_DEFINITIONS} from '../src/archive-table-definitions.js';
import {archiveTables} from '../src/archive-tables.js';
import {archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {archiveLibraryPage} from '../src/archive-library.js';
const power=name=>createPower(builtinEntries().find(e=>e.name===name));
const raw=(recordId,name,details,extra={})=>({type:'record',recordId,name,status:'active',fields:{description:'正文已确认的独立长期事实'},details,sourceIndex:-1,...extra});
function save(p,changes){const b=normalizeArchiveBatch({changes},p,[],[],'玩家确认的实际事实');assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((r,i)=>[i,r.id])),[]);return b;}
const wallets=p=>stable({resources:p.resources,assets:p.assets});
test('fourth batch is withdrawn: original statusbars suffice; all eight old categories stay compatible',()=>{
 const ds=ARCHIVE_TABLE_DEFINITIONS.slice(20,23);assert.equal(ds.length,3);assert.equal(ds.flatMap(d=>d.tables).length,0);assert.equal(ds.flatMap(d=>d.retiredTables).length,8);
 for(const d of ds){const p=power(d.name),before=stable(p),request=JSON.parse(archivePrompt(p,[],[]).user);assert.equal(request.longTermTables.tables.length,0);assert(request.longTermTables.writeScope.includes('没有默认独立子表'));assert(request.originalStatusbar.tables.length);for(const t of d.retiredTables)assert(!request.recordSchemas.some(r=>r.id===t.id));for(const quote of d.sourceQuotes)assert(p.primaryRules.includes(quote));assert.equal(archiveLibraryPage(p).categories.length,0);assert.equal(stable(p),before);assert.equal(archiveTables({...p,primaryRules:p.primaryRules+'自定义'}),null);}
});

test('legacy important exchange retains qualification, actual delivery and target nature on one ID; separate exchanges stay separate',()=>{
 const p=power('等价交换'),before=wallets(p);
 save(p,[raw('exchanges','北门交换·首次',{input:'本人已拥有的一粒砂砾',scale:'本次只按数量',target:'明确存在的宝石甲',state:'已成立但暂存待交割',related_details:'资格已保留，目标尚未到手；恢复通道后交割'},{})]);const id=Object.keys(p.archives)[0];
 save(p,[raw('exchanges','北门交换·首次',{state:'已实际交割',related_details:'通道恢复后宝石甲已交割，原有性质完整保留；同一资格不再领取'},{archiveId:id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[id].specific.fields.scale,'本次只按数量');assert.equal(p.archives[id].specific.fields.input,'本人已拥有的一粒砂砾');
 const snapshot=clone(p.archives);save(p,[raw('exchanges','北门交换·首次',{state:'已实际交割',related_details:'通道恢复后宝石甲已交割，原有性质完整保留；同一资格不再领取'},{archiveId:id,operation:'update'})]);assert.deepEqual(p.archives,snapshot);
 save(p,[raw('exchanges','北门交换·另一次',{input:'另一件本人资产',scale:'本次只按重量',target:'另一次交换的宝石乙',state:'独立已成立暂存'},{})]);assert.equal(Object.keys(p.archives).length,2);assert.equal(wallets(p),before);
});
test('legacy reward groups update direct contents and pending delivery without duplicating an entitlement or merging separate tasks',()=>{
 const p=power('我全都要'),before=wallets(p);
 save(p,[raw('reward_group','北门试炼奖励组',{origin:'已经完成的北门试炼',options:'同次可选宝物与传承',expanded:'传承已有功法、说明和信物',delivered:'宝物已交付',pending:'传承已归属但待承载',related_details:'真实互斥兼容已经成立，不扩展到未来其他任务'},{})]);const id=Object.keys(p.archives)[0];
 save(p,[raw('reward_group','北门试炼奖励组',{delivered:'宝物与传承现已完整交付',pending:'',related_details:'原本同组资格已完成兑现，兼容保持'},{archiveId:id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[id].specific.fields.pending,'');assert.equal(p.archives[id].specific.fields.expanded,'传承已有功法、说明和信物');
 save(p,[raw('reward_group','南门独立试炼奖励组',{origin:'另一项已完成任务',options:'名称相同的宝物与传承',delivered:'另一组真实交付'},{})]);assert.equal(Object.keys(p.archives).length,2);assert.equal(wallets(p),before);
});
test('legacy harvest pending entitlement; partial delivery and completion preserve original source without re-multiplication',()=>{
 const p=power('多倍收获系统'),before=wallets(p);
 save(p,[raw('retained','北岭采集·待交付权益',{origin:'北岭真实采集；正文已确认最终收益，已交付部分与剩余分清',remaining:'正文确认尚余五份',condition:'待仓库通路恢复',related_details:'本次原始收获及最终实际结果已确认，不再递归增幅'},{})]);const id=Object.keys(p.archives)[0];
 save(p,[raw('retained','北岭采集·待交付权益',{remaining:'正文确认尚余两份',delivered:'本次实际补交三份'},{archiveId:id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);assert.equal(p.archives[id].specific.fields.condition,'待仓库通路恢复');
 save(p,[raw('retained','北岭采集·待交付权益',{remaining:'无剩余',delivered:'正文明确最后两份已全部交付'},{archiveId:id,operation:'transition',status:'ended'})]);assert.equal(p.archives[id].status,'ended');assert.equal(p.archives[id].specific.fields.origin,'北岭真实采集；正文已确认最终收益，已交付部分与剩余分清');assert.equal(wallets(p),before);assert(!Object.values(p.archives).some(r=>r.specific.recordId==='harvest'));
 const input=JSON.parse(archivePrompt(p,[],[]).user);assert(input.longTermTables.boundaries.some(s=>s.includes('十份')&&s.includes('二十倍')));assert(input.settlementPolicy.includes('禁止自行选择更大倍率'));
});
test('legacy categories remain queryable; new insert contract cannot split one object into pending and result rows',()=>{
 for(const name of ['等价交换','我全都要','多倍收获系统']){const p=power(name),spec=archiveTables(p),before=stable(p);const old=spec.retiredTables[0],field=old.fields[0].id;
  const rejected=normalizeArchiveBatch({changes:[raw(old.id,'不应新增的明细',{[field]:'正文中的明细'},{operation:'insert'})]},p,[],[],'确认');assert.equal(rejected.changes.length,0);assert(rejected.issues.length);assert.equal(stable(p),before);
  save(p,[raw(old.id,'旧格式已保存对象',{[field]:'旧档保留原内容'})]);const r=Object.values(p.archives)[0];assert(archiveLibraryPage(p).categories.some(([id])=>id.endsWith('/'+old.id)));
  const input=JSON.parse(archivePrompt(p,[],[]).user);assert(input.recordSchemas.find(x=>x.id===old.id).updateOnly);const state=emptyState();state.powers[p.id]=p;validateState(JSON.parse(JSON.stringify(state)));assert.equal(Object.keys(state.powers[p.id].archives)[0],r.id);
 }
});
