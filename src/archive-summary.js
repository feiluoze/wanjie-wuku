// This is derived display metadata. Recover it without touching archive facts.
export function recoverArchiveSummary(power) {
 const u=power.lastArchiveUpdate;if(u===undefined)return;
 const header=u&&Number.isSafeInteger(u.at)&&u.at>=0&&typeof u.automatic==='boolean'&&Number.isInteger(u.arrangements)&&u.arrangements>=0&&u.arrangements<=64&&Array.isArray(u.sourceIndices)&&u.sourceIndices.length<=80&&u.sourceIndices.every(i=>Number.isSafeInteger(i)&&i>=0)&&new Set(u.sourceIndices).size===u.sourceIndices.length;
 if(!header||!Array.isArray(u.records)||u.records.length>4096){delete power.lastArchiveUpdate;power.archiveSummaryRecovery='最近整理摘要异常，已隔离摘要；成果及历史保留。';return;}
 const rows=new Map();let invalid=0;
 for(const row of u.records){if(!row||!power.archives?.[row.id]||!/^[a-f0-9]{16}$/.test(row.signature)||!['created','updated','recovered'].includes(row.kind)){invalid++;continue;}const previous=rows.get(row.id);rows.set(row.id,{...row,kind:previous?.kind==='created'?'created':row.kind});}
 if(invalid||rows.size!==u.records.length)power.archiveSummaryRecovery='最近整理摘要已去重并隔离失效引用；成果及历史保留。';
 u.records=[...rows.values()];
}
