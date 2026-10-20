import {taishiSnapshotField} from './taishi-fill.js';
import {archiveContextCurrent} from './archives.js';
import {tableForRecord} from './archive-tables.js';

// Derive a field's last actual change from retained full snapshots. A record's
// last source alone cannot prove that every column was updated on that floor.
export function fieldSourceIndex(record,section,field){
 let previous,origin=null;
 for(const row of [...(record.history||[]),record]){
  if(row.source?.type==='manual'||row.source?.contextReset===true){previous=undefined;origin=null;}
  const value=section==='details'?row.specific?.fields?.[field]:row.fields?.[field];
  if(value!==previous){
   origin=row.source?.type==='story'&&!/自主发展|发展候选|草案/.test(row.source.note||'')&&Number.isSafeInteger(row.source.anchor?.index)?row.source.anchor.index:null;
   previous=value;
  }
 }
 return typeof previous==='string'&&previous.trim()?origin:null;
}

export function maySkipStaleField(power,record,sourceIndex,field,chat){
 if(!record||!Number.isSafeInteger(sourceIndex)||sourceIndex<0||!archiveContextCurrent(record,chat)||tableForRecord(power,record)?.kind==='event')return false;
 if(taishiSnapshotField(record,field.section,field.key)===false)return false;
 const newer=fieldSourceIndex(record,field.section,field.key);
 return newer!==null&&newer>sourceIndex;
}
