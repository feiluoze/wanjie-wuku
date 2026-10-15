// Read-only presentation of saved facts. Every nonempty row appears once;
// unfamiliar fields are preserved, and no progress or world facts are invented.
export function taishiBrief(record, rows, esc) {
  const region=record.specific?.recordId==='region',civilization=record.specific?.recordId==='inhabitants';
  const world = record.specific?.recordId === 'world'||region;
  const person = record.specific?.recordId === 'companion',organization=record.specific?.recordId==='organization';
  const kind=record.specific?.recordId;
  const other={available:[['现有成果',['current','description','origin']],['取用与限制',['use','location','limits']]],growth:[['已经归身',['kind','current','description']],['所得与来路',['basis','retained','origin','world','limits']]],event:[['事件概况',['overview','description']],['实际进展',['phase','progress','result','completion']],['相关者与影响',['participants','location','limits']]],development:[['目标与安排',['goal','description','participants']],['实际进展',['phase','progress','result','completion']],['后续事项',['next','limits']]],relation:[['当前关系',['state','direction']],['变化原因',['cause','evidence']],['相关对象',['subject_id','target_id','event_id','world']]],manifestation:[['当前展开',['condition','mode','geometry','anchor']],['参与与去向',['forces','flow']],['时空与限制',['clock','world','limits']]]};
  if (!world && !person && !organization && !civilization && !other[kind]) return null;
  const groups = other[kind]|| (civilization ? [['文明概况',['civilization','achievements','scale']],['地域与生活',['world','location']],['发展与传承',['history']],['补充资料',['limits']]] : world ? [
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
    ['当前行动', ['action','progress','location','world','conditions']],
    ['目标与关系', ['current_goal','goals','social','relationship','limits']],
    ['认知与记忆', ['knowledge','recent_memory','settled_memory','core_memory']]
  ]);
  const originals=rows.filter(r=>r.id==='source_profile');rows=rows.filter(r=>!['ability_title','time_state'].includes(r.id));
  // Prefer the dedicated current field for duplicate IDs, then suppress
  // punctuation-only duplicates in this read-only brief. Archives stay intact.
  const byId=new Map(),superseded=[];for(const row of rows)if(row.id!=='source_profile'){const old=byId.get(row.id);if(old&&old.value!==row.value)superseded.push(old);byId.set(row.id,row);}
  const seen=new Set();rows=[...byId.values()].sort((a,b)=>Number(Object.hasOwn(record.specific?.fields||{},b.id))-Number(Object.hasOwn(record.specific?.fields||{},a.id))).filter(row=>{const key=String(row.value).normalize('NFKC').replace(/[\s，、；;。！？!?：:]/gu,'');if(!key||seen.has(key))return false;seen.add(key);return true;});
  const originalHTML=originals.map(r=>{try{const pieces=JSON.parse(r.value);return `<details><summary>查看世界书原文 · ${pieces.length} 个片段</summary>${pieces.map(p=>`<details><summary>${esc(p.book)} · ${esc(p.title||p.id)} · 片段 ${esc(p.part)} · 原文位置 ${esc(p.offset)}–${esc(p.end)} · 版本 ${esc(p.fingerprint?.slice(0,8)||'未知')}</summary><pre class="wjwk-full-rule">${esc(p.content)}</pre></details>`).join('')}<small>保存的是构建时所选片段，未宣称已读取该人物的全部词条；来源变化后需重新构建核对。</small></details>`;}catch{return `<details><summary>原文档案（需核对格式）</summary><pre>${esc(r.value)}</pre></details>`;}}).join('');
  const remaining = new Set(rows);
  const lead = rows.find(r => r.id === (world ? 'overview' : civilization?'civilization':person?'profile':kind==='available'?'current':'overview'))||rows.find(r=>r.id==='description');
  if (lead) remaining.delete(lead);
  const cards = groups.map(([title, ids]) => {
    const selected = rows.filter(r => remaining.has(r) && ids.includes(r.id)).sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
    selected.forEach(r => remaining.delete(r));
    return [title, selected];
  });
  if (remaining.size) cards.push(['补充档案', [...remaining]]);
  if(superseded.length)cards.push(['补充档案',superseded]);
  const excerpt=value=>{const chars=Array.from(String(value));return chars.slice(0,220).join('')+(chars.length>220?'…':'');};
  const paragraph=row=>{const value=String(row.value);return `<p>${esc(excerpt(value))}</p>${Array.from(value).length>220?`<details><summary>展开全文</summary><p>${esc(value)}</p></details>`:''}`;};
  const type=region?'地域简报':world?'世界简报':civilization?'文明简报':organization?'势力简报':person?'人物简报':({available:'成果简报',growth:'界主所得',event:'事件简报',development:'发展简报',relation:'关系简报',manifestation:'降界简报'}[kind]||'档案简报');
  const ordered=cards.filter(([,values])=>values.length).sort(([a],[b])=>Number(['当前变化','当前行动','实际进展','当前关系','当前展开'].includes(b))-Number(['当前变化','当前行动','实际进展','当前关系','当前展开'].includes(a)));
  const supplement=ordered.filter(([title])=>title==='补充档案');
  const featured=ordered.filter(([title])=>title!=='补充档案');
  const fullRows=values=>`<dl>${values.map(row=>`<div><dt>${esc(row.label||row.id)}</dt><dd>${esc(row.value)}</dd></div>`).join('')}</dl>`;
  return `<div class="wjwk-taishi-brief wjwk-editorial-report" data-taishi-brief="${region?'region':world?'world':civilization?'civilization':organization?'organization':kind||'person'}"><header class="wjwk-report-masthead"><div class="wjwk-report-monogram" aria-hidden="true">${esc(Array.from(record.name||'档')[0])}</div><div><small>${type} · 已保存资料</small><h3>${esc(record.name)}</h3>${lead?`<div class="wjwk-report-intro">${paragraph(lead)}</div>`:''}</div></header><div class="wjwk-report-grid">${featured.map(([title,values])=>`<section class="wjwk-report-section ${['当前变化','当前行动','实际进展','当前关系','当前展开'].includes(title)?'is-current':''}"><h4>${esc(title)}</h4>${values.slice(0,2).map(paragraph).join('')}${values.length>2?`<details><summary>更多资料 · ${values.length-2}</summary>${fullRows(values.slice(2))}</details>`:''}</section>`).join('')}</div>${supplement.length?`<details class="wjwk-report-supplement"><summary>补充档案</summary>${supplement.map(([,values])=>fullRows(values)).join('')}</details>`:''}${originalHTML}</div>`;
}
