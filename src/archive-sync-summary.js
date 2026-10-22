// Read-only summary of one AI review batch. It never changes save behavior.
import {archiveTables,archiveNeedsDetails} from './archive-tables.js';
import {isStatusbarRecord} from './builtin-statusbar.js';
import {stable} from './core.js';

const specificFacts=s=>s?{adapterId:s.adapterId,recordId:s.recordId,fields:s.fields}:null;
const hasFacts = fields => Object.values(fields || {}).some(value => String(value ?? '').trim());
export function archiveCandidateUnchanged(c){
 return Boolean(c.before&&!c.recovery&&!c.pendingLinks?.length&&
  c.status===c.before.status&&(!c.module||c.module===c.before.module)&&
  stable({...c.before.fields,...c.patch})===stable(c.before.fields)&&
  stable(specificFacts(c.specific))===stable(specificFacts(c.before.specific))&&
  (c.ownerPowerId||c.before.ownerPowerId)===c.before.ownerPowerId);
}

export function archiveSyncSummary(power, pending = {}) {
 const spec = archiveTables(power), tables = spec?.tables || [], changes = Array.isArray(pending.changes) ? pending.changes : [];
 const rows = new Map(tables.map(table => [table.id, {id: table.id, label: table.label, kind: table.kind, created: 0, updated: 0, unchanged:0, failed:0, base: 0, pending: 0}]));
 const main = {created: 0, updated: 0},other={created:0,updated:0};
 let unchanged=0;
 for(const issue of pending.issues||[]){const raw=issue.candidate||pending.data?.changes?.[issue.index],row=rows.get(raw?.recordId);if(row&&issue.kind==='成果')row.failed++;}
 for (const record of Object.values(power?.archives || {})) {
  const row = rows.get(record.specific?.recordId);
  if (row && archiveNeedsDetails(record,spec)) row.pending += 1;
 }
 for (const change of changes) {
  const recordId = change?.specific?.recordId;
  if(archiveCandidateUnchanged(change)){unchanged++;const row=rows.get(recordId);if(row&&change.specific?.adapterId===spec?.adapter)row.unchanged++;continue;}
  if (!recordId){other[change.before?'updated':'created']++;continue;}
  if (isStatusbarRecord({specific: {recordId}})) {
   if (change.before) main.updated += 1; else main.created += 1;
   continue;
  }
  if(change.specific?.adapterId!==spec?.adapter){other[change.before?'updated':'created']++;continue;}
  const row = rows.get(recordId);
  if (!row){other[change.before?'updated':'created']++;continue;}
  if (change.before) row.updated += 1;
  else {
   row.created += 1;
   if (!hasFacts(change.specific?.fields)) row.base += 1;
  }
 }
 return {
  main,other,
  unchanged, failed:pending.issues?.length||0,
  ignored:(pending.ignoredChanges?.length||0)+(pending.skippedOwnership?.length||0),
  accepted:changes.length+(pending.terminalResults?.length||0)+(pending.creationResults?.length||0),
  tables: [...rows.values()],
  tableCreated: [...rows.values()].reduce((sum, row) => sum + row.created, 0),
  tableUpdated: [...rows.values()].reduce((sum, row) => sum + row.updated, 0),
  baseCreated: [...rows.values()].reduce((sum, row) => sum + row.base, 0),
  pending: Object.values(power?.archives||{}).filter(record=>archiveNeedsDetails(record,spec)).length,
  retiredPending: Object.values(power?.archives||{}).filter(record=>archiveNeedsDetails(record,spec)&&!rows.has(record.specific.recordId)).length,
  changed: Boolean(main.created || main.updated || other.created || other.updated || [...rows.values()].some(row => row.created || row.updated))
 };
}
