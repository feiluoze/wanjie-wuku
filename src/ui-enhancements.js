import { ARCHIVE_FIELDS, ARCHIVE_STATUS, archiveCurrent, archiveDisplayFields } from './archives.js';
import { injectionRules } from './core.js';
import { isTaishi } from './taishi.js';
import { isMmlc } from './mmlc.js';
import {mmlcBodyRules} from './mmlc-rulebook.js';
import { memoryPlan } from './archive-memory.js';
import {outboxSummary} from './outbox.js';
import { specificRows } from './specialized-records.js';
import { isStatusbarRecord } from './builtin-statusbar.js';

export function formatCharCount(n) {
  const num = Number(n) || 0;
  return num >= 10000 ? `${(num / 10000).toFixed(1)}万` : num >= 1000 ? `${(num / 1000).toFixed(1)}k` : String(num);
}

export function injectionMetrics(state, chat = []) {
  const powers = Object.values(state?.powers || {});
  const items = [];
  let rulesChars = 0;
  for (const p of powers) {
    const text = p.active ? (isMmlc(p)?mmlcBodyRules(state,{chat}):injectionRules(p)) : '';
    const chars = p.active ? String(text).length : 0;
    rulesChars += chars;
    items.push({ id: p.id, name: p.name, active: Boolean(p.active), chars, isSpecial: isTaishi(p) || isMmlc(p) });
  }
  let memoryChars = 0;
  let memoryCount = 0;
  try {
    const plan = memoryPlan(state, chat, '');
    memoryChars = plan?.packet?.length || 0;
    memoryCount = plan?.included?.length || 0;
  } catch {}
  const queued=state?outboxSummary(state,chat).rows.filter(row=>row.selected):[];
  const outboxChars=queued.reduce((sum,row)=>sum+String(row.content||'').length,0);
  const totalChars = rulesChars + memoryChars + outboxChars;
  return {
    items,
    rulesChars,
    memoryChars,
    memoryCount,
    outboxCount:queued.length,
    outboxChars,
    totalChars,
    estTokens: Math.ceil(totalChars / 4),
  };
}

export function archiveCandidateEditorHTML(c, i, esc) {
  const fields = { ...(c.before?.fields || {}), ...(c.patch || {}) };
  const fieldDefs = Object.entries(ARCHIVE_FIELDS[c.type] || {});
  const specEntries = c.specific ? Object.entries(c.specific.fields || {}).filter(([k]) => k !== 'source_profile' && k !== 'time_state') : [];
  const statusOptions = Object.entries(ARCHIVE_STATUS).map(([id, label]) => `<option value="${esc(id)}" ${c.status === id ? 'selected' : ''}>${esc(label)}</option>`).join('');
  return `<details class="wjwk-inline-edit"><summary>微调内容</summary><div class="wjwk-inline-edit-body"><label>名称<input ${c.id||c.specific?'readonly':''} name="edit-name:${i}" value="${esc(c.name)}" maxlength="200"></label><label>状态<select ${c.specific?.recordId.startsWith('statusbar_')?'disabled':''} name="edit-status:${i}">${statusOptions}</select></label>${fieldDefs.map(([k, label]) => `<label>${esc(label)}<textarea name="edit-field:${i}:${esc(k)}" rows="2" maxlength="4000">${esc(fields[k] || '')}</textarea></label>`).join('')}${specEntries.map(([k, val]) => `<label>${esc(c.specific.labels?.[k] || k)}<textarea name="edit-spec:${i}:${esc(k)}" rows="2" maxlength="4000">${esc(val || '')}</textarea></label>`).join('')}</div></details>`;
}

export function repairIssueFormHTML(issue, index, esc) {
  const cand = issue.candidate || {};
  const fieldEntries = Object.entries(cand.fields && typeof cand.fields === 'object' ? cand.fields : {});
  const detailEntries = Object.entries(cand.details && typeof cand.details === 'object' ? cand.details : {});
  const fieldInputs = fieldEntries.map(([k, v]) => `<label>${esc(ARCHIVE_FIELDS[cand.type]?.[k] || k)}<textarea name="repair-field:${index}:${esc(k)}" rows="2" maxlength="4000">${esc(v ?? '')}</textarea></label>`).join('');
  const detailInputs = detailEntries.map(([k, v]) => `<label>${esc(k)}<textarea name="repair-detail:${index}:${esc(k)}" rows="2" maxlength="4000">${esc(v ?? '')}</textarea></label>`).join('');
  const extraInputs = !fieldInputs && !detailInputs ? `<label>补充内容<textarea name="repair-field:${index}:description" rows="2" maxlength="4000"></textarea></label>` : '';
  return `<details class="wjwk-inline-edit"><summary>修改字段并重新核对</summary><div class="wjwk-inline-edit-body"><input type="hidden" name="repair-form:${index}" value="1">${fieldInputs}${detailInputs}${extraInputs}<button type="button" class="wjwk-secondary" data-action="repair-archive-candidate" data-index="${index}">重新核对</button><details><summary>原始 JSON（高级）</summary><textarea name="repair-candidate:${index}" rows="6" maxlength="250000">${esc(JSON.stringify(cand, null, 2))}</textarea></details></div></details>`;
}

