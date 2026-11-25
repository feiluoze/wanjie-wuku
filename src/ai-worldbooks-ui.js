// Supplementary references stay outside the player's everyday overview.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,label,disabled=false,extra='')=>`<button type="button" data-action="${action}" ${disabled?'disabled':''} ${extra}>${label}</button>`;
export const referenceUIMethods={
 readReferenceChoices(){const map=new Map();for(const group of this.modal.querySelectorAll('[data-ai-ref-group]'))map.set(group.dataset.book,[...group.querySelectorAll('[data-ai-ref-entry]:checked')].map(e=>e.value));return map;},
 filterReferenceRows(query,kind){const q=query.trim().toLocaleLowerCase();for(const row of this.modal.querySelectorAll(kind==='books'?'[data-ai-ref-book-row]':'[data-ai-ref-row]'))row.hidden=!row.textContent.toLocaleLowerCase().includes(q);},
 selectReferenceRows(checked){for(const row of this.modal.querySelectorAll('[data-ai-ref-row]'))if(!row.hidden){const input=row.querySelector('input');if(!input.disabled)input.checked=checked;}this.updateReferenceCounts();},
 updateReferenceCounts(){for(const group of this.modal.querySelectorAll('[data-ai-ref-group]'))group.querySelector('[data-ai-ref-count]').textContent=`${group.querySelectorAll('input:checked').length}/${group.querySelectorAll('input').length} 条`;const preview=this.modal.querySelector('[data-ai-ref-preview]');if(preview)preview.hidden=true;},
 showAIWorldbooks(d,last){
  const locked=d.loading,manual=d.config.mode==='manual',scoped=Boolean(d.taishiPowerId);
  this.dialog(d.companionImport?'太始天 · 从世界书录入眷属':scoped?'太始天 · 选择构建世界书与词条':'插件 AI 参考世界书',`<div data-ai-reference-dialog><p>${d.companionImport?'勾选要录入的人物词条，预览后确认加入。':scoped?'选择用于太始天建档的世界设定（更改范围后会重新分批，不影响已有档案）。':'勾选的条目将作为整理和拟定方案的参考设定，随当前聊天保存。'}</p>
  ${scoped?'':`<label>来源</label><div class="wjwk-toolbar">${button('ai-ref-mode',manual?'跟随角色卡':'✓ 跟随角色卡',locked,'data-mode="card"')}${button('ai-ref-mode',manual?'✓ 手动选择':'手动选择',locked,'data-mode="manual"')}</div>`}
  ${manual?`<label>筛选世界书<input data-ai-ref-search="books" placeholder="按名称筛选"></label><div class="wjwk-reference-books">${d.names.map(name=>`<div data-ai-ref-book-row>${button('ai-ref-book',(d.config.books.some(b=>b.name===name)?'✓ ':'＋ ')+esc(name),locked,`data-book="${esc(name)}"`)}</div>`).join('')}</div>`:'<p class="wjwk-muted">仅跟随当前角色绑定的世界书。新绑定的书默认选择启用条目；群聊请使用手动选择。</p>'}
  <p>已选 ${d.config.books.length}/8 本：${esc(d.config.books.map(b=>b.name).join('、')||'暂无')}</p>
  <div class="wjwk-toolbar">${button('ai-ref-all','全选显示条目',locked)}${button('ai-ref-none','全不选显示条目',locked)}</div><label>搜索条目<input data-ai-ref-search="entries" placeholder="按条目标题筛选"></label>
  ${d.config.books.map(book=>{const rows=d.loaded.get(book.name)||[];return `<details data-ai-ref-group data-book="${esc(book.name)}"><summary>${esc(book.name)} <span data-ai-ref-count>${book.entryIds.length}/${rows.length} 条</span></summary><div class="wjwk-reference-entries">${rows.map(e=>`<div data-ai-ref-row><label class="wjwk-checkbox"><input type="checkbox" data-ai-ref-entry value="${esc(e.id)}" ${book.entryIds.includes(e.id)?'checked':''} ${locked?'disabled':''}>${esc(e.title)} <small>${e.content.length} 字${e.enabled?'':' · 酒馆已禁用'}</small></label><details><summary>查看内容</summary><pre>${esc(e.content)}</pre></details></div>`).join('')||'<p>暂无条目</p>'}</div></details>`;}).join('')}
  <p class="wjwk-muted">勾选的条目（含酒馆内已禁用项）均会作为参考发送。上限：普通整理 80 万字，合并整理 120 万字，太始天底稿 400 万字（分批读取）。</p>
  ${locked?'<p role="status">正在读取世界书…</p>':''}${d.error?`<p role="alert">${esc(d.error)}</p>`:''}
  <div class="wjwk-toolbar">${button('ai-ref-preview','发送预览',locked)}${button('ai-ref-save',d.companionImport?'生成眷属候选（消耗 API）':'保存选择',locked)}${button('ai-ref-clear','清空选择',locked)}</div>
  ${d.preview?`<details data-ai-ref-preview open><summary>实际发送预览 · ${d.preview.characters} 字正文</summary><pre>${esc(JSON.stringify(d.preview.serializedCharacters>800000?d.preview.summary:d.preview.payload,null,2))}</pre></details>`:''}
  ${!scoped&&last?`<details><summary>最近一次参考 · ${esc(last.status)}</summary><p>${esc(last.characters)} 字 · ${esc(last.books.map(b=>b.name+'（'+b.entries.length+'条）').join('、'))}</p></details>`:''}</div>`);
 },
};
