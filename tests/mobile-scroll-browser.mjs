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
 const sizes=process.env.WJWK_SCROLL_BASELINE?[{width:390,height:844}]:[{width:320,height:568},{width:390,height:844},{width:640,height:360},{width:1440,height:1000}];
 for(const module of ['wuku','mmlc','taishi'])for(const size of sizes)for(const theme of (process.env.WJWK_SCROLL_BASELINE?['dark']:['dark','light'])){
  const page=await browser.newPage({viewport:size,hasTouch:true,isMobile:size.width<=720});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async ({theme,module})=>{
   const a=wanjie_wuku_general_instance,{createPower}=await import('/src/core.js'),{builtinEntries}=await import('/src/builtin-worldbook.js');
   const p=createPower(builtinEntries().find(e=>e.name==='心渊'));await a.store.transact(s=>{s.powers={[p.id]:p};});a.powerId=p.id;a.settings.theme=theme;a.settings.mode='off';a.refresh();a.ui.setOpen(true);if(module==='mmlc')await a.action('add-mmlc',{});if(module==='taishi')await a.openTaishi();
   const main=document.querySelector('.wjwk-main');main.insertAdjacentHTML('beforeend','<button type="button" data-scroll-end>底部触摸验证</button>');main.lastElementChild.addEventListener('click',()=>window.bottomTapped=true);
  },{theme,module});
  const selector=size.width<=720?'.wjwk-layout':'.wjwk-main';
  const before=await page.locator(selector).evaluate(e=>({height:e.clientHeight,total:e.scrollHeight,overflow:getComputedStyle(e).overflowY}));
  if(process.env.WJWK_SCROLL_BASELINE)console.log(JSON.stringify({size,before}));
  assert(['auto','scroll'].includes(before.overflow),'visible content has no reachable scrolling ancestor');assert(before.total>before.height+100);
  const client=await page.context().newCDPSession(page),box=await page.locator(selector).boundingBox();
  const x=Math.round(box.x+box.width/2),y=Math.round(Math.min(size.height-80,box.y+box.height-60));
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let step=1;step<=12;step++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-step*18}]});await page.waitForTimeout(20);}
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(150);assert(await page.locator(selector).evaluate(e=>e.scrollTop>30),'finger swipe must move the viewport');
  // Host refresh must preserve the actual scrolling container.
  const oldTop=await page.locator(selector).evaluate(e=>e.scrollTop);await page.evaluate(()=>wanjie_wuku_general_instance.refresh());
  const newTop=await page.locator(selector).evaluate(e=>e.scrollTop);const maxTop=await page.locator(selector).evaluate(e=>e.scrollHeight-e.clientHeight);assert(Math.abs(newTop-Math.min(oldTop,maxTop))<3,JSON.stringify({module,size,oldTop,newTop,maxTop,error:'refresh jumped back to top'}));
  // Use production content footer after refresh; append only an inert test target.
  await page.evaluate(()=>{const main=document.querySelector('.wjwk-main');main.insertAdjacentHTML('beforeend','<button type="button" data-scroll-end>底部触摸验证</button>');main.lastElementChild.addEventListener('click',()=>window.bottomTapped=true);});
  await page.locator(selector).evaluate(e=>e.scrollTop=e.scrollHeight);
  const target=await page.locator('[data-scroll-end]').boundingBox();assert(target.y>=0&&target.y+target.height<=size.height,'bottom control clipped');await page.locator('[data-scroll-end]').tap();assert(await page.evaluate(()=>window.bottomTapped));
  if(size.width<=720)assert(await page.locator('.wjwk-main').evaluate(e=>e.scrollHeight<=e.clientHeight+2),'nested main scroll traps touch');
  await page.screenshot({path:resolve(out,`scroll-${module}-${size.width}-${theme}.png`)});checks.push({...size,theme,module,touchScroll:true,refreshPreserves:true,bottomReachable:true,bottomTap:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const evidence={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.close();}