export function uiEnhancementMethods({ esc, btn, empty }) {
  return {
    showInjectionOverview(state, chat = []) {
      const m = injectionMetrics(state, chat);
      const rows = m.items.map(item => `<article class="wjwk-inject-row"><div><strong>${esc(item.name)}</strong><small>${item.active ? `${item.chars.toLocaleString('zh-CN')} 字（约 ${Math.ceil(item.chars / 4).toLocaleString('zh-CN')} tokens）` : '已暂停注入'}</small></div><div class="wjwk-toolbar">${item.isSpecial ? '' : btn('view-rule-by-id', '编辑正文', 'wjwk-link', false, `data-id="${esc(item.id)}"`)}${btn('toggle-power-by-id', item.active ? '暂停' : '启用', 'wjwk-secondary', false, `data-id="${esc(item.id)}"`)}</div></article>`).join('') || empty('尚未接入金手指。');
      this.dialog('上下文注入总览', `<section data-injection-overview><div class="wjwk-saved-stats"><span><strong>${formatCharCount(m.totalChars)}</strong><small>预计总注入字数</small></span><span><strong>~${formatCharCount(m.estTokens)}</strong><small>估算 tokens</small></span><span><strong>${m.items.filter(i => i.active).length}</strong><small>启用词条</small></span></div><section><h3>金手指正文注入（${m.rulesChars.toLocaleString('zh-CN')} 字）</h3><div class="wjwk-inject-list">${rows}</div></section><section><h3>正文记忆（${m.memoryChars.toLocaleString('zh-CN')} 字 · ${m.memoryCount} 项）</h3><div class="wjwk-toolbar">${btn('open-memory', '管理正文记忆', 'wjwk-secondary', !this.view?.power?.active)}${btn('memory-report', '最近发送记录', 'wjwk-link')}</div></section>${m.outboxCount ? `<section><h3>待发方案（${m.outboxCount} 项 · ${m.outboxChars.toLocaleString('zh-CN')} 字）</h3>${btn('outbox-open', '查看待发队列', 'wjwk-secondary')}</section>` : ''}</section>`);
    },

    allPowersOverview(state, powers, chat, blocked, mode) {
      const activePowers = powers.filter(p => p.active);
      const canAI = !blocked && activePowers.length > 0 && mode !== 'off';
      const cards = powers.map(p => {
        const records = Object.values(p.archives || {}).filter(r => !isStatusbarRecord(r) && archiveCurrent(r, chat));
        const statusbar = Object.values(p.archives || {}).find(r => isStatusbarRecord(r));
        const statusFacts = statusbar ? specificRows(statusbar).slice(0, 3) : [];
        const resources = Object.values(p.resources || {});
        return `<article class="wjwk-overview-power-card ${p.active ? '' : 'is-paused'}"><header><div><h3>${esc(p.name)}</h3><span class="wjwk-status-pill ${p.active ? 'is-live' : 'is-paused'}"><i></i>${p.active ? '已接入' : '已暂停'}</span></div>${btn('select-power', '进入 →', 'wjwk-secondary', false, `data-id="${esc(p.id)}"`)}</header>${resources.length ? `<div class="wjwk-peek-counts">${resources.map(r => `<span><small>${esc(r.name)}</small> <strong>${r.balance === null ? '未确认' : esc(r.balance)}</strong></span>`).join('')}</div>` : ''}${statusFacts.length ? `<dl class="wjwk-overview-facts">${statusFacts.map(f => `<div><dt>${esc(f.label)}</dt><dd>${esc(String(f.value).slice(0, 100))}${String(f.value).length > 100 ? '…' : ''}</dd></div>`).join('')}</dl>` : `<p class="wjwk-muted">长期档案 ${records.length} 项${records.length ? '：' + esc(records.slice(0, 3).map(r => r.name).join('、')) : ''}</p>`}<footer>${btn('view-rule-by-id', '查看 / 编辑正文', 'wjwk-link', false, `data-id="${esc(p.id)}"`)}${btn('toggle-power-by-id', p.active ? '暂停' : '恢复', 'wjwk-link', blocked, `data-id="${esc(p.id)}"`)}</footer></article>`;
      }).join('');
      return `<div class="wjwk-all-overview"><section class="wjwk-page-head"><div class="wjwk-page-title"><span class="wjwk-eyebrow">万界武库 · 多词条总览</span><h1>全部金手指（${powers.length}）</h1><p>查看当前聊天的普通词条。依次整理时，遇到待确认结果会暂停。</p></div></section><section class="wjwk-action-bar" aria-label="总览操作">${btn('review-all-powers', `依次整理（${activePowers.length} 个已启用）`, 'wjwk-primary', !canAI)}${btn('injection-overview', '查看注入字数', 'wjwk-secondary')}${btn('manage', '＋ 接入金手指', 'wjwk-secondary', blocked)}</section><div class="wjwk-all-overview-grid">${cards}</div></div>`;
    },
  };
}
