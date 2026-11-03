import {mmlcModule} from './mmlc.js';
import {mmlcLinked} from './mmlc-view.js';
import {ARCHIVE_STATUS} from './archives.js';

const fields=r=>r.specific?.fields||{};
export const MMLC_OUTCOME_ACTIONS={
 trial:{label:'安排试用',section:'projects',goal:'安排试用已经得到的方法或设计，写清试用对象、步骤、需要的条件和观察重点。'},
 manufacture:{label:'据此制造',section:'items',goal:'把已经得到且适合制造的图纸或工艺用于炼制、制作或改造，结合现有设施与材料提出具体方案。'},
 cultivation:{label:'用于修行',section:'body',goal:'梳理已经得到的原理或方法如何用于本体修行，结合当前境界与既有能力提出适用路线。'}
};
export function mmlcOutcomeOptions(record){return mmlcModule(record)==='projects'&&['active','working'].includes(record.status)&&mmlcProjectOutput(record).length?Object.entries(MMLC_OUTCOME_ACTIONS).map(([kind,action])=>({kind,...action})):[];}
export function mmlcOutcomeActionsHTML(record,{esc,btn,disabled=false}){
 const actions=mmlcOutcomeOptions(record);return actions.length?`<details class="wjwk-mmlc-outcome-actions"><summary>使用研究成果</summary><small>选择用途后拟定方案，使用当前 API。</small>${actions.map(action=>`<div>${btn('mmlc-use-outcome',action.label,'wjwk-link',disabled,`data-id="${esc(record.id)}" data-kind="${action.kind}"`)}</div>`).join('')}</details>`:'';
}
export function mmlcProjectOutput(record){const f=fields(record);return ['discovery','usable','outcome'].filter(k=>f[k]).map(k=>({label:{discovery:'已验证的发现',usable:'已可用的方法与设计',outcome:'已完成部分'}[k],value:f[k]}));}
export function mmlcInventory(record){const f=fields(record);return [
 {label:'实际产出',value:f.produced},{label:'已交付',value:f.delivered},{label:'当前库存',value:f.stock},
 ...(!f.stock&&f.quantity?[{label:'数量原文',value:f.quantity}]:[]),{label:'完好与使用情况',value:f.condition}
 ].filter(r=>r.value);}
export function mmlcPrinciples(records){const groups=new Map();for(const r of records){const principle=fields(r).principle||'',key=principle?principle.normalize('NFKC').replace(/\s/g,''):r.id;if(!groups.has(key))groups.set(key,{principle,records:[]});groups.get(key).records.push(r);}return [...groups.values()];}
export function mmlcFocusContext(power,chat,id){
 const focus=power.archives[id],f=fields(focus),related=mmlcLinked(power,chat,id,{depth:2}).filter(r=>r.status!=='ended');
 return {focusArchiveId:id,name:focus.name,status:focus.status,goal:f.goal||'',stage:f.stage||'',available:mmlcModule(focus)==='projects'?mmlcProjectOutput(focus):['principle','mastery','effect','derivatives'].filter(k=>f[k]).map(k=>({label:{principle:'共同原理',mastery:'理解与验证',effect:'已有用途',derivatives:'已验证方法'}[k],value:f[k]})),needs:f.needs||f.limits||'',next:f.next||'',related:related.map(r=>({archiveId:r.id,name:r.name,module:mmlcModule(r),status:r.status}))};
}
export function mmlcFocusHTML(context,{esc}){
 return `<section class="wjwk-support-panel" data-mmlc-focus-context><h3>接着已有成果推进 · ${esc(context.name)}</h3>${context.stage?`<p><strong>当前阶段：</strong>${esc(context.stage)}</p>`:''}${context.goal?`<p><strong>原有目标：</strong>${esc(context.goal)}</p>`:''}${context.available.map(r=>`<p><strong>${esc(r.label)}：</strong>${esc(r.value)}</p>`).join('')}${context.needs?`<p><strong>待解决：</strong>${esc(context.needs)}</p>`:''}${context.next?`<p><strong>已定安排：</strong>${esc(context.next)}</p>`:''}${context.related.length?`<p><strong>相关档案：</strong>${context.related.map(r=>`${esc(r.name)}（${esc(ARCHIVE_STATUS[r.status])}）`).join('、')}</p>`:''}</section>`;
}
export function mmlcChainHTML(power,chat,id,{esc,btn}){
 const focus=power.archives[id],related=mmlcLinked(power,chat,id,{depth:2}),groups=[['原理与方法',['arts']],['研究与设计',['projects']],['设施与实物',['land','items','fleet']],['修行、人物与传承',['body','spirits','sect']]];
 const open=r=>btn('open-archive',esc(r.name),'wjwk-link',false,`data-id="${esc(r.id)}"`);
 return `<section data-mmlc-chain><h3>${esc(focus.name)}</h3><p>按已记录的关联展开，点击对象查看档案。</p>${groups.map(([label,modules])=>{const rows=[focus,...related].filter(r=>modules.includes(mmlcModule(r)));return rows.length?`<section class="wjwk-support-panel"><h4>${label}</h4>${rows.map(r=>`<p>${open(r)} · ${esc(ARCHIVE_STATUS[r.status])}${r.id===id?' · 当前对象':''}</p>`).join('')}</section>`:'';}).join('')}${related.length?'':'<p>还没有关联成果，可在档案的“关联成果”中填写已有档案名称。</p>'}</section>`;
}
