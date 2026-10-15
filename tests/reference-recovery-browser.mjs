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
  const ctx=SillyTavern.getContext();ctx.loadWorldInfo=async()=>({entries:{1000:{uid:1000,comment:'【地域】银城｜甲国',content:'银城位于甲国北部。'}}});
  await a.store.transact(s=>{s.powers[a.powerId].taishiWorldStructure={mode:'multi',worldId:'',worldName:''};s.aiWorldbooks={mode:'manual',books:[{name:'分类书',entryIds:['1000']}]};});
  a.model.request=async()=>{calls++;return JSON.stringify({changes:[{type:'environment',name:'银城',status:'active',recordId:'region',fields:{conditions:'已存在的城邦地域'},details:{geography:'甲国北部'},settingRefs:[{book:'未选书',id:'1000'}],sourceIndex:-1}]});};
  await a.reviewArchives({setupReferences:true});
  if(a.pendingArchiveReview.issues[0].diagnostic.code!=='reference_not_selected')throw Error('引用诊断不正确');
  a.pendingArchiveReview=null;a.restoreReviewCheckpoint(a.contextSnapshot());if(!a.pendingArchiveReview?.restored)throw Error('缓存恢复失败');a.ui.showArchiveReview(a.pendingArchiveReview,a.contextSnapshot().state.powers[a.powerId],ctx.chat);
 });
 await page.locator('[data-action="retry-archive-references"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();
 assert.equal(await page.evaluate(()=>calls),1);assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.pendingArchiveReview.issues.length),0);
 assert.equal(await page.evaluate(()=>JSON.parse(wanjie_wuku_general_instance.pendingArchiveReview.changes[0].specific.fields.source_profile)[0].content),'银城位于甲国北部。');
 const sourceFold=page.locator('[data-archive-diff] details').filter({hasText:'原文片段变更 · 展开核对'});assert.equal(await sourceFold.count(),1);assert.equal(await sourceFold.getAttribute('open'),null);
 await page.locator('.wjwk-dialog').screenshot({path:resolve(out,'reference-recovery-mobile.png')});
 const size=await page.locator('.wjwk-dialog-body').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));assert(size.scroll<=size.width+2);
 const evidence={unbatchedReferencePacketRetained:true,cachedCandidateRestored:true,localRetryButtonWorks:true,exactSourceCopied:true,confirmationStillRequired:true,mockedModelCalls:1,externalRequests:external,consoleErrors:errors,width:390};assert.equal(external,0);assert.deepEqual(errors,[]);await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.close();}
