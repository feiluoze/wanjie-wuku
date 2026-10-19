import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,relative,isAbsolute,extname} from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright'),out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const errors=[],checks=[];let externalRequests=0;
 for(const width of [1440,390,320])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async theme=>{const a=wanjie_wuku_general_instance,{createPower,chatHashes}=await import('/src/core.js'),{builtinEntries}=await import('/src/builtin-worldbook.js');const powers=['绝对生产力','先祖投资人'].map(name=>createPower(builtinEntries().find(e=>e.name===name)));SillyTavern.getContext().chat=[];await a.store.transact(s=>{s.powers=Object.fromEntries(powers.map(p=>[p.id,p]));s.historyAnchor=chatHashes([]);s.syncCursor=0;});a.powerId=powers[0].id;a.settings.theme=theme;a.settings.mode='off';a.refresh();a.ui.setOpen(true);window.menuIds=powers.map(p=>p.id);window.beforeMenu=JSON.stringify(a.store.read());a.model.request=async()=>{throw Error('unexpected model request');};},theme);
  const menu=page.locator(width<=720?'.wjwk-mobile-power .wjwk-power-menu':'.wjwk-power-list .wjwk-power-menu'),trigger=menu.locator(':scope > summary');
  assert(await trigger.isVisible());await trigger.focus();await page.keyboard.press('Enter');await menu.locator('[data-action="delete-power"]').waitFor({state:'visible'});
  const box=await menu.locator('.wjwk-power-menu-list').boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=1001);
  await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('open'),null);assert(await trigger.evaluate(e=>e===document.activeElement));
  if(width<=720)await page.locator('[data-power-picker]').selectOption(await page.evaluate(()=>menuIds[1]));else await page.locator('[data-action="select-power"]').nth(1).click();
  assert.equal(await menu.getAttribute('data-power-id'),await page.evaluate(()=>menuIds[1]));await trigger.click();await menu.locator('[data-action="delete-power"]').click();
  assert.match(await page.locator('.wjwk-danger-dialog').innerText(),/先祖投资人/);assert(await page.locator('.wjwk-danger-dialog [data-action="export"]').isVisible());await page.getByRole('button',{name:'取消',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())===beforeMenu),true);
  await trigger.click();await page.locator('.wjwk-page-head h1').click();assert.equal(await menu.getAttribute('open'),null);
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.busy=true;a.refresh();});await trigger.click();assert(!(await menu.locator('[data-action="delete-power"]').isEnabled()));assert(!(await menu.locator('[data-action="toggle-power"]').isEnabled()));await page.keyboard.press('Escape');
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.busy=false;a.refresh();});await trigger.click();await page.screenshot({path:resolve(out,`menu-${width}-${theme}.png`)});
  assert.equal(await page.locator('.wjwk-window').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);checks.push({width,theme,keyboard:true,cancelPreservesData:true,correctPower:true,busyProtected:true,menuInsideViewport:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const report={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.close();}
