// Real production code with a local fake transport; never calls an external API.
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
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);await page.locator('[data-action="toggle"]').click();
 await page.locator('[data-action="modules-open"]').click();await page.locator('[name="taishi"]').check();await page.locator('[data-action="modules-save"]').click();
 await page.locator('[data-action="space-taishi"]').click();await page.getByRole('heading',{name:'太始天',exact:true}).waitFor();
 assert.equal(await page.locator('.wjwk-mmlc-tile').count(),7);
 const ids=await page.evaluate(async()=>{
  const app=wanjie_wuku_general_instance,ctx=SillyTavern.getContext(),host=await import('/src/host.js');
  const settings={...host.DEFAULT_SETTINGS,mode:'custom',baseUrl:'https://fake-model.test/v1',model:'record-model'};
  const a=host.saveConnectionProfile({name:'便捷整理',settings,apiKey:'FAKE-RECORD-SECRET'});
  const b=host.saveConnectionProfile({name:'设定与拟定',settings:{...settings,model:'design-model'},apiKey:'FAKE-DESIGN-SECRET'});
  app.settings=host.getSettings();app.apiKey=host.getApiKey();window.mockCalls=[];
  ctx.loadWorldInfo=async()=>({entries:{1:{uid:1,comment:'个人诸界',content:'海蓝界和赤砂界已为成熟世界。眷属云岚在海蓝界主持灵圃。'}}});
  await app.store.transact(s=>{s.aiWorldbooks={mode:'manual',books:[{name:'个人诸界',entryIds:['1']}]};s.powers[app.powerId].taishiBuildReferences={mode:'manual',books:[{name:'个人诸界',entryIds:['1']}]};});
  app.model.fetchImpl=async(url,options)=>{
    const body=JSON.parse(options.body),input=JSON.parse(body.messages[1].content);window.mockCalls.push({model:body.model,url,key:options.headers.Authorization,setup:Boolean(input.setupReferences)});
    let result;
    if(input.task==='核对经营档案变化'){
      const existing=input.current.find(r=>r.name==='海蓝界');
      result=input.setupReferences?{changes:[
        ...['海蓝界','赤砂界'].map(name=>({name,type:'environment',status:'active',fields:{conditions:'成熟世界'},recordId:'world',details:{stage:'成熟',clock:'个人内历初始时点'},sourceIndex:-1})),
        {name:'云岚',type:'member',status:'working',fields:{role:'太始天眷属',location:'海蓝界'},recordId:'companion',details:{world:'海蓝界',role:'主持灵圃',action:'建设灵圃',progress:'正在进行'},sourceIndex:-1}
      ]}:{changes:[{archiveId:existing.id,name:existing.name,type:existing.type,status:existing.status,fields:{conditions:'灵圃建设已推进百年，既有生态保留'},recordId:'world',details:{clock:'主世界确认推进百年'},sourceIndex:input.sources.at(-1).index}]};
    }else result={draft:{title:'灵圃后续发展方案',content:'先核对已建区域，安排云岚继续完善现有灵圃，不新增未经确认的资源。',conditions:'尚未执行；结果交正文落实。',ruleQuote:input.rules.slice(0,20)}};
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(result)}}]})};
  };app.refresh();return {a,b,powerId:app.powerId};
 });
 await page.locator('.wjwk-header [data-action="settings"]').click();await page.locator('[data-task-routing] summary').click();
 await page.locator('[name="route:archive"]').selectOption(ids.a);await page.locator('[name="route:setup"]').selectOption(ids.b);await page.locator('[name="route:creation"]').selectOption(ids.b);
 await page.locator('[data-action="save-task-routes"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 await page.locator('[data-action="taishi-setup"]').click();assert.match(await page.locator('[data-task-connection]').textContent(),/世界书初始化.*设定与拟定.*design-model/);await page.locator('[data-action="taishi-build-run"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();assert.match(await page.locator('[data-ai-connections]').textContent(),/世界书初始化.*设定与拟定.*design-model/);

 const basic=await page.evaluate(()=>({...wanjie_wuku_general_instance.ui.aiState}));
 assert.match(basic.connections.setup,/design-model/);
 for(const width of [360,390,430]){await page.setViewportSize({width,height:850});const node=page.locator('.wjwk-ai-activity');assert.equal(await node.evaluate(e=>e.scrollWidth>e.clientWidth+2),false);await page.screenshot({path:out+`/task-model-${width}.png`});}
 await page.locator('[data-action="taishi-workflow-discard"]').click();
 await page.evaluate(async()=>{const a=wanjie_wuku_general_instance;a.model.request=async()=>{throw Error('模拟 HTTP 502');};try{await a.reviewArchives({supplement:true,values:{playerNote:'玩家请求检查构建连接的失败显示'},setupReferences:true});}catch{}});
 const failure=await page.evaluate(()=>wanjie_wuku_general_instance.ui.aiState);assert.equal(failure.status,'error');assert.match(failure.connections.setup,/design-model/);assert.match(await page.locator('[data-ai-connections]').textContent(),/design-model/);assert.match(await page.locator('[data-ai-message]').textContent(),/502/);

 // The toast remains actionable with the main panel closed. A late response cannot save.
 const revision=await page.evaluate(()=>wanjie_wuku_general_instance.store.read().revision);
 await page.evaluate(()=>{const a=wanjie_wuku_general_instance;window.cancelCalls=0;a.model.request=()=>{window.cancelCalls++;return new Promise(r=>window.finishCancelled=r);};window.cancelWork=a.reviewArchives({setupReferences:true}).catch(e=>e.name);});
 await page.locator('[data-action="ai-task-cancel"]').waitFor();await page.waitForFunction(()=>Boolean(window.finishCancelled));
 await page.locator('.wjwk-header [data-action="close"]').focus();await page.keyboard.press('Enter');
 for(const width of [360,390,430]){await page.setViewportSize({width,height:850});assert.equal(await page.locator('.wjwk-ai-activity').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);await page.screenshot({path:out+`/task-cancel-${width}.png`});}
 await page.locator('[data-action="ai-task-cancel"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.aiState.status==='cancelled');
 assert.equal(await page.locator('[data-action="ai-task-cancel"]').isVisible(),false);
 await page.evaluate(async()=>{window.finishCancelled(JSON.stringify({changes:[]}));await window.cancelWork;});
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.read().revision),revision);assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.pendingArchiveReview),null);assert.equal(await page.evaluate(()=>window.cancelCalls),1);
 const cancelled=await page.evaluate(()=>wanjie_wuku_general_instance.ui.aiState.status);
 // Closing a notification is independent from cancellation.
 await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.model.request=()=>new Promise(r=>window.finishDismissed=r);window.dismissWork=a.reviewArchives({setupReferences:true}).catch(e=>e.name);});await page.locator('[data-action="ai-task-cancel"]').waitFor();await page.waitForFunction(()=>Boolean(window.finishDismissed));
 await page.locator('[data-action="ai-status-close"]').click();assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.busy),true);
 await page.evaluate(async()=>{window.finishDismissed(JSON.stringify({changes:[]}));await window.dismissWork;});
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);await writeFile(out+'/task-model-flow.json',JSON.stringify({basic,failure,cancelled,cancelCalls:1,notificationDismissDoesNotCancel:true,lateReplyNotSaved:true,errors,externalRequests,realHostTested:false},null,2));console.log('PASS preflight routed model, task model retained on failure, 360/390/430 no toast overflow, zero external calls.');
}finally{await browser?.close();server.close();}
