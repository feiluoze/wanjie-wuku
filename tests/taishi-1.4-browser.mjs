import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let external=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external++;return r.abort();});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);


 const ids=await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance;await a.openTaishi();const {saveArchive,archiveSource}=await import('/src/archives.js'),{creationConfig}=await import('/src/creation-config.js');const ids={};
  await a.store.transact(s=>{const p=s.powers[a.powerId],c=creationConfig(p),add=(name,recordId,fields,type='record')=>{const d=c.records.find(r=>r.id===recordId);return saveArchive(p,{name,type,status:'active',fields:type==='environment'?{conditions:'本地示例已确认'}:{description:'本地示例已确认'},specific:{adapterId:c.id,recordId,version:c.version,label:d.label,labels:Object.fromEntries(d.fields.map(f=>[f.id,f.label])),fields}},archiveSource(a.store.context().chat,'玩家确认本地示例'));};
   ids.world=add('海蓝界','world',{overview:'群岛文明',era:'航海时代',geography:'群岛与内海',factions:'海商联盟',resources:'潮汐能源',crafts:'航海与造船',events:'港口重建'},'environment').id;
   ids.region=add('青岚山脉','region',{world_id:ids.world,world:'海蓝界',overview:'内陆山脉'}).id;
   ids.descent=add('青岚展开','manifestation',{world_id:ids.world,world:'海蓝界',region_id:ids.region,mode:'局部',anchor:'城外',condition:'已经展开'}).id;
  });a.refresh();a.ui.setOpen(true);return ids;
 });
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('.wjwk-brand strong').first().evaluate(e=>e.getBoundingClientRect().height<50));await page.screenshot({path:out+`/home-${width}.png`});}
 await page.locator('[data-action="taishi-world-report"]').first().click();for(const text of ['时代概况','山河与文明','势力格局','资源经济','能力与技艺','当前变化'])assert((await page.locator('[data-world-report]').textContent()).includes(text));
 await page.screenshot({path:out+'/world-report-320.png'});await page.locator('[data-action="dialog-close"]').click();
 const before=await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read()));
 await page.getByText('时间与降界',{exact:true}).click();await page.getByRole('button',{name:'垂天 / 降界',exact:true}).click();await page.locator('[name="regionId"]').selectOption(ids.region);await page.locator('[name="note"]').fill('以城外为锚点，保留山内时间流速。');await page.getByRole('button',{name:'写入正文草稿',exact:true}).click();
 assert((await page.locator('#send_textarea').inputValue()).includes('青岚山脉'));assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())),before);
 await page.getByRole('button',{name:'时间与改设资格',exact:true}).click();await page.locator('[name="event"]').fill('第10层远征结束');await page.locator('[name="external"]').fill('2');await page.locator('[name="rate"]').fill('500');await page.getByText('首次登记：时间基准与主世界身份',{exact:true}).click();await page.locator('[name="main"]').check();await page.locator('[name="yearDays"]').fill('365');
 await page.getByRole('button',{name:'换算并核对',exact:true}).click();assert((await page.locator('[data-taishi-clock-preview]').textContent()).includes('已可千年改设'));assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())),before);await page.screenshot({path:out+'/clock-preview-320.png'});
 await page.getByRole('button',{name:'确认登记',exact:true}).click();
 assert.equal(await page.evaluate(async id=>{const {readWorldClock,clockSummary}=await import('/src/taishi-clock.js');return clockSummary(readWorldClock(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives[id])).totalYears;},ids.world),'1000');
 await page.getByRole('button',{name:'时间与改设资格',exact:true}).click();await page.getByRole('button',{name:'首次设定 / 千年改设',exact:true}).click();await page.locator('[name="event"]').fill('第11层改设完成');await page.locator('[name="completed"]').check();await page.getByRole('button',{name:'核对资格并预览登记',exact:true}).click();await page.getByRole('button',{name:'确认登记',exact:true}).click();
 assert.equal(await page.evaluate(async id=>{const {readWorldClock,clockSummary}=await import('/src/taishi-clock.js');return clockSummary(readWorldClock(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives[id])).eligible;},ids.world),false);
 await page.reload();await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);await page.evaluate(()=>wanjie_wuku_general_instance.openTaishi());assert.equal(await page.evaluate(async id=>{const {readWorldClock}=await import('/src/taishi-clock.js');return readWorldClock(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives[id]).settings.length;},ids.world),1);
 assert.equal(external,0);assert.deepEqual(errors,[]);console.log('PASS: world homepage and six sections; descent writes draft only; clock preview, confirm, reset, reload; 1440/390/320 no overflow; no external/model requests');
}finally{await browser?.close();server.close();}
