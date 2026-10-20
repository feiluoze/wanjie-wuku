import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright'),out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const errors=[],checks=[];let externalRequests=0;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});
 for(const width of [1440,390,320])for(const theme of ['dark','light']){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async theme=>{
   const a=wanjie_wuku_general_instance,{createPower,chatHashes}=await import('/src/core.js'),{builtinEntries}=await import('/src/builtin-worldbook.js'),{normalizeArchiveBatch,applyArchiveChanges}=await import('/src/archive-review.js');
   const p=createPower(builtinEntries().find(e=>e.name==='人间游戏')),names=['冲锋','斩杀','旋风斩','战斗怒吼','盾牌格挡','盾墙','战地急救包扎','法理纹章学与贵族领地法辨识'],quote='重要技能：'+names.join('、');SillyTavern.getContext().chat=[];
   const b=normalizeArchiveBatch({changes:names.map(name=>({name,type:'skill',recordId:'skill',status:'active',sourceIndex:-1,quote}))},p,[],[],'玩家确认已掌握以上技能');if(b.issues.length)throw Error(JSON.stringify(b.issues));applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((r,i)=>[i,null])),[]);
   // Simulate already-saved legacy fallback data, without changing any live chat.
   for(const r of Object.values(p.archives))r.fields.level=quote;
   await a.store.transact(s=>{s.powers={[p.id]:p};s.historyAnchor=chatHashes([]);s.syncCursor=0;});a.powerId=p.id;a.settings.theme=theme;a.settings.mode='off';a.ui.tab='management';a.refresh();a.ui.setOpen(true);window.basicQuote=quote;
  },theme);
  await page.locator('.wjwk-action-bar > [data-action="archive-library"]').click();assert.equal(await page.locator('[data-library-results] .wjwk-archive-card').count(),8);
  const body=await page.locator('[data-library-results]').textContent();assert(!body.includes('重要技能：'));assert(!body.includes('已达程度'));assert.equal((body.match(/详情待补充/g)||[]).length,8);
  await page.screenshot({path:resolve(out,`basic-${width}-${theme}.png`)});
  await page.locator('[data-library-results] [data-action="open-archive"]').first().click();assert(!(await page.locator('[data-archive-current] dl').textContent()).includes('重要技能：'));assert((await page.locator('[data-archive-current] blockquote').textContent()).includes('重要技能：'));assert.equal(await page.locator('[name="field:level"]').inputValue(),'');
  const overflow=await page.locator('.wjwk-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+2);assert.equal(overflow,false);checks.push({width,theme,cleanCards:8,sourcePreserved:true,noOverflow:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const evidence={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.close();}
