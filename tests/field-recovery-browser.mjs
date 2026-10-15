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
 await page.evaluate(async()=>{const a=wanjie_wuku_general_instance;await a.openTaishi();a.settings.mode='st';a.ui.setOpen(true);window.calls=0;a.model.request=async()=>{calls++;return JSON.stringify({changes:[{type:'record',name:'资料核对',status:'active',fields:{unknown_blob:{text:'已确认资料'}},sourceIndex:-1}]});};await a.reviewArchives({values:{playerNote:'玩家确认已存在资料，仅做档案核对'}});});
 assert.equal(await page.evaluate(()=>calls),1);assert(await page.evaluate(()=>wanjie_wuku_general_instance.pendingArchiveReview.checkpointSaved));
 await page.getByText('查看未通过的条目',{exact:true}).click();await page.getByText('本地修正字段 · 不调用AI',{exact:true}).click();
 const raw=await page.evaluate(()=>({...wanjie_wuku_general_instance.pendingArchiveReview.issues[0].candidate,fields:{description:'已确认资料'}}));
 await page.locator('[name="repair-candidate:0"]').fill(JSON.stringify(raw));await page.locator('[data-action="repair-archive-candidate"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();
 assert.equal(await page.evaluate(()=>calls),1);assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.pendingArchiveReview.issues.length),0);
 await page.locator('.wjwk-dialog').screenshot({path:resolve(out,'local-repair-mobile.png')});
 const size=await page.locator('.wjwk-dialog-body').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));assert(size.scroll<=size.width+2);
 const evidence={allRejectedCached:true,repairButtonWorks:true,repairRequiresConfirmation:true,mockedModelCalls:1,externalRequests:external,consoleErrors:errors,width:390};assert.equal(external,0);assert.deepEqual(errors,[]);await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.close();}
