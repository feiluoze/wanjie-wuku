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


 const recovery=await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance,c=a.store.context(),core=await import('/src/core.js'),ar=await import('/src/archives.js');
  const p=core.createPower(core.importBook({entries:{1:{content:'记录实际完成的任务。',comment:'本地自编词条'}}},'本地测试')[0]);
  await a.store.transact(s=>{s.powers[p.id]=p;});a.powerId=p.id;
  await a.store.transact(s=>{const power=s.powers[p.id],r=ar.saveArchive(power,{name:'本地工具',type:'record',status:'active',fields:{description:'已修复'}},ar.archiveSource(c.chat,'本地记录'));ar.saveArchiveUpdate(power,{},[r],[],{chat:c.chat});});
  const raw=c.chatMetadata.extensions[core.MODULE_ID];raw.powers[p.id].lastArchiveUpdate.records.push({...raw.powers[p.id].lastArchiveUpdate.records[0]});
  a.refresh();a.ui.setOpen(true);
  return {count:a.store.read().powers[p.id].lastArchiveUpdate.records.length,warning:document.body.textContent.includes('摘要已去重'),facts:Object.keys(a.store.read().powers[p.id].archives).length};
 });
 assert.deepEqual(recovery,{count:1,warning:true,facts:1});
 await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance,core=await import('/src/core.js');const c=a.store.context();
  a.store.storageImpl=null;a.store.pendingSaves.clear();const power=c.chatMetadata.extensions[core.MODULE_ID].powers[a.powerId];Object.values(power.archives)[0].status='broken';
  const t=a.runtimeLog.begin('本地故障测试');a.runtimeLog.step(t,'本地检查',{count:1});a.runtimeLog.finish(t,'失败');
  a.refresh();a.ui.setOpen(true);
 });
 await page.getByRole('heading',{name:'当前档案暂不可读取'}).waitFor();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+`/unreadable-${width}.png`});}
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出脱敏日志',exact:true}).click();const download=await downloadPromise;const exported=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.equal(exported.version,'1.3.9');assert(exported.records.some(r=>r.label==='本地故障测试'));
 await page.getByRole('button',{name:'运行日志',exact:true}).click();await page.locator('[data-runtime-log]').waitFor();
 assert.equal(external,0);assert.deepEqual(errors,[]);console.log('PASS: duplicate summary recovery retains facts; unreadable archive still exports and opens logs; 1440/390/320 no overflow; no external requests');
}finally{await browser?.close();server.close();}
