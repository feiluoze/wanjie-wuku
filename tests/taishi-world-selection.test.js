import test from 'node:test';
import assert from 'node:assert/strict';
import {taishiUIMethods} from '../src/taishi-ui.js';
import {evolutionWorld} from '../src/taishi-evolution.js';
import {clone} from '../src/core.js';

test('development lists the same world identities despite legacy generic type',()=>{
 const archives=Object.fromEntries(['environment','record','facility','population'].map((type,i)=>['world'+i,{id:'world'+i,name:'世界'+i,type,status:'active',specific:{recordId:'world'}}]));
 archives.ended={id:'ended',name:'结束世界',type:'environment',status:'ended',specific:{recordId:'world'}};
 archives.person={id:'person',name:'普通人物',type:'member',status:'active',specific:{recordId:'companion'}};
 const power={archives,taishiAutonomy:true},before=clone(power);let html;
 const methods=taishiUIMethods({esc:String,btn:()=>'',empty:s=>s});
 methods.showTaishiDevelopment.call({dialog:(_,body)=>html=body},power,'st');
 for(let i=0;i<4;i++){
  assert(html.includes(`value="world${i}"`));
  assert.equal(evolutionWorld(power,{worldId:'world'+i,elapsed:1,unit:'years'}),archives['world'+i]);
 }
 assert(!html.includes('先建立世界，再推进其发展。'));
 assert(!html.includes('value="ended"'));assert(!html.includes('value="person"'));
 for(const id of ['ended','person','missing'])assert.throws(()=>evolutionWorld(power,{worldId:id,elapsed:1,unit:'years'}),/请选择/);
 assert.deepEqual(power,before,'读取不修改旧类型或档案');
});
