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
 // Main-status hints are redundant. Strip them instead of rejecting the
 // candidate, so a model's insert/update wording cannot block a real update.
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
 for(const f of group.fields){const value=raw.details?.[f.id];if(value!==undefined)assert(value!==f.description&&!/^X{2,}$/.test(value)&&!/^\{\{[^}]+\}\}$/.test(value),'原文状态栏占位符不是实际状态，未明确的字段请省略');}
 assert(raw.archiveId||matches.length<=1,'原文状态栏存在多条主记录，请明确原 archiveId；其他有效候选仍可保存');
 const before=raw.archiveId?matches.find(r=>r.id===raw.archiveId):matches[0]||null;
 assert(!raw.archiveId||before,'原文状态栏不能替换其他成果档案');
 return {group,before,name:group.title+(objectName?' · '+objectName:'')};
}
export function statusbarPolicy(power){
 const row=builtinStatusbar(power);if(!row)return null;
 return {sourceHash:row.contentHash,source:row.block,mode:row.disposition==='dedicated'?'dedicated-existing-controls':'original-statusbar-first',
  tables:row.disposition==='dedicated'?[]:row.groups.map(g=>({recordId:g.id,name:g.title,cardinality:g.cardinality,...(g.keyField?{keyField:g.keyField}:{}),fields:g.fields.filter(f=>!statusbarResourceReadOnly(power,f.id))})),
  resourceBindings:resourcePolicy(power),
  rules:'主状态栏和所有已启用子表在初始化与每次更新时一起核对。当前状态有变化就更新原记录，无变化保留；不要求operation，程序按单行或具名身份接续，不新建第二份主记录。原文占位符不是事实，未明确字段省略或留空。同一总览按原身份更新；per-object详情按keyField分别维护，不覆盖其他对象。既有其他档案保持，不自动迁移、删除或清空。普通小额流水不必另建成果，但主状态栏和已启用子表的明确变化仍要更新。原文固定额度和规则参数不是已发生收益。'};
}
export const isStatusbarRecord=record=>Boolean(record?.specific?.recordId?.startsWith('statusbar_'));
