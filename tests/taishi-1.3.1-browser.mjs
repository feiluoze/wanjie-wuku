// Production extension in a controlled mock host. No external model requests.
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
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];let externalRequests=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();externalRequests++;return r.abort();});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
 await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance;await a.openTaishi();
  const {saveArchive,archiveSource}=await import('/src/archives.js'),{taishiConfig}=await import('/src/taishi.js'),{hash}=await import('/src/core.js');
  await a.store.transact(s=>{
   const p=s.powers[a.powerId],schema=taishiConfig().records.find(r=>r.id==='companion');
   const content='云岚：银灰色眼睛；平时寡言，遇到熟悉的人会主动关照。<script>window.BAD_SOURCE_EXECUTED=true</script>';
   const record=saveArchive(p,{name:'云岚',type:'member',status:'active',fields:{role:'灵植师'},specific:{adapterId:'wuku.primordial_world',recordId:'companion',version:'1.2.0',label:'人物',labels:Object.fromEntries(schema.fields.map(f=>[f.id,f.label])),fields:{profile:'照看灵圃的年轻技师，寡言而细心。',world:'海蓝界',role:'灵植师',appearance:'银灰色眼睛，惯穿便于劳作的短衫。',personality:'寡言而细心；遇事先观察，对熟人会主动关照。',background:'早年随商队远行，后回到家族照看灵圃。',motivation:'希望用自己的手艺维持家族生计。',speech:'说话简短，解释技艺时会耐心举例。',crafts:'擅长育苗、辨认药草和修补灌溉器具。',action:'检修灵圃的水渠。',source_profile:JSON.stringify([{book:'人物设定书',id:'7',title:'云岚',part:1,offset:0,end:content.length,fingerprint:hash(content),content}])}}},archiveSource(SillyTavern.getContext().chat,'玩家确认世界书设定'));
   window.profileId=record.id;
  });
  a.refresh();document.querySelector('#send_textarea').value='云岚';a.openMemory();
 });
 assert.equal(await page.locator('[name="taishi:world:budget"]').inputValue(),'6000');
 assert.equal(await page.locator('[name="taishi:people:budget"]').inputValue(),'12000');
 await page.locator('[name="taishi:world:auto"]').uncheck();await page.locator('[data-action="save-memory"]').click();await page.waitForFunction(()=>!wanjie_wuku_general_instance.committing&&wanjie_wuku_general_instance.ui.modal.hidden);
 await page.evaluate(()=>wanjie_wuku_general_instance.openMemory());assert.equal(await page.locator('[name="taishi:world:auto"]').isChecked(),false);
 await page.screenshot({path:out+'/memory-1440.png'});
 await page.evaluate(()=>wanjie_wuku_general_instance.openArchive(window.profileId));
 assert.equal(await page.getByRole('heading',{name:'能力与技艺',exact:true}).count(),1);
 assert.equal(await page.getByRole('heading',{name:'战斗方式',exact:true}).count(),0);
 assert.equal(await page.locator('textarea[name="specific:source_profile"]').count(),0);
 const original=page.locator('.wjwk-taishi-brief > details');assert.equal(await original.getAttribute('open'),null);
 await original.locator(':scope > summary').click();await original.locator('details > summary').click();
 assert((await original.innerText()).includes('<script>'));assert.equal(await page.evaluate(()=>window.BAD_SOURCE_EXECUTED),undefined);
 await original.locator(':scope > summary').click();
 await page.screenshot({path:out+'/profile-1440.png'});
 await page.setViewportSize({width:390,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/profile-390.png'});
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(externalRequests,0);
 await writeFile(out+'/result.json',JSON.stringify({passed:true,externalRequests,errors,viewports:[1440,390]},null,2));
 console.log('1.3.1 browser: independent settings persist, daily crafts panel, folded original, safe rendering, responsive layout; no external requests.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
