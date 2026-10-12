// Model-input protocol only. Persisted readers/hashes remain unchanged.
import {withoutThoughts} from './archive-reader.js';
import {assert} from './primitives.js';
export const ARCHIVE_PROTOCOL_POLICY='按输入的 responseContract 返回 floorReviews，逐层核对，不得只检查最后一层。每层只返回一个 {sourceIndex:内部0基整数,status:"reviewed"或"uncertain",changeCount:本层返回的变化与进展总数}；漏查、冲突或归属不明为 uncertain，明确没有变化也必须报告。优先提取 sources.settlements.facts，再用 statusSnapshots 核对当前快照，content 仅补充叙事。opportunities 不代表玩家已选择、执行或到账。较新快照遗漏不代表删除旧成果；跨层重复不再次建档。已有记录复用 ID，各独立历史事件逐条保存。通用 fields 只能使用 fieldTypes[type] 的 ID；专用字段必须使用 recordSchemas 对应 recordId，并放在 details。已有专用分类的词条不要用普通技能或关系类别代替其记录范围；无法归类的内容说明并留待核对。每项明确 ownerPowerId，协作不转移归属。插件只归档已有事实，不执行结算。';

export function evidenceParts(content){
 const clean=withoutThoughts(content).replace(/<(story_driver|combat_driver|acg_think)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'');
 const blocks=[...clean.matchAll(/<([a-z][a-z0-9_]*-(settle|status|state))\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)];
 const receipts=blocks.filter(m=>m[2].toLowerCase()==='settle').map(m=>{const value=m[3].trim(),at=value.search(/(?:^|\n)\s*(?:后续机会|下一步)\s*[：:]/);return {protocol:m[1],facts:at<0?value:value.slice(0,at).trim(),opportunities:at<0?'':value.slice(at).trim()};});
 return {body:clean.replace(/<([a-z][a-z0-9_]*-(?:settle|status|state))\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').trim(),settlements:receipts,statusSnapshots:blocks.filter(m=>m[2].toLowerCase()!=='settle').map(m=>m[3].trim()).filter(Boolean)};
}

// Deterministic aliases only: declared IDs and UI labels, never guessed keys.
export function canonicalFields(raw,types,definition){
 const allowed=types[raw.type];if(!allowed)return raw;
 const fields={},details={...(raw.details||{})};
 const resolve=(key,entries)=>entries.find(([id])=>id===key)?.[0]||entries.find(([,label])=>label===key)?.[0];
 for(const [key,value] of Object.entries(raw.fields||{})){
  const canonical=resolve(key,Object.entries(allowed));
  const specific=definition&&resolve(key,definition.fields.map(f=>[f.id,f.label]));
  if(canonical){assert(!Object.hasOwn(fields,canonical)||fields[canonical]===value,'字段别名与标准字段值冲突');fields[canonical]=value;}
  else if(specific){assert(!Object.hasOwn(details,specific)||details[specific]===value,'通用与专用字段值冲突');details[specific]=value;}
  else throw Error('档案字段不在声明中：'+key+'；允许：'+Object.keys(allowed).join('、')+(definition?'；专用字段请放 details：'+definition.fields.map(f=>f.id).join('、'):''));
 }
 if(definition){
  const canonicalDetails={};for(const [key,value]of Object.entries(details)){
   const id=resolve(key,definition.fields.map(f=>[f.id,f.label]));assert(id,'专用字段不在声明中：'+key);
   assert(!Object.hasOwn(canonicalDetails,id)||canonicalDetails[id]===value,'专用字段别名冲突');canonicalDetails[id]=value;
  }
  // Preserve exact declared values as a display summary when a model supplies
  // only dedicated fields. This is formatting, not inferred game state.
  if(!Object.keys(fields).length&&Object.keys(canonicalDetails).length){const target=raw.type==='record'?'description':Object.keys(allowed)[0];fields[target]=Object.entries(canonicalDetails).map(([k,v])=>definition.fields.find(f=>f.id===k).label+'：'+v).join('\n');}
  return {...raw,fields,details:canonicalDetails};
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
  return {floor:s.index+1,sourceIndex:s.index,accepted:count,status:reviewed?'reviewed':'uncertain',reason:reviewed?'':'未提供一致的逐层核对结果'};
 });
}
