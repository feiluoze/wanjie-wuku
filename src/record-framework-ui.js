import {RECORD_FRAMEWORKS,supportsRecordFrameworks,recommendedFrameworks,frameworkCategory,FRAMEWORK_CATEGORY_LABELS} from './record-frameworks.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function frameworkChoicesHTML(power,enabled){
 if(!supportsRecordFrameworks(power))return '<p class="wjwk-muted">此模块沿用专用记录结构。</p>';
 const selected=enabled??power.recordFrameworks?.enabled??recommendedFrameworks(power),recommended=recommendedFrameworks(power),category=FRAMEWORK_CATEGORY_LABELS[frameworkCategory(power)];
 return `<fieldset class="wjwk-framework-choices"><legend>选择需要长期记住的内容</legend><input type="hidden" name="framework-selection" value="1"><p class="wjwk-muted">${category?esc(category)+' · ':''}推荐仅供参考，可自由勾选或全不选。选择不会调用 AI，也不会赋予新能力。</p><div class="wjwk-framework-grid">${RECORD_FRAMEWORKS.map(f=>`<label class="wjwk-framework-choice"><input type="checkbox" name="record-framework" value="${esc(f.id)}" ${selected.includes(f.id)?'checked':''}><span><strong>${esc(f.label)}</strong>${recommended.includes(f.id)?'<small class="wjwk-framework-recommended">推荐</small>':''}<small>${esc(f.hint)}</small></span></label>`).join('')}</div><p class="wjwk-muted">同一对象更新原档，已有专属表优先复用。关闭只停止自动整理该类旧档，不删除；原状态栏和资源账本继续使用。正文是否带入档案，仍由“正文记忆”设置决定。</p></fieldset>`;
}
export function frameworkLauncherHTML(power,blocked=false){
 if(!supportsRecordFrameworks(power))return '';
 const chosen=power.recordFrameworks?.enabled,labels=RECORD_FRAMEWORKS.filter(f=>chosen?.includes(f.id)).map(f=>f.label);
 return `<section class="wjwk-framework-launcher" aria-label="记录框架"><div><strong>记录框架</strong><p class="wjwk-muted">${chosen===undefined?'沿用原有记录方式，可自行选择长期记忆范围。':labels.length?esc(labels.join('、')):'未启用附加框架，继续使用原状态栏。'}</p></div><button type="button" data-action="frameworks-open" class="wjwk-secondary" ${blocked?'disabled':''}>选择记录框架</button></section>`;
}
