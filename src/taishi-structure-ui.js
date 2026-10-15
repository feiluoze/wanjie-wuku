import {archiveCurrent} from './archives.js';
export function taishiStructureUI({esc,btn}){return {
 showTaishiStructure(power,chat=[]){
  const s=power.taishiWorldStructure,worlds=Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='world'&&r.status!=='ended'&&archiveCurrent(r,chat));
  this.dialog('导入世界书 · 先选建档结构',`<form data-taishi-structure><div class="wjwk-structure-options"><label><input type="radio" name="mode" value="single" required ${s?.mode==='single'?'checked':''}><strong>单世界</strong><span>一个主世界，内部划分大陆、板块与文明</span></label><label><input type="radio" name="mode" value="multi" required ${s?.mode==='multi'?'checked':''}><strong>多世界</strong><span>多个实际独立的世界，各自保留内部地域</span></label></div><label data-structure-world ${s?.mode==='single'?'':'hidden'}>主世界名称<input name="worldName" maxlength="200" list="wjwk-main-world-names" value="${esc(s?.worldName||worlds[0]?.name||'')}" ${s?.mode==='single'?'required':'disabled'} placeholder="填写实际主世界名称"><datalist id="wjwk-main-world-names">${worlds.map(w=>`<option value="${esc(w.name)}"></option>`).join('')}</datalist></label><details class="wjwk-help"><summary>已有档案与批次如何处理</summary><p>同名主世界会复用原档案；新名称仅登记主世界占位，不生成设定。改变建档结构会重新规划构建批次，已有档案保留，不自动合并旧世界。此选择约束AI建档，与首页的显示布局分别保存。</p></details>${btn('taishi-structure-save','继续选择世界书','wjwk-primary')}</form>`);
 }
};}
