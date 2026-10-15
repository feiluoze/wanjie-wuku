import {isCivilizationRecord} from './taishi-civilization-kind.js';
import {taishiLayout,readTaishiLayout,saveTaishiLayout} from './taishi-layout.js';
import {worldForRecord} from './taishi-world.js';
import {archiveCurrent} from './archives.js';
const scope=ui=>(ui.view?.chatKey||'')+'|'+(ui.view?.state?.id||'');
const storage=()=>{try{return globalThis.localStorage;}catch{return null;}};
export const layoutTitles=mode=>mode==='single'?{overview:'世界总览',worlds:'主世界',civilizations:'地域与文明'}:{overview:'诸界总览',worlds:'诸界',civilizations:'众生与文明'};
export function taishiLayoutUIMethods({esc,btn}){return {
 getTaishiLayout(power=this.view?.power,chat=this.view?.managementChat||[]){
  const key=scope(this)+'|'+power.id;
  const preference=this.taishiLayoutDraft?.key===key?this.taishiLayoutDraft.value:readTaishiLayout(storage(),scope(this),power.id);
  return taishiLayout(power,chat,preference);
 },
 setTaishiLayout(patch){
  const power=this.view?.power;if(!power)return;
  const current=this.getTaishiLayout(),value={mode:current.mode,worldId:current.world?.id||'',civilizationId:current.civilizationId,...patch};
  if(patch.worldId!==undefined||patch.mode!==undefined)value.civilizationId='';
  this.taishiLayoutDraft={key:scope(this)+'|'+power.id,value};
  const saved=saveTaishiLayout(storage(),scope(this),power.id,value);
  this.taishiQuery='';this.panelContext=null;this.render(this.view);
  if(!saved)this.setNotice('浏览器存储不可用，布局仅在本次页面保留。');
 },
 taishiLayoutToolbar(power,layout){
  const modes=`<div class="wjwk-layout-switch" role="group" aria-label="世界布局">${Object.entries({multi:'多世界',single:'单主世界'}).map(([mode,label])=>`<button type="button" data-action="taishi-layout-mode" data-mode="${mode}" aria-pressed="${layout.mode===mode}" class="${layout.mode===mode?'is-active':''}">${label}</button>`).join('')}</div>`;
  return `<section class="wjwk-world-toolbar" data-taishi-layout="${layout.mode}">${modes}${layout.mode==='single'&&layout.worlds.length>1?`<label>主世界<select data-taishi-main-world aria-label="主世界">${layout.worlds.map(w=>`<option value="${esc(w.id)}" ${layout.world?.id===w.id?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label>`:''}${layout.mode==='single'&&layout.civilizations.length?`<label>文明<select data-taishi-civilization aria-label="筛选文明"><option value="">全部文明</option>${layout.civilizations.map(c=>`<option value="${esc(c.id)}" ${layout.civilizationId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>`:''}<label class="wjwk-world-search"><span class="wjwk-sr-only">查找当前分类档案</span><input type="search" data-taishi-query name="taishi-query" value="${esc(this.taishiQuery||'')}" maxlength="100" placeholder="查找档案…"></label>${btn('taishi-layout-search','查找','wjwk-secondary')}</section>`;
 },
 showTaishiCivilization(power,worldId,chat){
  const worlds=Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='world'&&r.status!=='ended'&&archiveCurrent(r,chat));
  this.dialog('登记文明',`<form data-taishi-civilization-draft><label>文明名称<input name="name" required maxlength="200" placeholder="例如：林海城邦文明"></label><label>所属世界<select name="worldId" required>${worlds.map(w=>`<option value="${esc(w.id)}" ${w.id===worldId?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label><label>所属地域<select name="regionId"><option value="">未指定 / 跨地域</option>${Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='region'&&r.status!=='ended'&&worldForRecord(power,r,chat)).map(r=>`<option value="${esc(r.id)}">${esc(worldForRecord(power,r,chat).name)} · ${esc(r.name)}</option>`).join('')}</select></label><label>已确认的文明概况<textarea name="description" rows="3" maxlength="4000" required placeholder="人口、社会、技艺或力量体系；未知部分留空，不必填写数值。"></textarea></label><details class="wjwk-help"><summary>登记说明</summary><p>文明是世界内部的独立档案，不会建立新世界、发放收益或调用AI。跨地域文明无需指定唯一地域；其他档案可分别选择文明归属。</p></details>${btn('taishi-civilization-save','保存文明档案','wjwk-primary')}</form>`);
 }
};}
export function taishiFieldControl(power,record,field,esc,chat=[]){
 const kinds={world_id:'world',region_id:'region',organization_id:'organization',civilization_id:'inhabitants'};
 const kind=kinds[field.id];
 if(!kind)return `<label>${esc(field.label)}<textarea name="specific:${esc(field.id)}" maxlength="4000" rows="2">${esc(field.value)}</textarea></label>`;
 const world=worldForRecord(power,record,chat);
 const rows=Object.values(power.archives||{}).filter(r=>r.id!==record.id&&r.status!=='ended'&&archiveCurrent(r,chat)&&r.specific?.recordId===kind&&(field.id!=='civilization_id'||isCivilizationRecord(r))&&(!world||kind==='world'||worldForRecord(power,r,chat)?.id===world.id));
 const missing=field.value&&!rows.some(r=>r.id===field.value);
 return `<label>${esc(field.label.replace('档案ID',''))}<select name="specific:${esc(field.id)}"><option value="">未指定</option>${missing?`<option value="${esc(field.value)}" selected>原关联（需核对）</option>`:''}${rows.map(r=>`<option value="${esc(r.id)}" ${r.id===field.value?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label>`;
}
