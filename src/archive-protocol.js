// Model-input protocol only. Persisted readers/hashes remain unchanged.
import {withoutThoughts} from './archive-reader.js';
import {assert} from './primitives.js';
export function fieldDiagnostic(raw,types,definition){
 const declared=new Map([...Object.entries(types[raw?.type]||{}),...(definition?.fields||[]).map(f=>[f.id,f.label])]),sections={};
 for(const section of ['fields','details']){
  const values=raw?.[section];const entries=values&&typeof values==='object'&&!Array.isArray(values)?Object.entries(values):[];
  const ids=entries.map(([k])=>declared.has(k)?k:[...declared].find(([,label])=>label===k)?.[0]).filter(Boolean);
  const safeKey=k=>/^[a-zA-Z_][a-zA-Z0-9_.-]{0,79}$/.test(k)&&!/secret|token|password|key/i.test(k)?k:'[非标准字段名]';
  const valueType=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
  sections[section]={shape:Array.isArray(values)?'array':values===null?'null':typeof values,knownIds:[...new Set(ids)],unknownCount:entries.length-ids.length,nonTextCount:entries.filter(([,v])=>typeof v!=='string').length,overlongCount:entries.filter(([,v])=>typeof v==='string'&&v.length>4000).length,
   unknownFields:entries.filter(([k])=>!declared.has(k)&&![...declared.values()].includes(k)).slice(0,40).map(([k,v])=>({key:safeKey(k),type:valueType(v)})),
   nonTextFields:entries.filter(([,v])=>typeof v!=='string').slice(0,40).map(([k,v])=>({key:safeKey(k),type:valueType(v)}))};
 }
 const allowedTop=new Set(['archiveId','ownerPowerId','type','name','status','fields','details','recordId','sourceIndex','quote','ruleQuote','module','settingRefs','operation']);
 const unexpectedTopFields=Object.keys(raw||{}).filter(k=>!allowedTop.has(k)).map(k=>/^[a-zA-Z_][a-zA-Z0-9_.-]{0,79}$/.test(k)&&!/secret|token|password|key/i.test(k)?k:'[非标准字段名]');
 return {stage:'archive_validation',unexpectedTopFields,...(Object.hasOwn(types,raw?.type)?{type:raw.type}:{}),...(definition?{recordId:definition.id}:{}),sections};
}
export const ARCHIVE_PROTOCOL_POLICY='按输入的 responseContract 返回 floorReviews，逐层核对，不得只检查最后一层。每层只返回一个 {sourceIndex:内部0基整数,status:"reviewed"或"uncertain",changeCount:本层返回的变化与进展总数}；漏查、冲突或归属不明为 uncertain，明确没有变化也必须报告。优先提取 sources.settlements.facts，再用 statusSnapshots（含MMLC-archive长期总档）核对当前快照；总档存量不等于本轮新增，不重复发放或累加；content 仅补充叙事。opportunities 不代表玩家已选择、执行或到账。较新快照遗漏不代表删除旧成果；跨层重复不再次建档。已有记录复用 ID，各独立历史事件逐条保存。通用 fields 只能使用 fieldTypes[type] 的 ID；专用字段必须使用 recordSchemas 对应 recordId，并放在 details。优先使用适合该事实的专用分类；已确认在本任务范围内但无法可靠映射时可用合法通用类型，不猜recordId；通用分类不接收归属不明或其他词条成果。已有专用对象继续沿用原分类。每项明确 ownerPowerId，协作不转移归属。插件只归档已有事实，不执行结算。';

export function evidenceParts(content){
 const clean=withoutThoughts(content).replace(/<(story_driver|combat_driver|acg_think)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'');
 const envelope=/<([a-z][a-z0-9_]*-(?:settle|status|state)|MMLC-archive)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi,blocks=[...clean.matchAll(envelope)];
 const receipts=blocks.filter(m=>/-settle$/i.test(m[1])).map(m=>{const value=m[2].trim(),at=value.search(/(?:^|\n)\s*(?:后续机会|下一步)\s*[：:]/);return {protocol:m[1],facts:at<0?value:value.slice(0,at).trim(),opportunities:at<0?'':value.slice(at).trim()};});
 return {body:clean.replace(envelope,'').trim(),settlements:receipts,statusSnapshots:blocks.filter(m=>!/-settle$/i.test(m[1])).map(m=>m[2].trim()).filter(Boolean)};
}

