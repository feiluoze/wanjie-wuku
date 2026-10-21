import {worldSchedules} from './taishi-schedule.js';
// Shared presentation for the approved three-module design. No state writes or requests.
export const designNames = {arsenal:'能力藏馆',journey:'修行道场',taishi:'诸界观测台'};
const marks = {arsenal:'库',journey:'道',taishi:'始'};
// Derive attention from the current chat, never from whether a panel was opened.
export function manualAttentionCount(view) {
  const state=view?.state;
  if(!state)return 0;
  const review=view.pendingArchiveReview;
  const current=review&&state.powers?.[review.powerId]?.active&&review.captured?.stateId===state.id&&review.captured?.revision===state.revision;
  const candidates=current?Math.max(1,(review.changes?.length||0)+(review.creationResults?.length||0)+(review.terminalResults?.length||0)):0;
  return candidates+(state.roleWrites||[]).filter(w=>w.status==='pending').length+(state.narrativeActions||[]).filter(a=>a.status==='presented'&&state.powers?.[a.powerId]?.active).length;
}
export function designHero({module,title,description,tag,stats,actions,extras='',compact=false,esc}) {
  if(compact)return `<section class="wjwk-taishi-title" data-design-hero><div><small>${esc(tag)}</small><h1>${esc(title)}</h1></div><details class="wjwk-help"><summary>简介</summary><p>${esc(description)}</p></details></section>${stats}<section class="wjwk-design-actions" aria-label="主要操作">${actions}</section>${extras?`<div class="wjwk-design-more">${extras}</div>`:''}`;
  return `<section class="wjwk-design-hero" data-design-hero><div class="wjwk-design-copy"><span class="wjwk-eyebrow">${designNames[module]} · 当前聊天</span><h1>${esc(title)}</h1><details class="wjwk-help"><summary>简介</summary><p>${esc(description)}</p></details><span class="wjwk-design-tag">${esc(tag)}</span></div><div class="wjwk-design-orb" aria-hidden="true"><i></i><i></i><i></i><span>${marks[module]}</span><small>${designNames[module]}</small></div></section>${stats}<section class="wjwk-design-actions" aria-label="主要操作">${actions}</section>${extras?`<div class="wjwk-design-more">${extras}</div>`:''}`;
}
export function designCover(index=0,label='') {
  return `<div class="wjwk-design-cover ${index%2?'is-jade':''}" aria-hidden="true"><svg viewBox="0 0 400 100" preserveAspectRatio="none"><path d="M0 95L60 50 105 70 170 20 224 63 270 45 330 72 400 35V100H0Z"/><path d="M0 100L78 78 130 90 240 48 310 84 360 60 400 79V100Z"/></svg><span>${label}</span></div>`;
}
export function designAside({power,pending,blocked,world,esc,btn,memory,compactTools=false}) {
  const count=pending?(pending.changes?.length||0)+(pending.creationResults?.length||0)+(pending.terminalResults?.length||0):0;
  const clock=world?.specific?.fields?.clock;
  const schedules=Object.values(worldSchedules(power)).filter(s=>s.config.enabled),scheduled=schedules.length>0,paused=scheduled&&schedules.every(s=>s.paused);
  return `<aside class="wjwk-design-aside" data-design-aside><section class="wjwk-design-panel is-pending ${pending?'':'is-empty'}"><header><span>◇ 待你确认</span><strong>${count}</strong></header><h3>${pending?(pending.restored?'已恢复待处理候选':'新的整理候选'):'暂无待确认更新'}</h3>${pending?`<span class="wjwk-chip">尚未采用</span>${btn('player-pending','查看变化并确认 →','wjwk-secondary',blocked)}`:'<small>已保存内容留在档案中</small>'}</section>${world?`<section class="wjwk-design-panel"><header><span>◷ 世界内历</span><small>剧情时间</small></header><small>${esc(world.name)}</small>${clock?`<p class="wjwk-design-clock">${esc(Array.from(clock).slice(0,80).join(''))}${Array.from(clock).length>80?'…':''}</p>`:'<p class="wjwk-design-clock">尚未登记内历</p>'}<p class="wjwk-design-state">${scheduled?(paused?'时间自动演化已暂停':'时间自动演化已开启'):'时间自动演化未开启'}</p>${btn('taishi-development','时间与自主发展设置 ↗','wjwk-link',blocked)}${btn('taishi-clock','查看全部世界内历','wjwk-link',blocked)}</section>`:`<section class="wjwk-design-panel"><header><span>◌ 正文记忆</span><small>当前聊天</small></header><h3>${memory?.auto?'自动选择档案':Object.values(memory?.selections||{}).some(s=>s.mode==='pinned'||s.mode==='next')?'已指定发送档案':'尚未开启发送'}</h3>${btn('open-memory','发送设置与预览 ↗','wjwk-link',blocked)}${btn('memory-report','最近发送记录','wjwk-link')}</section>`}${compactTools?'':`<section class="wjwk-design-panel"><header><span>留存与整理</span></header>${btn('open-archive','手动补录 / 修正','wjwk-link',blocked)}${btn('runtime-log-open','查看运行记录','wjwk-link')}${btn('export','导出当前模块档案','wjwk-link',blocked)}</section>`}</aside>`;
}
