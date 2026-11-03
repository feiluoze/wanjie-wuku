import {mmlcOutcomeActionsHTML,mmlcProjectOutput,mmlcInventory,mmlcPrinciples} from './mmlc-workbench.js';
// Read-only brief over existing archives. Relations never create or merge objects.
import {archiveCurrent,ARCHIVE_STATUS} from './archives.js';
import {mmlcModule,MMLC_MODULES} from './mmlc.js';
import {mmlcFacts,mmlcRelations} from './mmlc-view.js';
import {MMLC_CONFIG} from './mmlc-config.js';

export function mmlcBrief(power,chat){
 const records=Object.values(power.archives||{}).filter(r=>archiveCurrent(r,chat)).sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
 const byId=new Map(records.map(r=>[r.id,r])),links=new Map();
 for(const e of mmlcRelations(power,chat))for(const [from,to]of [[e.from,e.to],[e.to,e.from]]){
  if(!links.has(from))links.set(from,new Set());links.get(from).add(to);
 }
 return {records,byId,links,
  cultivation:records.filter(r=>mmlcModule(r)==='body'&&!['ended','planned'].includes(r.status)),
  knowledge:records.filter(r=>mmlcModule(r)==='arts'&&r.status==='active'),
  ongoing:records.filter(r=>r.status==='working'),
  deliveries:records.filter(r=>r.status==='active'&&['items','fleet','land'].includes(mmlcModule(r))),
  usableProjects:records.filter(r=>mmlcModule(r)==='projects'&&!['ended','planned'].includes(r.status)&&mmlcProjectOutput(r).length),
  changes:(power.lastArchiveUpdate?.records||[]).map(change=>({change,record:byId.get(change.id)})).filter(r=>r.record),
  projects:records.filter(r=>mmlcModule(r)==='projects'&&r.status!=='ended')};
}

const fieldOrder={arts:['principle','mastery','derivatives','effect'],projects:['discovery','usable','outcome','stage','needs'],body:['realm','body','soul','breakthrough','progress']};
const fieldNames={principle:'共同原理',mastery:'理解与验证',derivatives:'已验证方法',effect:'现在能做什么',discovery:'已经发现',usable:'现在能做什么',outcome:'已得成果',stage:'当前阶段',needs:'仍待解决',realm:'当前境界',body:'肉身与真元',soul:'神魂与本源',breakthrough:'最近突破',progress:'修行取向'};
export function mmlcBriefFacts(record){
 if(mmlcModule(record)==='items'&&record.specific?.adapterId===MMLC_CONFIG.id){const values=mmlcInventory(record),f=record.specific.fields;return [...values,...['effect','purpose'].filter(k=>f[k]).map(k=>({label:k==='effect'?'用途与效果':'用途',value:f[k]}))];}
 const module=mmlcModule(record),specific=record.specific?.adapterId===MMLC_CONFIG.id&&record.specific.recordId===module?record.specific.fields:null;
 if(!specific)return mmlcFacts(record);
 const ordered=fieldOrder[module];
 if(!ordered)return mmlcFacts(record);
 const rows=ordered.filter(k=>specific[k]).map(k=>({label:fieldNames[k],value:specific[k]}));
 // Full archive stays available; the brief suppresses repeated summaries only.
 return rows.length?rows.filter((r,i)=>!rows.slice(0,i).some(p=>p.value.normalize('NFKC').replace(/\s/g,'')===r.value.normalize('NFKC').replace(/\s/g,''))):mmlcFacts(record);
}

