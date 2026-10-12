// Actual extension source in a local mock host. No real API calls or installation.
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
 const page=await browser.newPage({viewport:{width:390,height:850},reducedMotion:'reduce'}),errors=[];let externalRequests=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();externalRequests++;return r.abort();});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
 await page.locator('[data-action="toggle"]').click();
 const ids=await page.evaluate(async()=>{
  const app=wanjie_wuku_general_instance,ctx=SillyTavern.getContext(),core=await import('/src/core.js'),{saveArchive}=await import('/src/archives.js');
  const p=core.createPower({id:'feedback_local',name:'测试置物栏',book:'自编测试',content:'<置物栏>登记已经持有的物品和实际发生的研究成果。</置物栏>'});
  p.assets.test_potion={id:'test_potion',name:'旅行灵药',kind:'消耗品',description:'一剂已经购买的灵药，尚未使用。',quantity:'1',permanent:false};
  const r=saveArchive(p,{type:'research',name:'寻药经历',status:'active',fields:{outcome:'旧分支已经买到并服用了灵药'}},{type:'story',note:'自动整理',anchor:{index:0,swipeId:ctx.chat[0].swipe_id??0,length:core.storyText(ctx.chat[0].mes).length,textHash:core.hash(core.storyText(ctx.chat[0].mes))}});
  await app.store.transact(s=>{s.powers[p.id]=p;s.archiveMemory={auto:true,budget:5000,selections:{[p.id+'/'+r.id]:{mode:'pinned',token:'test_branch'}}};s.historyAnchor=core.chatHashes(ctx.chat);});
  app.powerId=p.id;app.settings.mode='off';app.refresh();app.ui.tab='assets';app.refresh();return {powerId:p.id,archiveId:r.id};
 });
 for(const width of [360,390,430]){
  await page.setViewportSize({width,height:850});assert.equal(await page.locator('[data-action="asset-remove"]').count(),1);
  await page.locator('[data-action="asset-remove"]').click();await page.locator('[data-removed-assets]').waitFor();
  await page.locator('[data-removed-assets] summary').click();await page.locator('[data-action="asset-restore"]').waitFor();
  assert.equal(await page.locator('.wjwk-content').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);await page.screenshot({path:out+`/player-bag-${width}.png`});
  await page.locator('[data-action="asset-restore"]').click();await page.locator('[data-action="asset-remove"]').waitFor();assert.equal(await page.locator('[data-action="asset-remove"]').count(),1);
 }
 const result=await page.evaluate(async ids=>{
  const app=wanjie_wuku_general_instance,ctx=SillyTavern.getContext(),core=await import('/src/core.js');
  app.beginArchiveMemory('regenerate');app.mainBusy=true;
  const request={chat:[{role:'user',content:'重新呈现当前楼层'}]};await ctx.eventSource.emit('CHAT_COMPLETION_PROMPT_READY',request);
  const excluded=!JSON.stringify(request).includes('旧分支已经买到并服用');
  app.mainBusy=false;app.memoryAttempt=null;ctx.chat[0].swipe_id=(ctx.chat[0].swipe_id??0)+1;ctx.chat[0].mes='新分支：仍在寻找药铺，尚未使用灵药。';await ctx.eventSource.emit('MESSAGE_SWIPED',0);
  const s=app.store.read(),p=s.powers[ids.powerId];core.validateState(core.clone(s));
  return {excluded,deleted:!p.archives[ids.archiveId],selectionDeleted:!s.archiveMemory.selections[ids.powerId+'/'+ids.archiveId],assetQuantity:p.assets.test_potion.quantity,transactions:s.transactions.length};
 },ids);
 assert(result.excluded&&result.deleted&&result.selectionDeleted);assert.equal(result.assetQuantity,'1');assert.deepEqual(errors,[]);assert.equal(externalRequests,0);
 await writeFile(out+'/player-feedback-flow.json',JSON.stringify({result,errors,externalRequests,realHostTested:false,installed:false},null,2));
 console.log('PASS reversible bag controls at 360/390/430; regenerate request excludes old facts; swipe hook deletes branch archive and pin; settled inventory survives; zero external calls.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
