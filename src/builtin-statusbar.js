import {statusbarResourceReadOnly,statusbarResource,archiveResource,assertStatusbarResourceFields,resourcePolicy} from './builtin-resources.js';
import {BUILTIN_STATUSBARS} from './builtin-statusbar-data.js';
import {hash,clone,assert} from './primitives.js';
const byHash=new Map(BUILTIN_STATUSBARS.map(row=>[row.contentHash,row]));
export function builtinStatusbar(power){
 const row=byHash.get(hash(power?.primaryRules??power?.rules??''));
 if(!row?.groups.length)return null;
 const result=clone(row);
 for(const g of result.groups)g.fields=g.fields.flatMap(f=>{
  const b=statusbarResource(power,f.id);
  return b?.definition.kind==='energy'?[f,{id:f.id+'_capacity',label:b.definition.name+'上限',type:'text',description:'原文“当前值／上限”中的上限，仅保存有依据的最大储量，不是可用余额。',sourceField:f.id}]:[f];
 });
 return result;
}
export function withBuiltinStatusbar(config,power){
 const row=builtinStatusbar(power);
 if(!row||row.disposition==='dedicated'||power?.adapterBinding&&!config)return config;
 const records=row.groups.map(g=>({id:g.id,label:g.title,description:g.cardinality==='per-object'?'原文具名详情，同一名称更新原对象，不覆盖其他对象。':'原文状态栏当前主表，每块仅一条；不是新增成果或事件流水。',fields:g.fields.filter(f=>!statusbarResourceReadOnly(power,f.id))}));
 const existing=(config?.records||[]).map(r=>({...r,...(r.fields.some(f=>archiveResource(power,r.id,f.id))?{description:r.description+' 当前余额只读引用资源账本；此分类只登记收支依据，不得把余额另写进通用描述。'}:{}),fields:r.fields.filter(f=>!archiveResource(power,r.id,f.id))}));
 return {...(config||{format:'wjwk-adapter',schemaVersion:1,target:{primaryHashes:[row.contentHash]},id:'wuku.statusbar_'+row.contentHash,version:'1.0.0',name:row.name+'原文状态栏',operations:[]}),records:[...existing,...records]};
}
// insert/update on a declared original statusbar are redundant hints, not table commands.
export function normalizeStatusbarOperation(power,raw){
 const row=builtinStatusbar(power),declared=row?.disposition!=='dedicated'&&row?.groups.some(g=>g.id===raw.recordId);
 if(!declared||raw.operation===undefined)return raw;
 assert(['insert','update'].includes(raw.operation),'原文状态栏只接受 insert/update 兼容标记；不允许删除、批量覆盖或状态转换操作');
 const {operation,...candidate}=raw;return candidate;
}
export function statusbarTarget(power,raw){
 assertStatusbarResourceFields(power,raw);
 const row=builtinStatusbar(power),group=row?.disposition!=='dedicated'&&row?.groups.find(g=>g.id===raw.recordId);
 if(!group)return null;
 const rows=Object.values(power.archives||{}).filter(r=>r.specific?.recordId===group.id);
 const objectName=group.keyField?(raw.details?.[group.keyField]||rows.find(r=>r.id===raw.archiveId)?.specific?.fields[group.keyField]):null;
 if(group.keyField)assert(typeof objectName==='string'&&objectName.trim(),'原文具名详情必须明确对象名称，不能把不同对象覆盖成一行');
 const matches=group.keyField?rows.filter(r=>r.specific.fields[group.keyField]===objectName):rows;
 assert(matches.length<=1,'原文状态栏存在多条主记录，请先核对，不能自动合并');
 for(const f of group.fields){const value=raw.details?.[f.id];if(value!==undefined)assert(value!==f.description&&!/^X{2,}$/.test(value)&&!/^\{\{[^}]+\}\}$/.test(value),'原文状态栏占位符不是实际状态，未明确的字段请省略');}
 assert(raw.type==='record','原文状态栏只能作为状态主记录，不能改换对象类型');
 assert(!raw.archiveId||raw.archiveId===matches[0]?.id,'原文状态栏不能替换其他成果档案');
 return {group,before:matches[0]||null,name:group.title+(objectName?' · '+objectName:'')};
}
export function statusbarPolicy(power){
 const row=builtinStatusbar(power);if(!row)return null;
 return {sourceHash:row.contentHash,source:row.block,mode:row.disposition==='dedicated'?'dedicated-existing-controls':'original-statusbar-first',
  tables:row.disposition==='dedicated'?[]:row.groups.map(g=>({recordId:g.id,name:g.title,cardinality:g.cardinality,...(g.keyField?{keyField:g.keyField}:{}),fields:g.fields.filter(f=>!statusbarResourceReadOnly(power,f.id))})),
  resourceBindings:resourcePolicy(power),
  rules:'只依据当前原文状态栏维护当前状态；原文状态栏不输出operation，由程序按单行或具名身份接续；insert/update仅兼容为冗余标记，不表示新建第二份主记录。原文占位符不是事实，未明确不初始化为0或无。相同总览只更新原archiveId，不按楼层新建；cardinality为per-object的具名详情按keyField分别维护，不覆盖其他对象，不在描述字段复制整份总览。既有其他档案保持，不能自动迁移、删除、清空或降级。缺席不代表失效；只有本轮明确变化才提交字段，不变则changes:[]。普通小额流水和日常细节不另建成果；仅在 longTermTables 明确声明范围内展开长期明细，其余不扩建子表。汇总有完整已核实明细时才计算，不能用省略输入推算。原文固定额度和规则参数不是已发生收益。已完成事件与待办、当前状态分别表述；当前主表不计作新增能力。专用模块沿用其已有受保护的字段、时间和人物入口，不允许用总览绕过保护。'};
}
export const isStatusbarRecord=record=>Boolean(record?.specific?.recordId?.startsWith('statusbar_'));
