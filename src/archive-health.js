// Read-only archive health checks. Never rewrites, merges or deletes records.
import {archiveTables,archiveNeedsDetails} from './archive-tables.js';
import {builtinStatusbar} from './builtin-statusbar.js';

const key = value => String(value ?? '').normalize('NFKC').replace(/\s/g, '').toLowerCase();

export function archiveHealth(power, chat = []) {
 const spec = archiveTables(power), tables = spec ? [...spec.tables, ...spec.retiredTables] : [];
 const rows = Object.values(power?.archives || {}), issues = [];
 let pending = 0;
 for (const table of tables) {
  const own = rows.filter(row => row.specific?.adapterId === spec.adapter && row.specific.recordId === table.id);
  pending += own.filter(row => archiveNeedsDetails(row,spec)).length;
  const groups = new Map();
  for (const row of own) {
   const id = key(row.name);
   if (!id) continue;
   if (!groups.has(id)) groups.set(id, []);
   groups.get(id).push(row);
  }
  for (const group of groups.values()) if (group.length > 1) issues.push({
   code: 'duplicate_table_name',
   label: `${table.label}存在同名多条档案`,
   count: group.length,
   category: `${spec.adapter}/${table.id}`,
   records: group.map(row => ({id: row.id, name: row.name}))
  });
 }
 const status = builtinStatusbar(power);
 if (status) for (const group of status.groups || []) {
  const own = rows.filter(row => row.specific?.recordId === group.id);
  if (group.cardinality !== 'per-object' && own.length > 1) issues.push({
   code: 'duplicate_statusbar',
   label: `原文状态栏「${group.title}」有多条主记录`,
   count: own.length,
   category: `wuku.original_statusbar/${group.id}`,
   records: own.map(row => ({id: row.id, name: row.name}))
  });
 }
 if (spec) {
  const known = new Set(tables.map(table => table.id));
  for (const row of rows) {
   if (row.specific?.adapterId !== spec.adapter || known.has(row.specific.recordId)) continue;
   issues.push({
    code: 'unknown_table',
    label: `档案指向未声明的分类「${row.specific.recordId}」`,
    count: 1,
    records: [{id: row.id, name: row.name}]
   });
  }
  const tableNames = new Set(rows.filter(row => row.specific?.adapterId === spec.adapter && known.has(row.specific.recordId)).map(row => key(row.name)));
  const legacy = rows.filter(row => !row.specific && tableNames.has(key(row.name)));
  if (legacy.length) issues.push({
   code: 'legacy_name_overlap',
   label: '旧通用档与子表存在同名对象',
   count: legacy.length,
   records: legacy.slice(0, 12).map(row => ({id: row.id, name: row.name}))
  });
 }
 return {issues, pending};
}
