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
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];let external=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(external++,r.abort()));
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
 await page.evaluate(async()=>{
 const a=wanjie_wuku_general_instance;await a.openTaishi();a.settings.mode='st';a.ui.setOpen(true);window.calls=0;
 a.model.request=async()=>{calls++;return JSON.stringify({changes:Array.from({length:130},(_,i)=>({type:'record',name:'成果'+i,status:'active',fields:{description:'已确认成果'+i},sourceIndex:-1}))});};
 await a.reviewArchives({values:{playerNote:'玩家确认资料'}});
 });
 assert.equal(await page.locator('.wjwk-local-segment').count(),3);
 assert.equal(await page.locator('[name="archive-change"]').count(),130);
 assert.equal(await page.locator('.wjwk-local-segment[open]').count(),1);
 await page.locator('.wjwk-dialog').screenshot({path:resolve(out,'segments-mobile.png')});
 const restored=await page.evaluate(async()=>{const a=wanjie_wuku_general_instance,s=a.contextSnapshot(),{decodeCheckpoint}=await import('/src/review-checkpoint.js');return decodeCheckpoint(localStorage.getItem('wanjie-wuku:review-checkpoint:'+s.chatKey),s).changes.length;});assert.equal(restored,130);
 await page.locator('[data-action="apply-archive-review"]').click();
 await page.waitForFunction(()=>Object.keys(wanjie_wuku_general_instance.contextSnapshot().state.powers[wanjie_wuku_general_instance.powerId].archives).length===130);
 assert.equal(await page.evaluate(()=>calls),1);
 const evidence={segments:3,candidates:130,firstSegmentOnlyExpanded:true,restored:130,saved:130,mockedModelCalls:1,externalRequests:external,consoleErrors:errors,width:390};assert.equal(external,0);assert.deepEqual(errors,[]);await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));

}finally{await browser?.close();server.close();}

