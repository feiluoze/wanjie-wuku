import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const page=await browser.newPage(),errors=[];let externalRequests=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();externalRequests++;return r.abort();});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);await page.locator('[data-action="toggle"]').click();
 const ids=await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance;await a.openTaishi();const {saveArchive,archiveSource}=await import('/src/archives.js'),{creationConfig}=await import('/src/creation-config.js');let ids={};
  await a.store.transact(s=>{const p=s.powers[a.powerId],c=creationConfig(p);const add=(name,kind,fields)=>{const d=c.records.find(r=>r.id===kind);return saveArchive(p,{name,type:kind==='world'?'environment':'record',status:'active',fields:kind==='world'?{conditions:'当前概况'}:{description:'已有档案'},specific:{adapterId:c.id,version:c.version,recordId:kind,label:d.label,labels:Object.fromEntries(d.fields.map(f=>[f.id,f.label])),fields}},archiveSource([],'模拟宿主确认'));};
   ids.w=add('海蓝界','world',{overview:'群岛文明',era:'议会时代'}).id;ids.other=add('白塔界','world',{overview:'高原文明'}).id;
   ids.person=add('云岚<script>','companion',{world_id:ids.w,world:'海蓝界',profile:'沉稳的灵植师',progress:'正在主持灵田建设',core_memory:'救助村民的经历'}).id;
   ids.foreign=add('异界人物','companion',{world_id:ids.other,world:'白塔界',profile:'白塔学者'}).id;
   ids.event=add('群岛议会成立','event',{world_id:ids.w,world:'海蓝界',overview:'各岛达成共同议约',result:'建立群岛议会'}).id;
   ids.project=add('灵田灌溉阵','development',{world_id:ids.w,world:'海蓝界',goal:'灵田供水',progress:'主体已完成'}).id;
  });a.ui.setTaishiLayout({mode:'single',worldId:ids.w});a.selectTaishiSection('companions');return ids;
 });
 const before=await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read()));const checks=[];
 for(const width of [1440,390,320])for(const theme of ['dark','light','parchment']){
  await page.setViewportSize({width,height:1000});await page.evaluate(theme=>{const a=wanjie_wuku_general_instance;a.settings.theme=theme;a.ui.taishiRecordView='table';a.selectTaishiSection('companions');},theme);
  const row=page.locator(`[data-taishi-record="${ids.person}"]`);await row.waitFor();assert.equal(await page.locator(`[data-taishi-record="${ids.foreign}"]`).count(),0);assert((await row.textContent()).includes('云岚<script>'));assert.equal(await row.locator('script').count(),0);
  assert.equal(await page.locator('.wjwk-taishi-table').count(),1);assert((await page.locator('.wjwk-taishi-table caption').boundingBox()).height<80,'caption must remain readable horizontally');await row.locator('[data-action="open-archive"]').click();await page.locator('.wjwk-modal').waitFor();assert((await page.locator('.wjwk-modal').textContent()).includes('核心记忆'));await page.keyboard.press('Escape');
  await page.locator('[data-action="taishi-record-view"][data-view="cards"]').click();assert.equal(await page.locator('.wjwk-taishi-table').count(),0);assert.equal(await page.locator(`[data-taishi-record="${ids.person}"]`).count(),1);
  await page.locator('[data-action="taishi-record-view"][data-view="table"]').click();
  await page.evaluate(()=>wanjie_wuku_general_instance.selectTaishiSection('development'));assert.equal(await page.locator(`[data-taishi-record="${ids.event}"]`).count(),1);assert.equal(await page.locator(`[data-taishi-record="${ids.project}"]`).count(),1);
  const size=await page.locator('.wjwk-main').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));assert(size.scroll<=size.width+2,JSON.stringify({width,theme,size}));
  if(theme==='dark')await page.locator('.wjwk-taishi-table').screenshot({path:resolve(out,`table-${width}.png`)});checks.push({width,theme,scopedTables:true,details:true,toggle:true,historyVisible:true,noOverflow:true});
 }
 assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())),before);assert.deepEqual(errors,[]);assert.equal(externalRequests,0);
 const report={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.close();}
