// Production extension in a controlled mock host. No external model requests.
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
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);

 await page.evaluate(async(book)=>{
  const a=wanjie_wuku_general_instance,{importBook,createPower}=await import('/src/core.js'),{saveArchive}=await import('/src/archives.js'),{creationConfig}=await import('/src/creation-config.js');
  const p=createPower(importBook(book).find(e=>e.name==='早有先例'));const config=creationConfig(p),definition=config.records[0];
  for(let i=0;i<85;i++)saveArchive(p,{name:'独立先例'+i,type:'record',status:'active',fields:{description:'已完成事件'+i},specific:{adapterId:config.id,recordId:definition.id,version:config.version,label:definition.label,labels:Object.fromEntries(definition.fields.map(f=>[f.id,f.label])),fields:{event:'事件'+i,result:'真实发生'}}},{type:'manual',note:'测试数据'});
  saveArchive(p,{name:'<img src=x onerror=alert(1)>',type:'record',status:'planned',fields:{description:'旧通用记录'}},{type:'manual',note:'测试数据'});
  await a.store.transact(s=>{s.powers[p.id]=p;});a.powerId=p.id;a.ui.space='wuku';a.ui.setOpen(true);a.refresh();
 },JSON.parse(await readFile('data/builtin-worldbook.json','utf8')));
 await page.getByRole('button',{name:'完整档案库 · 搜索与分类',exact:true}).click();
 assert.equal(await page.locator('[data-library-results] .wjwk-archive-card').count(),20);
 assert.match(await page.locator('[data-library-results]').innerText(),/共 86 项/);
 await page.getByRole('button',{name:'下一页',exact:true}).click();assert.match(await page.locator('[data-library-results]').innerText(),/第 2\/5 页/);
 await page.locator('[data-library-query]').fill('独立先例84');assert.equal(await page.locator('[data-library-results] .wjwk-archive-card').count(),1);
 await page.locator('[data-library-query]').fill('');await page.locator('[data-library-category]').selectOption('legacy');assert.equal(await page.locator('[data-library-results] .wjwk-archive-card').count(),1);assert.equal(await page.locator('[data-library-results] img').count(),0);
 await page.locator('[data-library-status]').selectOption('active');assert.match(await page.locator('[data-library-results]').innerText(),/匹配 0 项/);
 await page.locator('[data-library-status]').selectOption('');await page.locator('[data-library-category]').selectOption('');
 await page.setViewportSize({width:390,height:900});await page.screenshot({path:out+'/archive-library-390.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.evaluate(()=>wanjie_wuku_general_instance.ui.closeDialog());
 await page.evaluate(()=>wanjie_wuku_general_instance.ui.setAIActivity({id:'fixture-task',label:'测试进行中任务',phase:'等待回复',status:'running',startedAt:performance.now(),connections:{}}));
 await page.locator('.wjwk-header [data-action="minimize-fab"]').click();
 assert(await page.locator('.wjwk-edge-tab').isVisible());assert(!await page.locator('.wjwk-window').isVisible());assert(!await page.locator('.wjwk-ai-activity').isVisible());
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.ui.aiState.status),'running');
 await page.screenshot({path:out+'/edge-tab-390.png'});
 await page.evaluate(()=>wanjie_wuku_general_instance.ui.setAIActivity({id:'fixture-task',label:'测试进行中任务',phase:'处理中',status:'running',startedAt:performance.now(),connections:{}}));
 assert(!await page.locator('.wjwk-ai-activity').isVisible());await page.locator('.wjwk-edge-tab').click();
 assert(await page.locator('.wjwk-window').isVisible());assert(await page.locator('.wjwk-ai-activity').isVisible());assert(await page.locator('[data-action="ai-task-cancel"]').isVisible());
 await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.ui.hideAIActivity();a.ui.setOpen(false);});
 await page.locator('.wjwk-fab-fold').click();assert(await page.locator('.wjwk-edge-tab').isVisible());await page.locator('.wjwk-edge-tab').click();assert(await page.locator('#wjwk-root > .wjwk-fab').isVisible());

 await page.setViewportSize({width:390,height:900});
 for(const name of ['多倍收获系统','代价减免','我全都要','指数增长','质能转换','故事点']){
  const expected=await page.evaluate(async({book,name})=>{
   const a=wanjie_wuku_general_instance,{importBook,createPower}=await import('/src/core.js'),{saveArchive}=await import('/src/archives.js'),{creationConfig}=await import('/src/creation-config.js');
   const p=createPower(importBook(book).find(e=>e.name===name)),c=creationConfig(p);
   for(const r of c.records)saveArchive(p,{name:r.label+'示例',type:'record',status:r.id==='intent'?'planned':'active',fields:{description:'玩家核对的事实'},specific:{adapterId:c.id,recordId:r.id,version:c.version,label:r.label,labels:Object.fromEntries(r.fields.map(f=>[f.id,f.label])),fields:Object.fromEntries(r.fields.map(f=>[f.id,f.id==='balance'?'-12':'确认内容']))}},{type:'manual',note:'测试数据'});
   await a.store.transact(s=>{s.powers[p.id]=p;});a.powerId=p.id;a.ui.setOpen(true);a.refresh();return c.records.map(r=>({label:r.label,key:c.id+'/'+r.id}));
  },{book:JSON.parse(await readFile('data/builtin-worldbook.json','utf8')),name});
  await page.getByRole('button',{name:'完整档案库 · 搜索与分类',exact:true}).click();
  assert.equal(await page.locator('[data-library-results] .wjwk-archive-card').count(),expected.length);
  for(const r of expected){await page.locator('[data-library-category]').selectOption(r.key);assert.equal(await page.locator('[data-library-results] .wjwk-archive-card').count(),1);assert.match(await page.locator('[data-library-results]').innerText(),new RegExp(r.label));}
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(name==='故事点')await page.screenshot({path:out+'/story-points-390.png'});
  await page.evaluate(()=>wanjie_wuku_general_instance.ui.closeDialog());
 }
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(externalRequests,0);
 console.log('1.3.4 browser passed: six settlement schemas and 86-object pagination, search, category and status filters, safe rendering, 390px layout, edge minimize and restore with task state retained.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
