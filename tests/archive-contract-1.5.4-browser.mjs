import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const checks=[],errors=[];let externalRequests=0,nativeBackendRequests=0;
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:980}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.route('**/api/backends/chat-completions/generate',async r=>{const body=JSON.parse(r.request().postData());assert.equal(JSON.parse(body.custom_include_body).response_format.type,'json_schema');assert.equal(body.custom_url,'https://provider.invalid/v1');nativeBackendRequests++;await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"changes":[]}'}}]})});});
  await page.addInitScript(()=>{window.nativeWireFetch=window.fetch.bind(window);});
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async()=>{
   const a=wanjie_wuku_general_instance,{createPower,chatHashes}=await import('/src/core.js'),{builtinEntries}=await import('/src/builtin-worldbook.js');
   const p=createPower(builtinEntries().find(e=>e.name==='天人骨血')),ctx=SillyTavern.getContext();window.testPower=p.id;ctx.chat=[{is_user:false,mes:'本层成果甲已经建立。'}];
   await a.store.transact(s=>{s.powers={[p.id]:p};s.historyAnchor=chatHashes(ctx.chat);s.syncCursor=1;});a.powerId=p.id;a.settings.mode='st';a.ui.setOpen(true);
   window.testRow={name:'成果甲',type:'record',status:'active',fields:{description:'本层成果甲已经建立。'},sourceIndex:0,quote:ctx.chat[0].mes};window.testBad=JSON.stringify({changes:[testRow]}).slice(0,-1);window.testCalls=0;
   a.model.request=async()=>{testCalls++;return testBad;};await a.reviewArchives({rescan:true});
  });
  await page.locator('[data-action="repair-archive-ai"]').waitFor();assert.equal(await page.evaluate(()=>testCalls),1);assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.pendingArchiveReview.data.rawFailures[0].raw===testBad),true);
  const downloaded=page.waitForEvent('download');await page.evaluate(()=>wanjie_wuku_general_instance.action('failed-review-export',{}));const download=await downloaded;await download.saveAs(resolve(out,`failed-reply-${width}.json`));const exported=JSON.parse(await readFile(resolve(out,`failed-reply-${width}.json`),'utf8'));assert(exported.payload.candidate.data.rawFailures[0].raw);
  await page.evaluate(()=>{wanjie_wuku_general_instance.model.request=async p=>{testCalls++;const input=JSON.parse(p.user);if(input.failed[0].raw!==testBad)throw Error('reply changed');return JSON.stringify({responses:[{index:0,data:{changes:[testRow],floorReviews:[{sourceIndex:0,status:'reviewed',changeCount:1}],message:'格式修复完成'}}]});};});
  await page.locator('[data-action="repair-archive-ai"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.pendingArchiveReview?.changes.length===1);
  assert.equal(await page.evaluate(()=>testCalls),2);assert.equal(await page.evaluate(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers[testPower].archives||{}).length),0);await page.screenshot({path:resolve(out,`repaired-${width}.png`)});
  await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers[testPower].archives||{}).length===1);
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.ui.showSettings({...a.settings,mode:'custom',baseUrl:'https://fixture.invalid/v1',model:'fixture'});});
  await page.locator('.wjwk-modal details').filter({has:page.locator('summary',{hasText:'高级设置与自动核算'})}).locator('summary').first().click();
  await page.locator('[name="archiveOutputMode"]').selectOption('schema');await page.locator('[data-action="save-settings"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.settings.archiveOutputMode==='schema');
  const native=await page.evaluate(async()=>{const {ModelConnection}=await import('/src/model.js');const m=new ModelConnection({settings:()=>({mode:'custom',baseUrl:'https://provider.invalid/v1',model:'fixture',archiveOutputMode:'schema'}),getKey:()=>'',fetchImpl:window.nativeWireFetch,context:()=>({getRequestHeaders:()=>({'X-CSRF-Token':'fixture'})})});return m.request({system:'JSON',user:'facts',archiveSchema:{type:'object'}});});assert.equal(native,'{"changes":[]}');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks.push({width,originalReplyRetained:true,exportedOriginalReply:true,explicitRepairCalls:2,confirmationRequired:true,oneArchiveSaved:true,outputModeSaved:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);assert.equal(nativeBackendRequests,2);const report={checks,errors,externalRequests,nativeBackendRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.close();}
