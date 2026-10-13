import test from 'node:test';
import assert from 'node:assert/strict';
import {taishiBrief} from '../src/taishi-brief.js';
import {requestTimeoutSeconds} from '../src/preferences.js';
import {ModelConnection} from '../src/model.js';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
test('brief preserves unknown facts, groups saved facts, and escapes all model text',()=>{
 const rows=[{id:'overview',label:'概况',value:'OVERVIEW'},{id:'era',label:'社会',value:'ERA'},{id:'events',label:'局势',value:'<img src=x onerror=alert(1)>'},{id:'future_field',label:'未来字段',value:'PRESERVED'}];
 const html=taishiBrief({name:'<script>',specific:{recordId:'world'}},rows,esc);
 for(const token of ['OVERVIEW','ERA','PRESERVED'])assert.equal(html.split(token).length-1,1);
 assert(html.includes('补充档案'));assert(html.includes('时代概况'));assert(html.includes('&lt;img'));assert(!html.includes('<script>'));
 assert.equal(taishiBrief({specific:{recordId:'available'}},rows,esc),null);
});
test('worldbook setup gets ten minutes even for saved 120 second profiles; ordinary tasks unchanged',()=>{
 assert.equal(requestTimeoutSeconds({timeoutSeconds:120},'setup'),600);
 assert.equal(requestTimeoutSeconds({timeoutSeconds:90},'archive'),90);
 assert.equal(requestTimeoutSeconds({},'setup'),600);
 assert.equal(requestTimeoutSeconds({timeoutSeconds:99999},'archive'),300);
});
test('both transports actually arm the setup timer for 600 seconds',async()=>{
 const original=globalThis.setTimeout, seen=[];
 globalThis.setTimeout=(fn,ms)=>{seen.push(ms);return original(fn,ms);};
 try {
  for(const mode of ['custom','st']){
   const settings={mode,timeoutSeconds:120,model:'fake',baseUrl:'https://fake.invalid/v1'};
   const model=new ModelConnection({context:()=>({generateRaw:async()=>'{}'}),settings:()=>settings,getKey:()=>'',fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{}'}}]})})});
   assert.equal(await model.request({system:'test',user:'test'},{connection:{task:'setup',settings,apiKey:''}}),'{}');
  }
  assert.deepEqual(seen,[600000,600000]);
 } finally {globalThis.setTimeout=original;}
});
