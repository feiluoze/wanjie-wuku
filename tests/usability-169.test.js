import test from 'node:test';
import assert from 'node:assert/strict';
import {AIActivity} from '../src/ai-activity.js';
import {selectArchiveInput} from '../src/archive-input.js';
import {createPower} from '../src/core.js';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {archivePrompt} from '../src/archive-review.js';
import {WorkbenchUI} from '../src/ui.js';

test('large archive details prioritize main status and directly named records before linked older records',()=>{
 const row=(id,name,description,specific)=>({id,name,type:'record',status:'active',fields:{description},history:[],specific});
 const linked=row('world','旧世界','世'.repeat(1200),{adapterId:'sample',recordId:'world',fields:{}});
 const fillers=Array.from({length:8},(_,i)=>row('cold'+i,'旧对象'+i,'字'.repeat(3500)));
 const direct=row('current','本轮对象','详'.repeat(600),{adapterId:'sample',recordId:'region',fields:{world_id:'world'}});
 const main=row('main','玩家概览','状'.repeat(600),{adapterId:'sample',recordId:'statusbar_main',fields:{}});
 const records=[linked,...fillers,direct,main],old=JSON.stringify(records),chosen=selectArchiveInput(records,'本轮对象',{compact:true,detailBudget:2000});
 assert.equal(chosen.length,records.length);assert.equal(chosen.find(r=>r.id==='main').identityOnly,undefined);assert.equal(chosen.find(r=>r.id==='current').identityOnly,undefined);assert.equal(chosen.find(r=>r.id==='world').identityOnly,true);
 assert.equal(chosen.find(r=>r.id==='cold0').name,'旧对象0');assert.equal(JSON.stringify(records),old);
});
test('reading metadata reflects actual provided sources without changing the model payload',()=>{
 const p=createPower(builtinEntries().find(e=>e.name==='人间游戏'));
 const chat=[{is_user:false,mes:'参考前文'},{is_user:true,mes:'用户输入'},{is_user:false,mes:'玩家已经掌握冲锋'}],sources=[{index:2,content:chat[2].mes}];
 const prompt=archivePrompt(p,sources,chat,'',{automatic:true}),body=JSON.parse(prompt.user);
 assert.deepEqual(prompt.reading.floors,[3]);assert.deepEqual(prompt.reading.contextFloors,[1]);assert.equal(prompt.reading.sourceCharacters,chat[2].mes.length);assert.equal(prompt.reading.contextCharacters,4);assert.equal(body.reading,undefined);assert.equal(body.sources[0].floor,3);
});
test('request usage includes all sent attempts and resets between independent activities',async()=>{
 const seen=[],a=new AIActivity(s=>seen.push(s));
 await a.run('首次整理',async()=>{a.reading({floors:[2]});a.budget({total:100});a.budget({total:150});});
 assert.deepEqual(seen.at(-1).usage,{requests:2,inputCharacters:250});assert.deepEqual(seen.at(-1).reading.floors,[2]);
 await a.run('下一次整理',async()=>{a.budget({system:10,user:20});});assert.deepEqual(seen.at(-1).usage,{requests:1,inputCharacters:30});assert.equal(seen.at(-1).reading,undefined);
});
test('update and undo previews explicitly include preserved and restored fields',()=>{
 const ui=Object.create(WorkbenchUI.prototype),before={id:'x',name:'设施',type:'facility',status:'active',fields:{purpose:'保留的功能',condition:'运转正常'}};
 const html=ui.archiveDiff({before,type:'facility',status:'active',patch:{condition:'扩建完成'}});assert.match(html,/保存后完整内容/);assert.match(html,/保留的功能/);assert.match(html,/扩建完成/);
 let undo='';ui.dialog=(_title,body)=>undo=body;ui.showArchiveUndo({label:'整理',at:1,entries:[{kind:'archives',id:'x',before}]},{name:'词条',archives:{x:{...before,fields:{condition:'扩建完成'}}}});assert.match(undo,/撤销后恢复的内容/);assert.match(undo,/运转正常/);assert.match(undo,/保留的功能/);
});
