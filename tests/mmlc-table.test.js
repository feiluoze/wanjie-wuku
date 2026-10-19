import test from 'node:test';
import assert from 'node:assert/strict';
import {createPower,emptyState,stable} from '../src/core.js';
import {MMLC_ENTRY,MMLC_MODULES} from '../src/mmlc.js';
import {MMLC_CONFIG} from '../src/mmlc-config.js';
import {saveArchive,archiveSource} from '../src/archives.js';
import {mmlcTablePage,mmlcTableHTML} from '../src/mmlc-table.js';
import {WorkbenchUI} from '../src/ui.js';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const btn=(action,label,cls='',disabled=false,attrs='')=>`<button data-action="${action}" class="${cls}" ${disabled?'disabled':''} ${attrs}>${label}</button>`;
const options={esc,btn,canAI:true};
function add(p,name,module,fields,status='active'){
 const d=MMLC_CONFIG.records.find(r=>r.id===module);
 return saveArchive(p,{name,type:'record',module,status,fields:{description:'已经确认的'+name},specific:{adapterId:MMLC_CONFIG.id,version:MMLC_CONFIG.version,recordId:module,label:d.label,labels:Object.fromEntries(d.fields.map(f=>[f.id,f.label])),fields}},archiveSource([],'玩家已确认'));
}
test('table consumes the existing eight modules and their real fields without adding a storage model',()=>{
 const p=createPower(MMLC_ENTRY);
 for(const d of MMLC_CONFIG.records)add(p,d.label+'对象',d.id,{[d.fields[0].id]:'已确认的实际情况'});
 const before=stable(p);assert.equal(MMLC_CONFIG.records.length,8);assert.equal(mmlcTablePage(p,[]).matched,8);
 for(const m of MMLC_MODULES){const page=mmlcTablePage(p,[],m.id);assert.equal(page.matched,1);assert.equal(page.columns.length,3);assert(page.columns.every(f=>MMLC_CONFIG.records.find(d=>d.id===m.id).fields.some(x=>x.id===f.id)));assert.equal(page.rows[0].record.module,m.id);}
 assert.equal(stable(p),before);assert.deepEqual(p.resources,{});assert.deepEqual(p.assets,{});
});
test('planned, working, active and ended remain distinct; quantities and incomplete research are never inferred',()=>{
 const p=createPower(MMLC_ENTRY);add(p,'研究甲','projects',{discovery:'已验证温控规律',usable:'只有图纸',needs:'尚需真实试制'},'working');add(p,'研究乙','projects',{goal:'希望建造实物'},'planned');add(p,'阵眼','items',{quantity:'两件',condition:'仅一件完好'});add(p,'旧工程','projects',{outcome:'明确终止'},'ended');
 const before=stable(p),all=mmlcTablePage(p,[]);assert.deepEqual(all.counts,{active:1,planned:1,working:1,ended:1});assert.equal(mmlcTablePage(p,[],'projects',{status:'active'}).matched,0);assert.equal(mmlcTablePage(p,[],'projects',{status:'working'}).rows[0].record.name,'研究甲');
 const html=mmlcTableHTML(p,[],'items',{},options);assert(html.includes('两件'));assert(!html.includes('quantity:2'));assert.equal(stable(p),before);
});
test('query searches omitted detail columns and paging clamps to existing rows without changing any record',()=>{
 const p=createPower(MMLC_ENTRY);for(let i=0;i<45;i++)add(p,'法器'+String(i).padStart(2,'0'),'items',{quantity:'一件',effect:'已取得',location:i===39?'北岭特殊仓库':'原处'});
 const before=stable(p),page=mmlcTablePage(p,[],'items',{page:1});assert.equal(page.rows.length,20);assert.equal(page.pages,3);assert.equal(mmlcTablePage(p,[],'items',{page:999}).rows.length,5);assert.equal(mmlcTablePage(p,[],'items',{page:-5}).page,0);assert.equal(mmlcTablePage(p,[],'items',{query:'北岭特殊仓库',page:2}).page,0);assert.equal(mmlcTablePage(p,[],'items',{query:'北岭特殊仓库'}).rows[0].record.name,'法器39');assert.equal(mmlcTablePage(p,[],'items',{query:'不存在'}).matched,0);assert.equal(stable(p),before);
});
test('table escapes names, facts and query values; it exposes semantic headers and existing detail actions',()=>{
 const p=createPower(MMLC_ENTRY),r=add(p,'<img src=x>研究','projects',{discovery:'<script>bad()</script>',usable:'已经确认的方法'});
 const html=mmlcTableHTML(p,[],'projects',{query:'"><svg onload=bad>'},options);assert(!html.includes('<svg'));assert(html.includes('&quot;&gt;&lt;svg'));
 const populated=mmlcTableHTML(p,[],'projects',{},options);assert(!populated.includes('<img'));assert(!populated.includes('<script>'));assert(populated.includes('scope="col"'));assert(populated.includes('scope="row"'));assert(populated.includes(`data-id="${r.id}"`));assert(populated.includes('data-action="mmlc-continue"'));assert(populated.includes('详情与修正'));
});
test('legacy rows retain their actual generic fields instead of being mislabelled as cultivation numbers',()=>{
 const p=createPower(MMLC_ENTRY),r=saveArchive(p,{type:'skill',name:'旧修行记录',module:'body',status:'active',fields:{effect:'神魂稳定，境界未明确'}},archiveSource([],'旧档案'));
 const html=mmlcTableHTML(p,[],'body',{},options);assert(html.includes('旧档原始内容'));assert(html.includes('神魂稳定，境界未明确'));assert(html.includes('colspan="3"'));assert.equal(mmlcTablePage(p,[],'body').rows[0].record.id,r.id);
});
test('table links follow only existing explicit relations and ended rows cannot request continuation or memory',()=>{
 const p=createPower(MMLC_ENTRY),method=add(p,'空间定位','arts',{principle:'已验证定位'}),project=add(p,'阵法研究','projects',{usable:'定位图纸',links:method.name},'ended');
 assert.equal(mmlcTablePage(p,[],'projects').rows[0].linked[0].id,method.id);const html=mmlcTableHTML(p,[],'projects',{},options);assert(html.includes('关联成果 · 1'));assert.match(html,new RegExp(`data-action="mmlc-continue"[^>]*data-id="${project.id}"[^>]*disabled`));assert.match(html,new RegExp(`data-action="open-memory"[^>]*data-id="${project.id}"[^>]*disabled`));
});
test('workbench defaults to tables, preserves brief fallback and resets table filters on another chat',()=>{
 const p=createPower(MMLC_ENTRY),s=emptyState();s.powers[p.id]=p;add(p,'本体','body',{realm:'筑基'});const before=stable(s),ui=Object.create(WorkbenchUI.prototype);ui.view={state:s,chatKey:'甲'};
 let html=ui.management(s,p,false,'off',null,[]);assert(html.includes('class="wjwk-mmlc-table"'));assert(html.includes('data-mode="table" aria-pressed="true"'));ui.mmlcTableFilter={query:'本体',status:'active',page:2};ui.management(s,p,false,'off',null,[]);assert.equal(ui.mmlcTableFilter.query,'本体');ui.view.chatKey='乙';ui.management(s,p,false,'off',null,[]);assert.equal(ui.mmlcTableFilter.query,'');ui.mmlcView='brief';html=ui.management(s,p,false,'off',null,[]);assert(html.includes('data-mmlc-brief="cultivation"'));assert(!html.includes('class="wjwk-mmlc-table"'));assert.equal(stable(s),before);
});
