import {assert,clone} from './primitives.js';
import {AI_TASKS} from './task-routing.js';
import {getContext,getSettings,getPromptPresetLibrary,savePromptPresetLibrary} from './host.js';
import {importPromptPreset,exportPromptPreset,PRESET_FILE_LIMIT,composePromptPreset} from './prompt-presets.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,label,extra='')=>`<button type="button" data-action="${action}" ${extra}>${label}</button>`;
function presetManager(){const ctx=getContext();try{return typeof ctx?.getPresetManager==='function'?ctx.getPresetManager('openai'):null;}catch{return null;}}
function installedNames(){const pm=presetManager();try{const list=pm?.getPresetList?.(),names=list?.preset_names??list?.presetNames;return Array.isArray(names)?names.filter(n=>typeof n==='string'):names&&typeof names==='object'?Object.keys(names):[];}catch{return [];}}
function captureAccount(){const c=getContext();return {user:c?.userHandle,settings:c?.extensionSettings};}
function assertAccount(before){const c=captureAccount();assert(before&&before.user===c.user&&before.settings===c.settings,'酒馆账户已切换，请重新打开预设管理');}
export const promptPresetMethods={
 openPromptPresets(){
  this.promptPresetCapture=captureAccount();this.promptPresetLibrary=getPromptPresetLibrary();this.promptPresetDraft=null;
  const lib=this.promptPresetLibrary,names=installedNames();
  this.ui.dialog('自定义提示词预设',`<p>导入自己的补全预设，选择需要的提示块，再指定哪些任务使用。独立保存到当前酒馆账户，默认不启用；不包含Key，不改主聊天预设。</p>
  <label>导入预设JSON<input type="file" accept=".json,application/json" data-prompt-preset-file></label><small>支持酒馆Chat Completion预设和武库导出的预设，最多2MB。只导入提示块，不导入模型、地址或采样参数。</small>
  ${names.length?`<form><label>或从酒馆已安装的预设中复制<select name="installedPreset">${names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select></label>${button('prompt-preset-installed','复制并挑选')}</form>`:'<p class="wjwk-muted">当前酒馆未提供可读取的补全预设列表，可直接导入JSON文件。</p>'}
  <h3>已保存预设 · ${lib.presets.length}/20</h3>${lib.presets.map(p=>`<section class="wjwk-card"><strong>${esc(p.name)}</strong><p>${p.blocks.filter(b=>b.enabled&&b.kind==='text').length}个文本块 · ${p.blocks.filter(b=>b.enabled).reduce((n,b)=>n+b.content.length,0)}字符</p><div class="wjwk-toolbar">${button('prompt-preset-edit','挑选／编辑',`data-id="${esc(p.id)}"`)}${button('prompt-preset-export','导出',`data-id="${esc(p.id)}"`)}${button('prompt-preset-delete','删除',`data-id="${esc(p.id)}"`)}</div></section>`).join('')||'<p>尚未导入预设。</p>'}
  <form><h3>哪些任务使用预设</h3>${Object.entries(AI_TASKS).map(([id,label])=>`<label>${esc(label)}<select name="preset:${id}"><option value="">关闭，使用武库原提示</option>${lib.presets.map(p=>`<option value="${esc(p.id)}" ${lib.routes[id]===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`).join('')}${button('prompt-preset-routes','保存任务选择')}</form><p class="wjwk-muted">自动更新与手动整理共用“整理与自动更新”；失败候选修复沿用该任务的选择。沿用酒馆连接时仍受酒馆自身预设影响。预设不能保证所有模型均不拒答。</p>`);
 },
 async importUserPromptPreset(file){
  assertAccount(this.promptPresetCapture);assert(file?.size<=PRESET_FILE_LIMIT,'预设文件超过2MB');
  const text=await file.text();assertAccount(this.promptPresetCapture);
  this.promptPresetDraft=importPromptPreset(text,file.name);this.showPromptPresetEditor();
 },
 importInstalledPromptPreset(name){
  assertAccount(this.promptPresetCapture);const pm=presetManager();assert(typeof pm?.getCompletionPresetByName==='function','此酒馆无法读取预设正文，请改用JSON导入');
  const raw=pm.getCompletionPresetByName(name);assert(raw,'未找到所选预设');
  this.promptPresetDraft=importPromptPreset(JSON.stringify(raw),name);this.showPromptPresetEditor();
 },
 editPromptPreset(id){assertAccount(this.promptPresetCapture);const p=this.promptPresetLibrary.presets.find(p=>p.id===id);assert(p,'预设已不存在');this.promptPresetDraft=clone(p);this.showPromptPresetEditor();},
 showPromptPresetEditor(){
  const p=this.promptPresetDraft;assert(p,'请先导入或选择预设');
  this.ui.dialog('挑选提示块',`<form data-preset-editor><label>预设名称<input name="presetName" value="${esc(p.name)}" maxlength="80" required></label><p>勾选要发送的块，用上移／下移调整顺序，可展开编辑全文。保存为独立快照；角色与世界书资料沿用武库本次任务，不重复展开原预设的上下文插槽。</p><p>建议关闭与任务无关的思维链、续写、文风和字数块。支持 {{user}}、{{char}}、setvar/getvar和setglobalvar/getglobalvar；变量只在本次请求内生效。其他宏需关闭对应块或改成普通文本。</p><div data-preset-blocks>${p.blocks.map(b=>`<section class="wjwk-card" data-preset-block="${esc(b.id)}"><label class="wjwk-checkbox"><input type="checkbox" data-preset-enabled ${b.enabled?'checked':''} ${b.kind==='context'?'disabled':''}>${esc(b.name)} · ${b.kind==='task'?'武库任务插槽':b.kind==='context'?'上下文插槽（不重复发送）':b.role+' · '+b.content.length+'字符'}</label><div class="wjwk-toolbar">${button('prompt-preset-up','上移')}${button('prompt-preset-down','下移')}</div>${b.kind==='text'?`<details><summary>查看／编辑提示词${/思维链|cot|续写|文风|字数/i.test(b.name)?' · 可能干扰填表':''}</summary><label>消息角色<select data-preset-role>${['system','user','assistant'].map(r=>`<option ${r===b.role?'selected':''}>${r}</option>`).join('')}</select></label><label>内容<textarea data-preset-content rows="7" maxlength="200000" spellcheck="false">${esc(b.content)}</textarea></label></details>`:''}</section>`).join('')}</div><div class="wjwk-toolbar">${button('prompt-preset-preview','预览组装顺序')}${button('prompt-preset-save','保存快照')}${button('prompt-presets','放弃修改并返回')}</div><pre data-preset-preview hidden></pre></form>`);
 },
 readPromptPresetDraft(){
  const p=clone(this.promptPresetDraft);assert(p,'预设草稿已失效');
  const form=this.ui.modal.querySelector('[data-preset-editor]');assert(form,'请重新打开预设编辑器');p.name=form.elements.presetName.value.trim();
  p.blocks=[...form.querySelectorAll('[data-preset-block]')].map(row=>{const b=p.blocks.find(b=>b.id===row.dataset.presetBlock);assert(b,'提示块已变化');return {...b,enabled:b.kind!=='context'&&row.querySelector('[data-preset-enabled]').checked,role:row.querySelector('[data-preset-role]')?.value||b.role,content:row.querySelector('[data-preset-content]')?.value||''};});return p;
 },
 movePromptPresetBlock(data,direction){const row=data.form?.querySelector(`[data-preset-block="${CSS.escape(data.blockId||'')}"]`);assert(row,'请选择提示块');const sibling=direction<0?row.previousElementSibling:row.nextElementSibling;if(sibling)direction<0?sibling.before(row):sibling.after(row);row.querySelector(`[data-action="prompt-preset-${direction<0?'up':'down'}"]`)?.focus();},
 previewPromptPreset(){
  const p=this.readPromptPresetDraft(),lib=clone(this.promptPresetLibrary);lib.presets=lib.presets.filter(v=>v.id!==p.id);lib.presets.push(p);lib.routes={general:p.id};
  const prompt=composePromptPreset({system:'【武库本次任务格式与规则：此处仅为示意】',user:'【本次来源、已有档案与任务数据：此处仅为示意】'},{promptPresetLibrary:lib},'general',{user:getContext()?.name1||'玩家',char:getContext()?.name2||'角色'});
  const node=this.ui.modal.querySelector('[data-preset-preview]');node.hidden=false;node.textContent='这是提示块与任务的位置预览，不包含真实档案，也不会调用模型。\n'+JSON.stringify(prompt.messages,null,2);
 },
 saveUserPromptPreset(){
  assertAccount(this.promptPresetCapture);assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前任务结束');const p=this.readPromptPresetDraft(),lib=clone(this.promptPresetLibrary),i=lib.presets.findIndex(v=>v.id===p.id);
  if(i<0)lib.presets.push(p);else lib.presets[i]=p;savePromptPresetLibrary(lib);this.settings=getSettings();this.openPromptPresets();this.notice('预设快照已保存；在下方选择需要启用的任务。');
 },
 savePromptPresetRoutes(values){assertAccount(this.promptPresetCapture);assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前任务结束');const lib=clone(this.promptPresetLibrary);lib.routes=Object.fromEntries(Object.keys(AI_TASKS).map(id=>[id,values['preset:'+id]||'']));savePromptPresetLibrary(lib);this.settings=getSettings();this.openPromptPresets();this.notice('预设任务选择已保存。');},
 confirmPromptPresetDelete(id){const p=this.promptPresetLibrary.presets.find(p=>p.id===id);assert(p,'预设已不存在');this.ui.dialog('删除提示词预设',`<p>删除“${esc(p.name)}”？使用它的任务将恢复武库原提示。玩家档案保持不变。</p>${button('prompt-preset-delete-confirm','确认删除',`data-id="${esc(id)}"`)}${button('prompt-presets','取消')}`);},
 deleteUserPromptPreset(id){assertAccount(this.promptPresetCapture);assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前任务结束');const lib=clone(this.promptPresetLibrary);lib.presets=lib.presets.filter(p=>p.id!==id);for(const task of Object.keys(lib.routes))if(lib.routes[task]===id)lib.routes[task]='';savePromptPresetLibrary(lib);this.settings=getSettings();this.openPromptPresets();},
 exportUserPromptPreset(id){const p=this.promptPresetLibrary.presets.find(p=>p.id===id);assert(p,'预设已不存在');const url=URL.createObjectURL(new Blob([JSON.stringify(exportPromptPreset(p),null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='武库提示词预设-'+p.name.replace(/[\\/:*?"<>|]/g,'_')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
};
