import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{
  const path=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),path);
  if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');
  res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(path)]||'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});
  const page=await browser.newPage({viewport:{width:1400,height:980}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);
  await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
  // The demo replaces its catalog with synthetic samples; restore the shipped catalog.
  await page.evaluate(async()=>{const {builtinEntries}=await import('/src/builtin-worldbook.js');const app=globalThis.wanjie_wuku_general_instance;app.settings.catalog=builtinEntries();app.settings.mode='off';});
  await page.locator('[data-action="toggle"]').click();await page.locator('[data-action="manage"]').first().click();
  assert.equal(await page.locator('[data-primary] option').count(),123);
  assert.equal(await page.locator('[data-primary] option').filter({hasText:/^升变之印/}).count(),1);
  for(const name of ['旅法师','一言为定','进化之炎'])assert.equal(await page.locator('[data-primary] option').filter({hasText:new RegExp('^'+name)}).count(),1);
  assert.equal(await page.locator('[data-primary] option').filter({hasText:/太始天/}).count(),0);
  const productionId=await page.locator('[data-primary] option').filter({hasText:/^绝对生产力/}).getAttribute('value');
  await page.locator('[data-primary]').selectOption(productionId);
  await page.locator('[data-action="register"]').click();
  await page.getByRole('heading',{name:'绝对生产力',exact:true}).waitFor();
  assert.equal(await page.locator('[data-dashboard-section]').count(),3);
  const state=await page.evaluate(()=>{const app=globalThis.wanjie_wuku_general_instance,p=app.store.read().powers[app.powerId];return {name:p.name,archives:Object.keys(p.archives||{}).length,resources:Object.keys(p.resources).length};});
  assert.deepEqual(state,{name:'绝对生产力',archives:0,resources:0});
  await page.screenshot({path:out+'/builtin-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:out+'/builtin-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
  const dedicated=await page.evaluate(async()=>{const a=wanjie_wuku_general_instance;await a.openTaishi();const p=a.store.read().powers[a.powerId],{builtinTaishiEntry,builtinEntries}=await import('/src/builtin-worldbook.js'),{creationConfig}=await import('/src/creation-config.js');return {name:p.name,latest:p.primaryRules===builtinTaishiEntry().content,descent:creationConfig(p).records.find(r=>r.id==='world').fields.some(f=>f.id==='descent'),generalHasTaishi:builtinEntries().some(e=>e.name.startsWith('太始天'))};});
  assert(dedicated.name.includes('完整版'));assert(dedicated.latest&&dedicated.descent&&!dedicated.generalHasTaishi);await page.screenshot({path:out+'/taishi-dedicated-mobile.png',fullPage:true});
  console.log('PASS: latest 123 general rules selectable, one seal version, new production dashboard with three modules, no mandatory resource form, desktop/mobile no overflow; no model calls. Mock host only.');
}finally{await browser?.close();server.close();}
