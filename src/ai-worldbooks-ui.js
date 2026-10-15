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
  this.dialog(d.companionImport?'太始天 · 从世界书录入眷属':scoped?'太始天 · 选择构建世界书与词条':'插件 AI 参考世界书',`<div data-ai-reference-dialog><p>${d.companionImport?'只勾选要作为眷属录入的人物词条。生成后预览，确认保存才加入；已有普通人物会复用档案。':scoped?'仅用于太始天世界书构建，不沿用共享参考。选择实际采用的世界设定，取消漫漫长路等无关词条。保存选择不调用模型；范围变化后重新分批，已有档案保留。':'选择随当前聊天保存，所有插件 AI 整理、拟定请求共享。每次读取最新内容；设定参考不能作为新增成果的正文证据。'}</p>
  ${scoped?'':`<label>来源</label><div class="wjwk-toolbar">${button('ai-ref-mode',manual?'跟随角色卡':'✓ 跟随角色卡',locked,'data-mode="card"')}${button('ai-ref-mode',manual?'✓ 手动选择':'手动选择',locked,'data-mode="manual"')}</div>`}
  ${manual?`<label>筛选世界书<input data-ai-ref-search="books" placeholder="按名称筛选"></label><div class="wjwk-reference-books">${d.names.map(name=>`<div data-ai-ref-book-row>${button('ai-ref-book',(d.config.books.some(b=>b.name===name)?'✓ ':'＋ ')+esc(name),locked,`data-book="${esc(name)}"`)}</div>`).join('')}</div>`:'<p class="wjwk-muted">仅跟随当前角色绑定的世界书。新绑定的书默认选择启用条目；群聊请使用手动选择。</p>'}
  <p>已选 ${d.config.books.length}/8 本：${esc(d.config.books.map(b=>b.name).join('、')||'暂无')}</p>
  <div class="wjwk-toolbar">${button('ai-ref-all','全选显示条目',locked)}${button('ai-ref-none','全不选显示条目',locked)}</div><label>搜索条目<input data-ai-ref-search="entries" placeholder="按条目标题筛选"></label>
  ${d.config.books.map(book=>{const rows=d.loaded.get(book.name)||[];return `<details data-ai-ref-group data-book="${esc(book.name)}"><summary>${esc(book.name)} <span data-ai-ref-count>${book.entryIds.length}/${rows.length} 条</span></summary><div class="wjwk-reference-entries">${rows.map(e=>`<div data-ai-ref-row><label class="wjwk-checkbox"><input type="checkbox" data-ai-ref-entry value="${esc(e.id)}" ${book.entryIds.includes(e.id)?'checked':''} ${locked?'disabled':''}>${esc(e.title)} <small>${e.content.length} 字${e.enabled?'':' · 酒馆已禁用'}</small></label><details><summary>查看内容</summary><pre>${esc(e.content)}</pre></details></div>`).join('')||'<p>暂无条目</p>'}</div></details>`;}).join('')}
  <p class="wjwk-muted">手动勾选的条目会直接提供给插件 AI，不受正文关键词触发限制。禁用条目只有明确勾选才会发送。普通请求参考上限 800000 字符，合并请求上限 1200000 字符；实际仍受所选模型上下文限制。太始天底稿可读取最多 4000000 字符并分批构建，保存选择不会调用模型。超出普通请求上限时，其他整理任务需减少条目。</p>
  ${locked?'<p role="status">正在读取世界书…</p>':''}${d.error?`<p role="alert">${esc(d.error)}</p>`:''}
  <div class="wjwk-toolbar">${button('ai-ref-preview','发送预览',locked)}${button('ai-ref-save',d.companionImport?'生成眷属候选（消耗 API）':'保存选择',locked)}${button('ai-ref-clear','清空选择',locked)}</div>
  ${d.preview?`<details data-ai-ref-preview open><summary>实际发送预览 · ${d.preview.characters} 字正文</summary><pre>${esc(JSON.stringify(d.preview.serializedCharacters>800000?d.preview.summary:d.preview.payload,null,2))}</pre></details>`:''}
  ${!scoped&&last?`<details><summary>最近一次参考 · ${esc(last.status)}</summary><p>${esc(last.characters)} 字 · ${esc(last.books.map(b=>b.name+'（'+b.entries.length+'条）').join('、'))}</p></details>`:''}</div>`);
 },
};