// A model's archive title need not occur verbatim in its narrative quote.
// Bind that title through an explicit receipt from the same source floor;
// planning, future opportunities and other powers cannot supply ownership.
export function settledOwnership(content,powerName,objectName,worldName=''){
 const alias=String(powerName||'').split(/[（(]/)[0].trim(),name=String(objectName||'').trim();
 if(!alias||!name)return false;
 return evidenceParts(content).settlements.some(receipt=>{let inherited=[];return receipt.facts.split(/\r?\n/).some(line=>{
  const markers=receiptScopeOwners(line,[alias]);
  if(markers.length||receiptItemStart(line))inherited=markers;
  const owners=markers.length?markers:inherited;
  const owner=owners.length?owners.every(marker=>marker===alias):line.includes(alias);
  return owner&&line.includes(name)&&(!worldName||line.includes(worldName))
   &&!/(?:尚未|未曾|未能|没有|计划|准备|拟将|如果|可能|预计)/.test(line)
   &&/(?:成功|已生效|已到账|已入账|已归档|已交付|已完成|已建立|已取得|已获得|已结算|已暂存|已延期|资格已保留)/.test(line);
 });});
}
// Each numbered receipt item starts a new scope. Its leading owner marker
// must not inherit the previous power, including powers absent from this task.
// Ordinary bracketed items later in a sentence remain object names.
const receiptItemStart=line=>/^\s*\d+[.、．)]\s*/.test(line);
function receiptScopeOwners(line,known){
 const owners=protocolOwners(line,known);
 const heading=String(line).match(/^\s*\d+[.、．)]\s*【([^】·]+)(?:·[^】]*)?】/);
 return [...new Set([...(heading?[heading[1].trim()]:[]),...owners])];
}

// Qualified protocol headings carry ownership; ordinary bracketed place/item
// names do not. A bare heading counts only when it is a known power name.
export function protocolOwners(text,known=[]){
 return [...new Set([...String(text||'').matchAll(/【([^】·]+)(·[^】]*)?】/g)].filter(m=>known.includes(m[1].trim())||m[2]&&/(?:结算|回执|总览|状态|调用成果|收益)/.test(m[2])).map(m=>m[1].trim()))];
}
export function sourceOwnership(content,quote,known=[]){
 const direct=protocolOwners(quote,known);if(direct.length||!quote)return direct;
 const parts=evidenceParts(content),blocks=[...parts.settlements.map(r=>r.facts),...parts.statusSnapshots];
 const matches=[];
 for(const block of blocks){let offset=0;while(offset<block.length){const at=block.indexOf(quote,offset);if(at<0)break;
   const prefix=block.slice(0,at),lines=prefix.split(/\r?\n/);let owners=[];
   for(const line of lines){const found=receiptScopeOwners(line,known);if(found.length||receiptItemStart(line))owners=found;}
   matches.push(owners);offset=at+quote.length;
 }}
 // The same quote in two differently owned receipts is ambiguous, not current.
 return [...new Set(matches.flat())];
}

