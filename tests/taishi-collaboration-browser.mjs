// Production extension in an isolated local mock host. No real model/API calls.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),path);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'}[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const checks=[],errors=[];let externalRequests=0;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();externalRequests++;return r.abort();});
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
  await page.locator('[data-action="toggle"]').click();await page.locator('[data-action="modules-open"]').click();await page.locator('[name="taishi"]').check();await page.locator('[data-action="modules-save"]').click();await page.locator('[data-action="space-taishi"]').click();
  await page.evaluate(()=>{const app=wanjie_wuku_general_instance;window.mockCalls=[];app.model.request=async()=>{throw Error('Opening configuration must not request a model');};});
  await page.locator('[data-action="taishi-advanced"]').click();await page.locator('[name="collaborationMode"]').selectOption('deep');await page.locator('[name="collaborationSummary"]').check();
  assert.equal(await page.locator('[name="collaborationAttempts"]').inputValue(),'3');assert.equal(await page.evaluate(()=>mockCalls.length),0);
  const bounds=await page.locator('[data-taishi-advanced]').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert(bounds.scroll<=bounds.width+1,JSON.stringify({width,bounds}));
  await page.screenshot({path:resolve(out,`settings-${width}.png`)});await page.locator('[data-action="taishi-workflow-save"]').click();
  await page.waitForFunction(()=>wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].taishiCollaboration?.mode==='deep');
  await page.evaluate(()=>{
   const app=wanjie_wuku_general_instance,ctx=SillyTavern.getContext();ctx.chat[0].mes='太始天已纳入海蓝界。云岚已正式加入太始天。';app.settings.mode='st';
   app.model.request=async(p,{connection})=>{mockCalls.push(connection.task);const input=JSON.parse(p.user);
    if(connection.task==='taishiReview')return JSON.stringify({conflicts:[{candidateRefs:['world','person'],reason:'人物活动地点需要核对',suggestion:'确认人物当前所属世界'}],message:'有一组待确认'});
    if(connection.task==='taishiSummary')return JSON.stringify({message:'本轮候选请先核对；仅摘要，不写入档案。'});
    const world=connection.task==='taishiWorld',changes=[{candidateRef:world?'world':'person',name:world?'海蓝界':'云岚',type:world?'environment':'member',status:'active',recordId:world?'world':'companion',fields:world?{conditions:'群岛文明'}:{role:'灵植师'},details:world?{overview:'群岛文明'}:{profile:'沉稳的灵植师',world_id:'@candidate:world'},sourceIndex:0,quote:world?'太始天已纳入海蓝界。':'云岚已正式加入太始天。'}];return JSON.stringify({changes,message:'待确认',floorReviews:input.sources.map(s=>({sourceIndex:s.index,status:'reviewed',changeCount:changes.filter(c=>c.sourceIndex===s.index).length}))});
   };app.refresh();
  });
  await page.locator('[data-action="review-archives"]').first().click();await page.locator('[data-collaboration-conflict="0"]').waitFor();
  assert.deepEqual(await page.evaluate(()=>mockCalls),['taishiWorld','taishiPeople','taishiReview','taishiSummary']);
  assert.equal(await page.locator('[name="archive-change"]').count(),0);await page.locator('[data-action="taishi-conflict-keep"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.pendingArchiveReview?.changes.length===2);
  await page.locator('[name="archive-change"]').first().waitFor({timeout:3000}).catch(async error=>{await page.screenshot({path:resolve(out,'failure.png')});console.log(await page.evaluate(()=>({notice:wanjie_wuku_general_instance.ui.notice,body:document.querySelector('.wjwk-dialog')?.textContent?.slice(-3000),pending:wanjie_wuku_general_instance.pendingArchiveReview?.issues})));throw error;});assert.equal(await page.evaluate(()=>mockCalls.length),4);assert.equal(await page.locator('[name="archive-change"]').count(),2);
  const dialogBounds=await page.locator('.wjwk-dialog').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert(dialogBounds.scroll<=dialogBounds.width+1,JSON.stringify({width,dialogBounds}));
  await page.screenshot({path:resolve(out,`preview-${width}.png`)});
  await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives).length===2);
  const saved=await page.evaluate(()=>{const app=wanjie_wuku_general_instance,p=app.store.read().powers[app.powerId],rs=Object.values(p.archives),world=rs.find(r=>r.specific.recordId==='world'),person=rs.find(r=>r.specific.recordId==='companion');return {linked:person.specific.fields.world_id===world.id,noPreviewIds:!JSON.stringify(p).includes('preview:'),count:mockCalls.length};});assert(saved.linked&&saved.noPreviewIds);assert.equal(saved.count,4);
  await page.reload();await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);const restored=await page.evaluate(()=>Object.values(wanjie_wuku_general_instance.store.read().powers).find(p=>p.taishiCollaboration?.mode==='deep')?.taishiCollaboration);assert.equal(restored.summary,true);
  checks.push({width,settingsPersisted:true,openingNoCalls:true,reviewAdvisoryOnly:true,localConflictChoice:true,realIdsAfterSave:true,noOverflow:true,modelCalls:4});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);await writeFile(resolve(out,'evidence.json'),JSON.stringify({checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false},null,2));console.log(JSON.stringify({checks:checks.length,errors,externalRequests,paidCalls:0,realHostAcceptance:false}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
