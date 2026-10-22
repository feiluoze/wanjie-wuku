import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower} from '../src/core.js';
import {archiveSyncSummary} from '../src/archive-sync-summary.js';
import {archiveLibraryPage} from '../src/archive-library.js';
import {WorkbenchUI} from '../src/ui.js';

const power = () => createPower(builtinEntries().find(e => e.name === '人间游戏'));

test('sync summary separates main status, table updates and base records', () => {
 const p = power();
 const text = {type: 'record', status: 'active', sourceIndex: 0};
 const pending = {changes: [
  {...text, name: '人间游戏·玩家概览', specific: {adapterId: 'wuku.human_game', recordId: 'statusbar_test', fields: {a: '状态'}}},
  {...text, name: '冲锋', specific: {adapterId: 'wuku.human_game', recordId: 'skill', fields: {}}},
  {...text, name: '流亡领主·初阶', specific: {adapterId: 'wuku.human_game', recordId: 'profession', fields: {level: '初阶'}}, before: {id: 'old'}}
 ]};
 const summary = archiveSyncSummary(p, pending);
 assert.deepEqual(summary.main, {created: 1, updated: 0});
 assert.equal(summary.tableCreated, 1);assert.equal(summary.tableUpdated, 1);assert.equal(summary.baseCreated, 1);
 const skill = summary.tables.find(row => row.id === 'skill'), profession = summary.tables.find(row => row.id === 'profession');
 assert.equal(skill.created, 1);assert.equal(skill.base, 1);assert.equal(profession.updated, 1);assert.equal(profession.created, 0);
 assert.equal(summary.changed, true);
});

test('pending completion counts saved base rows and clears when facts exist', () => {
 const p = power();p.archives = {};
 p.archives.a = {id: 'a', name: '冲锋', type: 'record', status: 'active', fields: {}, specific: {adapterId: 'wuku.human_game', recordId: 'skill', fields: {}}};
 p.archives.b = {id: 'b', name: '斩杀', type: 'record', status: 'active', fields: {}, specific: {adapterId: 'wuku.human_game', recordId: 'skill', fields: {effect: '已掌握'}}};
 p.archives.c = {id: 'c', name: '交涉', type: 'record', status: 'active', fields: {}, specific: {adapterId: 'wuku.human_game', recordId: 'profession', fields: {}}};
 const summary = archiveSyncSummary(p, {changes: []});
 assert.equal(summary.pending, 2);assert.equal(summary.tables.find(row => row.id === 'skill').pending, 1);assert.equal(summary.changed, false);
});

test('library pending filter and summary action are available without changing saved rows', () => {
 const p = power();p.archives = {
  a: {id: 'a', name: '冲锋', type: 'record', status: 'active', fields: {}, specific: {adapterId: 'wuku.human_game', recordId: 'skill', fields: {}}},
  b: {id: 'b', name: '斩杀', type: 'record', status: 'active', fields: {}, specific: {adapterId: 'wuku.human_game', recordId: 'skill', fields: {effect: '已掌握'}}}
 };
 const page = archiveLibraryPage(p, {pending: true});assert.equal(page.matched, 1);assert.equal(page.rows[0].id, 'a');
 const ui = Object.create(WorkbenchUI.prototype);
 const html = ui.syncSummary(p, {changes: [{name: '冲锋', type: 'record', status: 'active', specific: {adapterId: 'wuku.human_game', recordId: 'skill', fields: {}}}]});
 assert(html.includes('本次同步摘要'));assert(html.includes('基础记录 1'));assert(html.includes('查看待补全 1 条'));assert(html.includes('data-pending="1"'));
 assert.equal(p.archives.a.specific.fields.effect, undefined);
 p.archiveUndo = {label: '自动整理'};
 assert(Object.create(WorkbenchUI.prototype).automaticArchiveControls(p, false, 'st').includes('撤销上次：自动整理'));
});

test('review dialog renders the summary without changing the pending batch', () => {
 const p = power(), ui = Object.create(WorkbenchUI.prototype);let html = '';
 ui.dialog = (_title, body) => { html = body; };ui.view = {power: p, state: {powers: {[p.id]: p}}, pendingArchiveReview: null};
 const change = {name: '冲锋', type: 'record', status: 'active', patch: {description: '已掌握'}, specific: {adapterId: 'wuku.human_game', recordId: 'skill', fields: {}}, before: null, source: {type: 'story', anchor: {index: 0, swipeId: 0}, quote: '冲锋已掌握'}, id: null};
 const pending = {changes: [change], issues: [], floorReviews: [], data: {changes: []}, checkpointSaved: true, readOnly: false, terminalResults: [], creationResults: []};
 ui.showArchiveReview(pending, p, []);
 assert(html.includes('本次同步摘要'));assert(html.includes('基础记录 1'));assert.equal(pending.changes.length, 1);
});

test('review dialog renders an explicit target picker for an ambiguous table candidate', () => {
 const p = power(), ui = Object.create(WorkbenchUI.prototype);let html = '';
 ui.dialog = (_title, body) => { html = body; };ui.view = {power: p, state: {powers: {[p.id]: p}}, pendingArchiveReview: null};
 const candidate = {name: '冲锋', type: 'record', recordId: 'skill', status: 'active', fields: {}, details: {}, sourceIndex: 0};
 const pending = {changes: [], issues: [{kind: '成果', index: 0, name: '冲锋', reason: '名称对应多份', repairable: true, candidate, archiveTargets: {recordId: 'skill', label: '技能', options: [{id: 'a', name: '冲锋', status: 'active'}, {id: 'b', name: '冲锋', status: 'active'}]}}], floorReviews: [], data: {changes: []}, checkpointSaved: true, readOnly: false, terminalResults: [], creationResults: []};
 ui.showArchiveReview(pending, p, []);
 assert(html.includes('data-ambiguous-target="0"'));assert(html.includes('data-action="choose-archive-target"'));
});

test('no tables and no changes stays empty', () => {
 const summary = archiveSyncSummary({archives: {}}, {changes: []});
 assert.equal(summary.tables.length, 0);assert.equal(summary.pending, 0);assert.equal(summary.changed, false);
});
