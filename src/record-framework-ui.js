import {RECORD_FRAMEWORKS,supportsRecordFrameworks,recommendedFrameworks,frameworkCategory,FRAMEWORK_CATEGORY_LABELS,nativeFramework} from './record-frameworks.js';
import {archiveTables} from './archive-tables.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Inspect the native declaration without applying the player's optional scope filter.
// This is a read-only projection; retired categories are never presented as new tables.
export function nativeFrameworkCoverage(power){
 const nativePower={...power};delete nativePower.recordFrameworks;
 const spec=archiveTables(nativePower);if(!spec)return {tables:[],legacy:[]};
 const count=t=>Object.values(power.archives||{}).filter(r=>r.specific?.adapterId===spec.adapter&&r.specific.recordId===t.id).length;
 return {tables:spec.tables.map(t=>({...t,frameworkId:nativeFramework(spec,t.id),count:count(t)})),
  legacy:spec.retiredTables.map(t=>({...t,frameworkId:nativeFramework(spec,t.id)||nativeFramework(spec,t.detailTarget),count:count(t)})).filter(t=>t.count)};
}
export function frameworkChoicesHTML(power,enabled){
 if(!supportsRecordFrameworks(power))return '<p class="wjwk-muted">此模块沿用专用记录结构。</p>';
 const selected=enabled??power.recordFrameworks?.enabled??recommendedFrameworks(power),recommended=recommendedFrameworks(power),category=FRAMEWORK_CATEGORY_LABELS[frameworkCategory(power)],coverage=nativeFrameworkCoverage(power);
 const native=coverage.tables.length?coverage.tables.map(t=>`<article data-native-table="${esc(t.id)}"><strong>${esc(t.label)}</strong><p>${esc(t.retain)}</p><p class="wjwk-muted" data-static-help>记录栏目：${esc(t.fields.map(f=>f.label).join('、'))}</p><small>已有 ${t.count} 项 · 勾选“${esc(RECORD_FRAMEWORKS.find(f=>f.id===t.frameworkId)?.label||'对应框架')}”时启用并复用此表</small></article>`).join(''):'<p data-static-help>当前规则没有匹配的专属长期子表。原状态栏照常维护；按实际需要选择下方通用框架。</p>';
 return `<fieldset class="wjwk-framework-choices"><legend>选择需要长期记住的内容</legend><input type="hidden" name="framework-selection" value="1"><p class="wjwk-muted" data-static-help>${category?esc(category)+' · ':''}推荐仅供参考，可自由勾选或全不选。选择不会调用 AI，也不会赋予新能力。</p><section class="wjwk-native-coverage" aria-label="词条自带子表"><h3>先看词条自带的记录范围</h3><p data-static-help>原状态栏记当前概况；下列专属子表记独立长期对象。对应框架勾选后复用原表和原字段，不再增加同类通用副本；未勾选就不自动填写。</p>${native}${coverage.legacy.length?`<p data-static-help>已有旧分类：${esc(coverage.legacy.map(t=>t.label+'（'+t.count+'项）').join('、'))}。这些分类已收拢，只接续已有档案；不会作为新子表创建，同一对象不要再建通用副本。</p>`:''}</section><h3>再选择需要启用的记录范围</h3><div class="wjwk-framework-grid">${RECORD_FRAMEWORKS.map(f=>{
 const reused=coverage.tables.filter(t=>t.frameworkId===f.id),legacy=coverage.legacy.filter(t=>t.frameworkId===f.id);
 const routing=reused.length?'复用自带子表：'+reused.map(t=>t.label).join('、')+'；不会另建同类通用表。':'启用通用表；只记原状态栏之外需要独立追踪的重要对象。';
 return `<label class="wjwk-framework-choice"><input type="checkbox" name="record-framework" value="${esc(f.id)}" ${selected.includes(f.id)?'checked':''}><span><strong>${esc(f.label)}</strong>${recommended.includes(f.id)?'<small class="wjwk-framework-recommended">推荐</small>':''}<small>${esc(f.hint)}</small><small class="wjwk-framework-routing">${esc(routing)}${legacy.length?esc(' 已有旧档“'+legacy.map(t=>t.label).join('、')+'”沿原ID更新，避免重复建档。'):''}</small></span></label>`;
 }).join('')}</div><p class="wjwk-muted" data-static-help>同一对象更新原档，已有专属表优先复用。关闭只停止自动整理该类旧档，不删除；原状态栏和资源账本继续使用。正文是否带入档案，仍由“正文记忆”设置决定。</p></fieldset>`;
}
export function frameworkLauncherHTML(power,blocked=false){
 if(!supportsRecordFrameworks(power))return '';
 const chosen=power.recordFrameworks?.enabled,labels=RECORD_FRAMEWORKS.filter(f=>chosen?.includes(f.id)).map(f=>f.label);
 return `<section class="wjwk-framework-launcher" aria-label="记录框架"><div><strong>记录框架</strong><p class="wjwk-muted">${chosen===undefined?'沿用原有记录方式，可自行选择长期记忆范围。':labels.length?esc(labels.join('、')):'未启用附加框架，继续使用原状态栏。'}</p></div><button type="button" data-action="frameworks-open" class="wjwk-secondary" ${blocked?'disabled':''}>选择记录框架</button></section>`;
}
