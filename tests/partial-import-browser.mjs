import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];let external=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(external++,r.abort()));
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
 await page.evaluate(async()=>{
 const a=wanjie_wuku_general_instance;await a.openTaishi();a.settings.mode='st';a.ui.setOpen(true);a.ui.showAIWorldbooks=()=>{};window.calls=0;
 a.openTaishiStructure();await a.saveTaishiStructure({mode:'single',worldName:'主星'});const ctx=SillyTavern.getContext();ctx.loadWorldInfo=async()=>({entries:{1:{uid:1,comment:'【世界】主星',content:'【世界】主星\n世界设定。\n【人物】普通官员\n现任郡守。'}}});
 await a.store.transact(s=>{s.powers[a.powerId].taishiBuildReferences={mode:'manual',books:[{name:'书',entryIds:['1']}]};});
 a.model.request=async()=>{calls++;return JSON.stringify({changes:[{type:'record',name:'主星',status:'active',recordId:'world',fields:{description:'已成立主世界'},details:{overview:'完整设定'},sourceIndex:-1},{type:'record',name:'知识',status:'active',recordId:'available',fields:{unknown_blob:{text:'保留内容'}},details:{current:'已有知识'},sourceIndex:-1},{type:'member',name:'普通官员',status:'active',recordId:'companion',fields:{role:'郡守'},details:{profile:'普通居民'},sourceIndex:-1}]});};await a.initializeTaishi();
 });
 assert.equal(await page.locator('[data-build-people]').isChecked(),false);
 await page.locator('[data-action="taishi-build-run"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();await page.locator('[data-action="apply-archive-review"]').click();
 await page.waitForFunction(()=>wanjie_wuku_general_instance.pendingArchiveReview?.data.changes.length===1);
 assert.equal(await page.evaluate(()=>calls),1);assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.contextSnapshot().state.powers[wanjie_wuku_general_instance.powerId].taishiBuild.next),0);
 const restored=await page.evaluate(async()=>{const a=wanjie_wuku_general_instance,{decodeCheckpoint}=await import('/src/review-checkpoint.js'),s=a.contextSnapshot();const p=decodeCheckpoint(localStorage.getItem('wanjie-wuku:review-checkpoint:'+s.chatKey),s);a.pendingArchiveReview=p;return p.data.changes.length;});assert.equal(restored,1);
 await page.evaluate(async()=>{const a=wanjie_wuku_general_instance,p=a.pendingArchiveReview,i=p.issues.findIndex(i=>i.repairable),old=Object.values(a.contextSnapshot().state.powers[a.powerId].archives).find(r=>r.name==='知识');await a.repairArchiveCandidate({index:i,values:{['repair-candidate:'+i]:JSON.stringify({...p.issues[i].candidate,fields:{description:old.fields.description},details:{current:'已有知识',use:'保留内容'}})}});});
 await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.contextSnapshot().state.powers[wanjie_wuku_general_instance.powerId].taishiBuild.next===1);
 const people=await page.evaluate(()=>Object.values(wanjie_wuku_general_instance.contextSnapshot().state.powers[wanjie_wuku_general_instance.powerId].archives).filter(r=>r.specific?.recordId==='companion').length);assert.equal(people,0);assert.equal(await page.evaluate(()=>calls),1);await page.evaluate(()=>wanjie_wuku_general_instance.initializeTaishi());
 await page.locator('.wjwk-dialog').screenshot({path:resolve(out,'partial-completed-mobile.png')});
 const evidence={defaultWorldOnly:true,worldTypeRecovered:true,partialSavedThenCached:true,restoredRemaining:restored,localRepairCompletedBatch:true,ordinaryPeopleCreated:people,mockedModelCalls:1,externalRequests:external,consoleErrors:errors,width:390};assert.equal(external,0);assert.deepEqual(errors,[]);await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));

}finally{await browser?.close();server.close();}
