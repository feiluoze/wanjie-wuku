import test from 'node:test';
import assert from 'node:assert/strict';
import {taishiCivilizationOutlines} from '../src/taishi-view.js';
import {taishiUIMethods} from '../src/taishi-ui.js';
import {clone} from '../src/core.js';
const world={id:'w1',name:'林海界',type:'environment',status:'active',fields:{conditions:'成熟世界'},source:{type:'manual',note:'玩家采用设定'},specific:{recordId:'world',fields:{era:'城邦时代',factions:'林地议会',resources:'木材'},labels:{era:'时代与社会',factions:'主要势力',resources:'物产'}}};
test('world facts populate civilization outline without inventing independent archives or mutating state',()=>{
 const power={archives:{w1:world}},before=clone(power),rows=taishiCivilizationOutlines(power,[]);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'w1');assert.equal(rows[0].rows[1].value,'林地议会');assert.deepEqual(power,before);
 assert.deepEqual(taishiCivilizationOutlines({archives:{w1:{...world,status:'ended'}}},[]),[]);
});
test('civilization page and overview expose world outlines, but report independent counts separately',()=>{
 const methods=taishiUIMethods({esc:v=>String(v??''),btn:(action,label)=>`<button data-action="${action}">${label}</button>`,empty:s=>s});
 const ui={...methods,taishiSection:'civilizations',savedStatStrip:()=>'<p>独立档案 0</p>',archiveUpdatePanel:()=>'',memoryStatusPanel:()=>'',creationPanel:()=>'',automaticArchiveControls:()=>''};
 const html=ui.taishiStatistics({id:'taishi',active:true,archives:{w1:world}},false,'custom',[]);
 assert(html.includes('data-world-outline="w1"'));assert(html.includes('林地议会'));assert(html.includes('独立文明档案'));assert(!html.includes('暂无当前记录'));
 assert(html.includes('<details class="wjwk-support-panel">'));ui.taishiSection=null;
 assert(ui.taishiStatistics({id:'taishi',active:true,archives:{w1:world}},false,'custom',[]).includes('1 个世界轮廓'));
});
