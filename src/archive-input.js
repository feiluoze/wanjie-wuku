import {archiveOrigin} from './archive-origin.js';
// Preserve all fact fields and identity, omit evidence already supplied in sources.
export function archiveInputRecord(r) {
 const item={provenance:archiveOrigin(r),id:r.id,name:r.name,type:r.type,status:r.status,fields:r.fields,...(r.module?{module:r.module}:{}),...(r.ownerPowerId?{ownerPowerId:r.ownerPowerId}:{})};
 if(r.specific)item.specific={adapterId:r.specific.adapterId,recordId:r.specific.recordId,fields:Object.fromEntries(Object.entries(r.specific.fields||{}).filter(([k])=>!['source_profile','time_state'].includes(k)))};
 item.previousNames=[...new Set((r.history||[]).map(h=>h.name))].filter(n=>n!==r.name).slice(-12);
 return item;
}
export function inputCharacterBreakdown(payload) {return Object.fromEntries(Object.entries(payload).map(([key,value])=>[key,JSON.stringify(value)?.length||0]));}
