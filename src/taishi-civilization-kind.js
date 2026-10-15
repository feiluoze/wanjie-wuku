// Navigation classification only. No archive deletion, balance update or persisted migration.
export function isCivilizationRecord(record){
 if(record?.specific?.recordId!=='inhabitants')return false;
 const kind=record.specific.fields?.kind;
 if(kind)return kind==='civilization';
 // Compatibility for already saved explicit civilization names/player registrations.
 // Unmarked population records remain available in the archive, not navigation roots.
 return /玩家登记世界内部文明/.test(record.source?.note||'')||[record.name,...(record.history||[]).map(h=>h.name)].some(n=>typeof n==='string'&&/文明(?:[（(].*[）)])?$/.test(n));
}
export function classifyInhabitantInput(raw,reference,power){
 if(raw?.recordId!=='inhabitants')return;
 raw.details||={};
 if(!raw.details||typeof raw.details!=='object'||Array.isArray(raw.details))return;
 if(!reference)return;
 const markers=(reference.payload?.books||[]).flatMap(b=>b.entries.flatMap(e=>[...String(e.content||'').matchAll(/^(?:#{1,6}\s+)?【(文明|族群)】([^\r\n]+)\s*$/gm)]));
 const exact=markers.filter(m=>m[2].normalize('NFKC').trim()===String(raw.name||'').normalize('NFKC').trim());
 const existing=raw.archiveId?power?.archives?.[raw.archiveId]:Object.values(power?.archives||{}).find(r=>r.name===raw.name&&r.specific?.recordId==='inhabitants');
 if(exact.some(m=>m[1]==='文明')&&!exact.some(m=>m[1]==='族群'))raw.details.kind='civilization';
 else if(exact.some(m=>m[1]==='族群'))raw.details.kind='population';
 else if(existing)raw.details.kind=isCivilizationRecord(existing)?'civilization':'population';
 else raw.details.kind='population';
}
