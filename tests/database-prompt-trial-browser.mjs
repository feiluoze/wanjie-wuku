import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let external=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external++;return r.abort();});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);



 const result=await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance,{ModelConnection}=await import('/src/model.js'),{completeReview}=await import('/tests/review-response-fixture.js');
  await a.openTaishi();a.settings={...a.settings,mode:'custom',model:'wire-test',baseUrl:'https://example.test/v1'};let calls=0,wire;
  a.model=new ModelConnection({settings:()=>a.settings,getKey:()=>'',context:()=>SillyTavern.getContext(),fetchImpl:async(url,r)=>{
   calls++;wire=JSON.parse(r.body);const messages=wire.messages;
   const payload={...JSON.parse(messages[2].content),...JSON.parse(messages[6].content)};
   const response=completeReview({system:messages[4].content,user:JSON.stringify(payload)},{changes:[]});
   return {ok:true,status:200,json:async()=>({choices:[{message:{content:response},finish_reason:'stop'}]})};
  }});
  a.ui.setOpen(true);await a.reviewArchives({rescan:true});
  return {calls,roles:wire.messages.map(m=>m.role),trial:a.runtimeLog.list().flatMap(r=>r.steps).find(s=>s.phase==='数据库预设试验'),chars:wire.messages.reduce((n,m)=>n+m.content.length,0)};
 });
 assert.equal(result.calls,1);assert.deepEqual(result.roles,['system','assistant','user','assistant','user','assistant','user','user']);assert.equal(result.trial.messages,8);assert.equal(result.trial.presetId,'database-naiv1.2.9-original-strings-v1');assert(result.chars>0);assert.equal(external,0);assert.deepEqual(errors,[]);
 console.log('PASS browser archive review -> exact eight-message custom API -> validated preview; one mocked request; trial marker logged; zero external requests.');
}finally{await browser?.close();server.close();}