export function mmlcBriefHTML(power,chat,section,{esc,btn,blocked=false,canAI=false,state={}}){
 const brief=mmlcBrief(power,chat),short=value=>String(value).length>180?String(value).slice(0,180)+'…':String(value);
 const button=(action,label,id,disabled=blocked)=>btn(action,label,'wjwk-link',disabled).replace(`data-action="${action}"`,`data-action="${action}" data-id="${esc(id)}"`);
 const relationButtons=r=>[...(brief.links.get(r.id)||[])].map(id=>brief.byId.get(id)).filter(Boolean).map(other=>button('open-archive',`${esc(other.name)} · ${esc(ARCHIVE_STATUS[other.status])}`,other.id)).join('');
 const pipeline=r=>{
  const related=[...(brief.links.get(r.id)||[])].map(id=>brief.byId.get(id)).filter(Boolean);
  if(!related.length)return '';
  const grouped=[['知识与方法',['arts']],['研究与图纸',['projects']],['设施与实物',['land','items','fleet']],['修行与传承',['body','sect','spirits']]];
  return `<details open class="wjwk-mmlc-chain"><summary>成果脉络 · ${related.length} 项关联</summary>${grouped.map(([label,modules])=>{const rows=related.filter(x=>modules.includes(mmlcModule(x)));return rows.length?`<div><small>${label}</small>${rows.map(x=>button('open-archive',`${esc(x.name)} · ${esc(ARCHIVE_STATUS[x.status])}`,x.id)).join('')}</div>`:'';}).join('')}</details>`;
 };
 const card=(r,{compact=false,keys=null}={})=>{
  const module=mmlcModule(r),definition=MMLC_CONFIG.records.find(d=>d.id===module),facts=keys?keys.filter(k=>r.specific?.fields[k]).map(k=>({label:definition.fields.find(f=>f.id===k)?.label||k,value:r.specific.fields[k]})):mmlcBriefFacts(r);
  return `<article class="wjwk-mmlc-record wjwk-mmlc-brief-record" data-mmlc-record="${esc(r.id)}"><header><strong>${esc(r.name)}</strong><span>${esc(ARCHIVE_STATUS[r.status])}</span></header><dl>${facts.slice(0,compact?2:5).map(f=>`<div><dt>${esc(f.label)}</dt><dd>${esc(short(f.value))}</dd></div>`).join('')}</dl>${module==='projects'?pipeline(r):relationButtons(r)?`<details class="wjwk-mmlc-relations"><summary>关联成果（含历史状态）</summary>${relationButtons(r)}</details>`:''}<footer>${mmlcOutcomeActionsHTML(r,{esc,btn,disabled:!canAI})}${button('open-archive','详情与成长记录',r.id)}${brief.links.get(r.id)?.size?button('mmlc-chain','查看成果脉络',r.id):''}${r.status!=='ended'?button('mmlc-continue',module==='arts'?'基于此参悟':module==='projects'?'继续此课题':module==='body'?'基于此修行':'基于此改良',r.id,!canAI):''}${button('open-memory','带入正文',r.id,blocked||!power.active||r.status==='ended')}</footer></article>`;
 };
 const list=(rows,empty,limit=3,compact=false,keys=null)=>rows.length?`<div class="wjwk-mmlc-records">${rows.slice(0,limit).map(r=>card(r,{compact,keys})).join('')}</div>${rows.length>limit?`<details><summary>其余记录 · ${rows.length-limit} 项</summary><div class="wjwk-mmlc-records">${rows.slice(limit).map(r=>card(r)).join('')}</div></details>`:''}`:`<p class="wjwk-muted">${empty}</p>`;
 if(section==='projects')return `<div class="wjwk-mmlc-back">${btn('mmlc-section','← 道场总览','wjwk-link')}</div><p>同一课题的已得成果与后续进度分开展示，点击名称查看完整档案。</p><section><h2>已经可用的成果</h2>${list(brief.usableProjects,'尚无已记录的方法、图纸或阶段成果。',6,false,['discovery','usable','outcome'])}</section><section><h2>课题进度与缺口</h2>${list(brief.projects,'还没有研究课题。',6,false,['goal','stage','needs','next'])}</section>`;
 if(section==='arts'){
  const rows=brief.records.filter(r=>mmlcModule(r)==='arts'&&r.status!=='ended');
  return `<div class="wjwk-mmlc-back">${btn('mmlc-section','← 道场总览','wjwk-link')}</div><section><h2>原理与法式</h2>${mmlcPrinciples(rows).map(group=>`<section class="wjwk-support-panel"><h3>${group.principle?'共同原理':'独立方法'}</h3>${group.principle?`<p>${esc(group.principle)}</p>`:''}${list(group.records,'',6,false,['mastery','derivatives','effect','limits'])}</section>`).join('')||'<p>整理剧情后，已掌握的原理与方法会收录在这里。</p>'}</section>`;
 }
 if(section){
  const module=MMLC_MODULES.find(m=>m.id===section),rows=brief.records.filter(r=>mmlcModule(r)===section),current=rows.filter(r=>r.status==='active'),work=rows.filter(r=>['working','planned'].includes(r.status));
  return `<div class="wjwk-mmlc-back">${btn('mmlc-section','← 道场总览','wjwk-link')}</div>${section==='arts'?'<p class="wjwk-mmlc-kicker">明其理 · 验其法 · 用于万象</p>':''}<section class="wjwk-mmlc-current"><h2>${section==='arts'?'万法图谱':section==='body'?'性命与功行':section==='projects'?'已得成果':'当前家底'}</h2>${list(current,'尚无已确认成果。整理剧情后，已有内容会归入这里。',6)}</section>${work.length?`<section><h2>正在推进与计划</h2>${list(work,'',4)}</section>`:''}${rows.some(r=>r.status==='ended')?`<details><summary>已结束的记录</summary>${list(rows.filter(r=>r.status==='ended'),'',6)}</details>`:''}`;
 }
 const panel=(title,rows,empty,kind,keys=null)=>`<section class="wjwk-mmlc-brief-panel" data-mmlc-brief="${kind}"><h2>${title}</h2>${list(rows,empty,kind==='cultivation'?2:3,true,keys)}</section>`;
 const queued=(state.creations||[]).filter(x=>x.powerId===power.id&&['queued','delivered'].includes(x.status)).slice(-3).reverse();
 return `${brief.changes.length?`<section class="wjwk-support-panel" data-mmlc-recent-changes><h2>本次变化</h2>${brief.changes.slice(0,6).map(({record,change})=>`<p>${button('open-archive',esc(record.name),record.id)} · ${esc({created:'新建',updated:'更新',recovered:'重新收录'}[change.kind]||'已保存')} · ${esc(ARCHIVE_STATUS[record.status])}</p>`).join('')}</section>`:''}<div class="wjwk-mmlc-brief-grid">${panel('本体修行',brief.cultivation,'境界与性命变化尚未登记。','cultivation')}${panel('新近参悟',brief.knowledge,'已掌握的原理与法式会汇总在这里。','knowledge')}${panel('正在推进',brief.ongoing,'当前没有进行中的课题。','ongoing',['stage','needs','next','progress','condition'])}${panel('研究已得成果',brief.usableProjects,'研究中已可用的方法和图纸会出现在这里。','usable',['discovery','usable','outcome'])}${panel('现有设施与实物',brief.deliveries,'尚未登记已建成的设施或实际交付。','deliveries')}</div>${queued.length?`<section class="wjwk-mmlc-commissions"><h2>已采用的委托</h2>${queued.map(x=>`<p><strong>${esc(x.title)}</strong><small>${x.status==='queued'?'等待正文承接':'已交正文，成果待核对'}</small></p>`).join('')}</section>`:''}<details class="wjwk-mmlc-directory"><summary>八部总档</summary><div class="wjwk-mmlc-grid">${MMLC_MODULES.map(m=>{const rows=brief.records.filter(r=>mmlcModule(r)===m.id),active=rows.filter(r=>r.status==='active');return `<button type="button" data-action="mmlc-section" data-section="${m.id}" class="wjwk-mmlc-tile"><header><strong>${m.title}</strong><span>${active.length} 项成果</span></header>${active.slice(0,2).map(r=>`<small>${esc(r.name)} · ${esc(ARCHIVE_STATUS[r.status])}</small>`).join('')}<footer>查看${m.title} →</footer></button>`;}).join('')}</div></details>`;
}
