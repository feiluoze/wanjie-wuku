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
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const checks=[],errors=[];let externalRequests=0;
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:980}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  const result=await page.evaluate(async()=>{
   const {thinkingOptions}=await import('/src/model-thinking.js'),{parseModelResponse}=await import('/src/model-response.js'),{parseJSON,archiveReadText}=await import('/src/core.js');
   const response=parseModelResponse({choices:[{finish_reason:'stop',message:{content:'<think>{"fake":true}</think>{"changes":[]}'}}]});
   const a=wanjie_wuku_general_instance;a.ui.setOpen(true);a.ui.showSettings({...a.settings,mode:'custom',model:'MiniMax-M2.7-highspeed'});
   return {split:thinkingOptions({model:'MiniMax-M2.7-highspeed'}).reasoning_split,json:parseJSON(response.content),filtered:archiveReadText('<draft>hidden</draft>正文')};
  });
  assert.equal(result.split,true);assert.deepEqual(result.json,{changes:[]});assert.equal(result.filtered,'正文');
  const details=page.locator('.wjwk-modal details').filter({has:page.locator('summary',{hasText:'高级设置与自动核算'})});await details.locator('summary').first().click();
  assert.equal(await page.locator('[name="thinkingMode"]').isVisible(),true);assert.match(await details.innerText(),/模型思考模式/);assert.match(await details.innerText(),/仅分离思考/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:resolve(out,`settings-${width}.png`)});checks.push({width,...result});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const report={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.close();}
