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

 await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance,h=await import('/src/host.js');
  const settings=model=>({...h.DEFAULT_SETTINGS,mode:'custom',baseUrl:'https://fixture.test/v1',model});
  globalThis.primary=h.saveConnectionProfile({name:'日常主连接',settings:settings('primary'),apiKey:'mock-primary'});
  globalThis.backup=h.saveConnectionProfile({name:'备用连接',settings:settings('backup'),apiKey:'mock-backup'});
  a.settings=h.getSettings();a.ui.setOpen(true);a.ui.showSettings(a.settings,{profiles:h.getConnectionProfiles()});
 });
 await page.locator('[data-task-routing] > summary').click();
 await page.locator('[name="route:archive"]').selectOption(await page.evaluate(()=>primary));
 const detail=page.locator('[name="fallback1:archive"]').locator('xpath=ancestor::details[1]');await detail.locator('summary').click();
 await page.locator('[name="fallback1:archive"]').selectOption(await page.evaluate(()=>backup));
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:out+`/fallback-settings-${width}.png`});
 }
 await page.getByRole('button',{name:'保存主连接与备用',exact:true}).click();
 assert.deepEqual(await page.evaluate(async()=>{const h=await import('/src/host.js');return h.resolveTaskConnectionPlan('archive').map(c=>c.settings.model);}),['primary','backup']);
 await page.reload();await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
 assert.deepEqual(await page.evaluate(async()=>{const h=await import('/src/host.js');return h.resolveTaskConnectionPlan('archive').map(c=>c.settings.model);}),['primary','backup']);
 const result=await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance,{transportFailure}=await import('/src/api-fallback.js');
  a.ui.setOpen(true);const calls=[];
  a.model.request=async(_p,{connection})=>{calls.push(connection.settings.model);if(connection.settings.model==='primary')throw transportFailure('http','mock unavailable',503);return '{"message":"done"}';};
  const {AIActivity}=await import('/src/ai-activity.js');a.aiActivity=new AIActivity(s=>a.ui.setAIActivity(s));await a.aiActivity.run('备用演示',()=>a.query({system:'synthetic',user:'{}'},a.contextSnapshot(),{task:'archive'}));
  return {calls,visible:document.querySelector('[data-ai-connections]').textContent,notice:document.querySelector('[data-ai-message]').textContent};
 });
 assert.deepEqual(result.calls,['primary','backup']);assert.match(result.visible,/备用连接.*backup.*备用1/);
 assert(!result.visible.includes('mock-backup'));assert.equal(external,0);assert.deepEqual(errors,[]);
 await page.screenshot({path:out+'/fallback-result-320.png'});
 console.log('PASS: primary + ordered backup UI saves and reloads; actual backup label; desktop/mobile no overflow; no external requests');
}finally{await browser?.close();server.close();}
