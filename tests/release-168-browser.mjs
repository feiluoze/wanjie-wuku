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
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async()=>{
   const a=wanjie_wuku_general_instance,{createPower,clone,hash,stable}=await import('/src/core.js'),{builtinEntries}=await import('/src/builtin-worldbook.js'),{normalizeArchiveBatch,applyArchiveChanges}=await import('/src/archive-review.js');
   const p=createPower(builtinEntries().find(e=>e.name==='万界网购'));SillyTavern.getContext().chat=[];
   const raw={type:'record',recordId:'orders',name:'铁剑订单',status:'active',sourceIndex:-1,details:{item:'第一笔铁剑'}};
   const b=normalizeArchiveBatch({changes:[raw]},p,[],[],'玩家确认第一笔铁剑订单');applyArchiveChanges(p,b.changes,[],new Map([[0,null]]),[]);
   const first=Object.values(p.archives)[0],second=clone(first);second.id='second-order';second.specific.fields.item='第二笔铁剑';p.archives[second.id]=second;
   await a.store.transact(s=>{s.powers={[p.id]:p};});a.powerId=p.id;a.settings.mode='off';a.refresh();a.ui.setOpen(true);
   const data={changes:[{...raw,details:{progress:'已交付'}}]},playerNote='玩家确认铁剑订单已交付',batch=normalizeArchiveBatch(data,p,[],[],playerNote),snap=a.contextSnapshot();
   a.pendingArchiveReview={...batch,powerId:p.id,captured:a.store.capture(),contextHash:hash(stable(snap.hashes)),data,sources:[],playerNote};
   a.ui.showArchiveReview(a.pendingArchiveReview,p,[]);
  });
  assert(await page.locator('.wjwk-sync-summary').isVisible());
  await page.getByText('查看未通过的条目',{exact:true}).click();
  const picker=page.locator('[data-ambiguous-target="0"]'),options=await picker.locator('option').allTextContents();
  assert.notEqual(options[1],options[2]);assert(options[1].includes('第一笔铁剑'));assert(options[2].includes('第二笔铁剑'));await picker.selectOption({index:1});await page.locator('[data-action="choose-archive-target"]').click();
  await page.waitForFunction(()=>wanjie_wuku_general_instance.pendingArchiveReview.issues.length===0);assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.pendingArchiveReview.changes.length),1);assert(await page.evaluate(()=>Object.values(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives).every(r=>!r.specific.fields.progress)));assert(!(await page.locator('.wjwk-toast').isVisible()));
  await page.screenshot({path:resolve(out,`target-success-${width}.png`)});
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.ui.closeDialog();a.ui.render(a.ui.view);});
  await page.evaluate(async()=>{
   const a=wanjie_wuku_general_instance,{normalizeArchiveBatch,applyArchiveChanges}=await import('/src/archive-review.js');
   await a.store.transact(state=>{const p=state.powers[a.powerId],batch=normalizeArchiveBatch({changes:[{type:'record',recordId:'assets',name:'库存底稿',status:'active',sourceIndex:-1,details:{}}]},p,[],[],'玩家确认库存底稿已经存在');if(batch.issues.length)throw Error(JSON.stringify(batch.issues));applyArchiveChanges(p,batch.changes,[],new Map([[0,null]]),[]);});
   a.refresh();a.ui.showArchiveLibrary({pending:true});
  });
  assert.equal(await page.locator('[data-library-results] .wjwk-archive-card').count(),1);assert((await page.locator('[data-library-results]').textContent()).includes('库存底稿'));
  await page.locator('[data-library-pending]').uncheck();assert.equal(await page.locator('[data-library-results] .wjwk-archive-card').count(),3);
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.ui.closeDialog();a.ui.setAIActivity({id:777,status:'running',label:'输入量显示检查',phase:'等待',budget:{total:10086,system:10084,user:0,assistant:2},elapsed:0});});
  assert((await page.locator('[data-ai-budget]').textContent()).includes('10,086'));assert((await page.locator('[data-ai-budget]').textContent()).includes('非计费量'));
  await page.locator('.wjwk-sidebar-tools > summary').click();await page.locator('[data-action="simple-mode"]').click();
  assert(await page.locator('.wjwk-window.wjwk-simple').count());await page.locator('[data-action="simple-mode"]').click();assert.equal(await page.locator('.wjwk-window.wjwk-simple').count(),0);
  checks.push({width,summaryVisible:true,targetPickerSucceeded:true,distinctLabels:true,noPrematureSave:true,pendingFilterWorks:true,budgetVisible:true,simpleModeToggles:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const evidence={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.close();}
