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
 for(const width of [320,390,1440])for(const theme of ['dark','light']){
  const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async theme=>{
   const a=wanjie_wuku_general_instance,{createPower,clone}=await import('/src/core.js'),{builtinEntries}=await import('/src/builtin-worldbook.js'),{normalizeArchiveBatch,applyArchiveChanges}=await import('/src/archive-review.js');
   const p=createPower(builtinEntries().find(e=>e.name==='万界网购'));SillyTavern.getContext().chat=[];
   const raw={type:'record',recordId:'orders',name:'铁剑订单',status:'active',sourceIndex:-1,details:{item:'铁剑一把'}};
   const b=normalizeArchiveBatch({changes:[raw]},p,[],[],'玩家确认第一笔铁剑订单');applyArchiveChanges(p,b.changes,[],new Map([[0,null]]),[]);
   const first=Object.values(p.archives)[0],second=clone(first);second.id='second-order';second.specific.fields.item='铁剑两把';p.archives[second.id]=second;
   await a.store.transact(s=>{s.powers={[p.id]:p};});a.powerId=p.id;a.settings.theme=theme;a.settings.mode='off';a.refresh();a.ui.setOpen(true);
   a.query=()=>{throw Error('Unexpected model call');};window.originalArchives=clone(p.archives);
  },theme);
  await page.locator('[data-action="power-management"]').click();assert(await page.getByText('删除当前词条…',{exact:true}).isVisible());
  await page.locator('.wjwk-dialog [data-action="delete-power"]').click();assert(await page.locator('[data-action="confirm-delete-power"]').isVisible());
  assert.equal(await page.evaluate(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers).length),1);await page.locator('.wjwk-dialog [data-action="dialog-close"]').first().click();
  await page.locator('[data-action="power-management"]').click();await page.locator('.wjwk-dialog [data-action="toggle-power"]').click();await page.waitForFunction(()=>!wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].active);
  await page.locator('[data-action="power-management"]').click();await page.locator('.wjwk-dialog [data-action="toggle-power"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].active);
  await page.locator('.wjwk-health > summary').click();await page.locator('.wjwk-health [data-action="archive-merge-open"]').click();
  await page.locator('[data-action="archive-merge-compare"]').click();await page.locator('select[name="merge-choice:0"]').selectOption('left');
  await page.locator('[data-action="archive-merge-preview"]').click();assert.equal(await page.evaluate(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives).length),2);
  assert(await page.getByText('确认保存，可撤销',{exact:true}).isVisible());await page.screenshot({path:resolve(out,`merge-${width}-${theme}.png`)});
  await page.locator('[data-action="archive-correct-apply"]').click();await page.waitForFunction(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives).length===1);
  await page.evaluate(()=>wanjie_wuku_general_instance.openArchiveUndo());await page.locator('[data-action="archive-undo-confirm"]').click();await page.waitForFunction(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives).length===2);
  assert(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives)===JSON.stringify(window.originalArchives)));
  await page.evaluate(async()=>{
   const a=wanjie_wuku_general_instance,{normalizeArchiveBatch}=await import('/src/archive-review.js'),{hash,stable}=await import('/src/core.js'),snap=a.contextSnapshot(),p=snap.state.powers[a.powerId];
   const raw=(name,details)=>({type:'record',recordId:'orders',name,status:'active',sourceIndex:-1,details});
   const data={changes:[raw('新盾牌订单',{item:'盾牌'}),raw('错误列订单',{invalid:'错误列'})]},playerNote='玩家确认订单已存在',batch=normalizeArchiveBatch(data,p,[],[],playerNote);
   a.pendingArchiveReview={...batch,powerId:p.id,captured:a.store.capture(),contextHash:hash(stable(snap.hashes)),data,sources:[],playerNote};a.refresh();a.ui.showArchiveReview(a.pendingArchiveReview,p,[]);
  });
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.ui.closeDialog();a.refresh();});await page.locator('[data-action="attention-open"]').click();
  assert(await page.getByText('打开这份整理结果',{exact:true}).isVisible());await page.locator('[data-action="attention-review"]').click();
  assert((await page.locator('.wjwk-sync-summary').textContent()).includes('待处理 1'));
  await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.pendingArchiveReview.data.changes.length===1);
  assert.equal(await page.evaluate(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives).length),3);
  await page.getByText('查看未通过的条目',{exact:true}).click();await page.getByText('本地修正字段 · 不调用AI',{exact:true}).click();
  const fixed=await page.evaluate(()=>({...wanjie_wuku_general_instance.pendingArchiveReview.data.changes[0],details:{item:'第二面盾牌'}}));
  await page.locator('textarea[name="repair-candidate:0"]').fill(JSON.stringify(fixed));await page.locator('[data-action="repair-archive-candidate"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.pendingArchiveReview.issues.length===0);
  await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>!wanjie_wuku_general_instance.pendingArchiveReview);assert.equal(await page.evaluate(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives).length),4);
  await page.evaluate(async()=>{const a=wanjie_wuku_general_instance,{AIActivity}=await import('/src/ai-activity.js');a.aiActivity=new AIActivity(s=>a.ui.setAIActivity(s));await a.aiActivity.run('累计输入检查',async()=>{a.aiActivity.reading({floors:[3,5],contextFloors:[1],detailRecords:2,identityRecords:10});a.aiActivity.budget({total:100});a.aiActivity.budget({total:200});});});
  assert((await page.locator('[data-ai-budget]').textContent()).includes('累计 300'));assert((await page.locator('[data-ai-budget]').textContent()).includes('2 次'));assert((await page.locator('[data-ai-reading]').textContent()).includes('第 3、5 层'));
  await page.evaluate(()=>wanjie_wuku_general_instance.ui.setAIActivity({id:998,status:'error',label:'连接检查',phase:'接口请求失败',requestStage:'transport',elapsed:0}));
  await page.locator('[data-ai-recovery] [data-action="settings"]').click();assert(await page.locator('.wjwk-settings-dialog').isVisible());
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert(!overflow);
  checks.push({width,theme,manualMerge:true,previewBeforeSave:true,undoRestores:true,partialSaveAndLocalRepair:true,connectionRecovery:true,noHorizontalOverflow:true,powerManagement:true,attentionDirect:true,scopeAndUsage:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const evidence={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.close();}
