import {isCivilizationRecord} from './taishi-civilization-kind.js';
import {hash} from './primitives.js';
import {archiveCurrent} from './archives.js';
import {worldForRecord} from './taishi-world.js';

export const TAISHI_LAYOUTS={multi:'多世界',single:'单主世界'};
export const taishiLayoutKey=(scope,powerId)=>'wjwk:taishi-layout:'+hash(scope+'|'+powerId);
export function readTaishiLayout(storage,scope,powerId){
 try{const value=JSON.parse(storage?.getItem(taishiLayoutKey(scope,powerId))||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
export function saveTaishiLayout(storage,scope,powerId,value){
 const clean={mode:value.mode==='multi'?'multi':'single',worldId:String(value.worldId||''),civilizationId:String(value.civilizationId||'')};
 try{storage?.setItem(taishiLayoutKey(scope,powerId),JSON.stringify(clean));return Boolean(storage);}catch{return false;}
}
export function taishiLayout(power,chat=[],preference={}){
 const records=Object.values(power.archives||{}).filter(r=>archiveCurrent(r,chat));
 const worlds=records.filter(r=>r.specific?.recordId==='world'&&r.status!=='ended');
 const mode=Object.hasOwn(TAISHI_LAYOUTS,preference.mode)?preference.mode:power.taishiWorldStructure?.mode||(worlds.length>1?'multi':'single');
 const world=worlds.find(w=>w.id===(preference.worldId||power.taishiWorldStructure?.worldId))||worlds[0]||null;
 const civilizations=records.filter(r=>isCivilizationRecord(r)&&r.status!=='ended'&&worldForRecord(power,r,chat)?.id===world?.id);
 const civilizationId=civilizations.some(c=>c.id===preference.civilizationId)?preference.civilizationId:'';
 return {records,worlds,mode,world,civilizations,civilizationId};
}
export function civilizationForRecord(power,record,chat=[]){
 const world=worldForRecord(power,record,chat);if(!world)return null;
 const valid=r=>r&&r.status!=='ended'&&archiveCurrent(r,chat)&&worldForRecord(power,r,chat)?.id===world.id;
 const list=Object.values(power.archives||{}).filter(r=>isCivilizationRecord(r)&&valid(r));
 if(isCivilizationRecord(record))return list.find(r=>r.id===record.id)||null;
 const f=record.specific?.fields||{};
 const resolve=(r,seen=new Set())=>{
  if(!valid(r)||seen.has(r.id)||seen.size>=32)return null;seen.add(r.id);
  if(isCivilizationRecord(r))return list.find(c=>c.id===r.id)||null;
  const v=r.specific?.fields||{};
  if(v.civilization_id){const target=power.archives?.[v.civilization_id];if(!target)return null;return resolve(target,seen);}
  for(const id of [v.organization_id,v.region_id]){const parent=power.archives?.[id];if(valid(parent)&&parent.specific?.fields.civilization_id){const c=resolve(parent,seen);if(c)return c;}}
  return null;
 };
 if(f.civilization_id)return resolve(record); // Explicit invalid links never fall back.
 const direct=resolve(record);if(direct)return direct;
 // Late civilization imports regroup earlier records by explicit geography, without AI writes.
 const regions=Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='region'&&valid(r));
 const tokens=v=>new Set(String(v||'').normalize('NFKC').split(/[·：:；;、,，/\n\s（）()]+/).filter(Boolean));
 const regionIds=r=>{
  const result=new Set(),seen=new Set();
  const walk=x=>{if(!valid(x)||seen.has(x.id)||seen.size>=32)return;seen.add(x.id);
   const v=x.specific?.fields||{};if(x.specific?.recordId==='region')result.add(x.id);
   if(v.region_id){const parent=power.archives?.[v.region_id];if(valid(parent))walk(parent);}
   else {const names=tokens(v.location||x.fields?.location);for(const candidate of regions)if(candidate.id!==x.id&&names.has(candidate.name))walk(candidate);}
   if(v.organization_id)walk(power.archives?.[v.organization_id]);
  };walk(r);return result;
 };
 const own=regionIds(record),matches=list.filter(c=>[...regionIds(c)].some(id=>own.has(id)));
 return matches.length===1?matches[0]:null;
}

export function taishiLayoutGroups(power,rows,layout,chat=[]){
 if(layout.mode==='multi'){
  const groups=layout.worlds.map(w=>({id:w.id,name:w.name,kind:'world',record:w,rows:rows.filter(r=>worldForRecord(power,r,chat)?.id===w.id)}));
  const unknown=rows.filter(r=>!layout.worlds.some(w=>worldForRecord(power,r,chat)?.id===w.id));
  if(unknown.length)groups.push({id:'unassigned',name:'待明确所属世界',kind:'unassigned',rows:unknown});
  return groups.filter(g=>g.rows.length);
 }
 const scoped=layout.world?rows.filter(r=>r.id!==layout.world.id&&worldForRecord(power,r,chat)?.id===layout.world.id):[];
 const groups=layout.civilizations.filter(c=>!layout.civilizationId||c.id===layout.civilizationId).map(c=>({id:c.id,name:c.name,kind:'civilization',record:c,rows:scoped.filter(r=>civilizationForRecord(power,r,chat)?.id===c.id)}));
 const common=scoped.filter(r=>!civilizationForRecord(power,r,chat));
 if(common.length)groups.push({id:'common',name:'世界公共',kind:'common',rows:common});
 const unknown=rows.filter(r=>r.specific?.recordId!=='world'&&!worldForRecord(power,r,chat));
 if(unknown.length)groups.push({id:'unassigned',name:'待明确归属',kind:'unassigned',rows:unknown});
 return groups.filter(g=>g.rows.length);
}
export function taishiSearch(records,query=''){
 const key=String(query).trim().toLocaleLowerCase();if(!key)return records;
 return records.filter(r=>[r.name,...Object.values(r.fields||{}),...Object.entries(r.specific?.fields||{}).filter(([k])=>k!=='source_profile'&&!k.endsWith('_id')).map(([,v])=>v)].some(v=>String(v).toLocaleLowerCase().includes(key)));
}
