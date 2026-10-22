import {assert,clone} from './primitives.js';
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
export function archiveNeedsDetails(record,spec){
 return Boolean(spec&&record?.specific?.adapterId===spec.adapter&&[...spec.tables,...spec.retiredTables].some(t=>t.id===record.specific.recordId)&&!Object.values(record.specific.fields||{}).some(v=>String(v??'').trim()));
}
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
 // Names can resolve a unique row, but recency cannot establish identity.
 const identified=fullIdentity(raw.details,table)?matches.filter(r=>sameIdentity(r.specific.fields,raw.details,table)):[];
 if(!explicit&&matches.length>1&&identified.length!==1){
  const error=Error('名称对应多份长期档案，请选择要更新的目标；其他有效候选仍可保存');
  error.fieldCandidate=clone(raw);
  error.archiveTargets={recordId:table.id,label:table.label,options:matches.map(row=>({id:row.id,name:row.name,status:row.status,updatedAt:row.updatedAt||0,summary:Object.values(row.specific?.fields||{}).filter(v=>String(v??'').trim()).slice(0,2).join('；').slice(0,180)}))};
  throw error;
 }
 const before=explicit||identified[0]||matches[0]||null;
 assert(!table.updateOnly||before||raw.operation===undefined,'该分类已收拢，不再新增独立记录；已有旧档仍可按名称或identity更新');
 if(before)for(const id of table.identityFields||[]){const value=identityValue(raw.details,id,table),old=before.specific?.fields?.[id];assert(value===undefined||!old||key(value)===key(old),'已有档案的身份列不能被另一对象或版本覆盖；不同版本请使用独立名称新增，纠错请手动核对');}
 const identityKeys=new Set((table.identityFields||[]).flatMap(id=>[id,table.fields.find(f=>f.id===id)?.label]).filter(Boolean));
 const hasAnyIdentity=Boolean(identityKeys.size&&Object.keys(raw.details||{}).some(k=>identityKeys.has(k)));
 if(!before&&raw.operation==='insert'&&hasAnyIdentity)assert(fullIdentity(raw.details,table),'新建版本档案必须明确对象名称、来源与具体版本，不能用同名代替身份');
 if(before&&raw.operation==='insert'&&table.identityFields?.length)assert(false,'已有对象；请沿用原 archiveId 或原 recordId 更新，不能重复新建');
 if(!before){
  if(spec.frameworkSelection&&table.frameworkId){
   const shared=[...spec.tables,...spec.retiredTables].filter(t=>t.frameworkId&&t.frameworkId===table.frameworkId).map(t=>t.id);
   assert(!Object.values(power.archives||{}).some(r=>r.specific?.adapterId===spec.adapter&&r.specific.recordId!==table.id&&shared.includes(r.specific.recordId)&&names(r).includes(key(raw.name))),'同一对象已在其他原分类登记；沿用原档案，不新建通用副本。确实同名的独立对象请明确来源或类型');
  }
  if(table.exclusiveWith?.length)assert(!Object.values(power.archives||{}).some(r=>r.specific?.adapterId===spec.adapter&&table.exclusiveWith.includes(r.specific.recordId)&&names(r).includes(key(raw.name))),'同一对象已在关联分类中登记；请沿用原 recordId 和 archiveId，不能重复建档');
  assert(table.kind==='singleton'||key(raw.name)!==key(table.label),'新增名称应是具体对象或独立事件，不能只写子表标题');
 }
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
  fillDecision:{firstRecord:'已确认存在且需要长期接续的独立对象，即使没有详细属性、没有身份列或本轮没有数值增长，也先用名称与成立依据建立基础记录，未知列留空；首次记录不要求先有archiveId，以后有明确描述再补同一条。',existingRecord:'已有同一对象时按名称、archiveId或已有身份接续，只补变化字段；未提及字段保留，同一事实重复提及且无变化时省略，没有变化不重复写。',summaryVsDetail:'主状态栏和所有已启用子表一起核对。主表有概括不等于子表已建档，不能用主表长清单代替子表明细；已有子表继续更新，不因主表已记录、表为空或缺明细而跳过。',noChange:'只有正文明确没有该对象或事实时才省略。缺详细属性、缺身份列、主表提过、表为空、本轮无数值增长都不是跳过理由。'},
  writeScope:spec.tables.length?'向 tables 列出的已启用子表建档或更新。':'本词条没有默认独立子表；新事实按 originalStatusbar 的原文栏目更新。',
  consolidation:spec.retiredTables.map(t=>({recordId:t.id,target:t.detailTarget||'原文状态栏',...(t.disabled?{disabled:true}:{}),existingRows:t.disabled?'框架未启用，仅保留查询与手动编辑。':'旧档保留，可按名称或身份继续接续。'})),
  detailPolicy:'有独立对象就先建档，明细未知留空。训练、配置、过程等可先写基础事实，不必等到完整属性齐全；不虚构未出现的对象或细节。主表只保留整体现状与对象引用，子表保存独立对象。',
  ...(spec.boundaries?{boundaries:spec.boundaries}:{}),...(spec.sourceQuotes?{sourceQuotes:spec.sourceQuotes}:{}),
  operations:{insert:'新独立对象或事件；有明确依据即可，明细可空。',update:'已有对象补变化列；省略列保持。',transition:'对象确实转入另一状态；不代表再次到账。'},
  rules:'主状态栏和所有已启用子表在初始化与每次更新时一起核对。该建档就建档，有变化就更新，无变化保留。基础记录只要求具体名称与成立依据，详细列未知留空；不能因缺明细、缺身份列、主表已有概括或子表为空而跳过。已有对象按名称、archiveId或已有身份接续，不重复建档；不覆盖未变化数据，不编造对象或数值。operation可省略，程序自动判断接续。禁止删除、清空整表、补算奖励、创建第二份余额；规则示例不属于实得。ended只来自明确结束，未提及不等于结束。'};
}
export function archiveWriteCounts(before,saved,selectedCount= saved.length){
 const final=[...new Map(saved.map(r=>[r.id,r])).values()];
 return {operations:saved.length,objects:final.length,created:final.filter(r=>!before[r.id]).length,updated:final.filter(r=>before[r.id]&&!(before[r.id].status!=='ended'&&r.status==='ended')).length,ended:final.filter(r=>before[r.id]&&before[r.id].status!=='ended'&&r.status==='ended').length,unchanged:Math.max(0,selectedCount-saved.length)};
}
