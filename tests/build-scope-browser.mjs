// Real production code with a local fake transport; never calls an external API.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),path);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];let externalRequests=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();externalRequests++;return r.abort();});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);await page.locator('[data-action="toggle"]').click();
 await page.locator('[data-action="modules-open"]').click();await page.locator('[name="taishi"]').check();await page.locator('[data-action="modules-save"]').click();
 await page.locator('[data-action="space-taishi"]').click();await page.getByRole('heading',{name:'太始天',exact:true}).waitFor();
 assert.equal(await page.locator('.wjwk-mmlc-tile').count(),7);

 await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance,h=await import('/src/host.js'),ctx=SillyTavern.getContext();
  h.saveConnectionProfile({name:'范围测试',settings:{...h.DEFAULT_SETTINGS,mode:'custom',baseUrl:'https://fake-model.test/v1',model:'local-test'},apiKey:'FAKE'});a.settings=h.getSettings();a.apiKey=h.getApiKey();
  ctx.getWorldInfoNames=()=>['个人诸界','漫漫长路'];
  ctx.loadWorldInfo=async name=>({entries:{1:{uid:1,comment:name+'已采用设定',content:name==='个人诸界'?'林海界由议会和工坊共同管理。'.repeat(1800):'不应发送的漫漫长路'},2:{uid:2,comment:'未采用的备选世界',content:'不应发送的备选世界'}}});
  await a.store.transact(s=>{s.aiWorldbooks={mode:'manual',books:[{name:'个人诸界',entryIds:['1','2']},{name:'漫漫长路',entryIds:['1']}]};});
  window.calls=0;window.inputs=[];
  a.model.request=async prompt=>{window.calls++;window.inputs.push(JSON.parse(prompt.user));return JSON.stringify({changes:[{type:'environment',name:'林海界',status:'active',fields:{conditions:'成熟世界'},recordId:'world',details:{overview:'河谷城邦与林地居民共存的世界。',factions:'林地议会与造物工坊',era:'城邦时代',resources:'木材与铜材',events:'航路正在恢复',clock:'世界内历第三年'},sourceIndex:-1}]});};a.refresh();
 });
 await page.locator('[data-action="taishi-setup"]').click();await page.getByRole('heading',{name:'太始天 · 选择构建世界书与词条',exact:true}).waitFor();
 assert.equal(await page.locator('[data-action="ai-ref-mode"]').count(),0);
 assert.equal(await page.evaluate(()=>calls),0);
 await page.setViewportSize({width:390,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/build-picker-390.png'});await page.setViewportSize({width:1440,height:1000});
 await page.locator('button[data-action="ai-ref-book"][data-book="个人诸界"]').click();
 await page.locator('[data-ai-ref-group] > summary').click();
 await page.locator('[data-ai-ref-entry][value="2"]').uncheck();
 await page.locator('[data-action="ai-ref-save"]').click();await page.locator('[data-taishi-build]').waitFor();
 const scope=await page.evaluate(()=>({plan:wanjie_wuku_general_instance.taishiBuildDraft.plan,shared:wanjie_wuku_general_instance.store.read().aiWorldbooks}));
 assert.equal(scope.shared.books.length,2);assert.equal(scope.plan.next,0);assert.equal(await page.evaluate(()=>calls),0);
 assert(scope.plan.chunks.every(c=>c.payload.books.every(b=>b.name==='个人诸界'&&b.entries.every(e=>e.id==='1'))));
 await page.locator('[data-action="taishi-build-run"]').click();await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 assert.equal(await page.evaluate(()=>calls),1);assert.equal(await page.evaluate(()=>inputs[0].attachedWorldbooks.books.some(b=>b.name==='漫漫长路')),false);
 if(await page.locator('[data-action="ai-status-close"]').isVisible())await page.locator('[data-action="ai-status-close"]').click();
 await page.locator('.wjwk-sidebar [data-action="taishi-section"][data-section="civilizations"]').click();
 await page.locator('[data-world-outline]').waitFor();assert.match(await page.locator('[data-world-outline]').textContent(),/林地议会与造物工坊/);
 assert.equal(await page.locator('[data-archive-update]').isVisible(),false);
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.locator('[data-world-outline]').scrollIntoViewIfNeeded();await page.screenshot({path:out+`/civilization-outlines-${width}.png`});}
 await page.locator('[data-world-outline] [data-action="open-archive"]').click();
 assert.equal(await page.locator('[data-journey-details]').getAttribute('open'),null);
 assert.equal(await page.locator('[data-archive-edit]').getAttribute('open'),null);
 await page.locator('[data-journey-details] > summary').click();assert(await page.locator('[data-journey-details] ol').isVisible());await page.locator('[data-journey-details] > summary').click();
 for(const width of [1440,360,390,430]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.locator('.wjwk-brief-grid').evaluate(e=>getComputedStyle(e).columnCount),width===1440?'2':'1');
  assert.equal(await page.locator('[data-taishi-brief]').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);
  await page.screenshot({path:out+`/compact-brief-${width}.png`});
 }
 await page.locator('[data-action="dialog-close"]').click();await page.setViewportSize({width:1440,height:1000});
 await page.locator('.wjwk-section-actions > summary').click();await page.locator('[data-action="taishi-setup"]').click();await page.locator('[data-action="taishi-build-select"]').click();await page.locator('[data-ai-ref-group] > summary').click();
 await page.locator('[data-ai-ref-entry][value="2"]').check();await page.locator('[data-ai-ref-entry][value="1"]').uncheck();
 await page.locator('[data-action="ai-ref-save"]').click();await page.locator('[data-taishi-build]').waitFor();
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.taishiBuildDraft.plan.next),0);
 assert.equal(await page.evaluate(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives).length),1);
 assert.equal(await page.evaluate(()=>calls),1);
 await page.screenshot({path:out+'/independent-build-scope.png'});
 await page.reload();await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
 assert.equal(await page.evaluate(()=>Object.values(wanjie_wuku_general_instance.store.read().powers).find(p=>p.taishiBuildReferences).taishiBuildReferences.books[0].entryIds.join(',')),'2');
 const help=await page.evaluate(async()=>{
  const {compactHelp}=await import('/src/compact-help.js');const root=document.createElement('section');document.body.append(root);
  root.innerHTML='<p class="wjwk-muted">'+ '这是一段可选的操作说明。'.repeat(8)+'</p><p class="wjwk-muted" role="status">'+ '当前任务状态。'.repeat(10)+'</p><p role="alert">需要处理的错误</p><label>目标<input></label>';
  compactHelp(root);compactHelp(root);
  const result={help:root.querySelectorAll('details.wjwk-help').length,closed:!root.querySelector('details').open,statusVisible:root.querySelector('[role=status]').closest('details')===null,errorVisible:root.querySelector('[role=alert]').closest('details')===null,inputVisible:root.querySelector('input').closest('details')===null};root.remove();return result;
 });
 assert.deepEqual(help,{help:1,closed:true,statusVisible:true,errorVisible:true,inputVisible:true});
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);
 await writeFile(out+'/build-scope-flow.json',JSON.stringify({selectedBook:'个人诸界',selectedEntry:'2',calls:1,externalRequests,errors,preservedArchives:1,reloadSelection:true,historyCollapsed:true},null,2));
 console.log('PASS independent books/entries and sent payload, saved archives, collapsed history, world civilization outlines and compact responsive cards; zero external calls.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
