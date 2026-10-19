// A read-only table over the same eight archive modules. No second data store.
import {MMLC_CONFIG} from './mmlc-config.js';
import {MMLC_MODULES,mmlcModule} from './mmlc.js';
import {ARCHIVE_STATUS} from './archives.js';
import {mmlcBrief,mmlcBriefFacts} from './mmlc-brief.js';
const columns={land:['location','capacity','condition'],sect:['members','duties','condition'],arts:['principle','mastery','effect'],body:['realm','body','soul'],items:['quantity','effect','condition'],spirits:['form','duties','condition'],fleet:['quantity','availability','deployment'],projects:['discovery','usable','needs']};
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase();
export function mmlcTablePage(power,chat,section,filter={}){
 const brief=mmlcBrief(power,chat),definition=MMLC_CONFIG.records.find(r=>r.id===section),query=normalize(filter.query).trim();
 const status=Object.hasOwn(ARCHIVE_STATUS,filter.status)?filter.status:'';
 const all=brief.records.filter(r=>!definition||mmlcModule(r)===section);
 const records=all.filter(r=>(!status||r.status===status)&&(!query||normalize([r.name,...Object.values(r.fields||{}),...Object.values(r.specific?.fields||{})].join('\n')).includes(query)))
  .sort((a,b)=>({active:0,working:1,planned:2,ended:3}[a.status]-{active:0,working:1,planned:2,ended:3}[b.status])||b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
 const pages=Math.max(1,Math.ceil(records.length/20)),page=Math.max(0,Math.min(pages-1,Number.isSafeInteger(filter.page)?filter.page:0));
 return {total:all.length,matched:records.length,page,pages,definition,columns:definition?columns[definition.id].map(id=>definition.fields.find(f=>f.id===id)):[],
  counts:Object.fromEntries(Object.keys(ARCHIVE_STATUS).map(s=>[s,all.filter(r=>r.status===s).length])),
  rows:records.slice(page*20,page*20+20).map(record=>({record,facts:mmlcBriefFacts(record),linked:[...(brief.links.get(record.id)||[])].map(id=>brief.byId.get(id)).filter(Boolean)}))};
}
export function mmlcTableResultsHTML(power,chat,section,filter,{esc,btn,blocked=false,canAI=false}){
 const data=mmlcTablePage(power,chat,section,filter),short=value=>String(value).length>150?String(value).slice(0,150)+'…':String(value);
 const button=(action,label,id,disabled=blocked)=>btn(action,label,'wjwk-link',disabled).replace(`data-action="${action}"`,`data-action="${action}" data-id="${esc(id)}"`);
 const body=data.rows.map(({record:r,facts,linked})=>{
  const module=mmlcModule(r),typed=r.specific?.adapterId===MMLC_CONFIG.id&&r.specific.recordId===module;
  const cells=data.definition&&!typed?`<td colspan="${data.columns.length}"><small>旧档原始内容</small><div class="wjwk-mmlc-cell">${facts.map(f=>`${esc(f.label)}：${esc(short(f.value))}`).join('；')||'—'}</div></td>`:data.definition?data.columns.map(f=>`<td><span class="wjwk-mmlc-cell">${esc(typed?r.specific.fields[f.id]||'—':'—')}</span></td>`).join(''):`<td>${esc(MMLC_MODULES.find(m=>m.id===module)?.title||'其他记录')}</td><td><div class="wjwk-mmlc-cell">${facts.slice(0,2).map(f=>`<span><strong>${esc(f.label)}：</strong>${esc(short(f.value))}</span>`).join('')||'—'}</div></td>`;
  return `<tr data-mmlc-record="${esc(r.id)}"><th scope="row">${button('open-archive',esc(r.name),r.id)}${!typed?'<small>旧档详情保留</small>':''}</th><td><span class="wjwk-chip">${esc(ARCHIVE_STATUS[r.status])}</span></td>${cells}<td class="wjwk-mmlc-row-actions">${button('open-archive','详情与修正',r.id)}${button('mmlc-continue',module==='arts'?'基于此参悟':module==='projects'?'继续此课题':module==='body'?'基于此修行':'基于此改良',r.id,!canAI||r.status==='ended')}${button('open-memory','带入正文',r.id,blocked||!power.active||r.status==='ended')}${linked.length?`<details><summary>关联成果 · ${linked.length}</summary>${linked.map(other=>button('open-archive',esc(other.name),other.id)).join('')}</details>`:''}</td></tr>`;
 }).join('');
 const headers=data.definition?data.columns.map(f=>`<th scope="col">${esc(f.label)}</th>`).join(''):'<th scope="col">所属八部</th><th scope="col">当前情况</th>';
 return `<p class="wjwk-mmlc-table-count" role="status">${data.total} 项档案 · 当前筛选 ${data.matched} 项${Object.entries(data.counts).filter(([,n])=>n).map(([s,n])=>` · ${esc(ARCHIVE_STATUS[s])} ${n}`).join('')}</p><div class="wjwk-mmlc-table-scroll" tabindex="0" role="region" aria-label="${esc(data.definition?.label||'八部总档')}表格，可横向滚动"><table class="wjwk-mmlc-table"><caption>${esc(data.definition?.label||'八部总档')} · 每行沿用原档案，空白表示未登记</caption><thead><tr><th scope="col">名称</th><th scope="col">状态</th>${headers}<th scope="col">查看与操作</th></tr></thead><tbody>${body||`<tr><td colspan="${data.columns.length?data.columns.length+3:5}">${data.total?'没有匹配记录，请调整或清除筛选。':'尚无档案。整理剧情后，已确认的记录会出现在这里。'}</td></tr>`}</tbody></table></div><div class="wjwk-mmlc-table-pages">${btn('mmlc-table-page','上一页','wjwk-secondary',data.page===0,'data-direction="-1"')}<span>第 ${data.page+1} / ${data.pages} 页 · 每页最多 20 项</span>${btn('mmlc-table-page','下一页','wjwk-secondary',data.page+1===data.pages,'data-direction="1"')}</div>`;
}
export function mmlcTableHTML(power,chat,section,filter={},options){
 const {esc,btn}=options;
 return `<section class="wjwk-mmlc-table-panel" aria-label="漫漫长路档案表格"><div class="wjwk-mmlc-table-filters"><label>分类<select data-mmlc-table-module><option value="">八部总档</option>${MMLC_MODULES.map(m=>`<option value="${m.id}" data-section="${m.id}" ${section===m.id?'selected':''}>${esc(m.title)}</option>`).join('')}</select></label><label>搜索档案<input type="search" data-mmlc-table-query maxlength="1000" value="${esc(filter.query||'')}" placeholder="名称、原理、用途或内容"></label><label>状态<select data-mmlc-table-status><option value="">全部状态</option>${Object.entries(ARCHIVE_STATUS).map(([id,label])=>`<option value="${id}" ${filter.status===id?'selected':''}>${esc(label)}</option>`).join('')}</select></label>${btn('mmlc-table-reset','清除筛选','wjwk-secondary')}</div><p class="wjwk-muted">只查看现有记录；点击名称看完整字段、关联与成长历史。计划和研究所得不代表实物已交付。窄屏可在表格内横向滑动。</p><div data-mmlc-table-results>${mmlcTableResultsHTML(power,chat,section,filter,options)}</div></section>`;
}
