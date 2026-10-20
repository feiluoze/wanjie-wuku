import {fieldSourceIndex} from './archive-stale.js';
import {archiveOrigin} from './archive-origin.js';
// Preserve all fact fields and identity, omit evidence already supplied in sources.
export function archiveInputRecord(r) {
 const item={provenance:archiveOrigin(r),id:r.id,name:r.name,type:r.type,status:r.status,fields:r.fields,...(r.module?{module:r.module}:{}),...(r.ownerPowerId?{ownerPowerId:r.ownerPowerId}:{})};
 if(r.specific)item.specific={adapterId:r.specific.adapterId,recordId:r.specific.recordId,fields:Object.fromEntries(Object.entries(r.specific.fields||{}).filter(([k])=>!['source_profile','time_state'].includes(k)))};
 if(Number.isSafeInteger(r.source?.anchor?.index))item.lastSourceIndex=r.source.anchor.index;
 if(r.specific?.adapterId==='wuku.primordial_world')item.fieldSourceIndexes=Object.fromEntries(['fields','details'].map(section=>[section,Object.fromEntries(Object.keys(section==='details'?item.specific.fields:item.fields||{}).map(id=>[id,fieldSourceIndex(r,section,id)]).filter(([,index])=>index!==null))]));
 item.previousNames=[...new Set((r.history||[]).map(h=>h.name))].filter(n=>n!==r.name).slice(-12);
 return item;
}
export function inputCharacterBreakdown(payload) {return Object.fromEntries(Object.entries(payload).map(([key,value])=>[key,JSON.stringify(value)?.length||0]));}

// Setup is an incremental import, not a request to rewrite the entire archive.
// Keep every identity, but spend a fixed budget on details relevant to this piece.
export function selectBuildArchiveInput(records,reference,{detailBudget=24000,worldId=null}={}){
 const full=records.map(archiveInputRecord),key=s=>String(s||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
 const entries=reference?.payload?.books?.flatMap(b=>b.entries)||[],query=key(entries.map(e=>e.title+'\n'+e.content).join('\n'));
 const identities=full.map(r=>{
  const f=r.specific?.fields||{},scope=f.world_id&&f.world_id!==worldId?{world_id:f.world_id}:!f.world_id&&f.world?{world:f.world}:{};
  return {id:r.id,name:r.name,type:r.type,status:r.status,...(r.previousNames.length?{previousNames:r.previousNames}:{}),identityOnly:true,...(r.specific?{specific:{recordId:r.specific.recordId,...(Object.keys(scope).length?{fields:scope}:{})}}:{})};
 });
 let remaining=Math.max(0,Math.min(detailBudget,80000-JSON.stringify(identities).length));
 return full.map((r,i)=>{
  if(![r.name,...r.previousNames].some(n=>key(n).length>=2&&query.includes(key(n))))return identities[i];
  const cost=JSON.stringify(r).length-JSON.stringify(identities[i]).length;
  if(cost>remaining)return identities[i];remaining-=Math.max(0,cost);return r;
 });
}

// Large narrative updates carry full relevant records and a complete identity
// index for the rest. Never mutate saved facts or trim individual field values.
export function selectArchiveInput(records,query,{compact=false,focusIds=null,detailBudget=24000}={}){
 const full=records.map(archiveInputRecord);
 if(!focusIds&&(!compact||JSON.stringify(full).length<=24000))return full;
 const key=s=>String(s||'').normalize('NFKC').replace(/\s/g,'').toLowerCase(),text=key(query);
 const selected=new Set(focusIds||full.filter(r=>[r.name,...r.previousNames].some(n=>key(n).length>=2&&text.includes(key(n)))).map(r=>r.id));
 for(const r of full.filter(r=>selected.has(r.id))){
  const f=r.specific?.fields||{};
  for(const id of [f.world_id,f.region_id,f.organization_id,f.civilization_id,f.subject_id,f.target_id,f.event_id])if(id)selected.add(id);
  if(!f.world_id&&f.world)for(const w of full)if(w.specific?.recordId==='world'&&key(w.name)===key(f.world))selected.add(w.id);
 }
 const identities=full.map(r=>({id:r.id,name:r.name,type:r.type,status:r.status,...(r.previousNames.length?{previousNames:r.previousNames}:{}),identityOnly:true,...(r.module?{module:r.module}:{}),...(r.specific?{specific:{recordId:r.specific.recordId,fields:Object.fromEntries(Object.entries(r.specific.fields).filter(([k])=>['world_id','world'].includes(k)))}}:{})}));
 let remaining=Math.max(0,Math.min(detailBudget,80000-JSON.stringify(identities).length));
 return full.map((r,i)=>{
  if(!selected.has(r.id))return identities[i];
  const cost=Math.max(0,JSON.stringify(r).length-JSON.stringify(identities[i]).length);
  if(cost>remaining)return identities[i];remaining-=cost;return r;
 });
}

// A read-only archive request depends on this power and the ownership directory,
// not the full details of unrelated powers. Never use this for resource settlement.
export function archiveRequestScope(state,powerId){
 return {power:state.powers?.[powerId],roleLink:state.roleLink,aiWorldbooks:state.aiWorldbooks,terminalOrders:(state.terminalOrders||[]).filter(r=>r.powerId===powerId),creations:(state.creations||[]).filter(r=>r.powerId===powerId),
 ownership:Object.values(state.powers||{}).filter(p=>p.id!==powerId).map(p=>({id:p.id,name:p.name,active:p.active,objects:Object.values(p.archives||{}).map(r=>({id:r.id,name:r.name,type:r.type,ownerPowerId:r.ownerPowerId,previousNames:[...new Set((r.history||[]).map(h=>h.name).filter(name=>name!==r.name))]}))}))};
}
