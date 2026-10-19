import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,relative,isAbsolute,extname} from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright'),out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;

try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const errors=[],checks=[];let externalRequests=0;
 for(const width of [1440,390,320])for(const theme of ['dark','light']){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async theme=>{
   const a=wanjie_wuku_general_instance;await a.action('add-mmlc',{});a.ui.closeDialog();
   const {MMLC_CONFIG}=await import('/src/mmlc-config.js'),{MMLC_ID}=await import('/src/mmlc.js'),{saveArchive,archiveSource}=await import('/src/archives.js');
   await a.store.transact(s=>{const p=s.powers[MMLC_ID];for(const d of MMLC_CONFIG.records)for(let i=0;i<(d.id==='arts'?45:4);i++){const details=Object.fromEntries(d.fields.filter(f=>f.id!=='links').map(f=>[f.id,f.id==='quantity'?'两件':f.label+'已由正文确认；'+('保留实际条件和既有成果。'.repeat(i===0?20:1))]));if(d.id==='arts'&&i===27)details.limits='南岭独立约束';saveArchive(p,{type:'record',name:d.label+'对象'+i,module:d.id,status:['active','working','planned','ended'][i%4],fields:{description:'真实长期事实'},specific:{adapterId:MMLC_CONFIG.id,version:MMLC_CONFIG.version,recordId:d.id,label:d.label,labels:Object.fromEntries(d.fields.map(f=>[f.id,f.label])),fields:details}},archiveSource([],'固定模拟表格数据'));}});
   a.powerId=MMLC_ID;a.ui.mmlcView='table';a.ui.mmlcSection=null;a.settings.theme=theme;a.settings.mode='off';a.refresh();a.ui.setOpen(true);window.beforeTable=JSON.stringify(a.store.read());window.calls=0;a.model.request=async()=>{calls++;throw Error('表格浏览不应调用模型');};
  },theme);
  assert.equal(await page.locator('.wjwk-mmlc-table').count(),1);assert.equal(await page.locator('.wjwk-mmlc-table tbody tr').count(),20);
  const modules=await page.locator('[data-mmlc-table-module] option').evaluateAll(ns=>ns.map(n=>n.value).filter(Boolean));assert.equal(modules.length,8);
  for(const module of modules){
   await page.locator('[data-mmlc-table-module]').selectOption(module);assert.equal(await page.locator('.wjwk-mmlc-table thead th').count(),6);
   assert.equal(await page.locator('.wjwk-mmlc-table tbody tr').count(),module==='arts'?20:4);await page.locator('[data-mmlc-table-status]').selectOption('ended');assert.equal(await page.locator('.wjwk-mmlc-table tbody tr').count(),module==='arts'?11:1);assert.equal(await page.locator('.wjwk-mmlc-table [data-action="mmlc-continue"]:not(:disabled)').count(),0);
   await page.locator('[data-action="mmlc-table-reset"]').click();
   if(module==='arts'){
    await page.locator('[data-action="mmlc-table-page"][data-direction="1"]').click();assert.equal(await page.locator('.wjwk-mmlc-table tbody tr').count(),20);await page.locator('[data-action="mmlc-table-page"][data-direction="1"]').click();assert.equal(await page.locator('.wjwk-mmlc-table tbody tr').count(),5);
    await page.locator('[data-mmlc-table-query]').fill('南岭独立约束');assert.equal(await page.locator('.wjwk-mmlc-table tbody tr').count(),1);assert((await page.locator('.wjwk-mmlc-table tbody').textContent()).includes('对象27'));
    await page.evaluate(()=>wanjie_wuku_general_instance.refresh());assert.equal(await page.locator('[data-mmlc-table-query]').inputValue(),'南岭独立约束');assert.equal(await page.evaluate(()=>document.activeElement?.hasAttribute('data-mmlc-table-query')),true);
    await page.locator('[data-action="mmlc-table-reset"]').click();
   }
   const scroll=page.locator('.wjwk-mmlc-table-scroll');await scroll.scrollIntoViewIfNeeded();
   const bounds=await page.evaluate(()=>['.wjwk-window','.wjwk-main','.wjwk-content','.wjwk-design-content','.wjwk-design-primary','.wjwk-mmlc-table-panel'].map(selector=>{const e=document.querySelector(selector);return {selector,client:e.clientWidth,scroll:e.scrollWidth};}));for(const b of bounds)assert(b.client>0&&b.scroll<=b.client+2,JSON.stringify({width,theme,module,bounds}));
   if(width<=390){assert(await scroll.evaluate(e=>e.scrollWidth>e.clientWidth));await scroll.evaluate(e=>e.scrollLeft=200);assert(await scroll.evaluate(e=>e.scrollLeft>0));}
   if(module==='arts'){await scroll.evaluate(e=>e.scrollLeft=0);await page.locator('.wjwk-main').evaluate(e=>e.scrollTop=0);await page.locator('.wjwk-mmlc-layout .wjwk-content').evaluate(e=>e.scrollTop=0);await page.screenshot({path:resolve(out,`table-${width}-${theme}.png`)});}
   await page.locator('.wjwk-mmlc-table tbody th [data-action="open-archive"]').first().click();await page.locator('[data-archive-current]').waitFor();assert(await page.locator('[data-action="archive-edit-open"]').isVisible());await page.locator('.wjwk-dialog [data-action="dialog-close"]').click();assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())===beforeTable),true);
   checks.push({width,theme,module,filterAndDetails:true,originalStateUnchanged:true,onlyTableScrolls:true});
  }
  await page.evaluate(()=>{wanjie_wuku_general_instance.settings.mode='st';wanjie_wuku_general_instance.refresh();});
  const continueButton=page.locator('.wjwk-mmlc-table [data-action="mmlc-continue"]:not(:disabled)').first(),focusId=await continueButton.getAttribute('data-id');await continueButton.click();assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.creationRequest.focusId),focusId);assert.equal(await page.evaluate(()=>calls),0);assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())===beforeTable),true);await page.locator('.wjwk-dialog [data-action="dialog-close"]').click();
  await page.locator('[data-action="mmlc-view"][data-mode="brief"]').click();assert.equal(await page.locator('.wjwk-mmlc-table').count(),0);assert(await page.locator('[data-mmlc-record]').count());await page.locator('[data-action="mmlc-view"][data-mode="table"]').click();assert.equal(await page.locator('.wjwk-mmlc-table').count(),1);assert.equal(await page.evaluate(()=>calls),0);assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())===beforeTable),true);await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);await writeFile(resolve(out,'evidence.json'),JSON.stringify({checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false},null,2));console.log(JSON.stringify({cases:checks.length,errors,externalRequests,paidCalls:0,realHostAcceptance:false}));
}finally{await browser?.close();server.close();}
