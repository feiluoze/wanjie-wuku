import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.env.WJWK_NODE_MODULES+'/package.json'),{chromium}=require('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://local');
 if(url.pathname==='/scripts/user.js'){res.setHeader('Content-Type','text/javascript');res.end('export const accountsEnabled=false;export const getCurrentUserHandle=()=>"default-user";');return;}
 if(url.pathname==='/entry-preview'){
  let html=await readFile('tests/no-chat-preview.html','utf8');
  html=html.replaceAll('../style.css','/style.css').replaceAll('./mock-host.js','/tests/mock-host.js').replaceAll('../index.js','/bootstrap.js');
  html=html.replace('<body>','<body><button id="extensionsMenuButton">魔术棒</button><div id="extensionsMenu"></div>');
  html=html.replace('const c=SillyTavern.getContext();','const c=SillyTavern.getContext();delete c.userHandle;');
  if(url.searchParams.has('late'))html=html.replace("await import('/bootstrap.js');","const get=SillyTavern.getContext;SillyTavern.getContext=()=>null;setTimeout(()=>SillyTavern.getContext=get,700);await import('/bootstrap.js');");
  res.setHeader('Content-Type','text/html');res.end(html);return;
 }
 try{const p=resolve('.','.'+url.pathname);if(relative(process.cwd(),p).startsWith('..'))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=`http://127.0.0.1:${server.address().port}`;
 await page.goto(base+'/entry-preview?late');await page.locator('#wjwk-wand-entry button').waitFor();
 await page.waitForFunction(()=>Boolean(globalThis.wanjie_wuku_general_instance));
 await page.locator('#wjwk-root .wjwk-fab').evaluate(n=>{n.style.display='none';});
 await page.locator('#wjwk-wand-entry button').click();await page.getByRole('heading',{name:'先打开一个角色聊天',exact:true}).waitFor();
 assert.equal(await page.locator('#wjwk-root').count(),1);
 await page.screenshot({path:resolve(out,'mobile-wand-welcome.png')});
 await page.evaluate(()=>{document.getElementById('extensionsMenu').remove();const n=document.createElement('div');n.id='extensionsMenu';document.body.append(n);});
 await page.waitForFunction(()=>document.querySelectorAll('#extensionsMenu #wjwk-wand-entry').length===1);
 await page.goto(base+'/tests/preview.html');await page.waitForFunction(()=>Boolean(globalThis.wanjie_wuku_general_instance));
 await page.locator('#wjwk-root [data-action="toggle"]').click();
 assert.equal(await page.locator('[data-action="space-taishi"]').count(),0);assert.equal(await page.locator('[data-action="space-mmlc"]').count(),0);
 await page.locator('[data-action="modules-open"]').click();await page.locator('[name="mmlc"]').check();await page.locator('[name="taishi"]').check();await page.locator('[data-action="modules-save"]').click();
 await page.locator('[data-action="space-mmlc"]').waitFor();await page.locator('[data-action="space-taishi"]').waitFor();
 await page.locator('[data-action="modules-open"]').click();await page.locator('[name="mmlc"]').uncheck();await page.locator('[name="taishi"]').uncheck();await page.locator('[data-action="modules-save"]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-action="space-taishi"]'));
 assert.equal(await page.evaluate(()=>Object.values(wanjie_wuku_general_instance.store.read().powers).filter(p=>p.active).length),0);
 await page.locator('[data-action="modules-open"]').click();await page.screenshot({path:resolve(out,'mobile-module-switches.png')});
 const failed=await browser.newPage({viewport:{width:390,height:844}});
 await failed.route('**/index.js',r=>r.abort());await failed.goto(base+'/entry-preview');
 await failed.getByText(/启动未完成/).waitFor();assert.equal(await failed.locator('#wjwk-wand-entry').count(),1);
 await failed.screenshot({path:resolve(out,'mobile-visible-startup-error.png')});
 await failed.unroute('**/index.js');
 // ES module failed imports are cached by the browser: refresh, rather than retry, is required for network import failures.
 await failed.reload();await failed.waitForFunction(()=>Boolean(globalThis.wanjie_wuku_general_instance));
 assert.deepEqual(errors,[]);
 console.log('PASS: mobile wand entry, delayed context, default-user without account endpoint, menu replacement, hidden floating button fallback, module toggles, visible import failure, refreshed recovery. Mock host, no model calls.');
}finally{await browser?.close();server.close();}
