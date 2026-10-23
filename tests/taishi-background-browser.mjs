import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright'),out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const errors=[],checks=[];let externalRequests=0;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});
 for(const width of [390,1440])for(const close of ['dialog-x','escape','backdrop','explicit-cancel']){
  if(width===390&&close==='backdrop')continue; // The mobile dialog fills the screen, leaving no exposed backdrop.
  const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async()=>{const a=wanjie_wuku_general_instance;await a.openTaishi();a.settings.mode='st';a.ui.setOpen(true);a.model.request=(_p,options)=>{window.requestSignal=options.signal;return new Promise((resolve,reject)=>{window.releaseWorld=()=>resolve(JSON.stringify({changes:[{name:'海蓝界',type:'environment',status:'active',fields:{conditions:'成熟的海洋修仙世界'},recordId:'world',details:{overview:'群岛文明',geography:'三片群岛',era:'宗门与海商并存'},sourceIndex:-1}]}));options.signal.addEventListener('abort',()=>reject(new DOMException('模拟取消','AbortError')),{once:true});});};a.openTaishiDraft('world');});
  await page.locator('[data-taishi-draft] textarea').fill('建立成熟的海洋修仙世界，包含群岛文明和海商势力');await page.locator('[data-action="taishi-draft-submit"]').click();await page.waitForFunction(()=>Boolean(window.requestSignal));
  if(close==='dialog-x')await page.locator('.wjwk-dialog [data-action="dialog-close"]').click();else if(close==='escape')await page.keyboard.press('Escape');else if(close==='backdrop')await page.locator('.wjwk-modal').click({position:{x:1,y:1}});else {await page.locator('.wjwk-dialog [data-action="dialog-close"]').click();await page.locator('[data-action="ai-task-cancel"]').click();}
  const cancelled=await page.evaluate(()=>requestSignal.aborted);assert.equal(cancelled,close==='explicit-cancel');
  assert(await page.locator('.wjwk-modal').evaluate(n=>n.hidden));
  if(close!=='explicit-cancel'){await page.evaluate(()=>releaseWorld());await page.waitForFunction(()=>Boolean(wanjie_wuku_general_instance.pendingArchiveReview));assert(await page.locator('.wjwk-modal').evaluate(n=>n.hidden));}
  else await page.waitForFunction(()=>!wanjie_wuku_general_instance.archiveReviewJob);
  const result=await page.evaluate(()=>{const a=wanjie_wuku_general_instance;return {signalAborted:requestSignal.aborted,busy:a.busy,pending:Boolean(a.pendingArchiveReview),draftReleased:!a.taishiDraft,savedArchives:Object.keys(a.store.read().powers[a.powerId].archives||{}).length};});
  if(close!=='explicit-cancel'){
   assert((await page.locator('.wjwk-fab .wjwk-attention-badge').textContent())!=='');
   await page.locator('[data-action="attention-open"]').click();await page.locator('[data-action="attention-review"]').click();assert(await page.locator('.wjwk-modal').isVisible());assert((await page.locator('.wjwk-dialog').textContent()).includes('海蓝界'));
  }
  assert.equal(result.savedArchives,0);assert.equal(result.pending,close!=='explicit-cancel');assert(result.draftReleased);checks.push({width,close,...result});await page.screenshot({path:resolve(out,`fixed-${close}-${width}.png`)});await page.close();
 }
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async()=>{const a=wanjie_wuku_general_instance;await a.openTaishi();a.ui.setOpen(true);a.taishiBuildDraft={powerId:a.powerId,loading:true,error:'',structure:{mode:'multiple'}};a.ui.showTaishiBuild(a.taishiBuildDraft);});
  await page.locator('.wjwk-dialog [data-action="dialog-close"]').click();assert(await page.locator('.wjwk-modal').evaluate(n=>n.hidden));assert(await page.evaluate(()=>Boolean(wanjie_wuku_general_instance.taishiBuildDraft)));
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.taishiBuildDraft.loading=false;a.taishiBuildDraft.error='模拟读取完成后的提示';a.ui.showTaishiBuild(a.taishiBuildDraft);});assert(await page.locator('.wjwk-modal').evaluate(n=>n.hidden));
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.ui.resumeTaishiDialogs();a.ui.showTaishiBuild(a.taishiBuildDraft);});assert(await page.locator('.wjwk-modal').isVisible());checks.push({width,worldbookLoadingClosePreserves:true,completionDoesNotReopen:true,explicitReopenWorks:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const evidence={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.close();}
