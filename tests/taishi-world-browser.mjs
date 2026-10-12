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
  const a=wanjie_wuku_general_instance,{saveArchive}=await import('/src/archives.js');await a.openTaishi();a.ui.setOpen(true);
  await a.store.transact(s=>{const p=s.powers[a.powerId];const world=saveArchive(p,{name:'日常世界',type:'record',status:'active',fields:{description:'已经建立'},specific:{adapterId:'wuku.primordial_world',recordId:'world',version:'1.2.0',label:'世界',fields:{overview:'生活与手艺的世界',geography:'河谷村落',crafts:'木工、烹饪',ability_title:'生活技艺'},labels:{overview:'世界概况',geography:'区域与地理',crafts:'能力与技艺',ability_title:'分区名称'}}},{type:'manual',note:'玩家确认'});
   saveArchive(p,{name:'河谷木工会',type:'record',status:'active',fields:{description:'现存组织'},specific:{adapterId:'wuku.primordial_world',recordId:'organization',version:'1.2.0',label:'组织',fields:{world_id:world.id,world:world.name,overview:'传授手艺'},labels:{world_id:'世界ID',world:'所属世界',overview:'概况'}}},{type:'manual',note:'玩家确认'});
  });a.refresh();
 });
 assert(await page.locator('[data-action="taishi-world-report"]').first().isVisible());
 await page.locator('[data-action="taishi-world-report"]').first().click();
 assert(await page.locator('[data-world-report]').isVisible());assert((await page.locator('[data-world-report]').innerText()).includes('生活技艺'));
 await page.locator('[data-world-links] summary').click();assert(await page.locator('[data-world-links] [data-action="open-archive"]').isVisible());
 await page.locator('[data-world-links] [data-action="open-archive"]').click();assert((await page.locator('[data-world-links]').locator('..').innerText()).includes('河谷木工会'));
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.ui.closeDialog();a.refresh();a.ui.showTaishiWorldReport(Object.values(a.store.read().powers[a.powerId].archives).find(r=>r.specific.recordId==='world').id);});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/world-report-'+width+'.png'});
 }
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(externalRequests,0);
 console.log('World report browser passed: homepage report, daily craft heading, existing organization link, desktop/390/320 layout, no external requests.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
