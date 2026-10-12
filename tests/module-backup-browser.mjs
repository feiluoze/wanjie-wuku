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


 await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance,{createPower}=await import('/src/core.js'),{MMLC_ENTRY}=await import('/src/mmlc.js');
  const {builtinEntries}=await import('/src/builtin-worldbook.js');await a.openTaishi();await a.store.transact(s=>{s.powers[MMLC_ENTRY.id]=createPower(MMLC_ENTRY);const p=createPower(builtinEntries().find(e=>e.name==='深蓝'));s.powers[p.id]=p;});a.ui.setOpen(true);a.refresh();
 });
 for(const module of ['wuku','mmlc','taishi']){
  await page.evaluate(module=>{const a=wanjie_wuku_general_instance;a.ui.space=module;a.refresh();},module);
  const download=page.waitForEvent('download');await page.evaluate(()=>wanjie_wuku_general_instance.action('export',{}));
  const file=await download,path=await file.path(),pack=JSON.parse(await readFile(path,'utf8'));
  assert.equal(pack.format,'wjwk-module-backup');assert.equal(pack.module,module);assert.equal(Object.keys(pack.state.powers).length,1);
  assert(!pack.state.roleLink);assert.equal(pack.state.roleWrites.length,0);
  await page.evaluate(async pack=>{
   const a=wanjie_wuku_general_instance,before=a.store.read();globalThis.others=Object.fromEntries(Object.entries(before.powers).filter(([id])=>!pack.state.powers[id]));
   pack.state.powers[Object.keys(pack.state.powers)[0]].name='恢复后的独立模块';
   await a.action('import-backup',{file:new File([JSON.stringify(pack)],'module.json',{type:'application/json'})});
  },pack);
  assert((await page.locator('[data-action="confirm-restore"]').innerText()).startsWith('只恢复'));
  await page.locator('[data-action="confirm-restore"]').click();
  assert(await page.evaluate(()=>{const a=wanjie_wuku_general_instance,s=a.store.read();return Object.entries(others).every(([id,p])=>JSON.stringify(p)===JSON.stringify(s.powers[id]))&&Object.keys(s.powers).length===3;}));
 }
 const download=page.waitForEvent('download');await page.evaluate(()=>wanjie_wuku_general_instance.action('export-all',{}));
 const file=await download,all=JSON.parse(await readFile(await file.path(),'utf8'));assert.equal(all.format,'wjwk-backup');assert.equal(Object.keys(all.state.powers).length,3);
 await page.setViewportSize({width:390,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/independent-module-backup-390.png'});
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(externalRequests,0);
 console.log('Module backup browser passed: all three real export/import actions isolate modules, preserve other modules; separate complete backup; mobile layout; no external requests.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
