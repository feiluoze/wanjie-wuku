import {isStatusbarRecord} from './builtin-statusbar.js';
import {projectResourceStatus} from './builtin-resources.js';
import { isMmlc, mmlcModule } from './mmlc.js';
export { specificRows, specificDiff } from './specific-values.js';
import { validateSpecific } from './state-validation.js';
export { validateSpecific } from './state-validation.js';
import {assert,clone,stable,text} from './core.js';
import {creationConfig} from './creation-config.js';
import {archiveCurrent} from './archives.js';
import {worldForRecord} from './taishi-world.js';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);

export function normalizeSpecific(raw,power,before,{recovery=false,chat=[]}={}){
 if(isMmlc(power)&&before?.specific)assert((raw.module||mmlcModule(before))===before.specific.recordId,'已有漫漫长路专用档案不能自动改换模块身份');
 if(raw.recordId===undefined&&raw.details===undefined){assert(!recovery||!before?.specific,'旧专用统计来源失效，需AI重新确认专用字段');return before?.specific?clone(before.specific):undefined;}
 const config=creationConfig(power),definition=config?.records.find(r=>r.id===raw.recordId);
 assert(definition&&object(raw.details)&&Object.keys(raw.details).length&&Object.keys(raw.details).every(k=>definition.fields.some(f=>f.id===k)),'专用统计分类或字段不在当前适配声明中');
 const adapterId=definition.id.startsWith('statusbar_')?'wuku.original_statusbar':config.id;
 assert(!before?.specific||before.specific.adapterId===adapterId&&before.specific.recordId===definition.id,'已有对象不能自动换成另一种专用统计身份');
 if(isMmlc(power))assert(definition.id===(raw.module||mmlcModule(before||raw)),'漫漫长路专用字段必须归入同一个模块');
 assert(!Object.hasOwn(raw.details,'source_profile'),'世界书原文只允许程序复制，不能由AI改写');
 const patch={};for(const [k,v]of Object.entries(raw.details)){assert(typeof v==='string'&&v.length<=4000,'专用统计只接收正文中的文字，不推算数值');patch[k]=v.trim();}
 
 const fields=recovery?patch:{...before?.specific?.fields,...patch};
 if(config.id==='wuku.primordial_world'&&definition.id!=='world'){
  if(fields.world_id)assert(power.archives?.[fields.world_id]?.specific?.recordId==='world','所属世界ID不存在或不是世界档案，请核对后重试');
  else if(fields.world){const world=worldForRecord(power,{specific:{fields}},chat);if(world)fields.world_id=world.id;}
 }
 const labels={...before?.specific?.labels,...Object.fromEntries(definition.fields.map(f=>[f.id,f.label]))};
 const result={adapterId,recordId:definition.id,version:config.version,label:definition.label,labels,fields};validateSpecific(result);return result;
}


export function specializedGroups(power,chat){
 const groups=new Map();for(const r of Object.values(power.archives||{}).map(r=>projectResourceStatus(power,r))){if(!r.specific||isStatusbarRecord(r))continue;const id=r.specific.adapterId+'/'+r.specific.recordId;if(!groups.has(id))groups.set(id,{id,label:r.specific.label,records:[],active:0,working:0,planned:0,stale:0});const g=groups.get(id);g.records.push(r);if(!archiveCurrent(r,chat))g.stale++;else if(Object.hasOwn(g,r.status))g[r.status]++;}
 return [...groups.values()];
}

// Optional data-declared overview; no entry-name branches or new storage.
export function statisticsDashboard(power,chat){
 const config=creationConfig(power);if(!config?.dashboard)return null;
 const sections=config.dashboard.sections.map(section=>{
  const records=Object.values(power.archives||{}).filter(r=>r.specific?.adapterId===config.id&&section.recordIds.includes(r.specific.recordId)).map(r=>projectResourceStatus(power,r));
  const counts={active:0,working:0,planned:0,ended:0,stale:0};for(const r of records){if(!archiveCurrent(r,chat))counts.stale++;else counts[r.status]++;}
  return {...section,records,counts};
 });
 return {...config.dashboard,adapterId:config.id,sections};
}
