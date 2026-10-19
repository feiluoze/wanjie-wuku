import {assert} from './primitives.js';
import {creationConfig} from './creation-config.js';
import {archiveTableDefinition} from './archive-table-definitions.js';
const key=s=>String(s||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
export function archiveTables(power){
 const config=creationConfig(power),d=archiveTableDefinition(power,config);if(!d||!config)return null;
 return {...d,tables:d.tables.flatMap(t=>{const r=config.records.find(r=>r.id===t.id);return r?[{...t,label:r.label,fields:r.fields}]:[];})};
}
export function tableForRecord(power,record){const spec=archiveTables(power);return spec&&record?.specific?.adapterId===spec.adapter?spec.tables.find(t=>t.id===record.specific.recordId):null;}
export function tableTarget(power,raw){
 const spec=archiveTables(power),table=spec?.tables.find(t=>t.id===raw.recordId);if(!table){assert(raw.operation===undefined,'只有已声明长期子表接收 operation');return null;}
 assert(raw.operation===undefined||['insert','update','transition'].includes(raw.operation),'子表操作须为 insert、update 或 transition；不允许删除或批量覆盖');
 const rows=Object.values(power.archives||{}).filter(r=>r.specific?.adapterId===spec.adapter&&r.specific.recordId===table.id);
 const matches=table.kind==='singleton'?rows:rows.filter(r=>[r.name,...(r.history||[]).map(h=>h.name)].some(n=>key(n)===key(raw.name)));
 const explicit=raw.archiveId?power.archives?.[raw.archiveId]:null;
 assert(!raw.archiveId||explicit?.specific?.adapterId===spec.adapter&&explicit.specific.recordId===table.id,'子表更新必须指向同一分类中的原档案');
 assert(table.kind!=='singleton'||matches.length<=1,'单行子表已有多份记录，请先核对，不能自动合并');
 assert(explicit||matches.length<=1,'名称对应多份长期档案，请明确原 archiveId，不会猜测合并');
 const before=explicit||matches[0]||null;
 if(!before)assert(!Object.values(power.archives||{}).some(r=>!r.specific&&[r.name,...(r.history||[]).map(h=>h.name)].some(n=>key(n)===key(raw.name))),'同名旧通用档案已存在；请先核对身份，不自动迁移或建立副本');
 assert(before||raw.operation===undefined||key(raw.name)!==key(table.label),'新增名称应是具体对象或独立事件，不能只写子表标题');
 assert(raw.operation!=='insert'||!before,'insert 指向了已有对象；应沿用 archiveId 更新，不能重复新建');
 assert(!['update','transition'].includes(raw.operation)||before,'update/transition 没有唯一原对象；请明确 archiveId 或先新增');
 assert(raw.operation!=='transition'||raw.status&&raw.status!==before.status,'transition 必须有明确的状态变化，不能当作重复结算');
 return {table,before,name:before?.name||(table.kind==='singleton'?table.label:raw.name)};
}
export function assertChronologicalTableInsert(power,raw,previous){
 if(raw.operation!=='insert')return;
 const t=archiveTables(power)?.tables.find(t=>t.id===raw.recordId);if(!t)return;
 assert(!previous.some(r=>r?.recordId===t.id&&Number.isInteger(r.sourceIndex)&&r.sourceIndex<raw.sourceIndex&&(t.kind==='singleton'||key(r.name)===key(raw.name))),'本批前层已经提出同一对象；后层必须接续更新，不可再次 insert');
}
export function archiveTablePolicy(power){
 const spec=archiveTables(power);if(!spec)return null;
 return {version:1,sourceHash:spec.hash,tables:spec.tables,
  operations:{insert:'新独立对象或事件；明确事实依据，不重复已有对象。',update:'沿用原 archiveId，只给发生变化的列；省略列保持，不写整段快照。',transition:'原对象确实转入另一状态；不代表再次到账。'},
  rules:'原文状态栏为主表，子表仅展开需要后续调用、持续约束、未完成事项或重要独立结算。严格按各表 retain/update 判断，日常练习、普通恢复、路过人物、一次性细节不入表。同一长期对象名称稳定，阶段名变化沿用 archiveId；不同订单、投资、支出不可因同商品或同币种合并。名称不能只写分类标题。已有通用档案不自动迁移或删改，身份歧义报告 uncertain。每项优先填写 operation；无变化返回 changes:[]。禁止删除、清空整表、补算奖励、创建第二份余额；规则示例不属于实得。ended 只来自明确结束，未提及不等于结束。子表与主表不要复制同一份长清单。event 表用于追溯，默认不自动注入正文；玩家仍可单独选为记忆。'};
}
export function archiveWriteCounts(before,saved,selectedCount= saved.length){
 const final=[...new Map(saved.map(r=>[r.id,r])).values()];
 return {operations:saved.length,objects:final.length,created:final.filter(r=>!before[r.id]).length,updated:final.filter(r=>before[r.id]&&!(before[r.id].status!=='ended'&&r.status==='ended')).length,ended:final.filter(r=>before[r.id]&&before[r.id].status!=='ended'&&r.status==='ended').length,unchanged:Math.max(0,selectedCount-saved.length)};
}
