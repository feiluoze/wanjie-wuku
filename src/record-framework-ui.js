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
 if(!supportsRecordFrameworks(power))return '<p class="wjwk-muted">此模块使用专属记录结构。</p>';
 const selected=enabled??power.recordFrameworks?.enabled??recommendedFrameworks(power),recommended=recommendedFrameworks(power),category=FRAMEWORK_CATEGORY_LABELS[frameworkCategory(power)],coverage=nativeFrameworkCoverage(power);
 const native=coverage.tables.length?coverage.tables.map(t=>`<article data-native-table="${esc(t.id)}"><strong>${esc(t.label)}</strong><p>${esc(t.retain)}</p><p class="wjwk-muted" data-static-help>记录栏目：${esc(t.fields.map(f=>f.label).join('、'))}</p><small>已有 ${t.count} 项 · 勾选「${esc(RECORD_FRAMEWORKS.find(f=>f.id===t.frameworkId)?.label||'对应框架')}」即可启用</small></article>`).join(''):'<p data-static-help>当前词条没有专属长期子表，可按需勾选下方通用记录框架。</p>';
 return `<fieldset class="wjwk-framework-choices"><legend>选择需要长期记住的内容</legend><input type="hidden" name="framework-selection" value="1"><p class="wjwk-muted" data-static-help>${category?esc(category)+' · ':''}按需要勾选记录内容，也可以全部关闭。</p><section class="wjwk-native-coverage" aria-label="词条自带子表"><h3>词条自带的记录范围</h3><p data-static-help>勾选对应框架即可启用自带子表，关闭后暂停记录。</p>${native}${coverage.legacy.length?`<p data-static-help>已有旧分类：${esc(coverage.legacy.map(t=>t.label+'（'+t.count+'项）').join('、'))}，仅保留已有记录，不再新建。</p>`:''}</section><h3>选择需要启用的记录范围</h3><div class="wjwk-framework-grid">${RECORD_FRAMEWORKS.map(f=>{
 const reused=coverage.tables.filter(t=>t.frameworkId===f.id),legacy=coverage.legacy.filter(t=>t.frameworkId===f.id);
 const routing=reused.length?'使用自带子表：'+reused.map(t=>t.label).join('、'):'启用通用子表';
 return `<label class="wjwk-framework-choice"><input type="checkbox" name="record-framework" value="${esc(f.id)}" ${selected.includes(f.id)?'checked':''}><span><strong>${esc(f.label)}</strong>${recommended.includes(f.id)?'<small class="wjwk-framework-recommended">推荐</small>':''}<small>${esc(f.hint)}</small><small class="wjwk-framework-routing">${esc(routing)}${legacy.length?esc('（已有旧档「'+legacy.map(t=>t.label).join('、')+'」会直接更新）'):''}</small></span></label>`;
 }).join('')}</div><p class="wjwk-muted" data-static-help>关闭某项仅停止自动记录，不会删除已有档案。</p></fieldset>`;
}
export function frameworkLauncherHTML(power,blocked=false){
 if(!supportsRecordFrameworks(power))return '';
 const chosen=power.recordFrameworks?.enabled,labels=RECORD_FRAMEWORKS.filter(f=>chosen?.includes(f.id)).map(f=>f.label);
 return `<section class="wjwk-framework-launcher" aria-label="记录框架"><div><strong>记录框架</strong><p class="wjwk-muted">${chosen===undefined?'可按需选择要长期记录的内容。':labels.length?esc(labels.join('、')):'未启用附加记录，仅保留原状态栏。'}</p></div><button type="button" data-action="frameworks-open" class="wjwk-secondary" ${blocked?'disabled':''}>选择记录框架</button></section>`;
}
