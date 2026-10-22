// Read-only summary of one AI review batch. It never changes save behavior.
import {archiveTables,archiveNeedsDetails} from './archive-tables.js';
import {isStatusbarRecord} from './builtin-statusbar.js';

const hasFacts = fields => Object.values(fields || {}).some(value => String(value ?? '').trim());

export function archiveSyncSummary(power, pending = {}) {
 const spec = archiveTables(power), tables = spec?.tables || [], changes = Array.isArray(pending.changes) ? pending.changes : [];
 const rows = new Map(tables.map(table => [table.id, {id: table.id, label: table.label, kind: table.kind, created: 0, updated: 0, base: 0, pending: 0}]));
 const main = {created: 0, updated: 0};
 for (const record of Object.values(power?.archives || {})) {
  const row = rows.get(record.specific?.recordId);
  if (row && archiveNeedsDetails(record,spec)) row.pending += 1;
 }
 for (const change of changes) {
  const recordId = change?.specific?.recordId;
  if (!recordId) continue;
  if (isStatusbarRecord({specific: {recordId}})) {
   if (change.before) main.updated += 1; else main.created += 1;
   continue;
  }
  if(change.specific?.adapterId!==spec?.adapter)continue;
  const row = rows.get(recordId);
  if (!row) continue;
  if (change.before) row.updated += 1;
  else {
   row.created += 1;
   if (!hasFacts(change.specific?.fields)) row.base += 1;
  }
 }
 return {
  main,
  tables: [...rows.values()],
  tableCreated: [...rows.values()].reduce((sum, row) => sum + row.created, 0),
  tableUpdated: [...rows.values()].reduce((sum, row) => sum + row.updated, 0),
  baseCreated: [...rows.values()].reduce((sum, row) => sum + row.base, 0),
  pending: Object.values(power?.archives||{}).filter(record=>archiveNeedsDetails(record,spec)).length,
  retiredPending: Object.values(power?.archives||{}).filter(record=>archiveNeedsDetails(record,spec)&&!rows.has(record.specific.recordId)).length,
  changed: Boolean(main.created || main.updated || [...rows.values()].some(row => row.created || row.updated))
 };
}
