import {assert,clone} from './primitives.js';
const nameKey=s=>String(s||'').normalize('NFKC').trim();
export function validateWorldStructure(value){
 if(value===undefined)return;
 assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['mode','worldId','worldName'].includes(k))&&['single','multi'].includes(value.mode),'世界建档结构无效');
 assert(typeof value.worldId==='string'&&value.worldId.length<=200&&typeof value.worldName==='string'&&value.worldName.length<=200,'主世界标识无效');
 assert(value.mode!=='single'||value.worldId&&value.worldName.trim(),'单世界须指定主世界');
}
export function worldStructurePolicy(power){
 const s=power.taishiWorldStructure;if(!s)return null;validateWorldStructure(s);
 return {...s,policy:s.mode==='single'?'玩家已选择单世界：只有指定主世界使用world，更新它必须复用worldId和worldName。大陆、板块、高天、地渊、依附层域使用region；文明与族群使用inhabitants。所有内部对象world_id使用指定主世界ID。不要再次判断世界数量，不因名称含界/域/世界或世界级规模新建world。':'玩家已选择多世界：只有设定中实际独立的世界使用world；每个世界内部的大陆、板块和依附层域使用region，文明用inhabitants。不因词条数量或体系不同自动拆世界。'};
}
// A player-selected single world supplies deterministic classification before
// ordinary field validation. Original text, fields, references and IDs survive.
export function prepareStructureImport(data,power){
 const clean=clone(data),s=power.taishiWorldStructure;let converted=0;
 if(s?.mode!=='single'||!Array.isArray(clean.changes))return {data:clean,converted};
 validateWorldStructure(s);
 for(const raw of clean.changes){
  if(!raw||typeof raw!=='object')continue;
  const root=raw.archiveId===s.worldId||nameKey(raw.name)===nameKey(s.worldName);
  if(raw.recordId==='world'&&!root){
   // Existing world identities require an explicit correction, never a silent migration.
   if(raw.archiveId&&power.archives?.[raw.archiveId]?.specific?.recordId==='world')continue;
   raw.recordId='region';raw.details={...raw.details};
   if(raw.details.reset){raw.details.limits=[raw.details.limits,'原文资格描述（不授予主世界改设资格）：'+raw.details.reset].filter(Boolean).join('\n');delete raw.details.reset;}
   converted++;
  }
  if(raw.recordId==='world'&&root){raw.archiveId=s.worldId;raw.name=s.worldName;}
  else if(raw.recordId){raw.details={...raw.details,world_id:s.worldId,world:s.worldName};}
 }
 return {data:clean,converted};
}
export function assertStructureCandidate(power,raw,before){
 const s=power.taishiWorldStructure;if(s?.mode!=='single'||raw.recordId!=='world')return;
 assert((before?.id||raw.archiveId)===s.worldId||!before&&!raw.archiveId&&nameKey(raw.name)===nameKey(s.worldName),'当前为单世界建档：板块与附属层域应归为地域，不能新增独立世界；已有错误世界需另行纠正，不自动合并');
}
