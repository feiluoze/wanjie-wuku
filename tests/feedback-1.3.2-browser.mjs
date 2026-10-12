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
  const a=wanjie_wuku_general_instance,{importBook,createPower}=await import('/src/core.js'),{saveArchive}=await import('/src/archives.js');
  const entry=importBook({entries:{1:{comment:'蝴蝶效应',content:'消耗因果点。因果点余额按实际记录。'}}},'测试')[0];const p=createPower(entry);
  const r=Object.values(p.resources)[0];if(!r)throw Error('missing resource');r.balance='0';window.resourceId=r.id;window.testPowerId=p.id;
  const record=saveArchive(p,{name:'采购订单',type:'record',status:'active',fields:{description:'已交付，订单记载实付56000。'}},{type:'manual',note:'测试订单'});window.recordId=record.id;
  await a.store.transact(s=>{s.powers[p.id]=p;});a.powerId=p.id;a.space='wuku';a.ui.space='wuku';a.ui.panel.hidden=false;a.refresh();
  window.modelCalls=0;a.model.request=async()=>{window.modelCalls++;throw Error('manual action must not call model');};
 });
 await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.roleError='未检测到可用 MVU 接口';a.refresh();});
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.ui.panel.textContent.includes('未检测到可用 MVU 接口')),false);
 await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.ui.dialog('角色变量接入',a.ui.rolePanel({state:a.store.read(),error:a.roleError},[]));});
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.ui.modal.textContent.includes('未检测到可用 MVU 接口')),true);
 await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.ui.closeDialog();const render=a.ui.render;let view;a.ui.render=function(v){view=v;return render.call(this,v);};a.refresh();a.ui.render=render;render.call(a.ui,{...view,state:{...view.state,roleLink:{bindings:{},roots:[]}}});});
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.ui.panel.textContent.includes('未检测到可用 MVU 接口')),true);
 await page.evaluate(()=>wanjie_wuku_general_instance.refresh());
 const manual=page.locator('[data-action="baseline"].wjwk-manual-balance');await assert.equal(await manual.count(),1);await assert.equal(await manual.isVisible(),true);
 await manual.click();await page.waitForSelector('[data-action="save-baseline"]');
 const resource=await page.evaluate(()=>resourceId);await page.locator(`[name="balance:${resource}"]`).fill('56000.123456');await page.locator('[name="reason"]').fill('玩家核对后的实际余额');
 await page.locator('[data-action="save-baseline"]').click();await page.waitForFunction(()=>!wanjie_wuku_general_instance.committing&&wanjie_wuku_general_instance.ui.modal.hidden);
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.read().powers[testPowerId].resources[resourceId].balance),'56000.123456');
 await page.screenshot({path:out+'/manual-balance-1440.png'});
 await page.evaluate(()=>wanjie_wuku_general_instance.openArchive(recordId));
 assert.equal(await page.locator('[data-archive-edit]').getAttribute('open'),null);
 await page.getByRole('button',{name:'手动修改内容',exact:true}).click();assert.notEqual(await page.locator('[data-archive-edit]').getAttribute('open'),null);
 await page.locator('[data-archive-edit] textarea[name="field:description"]').fill('玩家手写：采购已交付，保留完整用途说明。');await page.locator('[data-archive-edit] [name="note"]').fill('玩家手动核对');
 await page.locator('[data-action="save-archive"]').click();await page.waitForFunction(()=>!wanjie_wuku_general_instance.committing&&wanjie_wuku_general_instance.ui.modal.hidden);
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.read().powers[testPowerId].archives[recordId].fields.description),'玩家手写：采购已交付，保留完整用途说明。');
 assert.equal(await page.evaluate(()=>modelCalls),0);
 await page.setViewportSize({width:390,height:900});await page.screenshot({path:out+'/manual-balance-390.png'});assert(await manual.isVisible());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // Same production controller records structural response errors with details disabled.
 await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance,{ModelConnection}=await import('/src/model.js');
  a.settings={...a.settings,mode:'custom',baseUrl:'https://fixture.test/v1',model:'fixture'};
  a.model=new ModelConnection({settings:()=>a.settings,getKey:()=>'',fetchImpl:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:null,reasoning_content:'PRIVATE_RESPONSE'},finish_reason:'length'}]})})});
  const s=a.contextSnapshot(),ticket=a.runtimeLog.begin('模拟独立API');a.logTask=ticket;
  try{await a.query({system:'',user:''},s);}catch(e){window.apiError=e.message;}
  window.apiLog=JSON.stringify(a.runtimeLog.export());
 });
 assert.match(await page.evaluate(()=>apiError),/输出限制/);assert.match(await page.evaluate(()=>apiLog),/接口响应诊断/);assert.doesNotMatch(await page.evaluate(()=>apiLog),/PRIVATE_RESPONSE/);
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(externalRequests,0);
 console.log('1.3.2 browser: visible manual balance, exact save, manual archive editor, no model calls, narrow layout, default structural API diagnostics.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
