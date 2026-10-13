import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),r=relative(process.cwd(),p);if(r.startsWith('..')||isAbsolute(r))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];let external=0;page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external++;return r.abort();});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.settings.theme='dark';a.ui.setOpen(true);a.refresh();});
 const colors=[];
 for(const mode of ['wuku','mmlc','taishi']){
  await page.evaluate(async mode=>{const a=wanjie_wuku_general_instance;if(mode==='wuku')await a.action('space-wuku',{});else if(mode==='mmlc')await a.action('add-mmlc',{});else await a.openTaishi();a.settings.theme='dark';a.ui.setOpen(true);a.refresh();},mode);
  colors.push(await page.locator('#wjwk-root').evaluate(e=>getComputedStyle(e).getPropertyValue('--wk-module')));await page.screenshot({path:out+'/'+mode+'-formal-desktop.png'});
 }
 assert.equal(new Set(colors).size,3);
 await page.locator('[data-action="taishi-advanced"]').click();assert.equal(await page.locator('.wjwk-modal details[open]').count(),0);assert(await page.locator('[data-action="taishi-workflow-save"]').isVisible());await page.locator('[data-action="dialog-close"]').click();
 await page.evaluate(()=>wanjie_wuku_general_instance.ui.dialog('折叠与校验',`<form><p data-wjwk-help>一段按需展开的说明。</p><p role="status">未保存 · 1项候选</p><p class="wjwk-error">需要确认的错误</p><details><summary>更多设置</summary><label>名称<input name="name" required></label></details><button type="button" data-action="save-archive">保存</button></form>`));
 assert.equal(await page.locator('.wjwk-modal .wjwk-help[open]').count(),0);assert(await page.getByText('未保存 · 1项候选',{exact:true}).isVisible());assert(await page.getByText('需要确认的错误',{exact:true}).isVisible());assert(!(await page.locator('[name="name"]').isVisible()));await page.locator('[data-action="save-archive"]').click();assert(await page.locator('[name="name"]').isVisible());await page.locator('[data-action="dialog-close"]').click();
 for(const width of [390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('.wjwk-window').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);await page.screenshot({path:out+'/taishi-formal-'+width+'.png'});}
 await page.setViewportSize({width:1440,height:1050});await page.locator('.wjwk-design-actions [data-action="taishi-development"]').click();await page.screenshot({path:out+'/development-formal.png'});assert.deepEqual(errors,[]);assert.equal(external,0);console.log('PASS production UI: three palettes, folded explanations, visible status/errors, hidden required input expansion, advanced controls and 1440/390/320; zero external requests');
}finally{await browser?.close();server.close();}

