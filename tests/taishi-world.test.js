import test from 'node:test';
import assert from 'node:assert/strict';
import {worldForRecord,worldBriefData,worldLinksHTML} from '../src/taishi-world.js';
import {taishiBrief} from '../src/taishi-brief.js';
import {preparePersonSources,attachPersonSources} from '../src/taishi-profile.js';
import {clone} from '../src/core.js';
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const record=(id,name,kind,fields={})=>({id,name,type:kind==='world'?'environment':'record',status:'active',source:{type:'manual'},specific:{recordId:kind,fields,labels:{}}});
test('stable world IDs survive rename, legacy exact names resolve only unambiguously',()=>{
 const a=record('a','新世界','world'),b=record('b','另一个','world');a.history=[{name:'旧世界'}];
 const p={archives:{a,b}},person=record('person','人物','companion',{world:'旧世界'});
 assert.equal(worldForRecord(p,person).id,'a');person.specific.fields.world_id='b';assert.equal(worldForRecord(p,person).id,'b');
 person.specific.fields.world_id='missing';assert.equal(worldForRecord(p,person),null);delete person.specific.fields.world_id;
 b.name='旧世界';assert.equal(worldForRecord(p,person),null);b.status='ended';assert.equal(worldForRecord(p,person).id,'a');
 a.status='ended';assert.equal(worldForRecord(p,person),null);
});
test('world associations are read-only and contain only current existing records',()=>{
 const a=record('a','世界<script>','world'),org=record('org','组织<img>','organization',{world_id:'a'}),event=record('event','事件','event',{world_id:'a'}),foreign=record('other','其他人物','companion',{world_id:'not-a'});
 const p={archives:{a,org,event,foreign}},before=clone(p),data=worldBriefData(p,'a');
 assert.deepEqual(data.groups.map(g=>g.id),['organization','event']);const html=worldLinksHTML(p,a,[],esc);
 assert(html.includes('组织&lt;img&gt;'));assert(!html.includes('其他人物'));assert.deepEqual(p,before);
});
test('daily ability title is escaped; empty sections stay absent',()=>{
 const r=record('a','日常世界','world',{ability_title:'技艺<script>',crafts:'烹饪与木工'});
 const html=taishiBrief(r,Object.entries(r.specific.fields).map(([id,value])=>({id,value,label:id})),esc);
 assert(html.includes('技艺&lt;script&gt;'));assert(!html.includes('<script>'));assert(!html.includes('战斗与力量体系'));assert(html.includes('烹饪与木工'));
});
test('world source fragments are copied exactly and reject unselected references',()=>{
 const input={payload:{books:[{name:'所选书',entries:[{id:'1',part:1,content:'原始世界设定完整细节。'}]}]}};
 const prepared=preparePersonSources({changes:[{recordId:'world',settingRefs:[{book:'所选书',id:'1'}]}]},input);
 const batch={changes:[{inputIndex:0,name:'世界',specific:{fields:{},labels:{}}}],issues:[]};attachPersonSources(batch,prepared);
 assert.equal(JSON.parse(batch.changes[0].specific.fields.source_profile)[0].content,input.payload.books[0].entries[0].content);
 const bad=preparePersonSources({changes:[{recordId:'world',settingRefs:[{book:'其他书',id:'1'}]}]},input);assert(bad.errors.has(0));
});
