// View-only filtering; never delete or rewrite objects when a page is hidden.
import {archiveTables} from './archive-tables.js';
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase();
export function archiveLibraryPage(power, {query='', category='', type='', status='', page=0} = {}) {
  const all=Object.values(power.archives || {});
  const categoryKey = row => row.specific ? row.specific.adapterId+'/'+row.specific.recordId : 'legacy';
  const spec=archiveTables(power);
  const categories=[...new Map([...(spec?.tables||[]).map(t=>[spec.adapter+'/'+t.id,t.label]),...all.map(row=>[categoryKey(row),row.specific?.label || '通用与旧档案'])]).entries()];
  const q=normalize(query).trim();
  const filtered=all.filter(row=>(!category || categoryKey(row)===category) && (!type || row.type===type) && (!status || row.status===status) && (!q || normalize([row.name,...Object.values(row.fields || {}),...Object.values(row.specific?.fields || {})].join('\n')).includes(q)))
    .sort((a,b)=>b.updatedAt-a.updatedAt || a.id.localeCompare(b.id));
  const pages=Math.max(1,Math.ceil(filtered.length/20)), current=Math.min(pages-1,Math.max(0,Number.isSafeInteger(page)?page:0));
  return {total:all.length,matched:filtered.length,categories,page:current,pages,rows:filtered.slice(current*20,current*20+20)};
}
