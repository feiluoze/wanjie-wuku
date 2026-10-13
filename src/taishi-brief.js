// Read-only presentation of saved facts. Every nonempty row appears once;
// unfamiliar fields are preserved, and no progress or world facts are invented.
export function taishiBrief(record, rows, esc) {
  const world = record.specific?.recordId === 'world';
  const person = record.specific?.recordId === 'companion',organization=record.specific?.recordId==='organization';
  if (!world && !person && !organization) return null;
  const groups = world ? [
    ['时代概况', ['overview','era','stage','structure','conditions','coverage','scope']],
    ['山河与文明', ['geography','inhabitants','facilities','species']],
    ['势力格局', ['factions']],
    ['资源经济', ['resources','setting']],
    [record.specific?.fields?.ability_title || (rows.some(r=>r.id==='combat_style'&&r.value)?'战斗与力量体系':'能力与技艺'), ['abilities','combat_style','crafts']],
    ['当前变化', ['events','evolution','changes','progress','result']],
    ['时间与降界', ['clock','rates','reset','connections','location','limits','descent']]
  ] : organization ? [
    ['势力现状',['overview','state','result']],
    ['活动区域',['world','location','territory']],
    ['内政与权力',['internal','pillars']],
    ['外交与人物',['diplomacy','leaders','participants']],
    ['重要行动',['actions']],
    ['声誉',['official_reputation','public_reputation','hidden_reputation','industry_reputation']],
    ['限制与未知',['limits']]
  ] : [
    ['身份与专长', ['profile','role','position','origin']],
    [rows.some(r=>r.id==='combat_style'&&r.value)?(rows.some(r=>r.id==='crafts'&&r.value)?'战斗与技艺':'战斗方式'):'能力与技艺', ['abilities','combat_style','crafts']],
    ['外貌与性情', ['appearance','personality','speech','preferences']],
    ['经历与动机', ['background','motivation']],
    ['当前行动', ['world','location','action','progress','conditions']],
    ['目标与关系', ['current_goal','goals','social','relationship','limits']],
    ['认知与记忆', ['knowledge','recent_memory','settled_memory','core_memory']]
  ];
  const originals=rows.filter(r=>r.id==='source_profile');rows=rows.filter(r=>!['ability_title','time_state'].includes(r.id));
  // Collapse identical values only; distinct old/manual facts remain visible.
  const seen=new Set();rows=rows.filter(r=>{if(r.id==='source_profile')return false;const key=r.id+'\0'+r.value;if(seen.has(key))return false;seen.add(key);return true;});
  const originalHTML=originals.map(r=>{try{const pieces=JSON.parse(r.value);return `<details><summary>查看世界书原文 · ${pieces.length} 个片段</summary>${pieces.map(p=>`<details><summary>${esc(p.book)} · ${esc(p.title||p.id)} · 片段 ${esc(p.part)} · 原文位置 ${esc(p.offset)}–${esc(p.end)} · 版本 ${esc(p.fingerprint?.slice(0,8)||'未知')}</summary><pre class="wjwk-full-rule">${esc(p.content)}</pre></details>`).join('')}<small>保存的是构建时所选片段，未宣称已读取该人物的全部词条；来源变化后需重新构建核对。</small></details>`;}catch{return `<details><summary>原文档案（需核对格式）</summary><pre>${esc(r.value)}</pre></details>`;}}).join('');
  const remaining = new Set(rows);
  const lead = rows.find(r => r.id === (world ? 'overview' : 'profile'));
  if (lead) remaining.delete(lead);
  const cards = groups.map(([title, ids]) => {
    const selected = rows.filter(r => remaining.has(r) && ids.includes(r.id));
    selected.forEach(r => remaining.delete(r));
    return [title, selected];
  });
  if (remaining.size) cards.push(['补充档案', [...remaining]]);
  return `<div class="wjwk-taishi-brief" data-taishi-brief="${world?'world':organization?'organization':'person'}"><header class="wjwk-brief-hero"><small>${world?'诸界档案 · 世界简报':organization?'势力档案 · 当前格局':'人物档案 · 动态观测'}</small><h3>${esc(record.name)}</h3>${lead?`<p>${esc(lead.value)}</p>`:'<p class="wjwk-muted">根据已保存资料展示当前轮廓</p>'}</header><nav class="wjwk-brief-index" aria-label="简报分区">${cards.filter(([,r])=>r.length).map(([title])=>`<span class="wjwk-chip">${esc(title)}</span>`).join('')}</nav><div class="wjwk-brief-grid">${cards.filter(([,r])=>r.length).map(([title, values])=>`<section class="wjwk-brief-card"><h4>${esc(title)}</h4><dl>${values.map(r=>`<div><dt>${esc(r.label||r.id)}</dt><dd>${esc(r.value)}</dd></div>`).join('')}</dl></section>`).join('')}</div>${originalHTML}</div>`;
}
