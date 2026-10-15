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
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let external=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(external++,r.abort()));
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
 await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance;await a.openTaishi();a.settings.mode='st';a.settings.theme='parchment';a.refresh();a.ui.setOpen(true);window.structureCalls=0;window.referenceReads=0;
  const ctx=SillyTavern.getContext();ctx.getWorldInfoNames=()=>['合流世界设定'];ctx.loadWorldInfo=async()=>{referenceReads++;return {entries:{1:{uid:1,comment:'主星与板块',content:'合流星是唯一主世界。云海板块与高天神庭是其中地域，文明跨越山海发展。'},2:{uid:2,comment:'云海板块',content:'云海板块拥有林海、河谷与城邦，仙道和魔药共同发展。'},3:{uid:3,comment:'人物档案',content:'林海学者负责城邦守备，研究符文与魔药，正在核对远行者带回的典籍。'}}};};
  a.model.request=async prompt=>{structureCalls++;const u=JSON.parse(prompt.user);window.lastStructure=u.worldStructure;const book=u.attachedWorldbooks.books[0];const refs=id=>[{book:book.name,id,part:1}];return JSON.stringify({changes:[
   {archiveId:u.worldStructure.worldId,type:'environment',name:u.worldStructure.worldName,status:'active',recordId:'world',fields:{conditions:'多种文明共同生活的成熟主星'},details:{overview:'合流星的诸地文明共同生活在一套天地之中，历史与山海彼此相连。',era:'城邦、学会与远行者共同推动交流',geography:'东方林海、西方高原与南方群岛',events:'远行者带回新的典籍，各地学者正在核对已有知识。'},settingRefs:refs('1'),sourceIndex:-1},
   {type:'environment',name:'云海板块',status:'active',recordId:'world',fields:{conditions:'森林与河流交错的大地'},details:{overview:'灵植、炼丹与星象学共同发展的地域。',geography:'长河连接林海与城邦',resources:'林木、药材与符文工艺',abilities:'仙道与魔药共同发展'},settingRefs:refs('2'),sourceIndex:-1},
   {type:'member',name:'林海学者',status:'active',recordId:'companion',fields:{role:'城邦守备学者',traits:'符文、药剂与护卫术'},details:{world:'云海板块',profile:'行走于林海和城邦之间的学者，负责守备与典籍整理。',role:'城邦守备学者',abilities:'符文、药剂与护卫术',combat_style:'符文，药剂与护卫术',action:'正在核对远行者带回的典籍',location:'林海城邦 · 静河书院'},settingRefs:refs('3'),sourceIndex:-1}
  ]});};await a.initializeTaishi();
 });
 assert.equal(await page.locator('[data-taishi-structure]').count(),1);assert.equal(await page.evaluate(()=>referenceReads),0);
 await page.locator('[data-action="taishi-structure-save"]').click();assert.equal(await page.locator('[data-taishi-structure]').count(),1);
 await page.locator('[name="mode"][value="single"]').check();await page.locator('[name="worldName"]').fill('合流星');
 await page.locator('.wjwk-dialog').screenshot({path:resolve(out,'import-choice-desktop.png')});
 await page.locator('[data-action="taishi-structure-save"]').click();await page.locator('[data-ai-reference-dialog]').waitFor();
 assert.equal(await page.evaluate(()=>structureCalls),0);
 await page.locator('[data-action="ai-ref-book"][data-book="合流世界设定"]').click();await page.locator('[data-action="ai-ref-save"]').click();
 await page.locator('[data-taishi-build]').waitFor();assert((await page.locator('.wjwk-structure-summary').innerText()).includes('单世界 · 合流星'));
 await page.locator('[data-build-people]').check();await page.locator('[data-action="taishi-build-run"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();
 const candidate=await page.evaluate(()=>{const a=wanjie_wuku_general_instance,p=a.pendingArchiveReview;return {types:p.changes.map(c=>c.specific.recordId),issues:p.issues,message:p.message,worldId:lastStructure.worldId};});
 assert.deepEqual(candidate.types,['world','region','companion']);assert.deepEqual(candidate.issues,[]);assert(candidate.message.includes('单世界结构'));
 await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>!wanjie_wuku_general_instance.pendingArchiveReview);
 if(await page.locator('[data-action="ai-status-close"]').isVisible())await page.locator('[data-action="ai-status-close"]').click();
 const ids=await page.evaluate(()=>{const a=wanjie_wuku_general_instance,p=a.store.read().powers[a.powerId],rows=Object.values(p.archives);return {worlds:rows.filter(r=>r.specific.recordId==='world').length,region:rows.find(r=>r.specific.recordId==='region').id,person:rows.find(r=>r.specific.recordId==='companion').id,root:p.taishiWorldStructure.worldId,overview:p.archives[p.taishiWorldStructure.worldId].specific.fields.overview};});
 assert.equal(ids.worlds,1);assert(!ids.overview.includes('待导入'));assert.equal(await page.evaluate(()=>structureCalls),1);
 for(const width of [1440,390])for(const theme of ['parchment','dark']){
  await page.setViewportSize({width,height:1000});await page.evaluate(theme=>{const a=wanjie_wuku_general_instance;a.settings.theme=theme;a.refresh();},theme);
  for(const [kind,id] of [['world',ids.root],['region',ids.region],['person',ids.person]]){
   await page.evaluate(({kind,id})=>{const a=wanjie_wuku_general_instance;if(kind==='world')a.ui.showTaishiWorldReport(id);else a.openArchive(id);},{kind,id});
   const report=page.locator('[data-taishi-brief]');await report.waitFor();assert.equal(await report.locator('.wjwk-report-masthead h3').count(),1);assert((await report.locator('.wjwk-report-section').count())>0);
   const size=await page.locator('.wjwk-dialog-body').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));assert(size.scroll<=size.width+2);
   await page.locator('.wjwk-dialog').screenshot({path:resolve(out,`brief-${kind}-${width}-${theme}.png`)});await page.locator('[data-action="dialog-close"]').click();
  }
 }
 const evidence={choiceBeforeBookRead:true,requiredChoice:true,requestContainsStructure:true,misclassifiedWorldBecomesRegion:true,savedWorlds:ids.worlds,rootPlaceholderReplaced:true,mockedModelCalls:1,externalRequests:external,briefChecks:12,widths:[1440,390],themes:['parchment','dark'],consoleErrors:errors};
 assert.equal(external,0);assert.deepEqual(errors,[]);await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.close();}

