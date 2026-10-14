import {archiveOrigin} from './archive-origin.js';
// Preserve all fact fields and identity, omit evidence already supplied in sources.
export function archiveInputRecord(r) {
 const item={provenance:archiveOrigin(r),id:r.id,name:r.name,type:r.type,status:r.status,fields:r.fields,...(r.module?{module:r.module}:{}),...(r.ownerPowerId?{ownerPowerId:r.ownerPowerId}:{})};
 if(r.specific)item.specific={adapterId:r.specific.adapterId,recordId:r.specific.recordId,fields:Object.fromEntries(Object.entries(r.specific.fields||{}).filter(([k])=>!['source_profile','time_state'].includes(k)))};
 item.previousNames=[...new Set((r.history||[]).map(h=>h.name))].filter(n=>n!==r.name).slice(-12);
 return item;
}
export function inputCharacterBreakdown(payload) {return Object.fromEntries(Object.entries(payload).map(([key,value])=>[key,JSON.stringify(value)?.length||0]));}

// Large narrative updates carry full relevant records and a complete identity
// index for the rest. Never mutate saved facts or trim individual field values.
export function selectArchiveInput(records,query,{compact=false,focusIds=null}={}){
 const full=records.map(archiveInputRecord);
 if(!focusIds&&(!compact||JSON.stringify(full).length<=24000))return full;
 const key=s=>String(s||'').normalize('NFKC').replace(/\s/g,'').toLowerCase(),text=key(query);
 const selected=new Set(focusIds||full.filter(r=>[r.name,...r.previousNames].some(n=>key(n).length>=2&&text.includes(key(n)))).map(r=>r.id));
 for(const r of full.filter(r=>selected.has(r.id))){
  const f=r.specific?.fields||{};
  for(const id of [f.world_id,f.region_id,f.organization_id,f.subject_id,f.target_id,f.event_id])if(id)selected.add(id);
  if(!f.world_id&&f.world)for(const w of full)if(w.specific?.recordId==='world'&&key(w.name)===key(f.world))selected.add(w.id);
 }
 return full.map(r=>selected.has(r.id)?r:{id:r.id,name:r.name,type:r.type,status:r.status,previousNames:r.previousNames,identityOnly:true,...(r.module?{module:r.module}:{}),...(r.ownerPowerId?{ownerPowerId:r.ownerPowerId}:{}),...(r.specific?{specific:{adapterId:r.specific.adapterId,recordId:r.specific.recordId,fields:Object.fromEntries(Object.entries(r.specific.fields).filter(([k])=>['world_id','world'].includes(k)))}}:{})});
}
