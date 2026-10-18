import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,relative,isAbsolute,extname} from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright'),out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const checks=[],errors=[];let externalRequests=0;
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;window.beforeToast=JSON.stringify(a.store.read());a.ui.setOpen(false);a.ui.setNotice('本次2项未通过校验，未推进读取进度。',true);});
  const toast=page.locator('.wjwk-toast'),button=toast.locator('[data-action="notice-dismiss"]');
  if(process.env.WJWK_EXPECT_BROKEN){assert.equal(await button.evaluate(e=>getComputedStyle(e).pointerEvents),'none');let blocked=false;try{await button.click({timeout:800});}catch{blocked=true;}assert(blocked);checks.push({width,reproducedUnclickableToast:true});await page.close();continue;}
  assert.equal(await button.evaluate(e=>getComputedStyle(e).pointerEvents),'auto');await button.click();assert.equal(await toast.isVisible(),false);
  await page.evaluate(()=>wanjie_wuku_general_instance.refresh());assert.equal(await toast.isVisible(),false);
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.ui.setOpen(true);a.ui.setNotice('新的独立错误',true);});await button.click();assert.equal(await toast.isVisible(),false);
  await page.evaluate(()=>wanjie_wuku_general_instance.ui.setNotice('键盘关闭测试',true));await button.focus();await page.keyboard.press('Enter');assert.equal(await toast.isVisible(),false);
  assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())===window.beforeToast),true);checks.push({width,closeWithPanelHidden:true,closeWithPanelOpen:true,keyboardClose:true,refreshDoesNotReshow:true,newErrorCanAppear:true,stateUnchanged:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const report={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.close();}
