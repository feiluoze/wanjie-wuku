import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,relative,isAbsolute,extname} from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright'),out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const checks=[],errors=[];let externalRequests=0;
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async()=>{
   const a=wanjie_wuku_general_instance,{createPower,chatHashes}=await import('/src/core.js'),{builtinEntries}=await import('/src/builtin-worldbook.js');const p=createPower(builtinEntries().find(e=>e.name==='敕天法统')),ctx=SillyTavern.getContext();
   await a.store.transact(s=>{s.powers={[p.id]:p};s.historyAnchor=chatHashes(ctx.chat);});a.powerId=p.id;a.settings.theme='light';a.settings.mode='off';a.ui.tab='management';a.ui.setOpen(true);a.model.request=async()=>{throw Error('no model calls');};
   a.store.storageImpl={getItem:()=>null,setItem:()=>{throw Object.assign(Error(),{name:'QuotaExceededError'});}};ctx.saveChat=async()=>{};a.store.fetchImpl=async()=>({ok:true,json:async()=>[{chat_metadata:{}}]});
   try{await a.store.transact(s=>{s.syncCursor++;});}catch{}a.refresh();window.beforeRecovery=JSON.stringify(a.store.read());
  });
  const banner=page.locator('.wjwk-save-recovery');await banner.waitFor();assert.match(await banner.innerText(),/容量不足/);assert(await banner.locator('[data-action="export-all"]').isVisible());
  const download=page.waitForEvent('download');await banner.locator('[data-action="export-all"]').click();const d=await download;const payload=JSON.parse(await readFile(await d.path(),'utf8'));assert.equal(payload.format,'wjwk-backup');assert.equal(JSON.stringify(payload.state),await page.evaluate(()=>window.beforeRecovery));assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.pendingSaves.size),1);
  await banner.locator('[data-action="retry-save"]').click();await page.waitForFunction(()=>!wanjie_wuku_general_instance.committing);assert(await banner.isVisible());assert.equal(await banner.locator('[data-action="retry-save"]').isEnabled(),true);
  await page.screenshot({path:resolve(out,`recovery-${width}.png`)});
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.store.fetchImpl=async()=>({ok:true,json:async()=>[{chat_metadata:structuredClone(SillyTavern.getContext().chatMetadata)}]});});
  await banner.locator('[data-action="retry-save"]').click();await page.waitForFunction(()=>!wanjie_wuku_general_instance.committing&&wanjie_wuku_general_instance.store.lastSave.verified);assert.equal(await banner.count(),0);assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())===window.beforeRecovery),true);assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.pendingSaves.size),0);
  assert.equal(await page.locator('.wjwk-main').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);checks.push({width,exportedPendingState:true,failedRetryUnlocks:true,verifiedRetryClearsWarning:true,noMutationReplay:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const report={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.close();}
