// Read-only presentation of saved facts. Every nonempty row appears once;
// unfamiliar fields are preserved, and no progress or world facts are invented.
export function taishiBrief(record, rows, esc) {
  const world = record.specific?.recordId === 'world';
  const person = record.specific?.recordId === 'companion';
  if (!world && !person) return null;
  const groups = world ? [
    ['世界轮廓', ['overview','stage','structure','conditions','coverage','scope']],
    ['山河与文明', ['geography','era','factions','resources','inhabitants','facilities','species']],
    ['局势与发展', ['events','evolution','changes','progress','result']],
    ['时间与界域', ['clock','rates','reset','connections','location','limits']]
  ] : [
    ['身份与专长', ['profile','role','abilities','origin']],
    ['当前行动', ['world','location','action','progress','conditions']],
    ['目标与关系', ['goals','social','relationship','limits']],
    ['认知与记忆', ['knowledge','recent_memory','settled_memory','core_memory']]
  ];
  const remaining = new Set(rows);
  const lead = rows.find(r => r.id === (world ? 'overview' : 'profile'));
  if (lead) remaining.delete(lead);
  const cards = groups.map(([title, ids]) => {
    const selected = rows.filter(r => remaining.has(r) && ids.includes(r.id));
    selected.forEach(r => remaining.delete(r));
    return [title, selected];
  });
  if (remaining.size) cards.push(['补充档案', [...remaining]]);
  return `<div class="wjwk-taishi-brief" data-taishi-brief="${world?'world':'person'}"><header class="wjwk-brief-hero"><small>${world?'诸界档案 · 世界简报':'人物档案 · 动态观测'}</small><h3>${esc(record.name)}</h3>${lead?`<p>${esc(lead.value)}</p>`:'<p class="wjwk-muted">根据已保存资料展示当前轮廓</p>'}</header><nav class="wjwk-brief-index" aria-label="简报分区">${cards.filter(([,r])=>r.length).map(([title])=>`<span class="wjwk-chip">${title}</span>`).join('')}</nav><div class="wjwk-brief-grid">${cards.filter(([,r])=>r.length).map(([title, values])=>`<section class="wjwk-brief-card"><h4>${title}</h4><dl>${values.map(r=>`<div><dt>${esc(r.label||r.id)}</dt><dd>${esc(r.value)}</dd></div>`).join('')}</dl></section>`).join('')}</div></div>`;
}
