import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let external=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external++;return r.abort();});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
 await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance,{createPower}=await import('/src/core.js');const p=createPower({id:'synthetic',name:'自编记录能力',content:'只记载本能力真实发生的事件。'});
  SillyTavern.getContext().chat.push({is_user:false,mes:'<story_driver>仅供规划的未知奖励</story_driver><WJWK-settle>本轮收益：旧事件已完成\n后续机会：探索新区域</WJWK-settle>'},{is_user:false,mes:'新事件已完成。'});
  await a.store.transact(s=>s.powers[p.id]=p);a.powerId=p.id;a.ui.space='wuku';a.ui.setOpen(true);a.settings.mode='st';a.refresh();
  a.model.request=async prompt=>{
   const input=JSON.parse(prompt.user);if(JSON.stringify(input.sources).includes('仅供规划的未知奖励'))throw Error('planning leaked');
   const index=input.sources.at(-1).index;return JSON.stringify({changes:[{name:'新事件',type:'record',status:'active',fields:{description:'已完成'},sourceIndex:index}],floorReviews:[{sourceIndex:index,status:'reviewed',changeCount:1}]});
  };await a.reviewArchives({rescan:true});
 });
 await page.getByText(/逐层核对结果 ·/).click();assert.match(await page.locator('.wjwk-dialog').innerText(),/待重查，不推进读取进度/);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+`/floor-review-${width}.png`});}
 await page.getByRole('button',{name:'接受这些更新',exact:true}).click();
 await page.waitForFunction(()=>!wanjie_wuku_general_instance.pendingArchiveReview);
 const result=await page.evaluate(()=>{const a=wanjie_wuku_general_instance,p=a.store.read().powers[a.powerId];return {archives:Object.values(p.archives).map(r=>r.name),reviewed:p.archiveReviewed.map(r=>r.index),total:SillyTavern.getContext().chat.length};});
 assert.deepEqual(result.archives,['新事件']);assert.deepEqual(result.reviewed,[result.total-1]);assert.equal(external,0);assert.deepEqual(errors,[]);
 console.log('PASS: structured receipts exclude planning; partial multi-floor review remains visible; valid selection saves once and leaves earlier floors retryable; 1440/390/320 without overflow; no external/model requests');
}finally{await browser?.close();server.close();}
