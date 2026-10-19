import {assert} from './primitives.js';
import {creationConfig} from './creation-config.js';
import {archiveTableDefinition} from './archive-table-definitions.js';
import {selectedTableDefinition,frameworkSelectionPolicy,legacyFrameworkForType} from './record-frameworks.js';
const key=s=>String(s||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
const names=r=>[r.name,...(r.history||[]).map(h=>h.name)].map(key);
const identityValue=(details,id,table)=>details?.[id]??details?.[table.fields.find(f=>f.id===id)?.label];
const identityValues=(details,table)=>(table.identityFields||[]).map(id=>identityValue(details,id,table));
const fullIdentity=(details,table)=>Boolean(table.identityFields?.length)&&identityValues(details,table).every(v=>typeof v==='string'&&v.trim());
const sameIdentity=(a,b,table)=>fullIdentity(a,table)&&fullIdentity(b,table)&&identityValues(a,table).every((v,i)=>key(v)===key(identityValues(b,table)[i]));
export function archiveTables(power){
 const config=creationConfig(power),d=selectedTableDefinition(power,config,archiveTableDefinition(power,config));if(!d||!config)return null;
 const fields=t=>{const r=config.records.find(r=>r.id===t.id);return r?[{...t,label:r.label,fields:r.fields}]:[];};
 return {...d,tables:d.tables.flatMap(fields),retiredTables:d.retiredTables.flatMap(fields)};
}
export function tableForRecord(power,record){const spec=archiveTables(power);return spec&&record?.specific?.adapterId===spec.adapter?[...spec.tables,...spec.retiredTables].find(t=>t.id===record.specific.recordId):null;}
export function tableTarget(power,raw){
 const spec=archiveTables(power),table=spec&&[...spec.tables,...spec.retiredTables].find(t=>t.id===raw.recordId);if(!table){
  if(spec?.frameworkSelection&&!String(raw.recordId||'').startsWith('statusbar_')){
   const before=power.archives?.[raw.archiveId],legacyType=legacyFrameworkForType(before?.type);
   assert(before&&!before.specific&&legacyType&&spec.frameworkSelection.enabled.includes(legacyType),'请使用玩家已启用的记录框架，不得用通用成果或未知分类绕过选择');
  }
  assert(raw.operation===undefined,'只有已声明长期子表接收 operation');return null;
 }
 assert(!table.disabled,'该记录框架未启用；旧档保留可查看，请先启用对应框架再自动更新');
 assert(raw.operation===undefined||['insert','update','transition'].includes(raw.operation),'子表操作须为 insert、update 或 transition；不允许删除或批量覆盖');
 const rows=Object.values(power.archives||{}).filter(r=>r.specific?.adapterId===spec.adapter&&r.specific.recordId===table.id);
 const matches=table.kind==='singleton'?rows:rows.filter(r=>names(r).includes(key(raw.name))||sameIdentity(r.specific.fields,raw.details,table));
 const explicit=raw.archiveId?power.archives?.[raw.archiveId]:null;
 assert(!raw.archiveId||explicit?.specific?.adapterId===spec.adapter&&explicit.specific.recordId===table.id,'子表更新必须指向同一分类中的原档案');
 assert(table.kind!=='singleton'||matches.length<=1,'单行子表已有多份记录，请先核对，不能自动合并');
 assert(explicit||matches.length<=1,'名称对应多份长期档案，请明确原 archiveId，不会猜测合并');
 const before=explicit||matches[0]||null;
 if(spec.frameworkSelection&&!before){
  const shared=[...spec.tables,...spec.retiredTables].filter(t=>t.frameworkId&&t.frameworkId===table.frameworkId).map(t=>t.id);
  assert(!Object.values(power.archives||{}).some(r=>r.specific?.adapterId===spec.adapter&&r.specific.recordId!==table.id&&(shared.includes(r.specific.recordId)||table.id.startsWith('framework_')||r.specific.recordId.startsWith('framework_'))&&names(r).includes(key(raw.name))),'同一对象已在其他原分类登记；沿用原档案，不新建通用副本。确实同名的独立对象请明确来源或类型');
 }
 assert(!table.updateOnly||before||raw.operation===undefined,'该分类已收拢，不再新增独立记录；请把明细写入对应主对象的相关进展，当前状态写入原文状态栏。已有旧记录仍可沿原 archiveId 更新');
 if(before)for(const id of table.identityFields||[]){const value=identityValue(raw.details,id,table),old=before.specific.fields[id];assert(value===undefined||!old||key(value)===key(old),'已有档案的身份列不能被另一对象或版本覆盖；不同版本请使用独立名称新增，纠错请手动核对');}
 if(!before&&raw.operation==='insert'&&table.identityFields?.length)assert(fullIdentity(raw.details,table),'新建版本档案必须明确对象名称、来源与具体版本，不能用同名代替身份');
 if(!before&&table.exclusiveWith?.length)assert(!Object.values(power.archives||{}).some(r=>r.specific?.adapterId===spec.adapter&&table.exclusiveWith.includes(r.specific.recordId)&&names(r).includes(key(raw.name))),'同一对象已在关联分类中登记；请沿用其 archiveId 和原 recordId 更新，不能重复建档');
 if(!before)assert(!Object.values(power.archives||{}).some(r=>!r.specific&&[r.name,...(r.history||[]).map(h=>h.name)].some(n=>key(n)===key(raw.name))),'同名旧通用档案已存在；请先核对身份，不自动迁移或建立副本');
 assert(before||table.kind==='singleton'||key(raw.name)!==key(table.label),'新增名称应是具体对象或独立事件，不能只写子表标题');
 assert(raw.operation!=='insert'||!before,'insert 指向了已有对象；应沿用 archiveId 更新，不能重复新建');
 assert(!['update','transition'].includes(raw.operation)||before,'update/transition 没有唯一原对象；请明确 archiveId 或先新增');
 assert(raw.operation!=='transition'||raw.status&&raw.status!==before.status,'transition 必须有明确的状态变化，不能当作重复结算');
 return {table,before,name:before?.name||(table.kind==='singleton'?table.singletonName||table.label:raw.name)};
}
export function assertTableBatchIdentity(power,raw,previous){
 const spec=archiveTables(power),table=spec?.tables.find(t=>t.id===raw.recordId);if(!table)return;
 const owned=previous.filter(r=>!r?.ownerPowerId||r.ownerPowerId===power.id);
 if(spec.frameworkSelection&&table.frameworkId&&raw.operation==='insert')assert(!owned.some(r=>r?.recordId!==table.id&&key(r.name)===key(raw.name)&&spec.tables.some(t=>t.id===r.recordId&&t.frameworkId===table.frameworkId)),'本批同一框架中已登记同名对象；不要换用另一分类重复建档');
 assert(!owned.some(r=>table.exclusiveWith?.includes(r?.recordId)&&key(r.name)===key(raw.name)),'本批同一对象同时出现在互斥分类；沿用一份原档，不重复登记');
 if(raw.operation==='insert')assert(!owned.some(r=>r?.recordId===table.id&&sameIdentity(r.details,raw.details,table)),'本批已经登记相同对象与版本，不能用更换标题重复 insert');
}
export function assertChronologicalTableInsert(power,raw,previous){
 if(raw.operation!=='insert')return;
 const t=archiveTables(power)?.tables.find(t=>t.id===raw.recordId);if(!t)return;
 assert(!previous.some(r=>r?.recordId===t.id&&Number.isInteger(r.sourceIndex)&&r.sourceIndex<raw.sourceIndex&&(t.kind==='singleton'||key(r.name)===key(raw.name)||sameIdentity(r.details,raw.details,t))),'本批前层已经提出同一对象；后层必须接续更新，不可再次 insert');
}
export function archiveTablePolicy(power){
 const spec=archiveTables(power);if(!spec)return null;
 return {version:2,sourceHash:spec.hash,tables:spec.tables,...(spec.ownership?{ownership:spec.ownership}:{}),...(spec.frameworkSelection?{selection:frameworkSelectionPolicy(power,spec),nativePolicies:spec.nativePolicies}:{}),
  writeScope:spec.tables.length?'仅向 tables 列出的默认分类新增；consolidation 分类只更新已有旧档。':'本词条没有默认独立子表；新事实按 originalStatusbar 的原文栏目更新，不以通用成果、事件或新分类重建已撤下的统计。兼容分类只更新已有旧档。',
  consolidation:spec.retiredTables.map(t=>({recordId:t.id,target:t.detailTarget||'原文状态栏',...(t.disabled?{disabled:true}:{}),existingRows:t.disabled?'框架未启用，仅保留查询与手动编辑，不自动更新。':'只更新已有原档，禁止新增；不自动迁移、合并或删除'})),
  detailPolicy:'只为有独立身份、必须跨回合单独更新的对象建档。训练、配置、过程、已得收益等依consolidation进入对象的related_details或原状态栏；同一事实只存一处，主表只摘要引用。主对象尚未成立时，候选与计划留在原文状态栏，不为容纳明细而虚构已得对象。related_details保留未改变的重要事实，不复制整份快照；没有明确主要对象时报告待核对，不猜测归属。',
  ...(spec.boundaries?{boundaries:spec.boundaries}:{}),...(spec.sourceQuotes?{sourceQuotes:spec.sourceQuotes}:{}),
  operations:{insert:'新独立对象或事件；明确事实依据，不重复已有对象。',update:'沿用原 archiveId，只给发生变化的列；省略列保持，不写整段快照。',transition:'原对象确实转入另一状态；不代表再次到账。'},
  rules:'原文状态栏为主表，子表仅展开需要后续调用、持续约束、未完成事项或重要独立结算。严格按各表 retain/update 及 boundaries 判断；普通细节不逐次入表，但原文明确要求的独立进展仍更新对应对象。同一长期对象名称稳定，阶段名变化沿用 archiveId；不同订单、投资、支出不可因同商品或同币种合并。identityFields 为明确身份列，新建时完整填写，更新不得换成其他版本；exclusiveWith 表示同一生命跨这些分类仍只留一个身份，不自动换类。名称不能只写分类标题。已有通用档案不自动迁移或删改，身份歧义报告 uncertain。仅tables声明的长期子表项优先填写operation；originalStatusbar主状态栏和其他记录不填写operation；无变化返回 changes:[]。禁止删除、清空整表、补算奖励、创建第二份余额；规则示例不属于实得。ended 只来自明确结束，未提及不等于结束。子表与主表不要复制同一份长清单。event 表用于追溯，默认不自动注入正文；玩家仍可单独选为记忆。'};
}
export function archiveWriteCounts(before,saved,selectedCount= saved.length){
 const final=[...new Map(saved.map(r=>[r.id,r])).values()];
 return {operations:saved.length,objects:final.length,created:final.filter(r=>!before[r.id]).length,updated:final.filter(r=>before[r.id]&&!(before[r.id].status!=='ended'&&r.status==='ended')).length,ended:final.filter(r=>before[r.id]&&before[r.id].status!=='ended'&&r.status==='ended').length,unchanged:Math.max(0,selectedCount-saved.length)};
}
