// Keep explicit relationships attached to record IDs when display names change.
const normalize=v=>String(v||'').normalize('NFKC').trim().toLowerCase();
export function bindMmlcLinks(power){
 const records=Object.values(power.archives||{}),names=new Map();
 for(const r of records)for(const name of new Set([r.name,...(r.history||[]).map(h=>h.name)].map(normalize))){if(!names.has(name))names.set(name,new Set());names.get(name).add(r.id);}
 for(const r of records){
  const text=r.specific?.fields?.links||'';
  const ids=r.mmlcRefs?.text===text?r.mmlcRefs.ids.filter(id=>power.archives[id]&&id!==r.id):[];
  for(const name of String(text).split(/[;；、\n]/).map(normalize).filter(Boolean)){const found=names.get(name);if(found?.size===1){const id=[...found][0];if(id!==r.id&&!ids.includes(id))ids.push(id);}}
  if(text||r.mmlcRefs)r.mmlcRefs={text,ids};
 }
}
