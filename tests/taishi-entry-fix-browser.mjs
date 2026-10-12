// Production extension in a controlled mock host. No external model requests.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),path);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];let externalRequests=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();externalRequests++;return r.abort();});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);


 await page.evaluate(async()=>{const a=wanjie_wuku_general_instance;await a.openTaishi();a.ui.setOpen(true);});
 assert(await page.locator('[data-taishi-auto-update] [data-action="player-auto-save"]').isVisible());
 assert.equal(await page.locator('[data-action="player-auto-save"]').count(),1);
 await page.setViewportSize({width:390,height:900});
 assert(await page.locator('[data-taishi-auto-update] [data-action="player-auto-save"]').isVisible());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/taishi-auto-entry-390.png'});
 await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance,{saveArchive}=await import('/src/archives.js');
  await a.store.transact(s=>{const p=s.powers[a.powerId];p.taishiAutonomy=true;saveArchive(p,{name:'旧类型世界',type:'record',status:'active',fields:{description:'已确认世界'},specific:{adapterId:'wuku.primordial_world',recordId:'world',version:'1.2.0',label:'世界',fields:{stage:'成熟'},labels:{stage:'阶段'}}},{type:'manual',note:'测试'});});
  a.openTaishiDevelopment();
 });
 assert.equal(await page.locator('[data-taishi-evolve] select[name="worldId"] option').count(),1);
 assert.equal(await page.locator('[data-taishi-evolve] select[name="worldId"] option').innerText(),'旧类型世界');
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(externalRequests,0);
 console.log('Focused browser passed: visible default auto-update entry on desktop/mobile; legacy-type world selectable; no external requests.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