// Deterministic aliases only: declared IDs and UI labels, never guessed keys.
export function canonicalFields(raw,types,definition,{resolutions={}}={}){
 const allowed=types[raw.type];if(!allowed)return raw;
 const fields={},details={},conflicts=[];
 const resolve=(key,entries)=>entries.find(([id])=>id===key)?.[0]||entries.find(([,label])=>label===key)?.[0];
 const equal=(a,b)=>typeof a==='string'&&typeof b==='string'?a.trim().replace(/\r\n/g,'\n')===b.trim().replace(/\r\n/g,'\n'):a===b;
 const put=(target,section,id,label,value)=>{
  if(['scale','quantity','capacity','level'].includes(id)&&typeof value==='number'&&Number.isSafeInteger(value))value=String(value);
  const key=section+':'+id;
  if(Object.hasOwn(target,id)&&!equal(target[id],value)){
   if(Object.hasOwn(resolutions,key)){assert(typeof resolutions[key]==='string','修正字段必须为文字');target[id]=resolutions[key];}
   else conflicts.push({key,section,id,label,left:target[id],right:value});
  }else target[id]=value;
 };
 if(definition)for(const [key,value]of Object.entries(raw.details||{})){
  const id=resolve(key,definition.fields.map(f=>[f.id,f.label]));assert(id,'专用字段不在声明中：'+key);
  put(details,'details',id,definition.fields.find(f=>f.id===id).label,value);
 }
 for(const [key,value]of Object.entries(raw.fields||{})){
  const canonical=resolve(key,Object.entries(allowed));
  const specific=definition&&resolve(key,definition.fields.map(f=>[f.id,f.label]));
  if(canonical)put(fields,'fields',canonical,allowed[canonical],value);
  else if(specific)put(details,'details',specific,definition.fields.find(f=>f.id===specific).label,value);
  else throw Error('档案字段不在声明中：'+key+'；允许：'+Object.keys(allowed).join('、')+(definition?'；专用字段请放 details：'+definition.fields.map(f=>f.id).join('、'):''));
 }
 if(conflicts.length){const error=Error('重复字段内容冲突：'+conflicts.map(c=>c.label).join('、')+'；可本地选择或手动修正，无需重新调用AI');error.fieldConflicts=conflicts;throw error;}
 if(definition){
  if(!Object.keys(fields).length&&Object.keys(details).length){const target=raw.type==='record'?'description':Object.keys(allowed)[0];fields[target]=Object.entries(details).map(([k,v])=>definition.fields.find(f=>f.id===k).label+'：'+v).join('\n');}
  return {...raw,fields,details};
 }
 return {...raw,fields};
}

export function assertSnapshotPatch(before,fields,details,quote,content){
 if(!before||!quote)return;
 const parts=evidenceParts(content),snapshotOnly=parts.statusSnapshots.some(s=>s.includes(quote))&&!parts.body.includes(quote)&&!parts.settlements.some(s=>s.facts.includes(quote));
 if(!snapshotOnly)return;
 const unknown=value=>/^(?:无|暂无|未知|未登记|未记载|不详|空)?[。；;\s]*$/.test(String(value));
 const regressions=Object.entries(fields||{}).filter(([k,v])=>before.fields?.[k]&&!unknown(before.fields[k])&&unknown(v));
 const specific=Object.entries(details||{}).filter(([k,v])=>before.specific?.fields[k]&&!unknown(before.specific.fields[k])&&unknown(v));
 assert(!regressions.length&&!specific.length,'状态快照不能单独清空已知记录；需要正文明确的消耗、删除或更正事实，旧档案保留待核对');
}

export function assertFactEvidence(quote,content){
 if(!quote)return;
 const plain=value=>String(value).replace(/<[^>]*>/g,'').replace(/\s/g,'');
 const needle=plain(quote);if(!needle)return;
 const parts=evidenceParts(content),facts=[parts.body,...parts.settlements.map(r=>r.facts),...parts.statusSnapshots];
 const found=facts.some(s=>plain(s).includes(needle));
 assert(found||!plain(content).includes(needle),'引用仅存在于规划或未选择的后续机会中，不能作为已成立事实归档');
}

export function floorCoverage(data,sources,changes,terminalResults=[],creationResults=[]){
 const rows=Array.isArray(data.floorReviews)?data.floorReviews:[];
 return sources.map(s=>{
  const count=changes.filter(c=>c.source?.anchor?.index===s.index).length+terminalResults.filter(c=>c.progress?.anchor?.index===s.index).length+creationResults.filter(c=>c.progress?.anchor?.index===s.index).length;
  const matches=rows.filter(r=>r?.sourceIndex===s.index);
  const r=matches.length===1?matches[0]:null;
  const reviewed=Boolean(r&&r.status==='reviewed'&&Number.isSafeInteger(r.changeCount)&&r.changeCount===count);
  return {floor:s.index+1,sourceIndex:s.index,accepted:count,status:reviewed?'reviewed':'uncertain',reason:reviewed?'':r?.status==='uncertain'&&typeof r.reason==='string'&&r.reason.trim()?r.reason.trim().slice(0,600):'未提供一致的逐层核对结果'};
 });
}
