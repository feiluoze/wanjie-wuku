import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,relative,isAbsolute,extname} from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright'),out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const errors=[],checks=[];let externalRequests=0;
 for(const width of [1440,390,320])for(const theme of ['dark','light']){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async({theme})=>{
   const a=wanjie_wuku_general_instance,{createPower,chatHashes}=await import('/src/core.js'),{builtinEntries}=await import('/src/builtin-worldbook.js'),{normalizeArchiveBatch,applyArchiveChanges}=await import('/src/archive-review.js');
   const p=createPower(builtinEntries().find(e=>e.name==='心渊')),ctx=SillyTavern.getContext();ctx.chat=[];
   const changes=[{recordId:'scars',name:'耐火渊痕',details:{effect:'已经永久取得耐火性质'}},{recordId:'relics',name:'深层钥痕',details:{kind:'永久通路权限',current:'已经开启'}},{recordId:'scars',name:'旧护体渊痕',status:'ended',details:{effect:'已明确结束的旧效果'}}].map(r=>({type:'record',status:'active',fields:{description:'自编界面验收数据'},sourceIndex:-1,...r}));
   const b=normalizeArchiveBatch({changes},p,[],[],'玩家确认上述已有事实');if(b.issues.length)throw Error(JSON.stringify(b.issues));applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((c,i)=>[i,c.id])),[]);
   await a.store.transact(s=>{s.powers={[p.id]:p};s.historyAnchor=chatHashes([]);s.syncCursor=0;});a.powerId=p.id;a.settings.theme=theme;a.settings.mode='off';a.ui.tab='management';a.refresh();a.ui.setOpen(true);
  },{theme});
  await page.locator('[data-long-term-table="scars"]').scrollIntoViewIfNeeded();assert.equal(await page.locator('[data-long-term-table]').count(),2);
  await page.screenshot({path:resolve(out,`tables-${width}-${theme}.png`)});
  await page.locator('[data-long-term-table="scars"] [data-action="archive-library"]').click();assert((await page.locator('[data-library-category]').inputValue()).endsWith('/scars'));assert.equal(await page.locator('[data-library-results] .wjwk-archive-card').count(),2);
  await page.locator('[data-library-status]').selectOption('active');assert.equal(await page.locator('[data-library-results] .wjwk-archive-card').count(),1);await page.locator('[data-library-query]').fill('不存在');assert((await page.locator('[data-library-results]').textContent()).includes('没有匹配档案'));
  await page.locator('[data-library-query]').fill('耐火');await page.locator('[data-library-results] [data-action="open-archive"]').click();await page.locator('.wjwk-modal [data-archive-current]').waitFor();assert((await page.locator('[data-archive-current]').textContent()).includes('永久效果'));
  assert.equal(await page.locator('[name="specific:limits"]').count(),1);await page.locator('.wjwk-modal [data-action="archive-library-back"]').click();assert.equal(await page.locator('[data-library-query]').inputValue(),'耐火');
  await page.keyboard.press('Escape');await page.locator('[data-long-term-table="expeditions"] [data-action="archive-library"]').click();assert((await page.locator('[data-library-results]').textContent()).includes('没有匹配档案'));await page.keyboard.press('Escape');
  const overflow=await page.evaluate(()=>{const r=document.querySelector('.wjwk-shell')||document.querySelector('#wjwk-root');return r?r.scrollWidth>r.clientWidth+2:false;});assert.equal(overflow,false);checks.push({width,theme,tableNavigation:true,emptyTable:true,searchStatusFilters:true,detailAndReturn:true,missingColumnsEditable:true,noHorizontalOverflow:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const report={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'tables-evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.close();}
