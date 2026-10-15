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
 const civilizations=records.filter(r=>r.specific?.recordId==='inhabitants'&&r.status!=='ended'&&worldForRecord(power,r,chat)?.id===world?.id);
 const civilizationId=civilizations.some(c=>c.id===preference.civilizationId)?preference.civilizationId:'';
 return {records,worlds,mode,world,civilizations,civilizationId};
}
export function civilizationForRecord(power,record,chat=[]){
 const world=worldForRecord(power,record,chat);if(!world)return null;
 const list=Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='inhabitants'&&r.status!=='ended'&&archiveCurrent(r,chat)&&worldForRecord(power,r,chat)?.id===world.id);
 if(record.specific?.recordId==='inhabitants')return list.find(r=>r.id===record.id)||null;
 const f=record.specific?.fields||{};
 if(f.civilization_id)return list.find(r=>r.id===f.civilization_id)||null;
 for(const id of [f.organization_id,f.region_id]){
  const parent=power.archives?.[id];
  if(!parent||!archiveCurrent(parent,chat)||parent.status==='ended'||worldForRecord(power,parent,chat)?.id!==world.id)continue;
  if(parent.specific?.fields.civilization_id)return list.find(r=>r.id===parent.specific.fields.civilization_id)||null;
 }
 const region=f.region_id||(record.specific?.recordId==='region'?record.id:power.archives?.[f.organization_id]?.specific?.fields.region_id);
 const matches=region?list.filter(c=>c.specific.fields.region_id===region):[];
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
