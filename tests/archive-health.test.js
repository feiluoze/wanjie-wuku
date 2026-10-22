import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower} from '../src/core.js';
import {archiveTables} from '../src/archive-tables.js';
import {archiveHealth} from '../src/archive-health.js';
import {WorkbenchUI} from '../src/ui.js';

const power = () => createPower(builtinEntries().find(e => e.name === '人间游戏'));
const row = (adapter, id, name, fields = {}, recordId = 'skill') => ({id, name, type: 'record', status: 'active', fields: {}, specific: {adapterId: adapter, recordId, fields}});

test('health finds duplicate table names, base rows, unknown categories and legacy overlaps', () => {
 const p = power(), spec = archiveTables(p);p.archives = {
  a: row(spec.adapter, 'a', '冲锋'),
  b: row(spec.adapter, 'b', '冲锋', {effect: '已掌握'}),
  c: row(spec.adapter, 'c', '斩杀', {effect: '已掌握'}),
  d: row(spec.adapter, 'd', '旧对象', {}, 'missing_table'),
  e: {id: 'e', name: '冲锋', type: 'record', status: 'active', fields: {description: '旧通用档'}}
 };
 const health = archiveHealth(p, []);
 const codes = health.issues.map(issue => issue.code);
 assert(codes.includes('duplicate_table_name'));assert(codes.includes('unknown_table'));assert(codes.includes('legacy_name_overlap'));
 assert.equal(health.pending, 1);
 assert.equal(health.issues.find(i => i.code === 'duplicate_table_name').count, 2);
});

test('health panel is read-only and links to the exact records', () => {
 const p = power(),spec = archiveTables(p);p.archives = {
  a: row(spec.adapter, 'a', '冲锋'), b: row(spec.adapter, 'b', '冲锋', {effect: '已掌握'})
 };
 const html = Object.create(WorkbenchUI.prototype).healthPanel(p, [], false);
 assert(html.includes('数据健康'));assert(html.includes('同名'));assert(html.includes('data-id="a"'));assert(html.includes('查看待补全记录'));
 assert.equal(p.archives.a.specific.fields.effect, undefined);
});
