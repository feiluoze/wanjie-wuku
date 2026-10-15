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
  const a=wanjie_wuku_general_instance;await a.openTaishi();a.settings.mode='st';a.ui.setOpen(true);window.calls=0;
  const ctx=SillyTavern.getContext();ctx.loadWorldInfo=async()=>({entries:{1000:{uid:1000,comment:'【地域】大陆·综合设定',content:'## 银城\n【地域】银城\n银城位于甲国北部。\n\n## 学者\n【人物】学者\n学者隶属星塔学院。\n\n## 星塔学院\n【组织】星塔学院\n已有学院。'}}});
  await a.store.transact(s=>{s.powers[a.powerId].taishiWorldStructure={mode:'multi',worldId:'',worldName:''};s.aiWorldbooks={mode:'manual',books:[{name:'合并书',entryIds:['1000']}]};});
  const {creationConfig}=await import('/src/creation-config.js');const def=creationConfig(a.contextSnapshot().state.powers[a.powerId]).records.find(r=>r.id==='organization'),field=def.fields.find(f=>!f.id.endsWith('_id')&&f.id!=='world').id;
  a.model.request=async()=>{calls++;return JSON.stringify({changes:[
   {type:'member',name:'学者',status:'active',recordId:'companion',fields:{role:'学院学者'},details:{profile:'已有设定的学者',organization_id:'星塔学院'},sourceIndex:-1},
   {type:'environment',name:'银城',status:'active',recordId:'region',fields:{conditions:'城邦地域'},details:{geography:'甲国北部'},settingRefs:[{book:'未选书',id:'1000'}],sourceIndex:-1},
   {type:'record',name:'星塔学院',status:'active',recordId:'organization',fields:{description:'已有学院'},details:{[field]:'已有设定的学院'},sourceIndex:-1}
  ]});};await a.reviewArchives({setupReferences:true});
 });
 await page.locator('[data-action="retry-archive-references"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.pendingArchiveReview.issues.length),0);
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.pendingArchiveReview.changes[0].pendingLinks[0].name),'星塔学院');
 await page.locator('.wjwk-dialog').screenshot({path:resolve(out,'merged-links-preview-mobile.png')});
 await page.locator('[name="archive-change"][value="2"]').uncheck();await page.locator('[data-action="apply-archive-review"]').click();
 await page.waitForFunction(()=>wanjie_wuku_general_instance.committing===false);
 assert.equal(await page.evaluate(()=>Object.keys(wanjie_wuku_general_instance.contextSnapshot().state.powers[wanjie_wuku_general_instance.powerId].archives).length),0);
 await page.locator('[name="archive-change"][value="2"]').check();await page.locator('[data-action="apply-archive-review"]').click();
 await page.waitForFunction(()=>Object.keys(wanjie_wuku_general_instance.contextSnapshot().state.powers[wanjie_wuku_general_instance.powerId].archives).length===3);
 assert(await page.evaluate(()=>{const a=wanjie_wuku_general_instance,rows=Object.values(a.contextSnapshot().state.powers[a.powerId].archives);return rows.find(r=>r.name==='学者').specific.fields.organization_id===rows.find(r=>r.name==='星塔学院').id;}));
 assert.equal(await page.evaluate(()=>calls),1);
 const evidence={mergedSourceRetry:true,personBeforeOrganization:true,deselectedTargetWritesNothing:true,confirmedTargetUsesRealId:true,mockedModelCalls:1,externalRequests:external,consoleErrors:errors,width:390};assert.equal(external,0);assert.deepEqual(errors,[]);await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.close();}
