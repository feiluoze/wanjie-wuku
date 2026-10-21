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
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async theme=>{
   const a=wanjie_wuku_general_instance,{createPower}=await import('/src/core.js'),{builtinEntries}=await import('/src/builtin-worldbook.js');
   const p=createPower(builtinEntries()[0]);await a.store.transact(s=>{s.powers={[p.id]:p};});a.powerId=p.id;a.settings.theme=theme;a.settings.mode='off';a.refresh();
   window.attentionView={...a.ui.view,pendingArchiveReview:{powerId:p.id,captured:{stateId:a.ui.view.state.id,revision:a.ui.view.state.revision},changes:[{},{}]}};
   a.ui.render(window.attentionView);
  },theme);
  const badge=page.locator('.wjwk-fab .wjwk-attention-badge');assert.equal(await badge.textContent(),'2');assert(await badge.isVisible());
  await page.locator('.wjwk-fab-fold').click();const edge=page.locator('.wjwk-edge-tab .wjwk-attention-badge');assert(await edge.isVisible());
  await page.screenshot({path:resolve(out,`attention-${width}-${theme}.png`)});
  assert((await page.locator('.wjwk-edge-tab').getAttribute('aria-label')).includes('2'));
  const rect=await edge.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width);
  await page.evaluate(()=>{const u=wanjie_wuku_general_instance.ui;u.restoreFloating(false);u.setOpen(true);u.render(window.attentionView);});assert(await badge.isVisible());
  await page.evaluate(()=>wanjie_wuku_general_instance.ui.render({...window.attentionView,pendingArchiveReview:null}));assert(!(await badge.isVisible()));
  await page.evaluate(()=>wanjie_wuku_general_instance.ui.render({...window.attentionView,state:null}));assert(!(await badge.isVisible()));
  checks.push({width,theme,foldedBadge:true,openingPreserves:true,completionClears:true,chatSwitchClears:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const evidence={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.close();}
