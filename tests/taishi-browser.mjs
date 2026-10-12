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
 assert.match(await page.locator('.wjwk-modal').textContent(),/世界书设定底稿/);
 assert.equal(await page.evaluate(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives||{}).length),0);
 await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 assert.equal(await page.evaluate(()=>Object.keys(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives).length),3);
 await page.locator('.wjwk-mmlc-tile[data-section="worlds"]').click();assert.equal(await page.locator('[data-taishi-record]').count(),2);
 await page.screenshot({path:out+'/taishi-worlds-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('.wjwk-sidebar').isVisible(),false);await page.evaluate(()=>wanjie_wuku_general_instance.ui.hideAIActivity());await page.screenshot({path:out+'/taishi-worlds-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});await page.locator('.wjwk-content [data-action="taishi-section"]').first().click();
 if(!await page.locator('[data-action="player-auto-save"]').isVisible())await page.getByText('拟定内容与自动整理设置',{exact:true}).click();await page.locator('[data-action="player-auto-save"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].autoArchiveSave);
 await page.locator('[data-action="space-wuku"]').click();
 await page.evaluate(()=>{const app=wanjie_wuku_general_instance,ctx=SillyTavern.getContext();ctx.chat.push({name:'旅人',is_user:false,swipe_id:0,mes:'海蓝界的灵圃建设推进百年，云岚继续维护原有生态。'});app.schedulePlayerReview('normal');});
 await page.waitForFunction(id=>Object.values(wanjie_wuku_general_instance.store.read().powers[id].archives).some(r=>r.specific?.fields.clock==='主世界确认推进百年'),ids.powerId);
 await page.waitForFunction(()=>!wanjie_wuku_general_instance.busy&&!wanjie_wuku_general_instance.playerAutoRunning);
 await page.locator('[data-action="space-taishi"]').click();if(!await page.locator('[data-action="creation-open"]').isVisible())await page.getByText('拟定内容与自动整理设置',{exact:true}).click();await page.locator('[data-action="creation-open"]').click();await page.locator('[name="goal"]').fill('安排云岚推进灵圃建设，结合现有成果给一份后续方案。');await page.locator('[data-action="creation-draft"]').click();await page.locator('[data-action="creation-adopt"]').waitFor();
 await page.locator('[data-action="dialog-close"]').click();
 if(!await page.locator('[data-action="archive-undo"]').isVisible())await page.getByText('整理记录与变化',{exact:true}).click();await page.locator('[data-action="archive-undo"]').click();await page.locator('[data-action="archive-undo-confirm"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 const evidence=await page.evaluate(id=>{const app=wanjie_wuku_general_instance,p=app.store.read().powers[id];return {calls:window.mockCalls.map(({key,...r})=>({...r,keyCorrect:key===`Bearer ${r.model==='record-model'?'FAKE-RECORD-SECRET':'FAKE-DESIGN-SECRET'}`})),records:Object.keys(p.archives).length,clock:Object.values(p.archives).find(r=>r.name==='海蓝界').specific.fields.clock,logs:app.runtimeLog.export()};},ids.powerId);
 assert.deepEqual(evidence.calls.map(r=>r.model),['design-model','record-model','design-model']);assert(evidence.calls.every(r=>r.keyCorrect));assert.equal(evidence.records,3);assert.equal(evidence.clock,'个人内历初始时点');assert(!JSON.stringify(evidence.logs).includes('SECRET'));assert(evidence.logs.records.some(r=>r.steps.some(s=>JSON.stringify(s).includes('便捷整理'))));
 // New basic entry: one request, explicit preview and local save, no worldbook required.
 await page.locator('[data-action="space-taishi"]').click();
 await page.locator('[data-action="taishi-advanced"]').click();
 await page.getByText('按任务选模型',{exact:true}).waitFor();assert(await page.getByText('Pro 类优先',{exact:true}).count()>0);
 await page.locator('[data-action="dialog-close"]').click();
 await page.evaluate(()=>{const app=wanjie_wuku_general_instance;window.basicDraftCalls=0;app.model.request=async()=>{window.basicDraftCalls++;return JSON.stringify({changes:[{name:'晨光界',type:'environment',status:'active',fields:{conditions:'成熟的群岛文明'},recordId:'world',details:{overview:'海洋世界',geography:'三片群岛'},sourceIndex:-1}]});};});
 await page.locator('[data-action="taishi-create-world"]').click();await page.locator('[name="description"]').fill('建立成熟的海洋世界晨光界，概述三片群岛。');
 await page.locator('[data-action="taishi-draft-submit"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();
 assert(await page.getByText('这是 AI 建档草案，尚未保存。补全设定不代表正文已发生；确认后采用所选内容。',{exact:true}).count());
 await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 assert.equal(await page.evaluate(()=>window.basicDraftCalls),1);
 for(const width of [360,390,430]){
   await page.setViewportSize({width,height:850});await page.locator('[data-action="taishi-add-companion"]').click();
   await page.locator('[name="joining"]').selectOption('encounter');
   assert.equal(await page.locator('[name="joining"]').inputValue(),'encounter');
   const overflow=await page.locator('[data-taishi-draft]').evaluate(e=>e.scrollWidth>e.clientWidth+2);assert.equal(overflow,false);
   await page.screenshot({path:out+`/taishi-basic-draft-${width}.png`});await page.locator('[data-action="dialog-close"]').click();
 }
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.taishiDraft),null);
 // Advanced is explicitly enabled and uses the same preview/commit path.
 await page.locator('[data-action="taishi-advanced"]').click();
 assert.equal(await page.locator('[name="workflow"]').isChecked(),false);
 await page.locator('[name="workflow"]').check();await page.locator('[data-action="taishi-workflow-save"]').click();
 await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 const beforeAdvanced=await page.evaluate(()=>{
   const app=wanjie_wuku_general_instance;window.advancedCalls=[];
   app.model.request=async(prompt,{connection})=>{
     window.advancedCalls.push(connection.task);
     if(connection.task==='taishiSummary')return JSON.stringify({message:'世界与人物待确认'});
     const input=JSON.parse(prompt.user),world=connection.task==='taishiWorld',old=input.current.find(r=>r.name===(world?'海蓝界':'云岚'));
     return JSON.stringify({changes:[{archiveId:old.id,name:old.name,type:old.type,status:old.status,fields:world?{conditions:'保留生态，灵圃进展已核对'}:{location:'海蓝界灵圃'},recordId:world?'world':'companion',details:world?{events:'灵圃维护'}:{action:'继续维护灵圃'},sourceIndex:input.sources.at(-1).index}]});
   };return app.store.read().revision;
 });
 await page.locator('[data-action="review-archives"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();
 assert.deepEqual(await page.evaluate(()=>window.advancedCalls),['taishiWorld','taishiPeople','taishiSummary']);
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.read().revision),beforeAdvanced);
 await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.read().revision),beforeAdvanced+1);
 await page.setViewportSize({width:390,height:850});await page.locator('[data-action="taishi-advanced"]').click();
 assert.equal(await page.locator('[name="workflow"]').isChecked(),true);
 assert.equal(await page.locator('[data-taishi-advanced]').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);
 await page.evaluate(()=>wanjie_wuku_general_instance.ui.hideAIActivity());await page.screenshot({path:out+'/taishi-advanced-390.png'});await page.locator('[data-action="dialog-close"]').click();
 // People and autonomous development stay reachable from the basic mobile page.
 for(const width of [360,390,430]){
   await page.setViewportSize({width,height:850});await page.locator('[data-action="taishi-people"]').click();
   assert.equal(await page.locator('[data-taishi-people]').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);
   await page.evaluate(()=>wanjie_wuku_general_instance.ui.hideAIActivity());await page.screenshot({path:out+`/taishi-people-${width}.png`});
   await page.locator('[data-action="dialog-close"]').click();
 }
 const peopleId=await page.evaluate(()=>Object.values(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].archives).find(r=>r.name==='云岚').id);
 await page.locator('[data-action="taishi-people"]').click();await page.locator('[name="mode"]').selectOption('selected');
 await page.locator(`[name="pin:${peopleId}"]`).check();await page.locator(`[name="join:${peopleId}"]`).selectOption('direct');
 await page.locator('[data-action="taishi-people-save"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 assert.equal(await page.evaluate(id=>wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].taishiPeople.joining[id],peopleId),'direct');
 await page.locator('[data-action="taishi-development"]').click();assert.equal(await page.locator('[name="autonomy"]').isChecked(),false);
 assert.equal(await page.locator('[data-action="taishi-evolve"]').isDisabled(),true);
 await page.locator('[name="autonomy"]').check();await page.locator('[data-action="taishi-autonomy-save"]').click();
 await page.waitForFunction(()=>wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].taishiAutonomy===true);
 await page.locator('[name="elapsed"]').fill('2');await page.locator('[name="unit"]').selectOption('years');
 await page.locator('[name="note"]').fill('维持现有灵圃，推进眷属自己的研究目标');
 for(const width of [360,390,430]){await page.setViewportSize({width,height:850});assert.equal(await page.locator('[data-taishi-development]').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);await page.evaluate(()=>wanjie_wuku_general_instance.ui.hideAIActivity());await page.screenshot({path:out+`/taishi-development-${width}.png`});}
 const evolveBefore=await page.evaluate(()=>{
   const app=wanjie_wuku_general_instance,p=app.store.read().powers[app.powerId];window.evolutionCalls=[];
   window.evolutionOld=Object.values(p.archives).find(r=>r.name==='海蓝界').specific.fields.clock;
   app.model.request=async(prompt,{connection})=>{
     window.evolutionCalls.push(connection.task);if(connection.task==='taishiSummary')return JSON.stringify({message:'两年发展候选'});
     const input=JSON.parse(prompt.user),world=connection.task==='taishiWorld',old=input.current.find(r=>r.name===(world?'海蓝界':'云岚'));
     return JSON.stringify({changes:[{archiveId:old.id,name:old.name,type:old.type,status:old.status,fields:world?{conditions:'灵圃两年发展'}:{role:'主持灵圃研究'},recordId:world?'world':'companion',details:world?{overview:'文明保持运转'}:{world:'海蓝界',action:'推进灵圃研究'},sourceIndex:-1}]});
   };return {revision:app.store.read().revision,otherClock:Object.values(p.archives).find(r=>r.name==='赤砂界').specific.fields.clock};
 });
 await page.locator('[data-action="taishi-evolve"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();
 assert.match(await page.locator('.wjwk-modal').textContent(),/AI 自主发展候选/);assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.read().revision),evolveBefore.revision);
 await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 const evolved=await page.evaluate(()=>{const app=wanjie_wuku_general_instance,p=app.store.read().powers[app.powerId];return {clock:Object.values(p.archives).find(r=>r.name==='海蓝界').specific.fields.clock,otherClock:Object.values(p.archives).find(r=>r.name==='赤砂界').specific.fields.clock,old:window.evolutionOld,calls:window.evolutionCalls};});
 assert.equal(evolved.clock,evolved.old+'；本次确认推进内部 2年');assert.equal(evolved.otherClock,evolveBefore.otherClock);assert.equal(evolved.calls.length,3);
 // Failed specialist resumes from the preview without re-running a successful role.
 const resumeBefore=await page.evaluate(()=>{
   const app=wanjie_wuku_general_instance,ctx=SillyTavern.getContext();window.resumeCalls=[];window.failPeople=true;
   ctx.chat.push({mes:'海蓝界新建航路，云岚整理灵圃中的新植株。',name:'旅人',is_user:false,swipe_id:0});
   app.model.request=async(prompt,{connection})=>{
     const role=connection.task;window.resumeCalls.push(role);if(role==='taishiPeople'&&window.failPeople)throw Error('模拟人物连接超时');
     if(role==='taishiSummary')return JSON.stringify({message:'航路与灵圃更新'});
     const input=JSON.parse(prompt.user),world=role==='taishiWorld',old=input.current.find(r=>r.name===(world?'海蓝界':'云岚'));
     return JSON.stringify({changes:[{archiveId:old.id,name:old.name,type:old.type,status:old.status,fields:world?{conditions:'新航路已经建立'}:{location:'海蓝界新灵圃'},recordId:world?'world':'companion',details:world?{events:'建立新航路'}:{world:'海蓝界',action:'整理新植株'},sourceIndex:input.sources.at(-1).index}]});
   };return app.store.read().revision;
 });
 await page.locator('[data-action="review-archives"]').click();await page.locator('[data-taishi-workflow-review]').waitFor();
 assert.deepEqual(await page.evaluate(()=>window.resumeCalls),['taishiWorld','taishiPeople']);
 assert.equal(await page.locator('[data-action="taishi-workflow-retry"][data-stage="taishiWorld"]').count(),0);
 for(const width of [360,390,430]){await page.setViewportSize({width,height:850});assert.equal(await page.locator('[data-taishi-workflow-review]').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);await page.evaluate(()=>wanjie_wuku_general_instance.ui.hideAIActivity());await page.screenshot({path:out+`/taishi-resume-${width}.png`});}
 await page.evaluate(()=>window.failPeople=false);await page.locator('[data-action="taishi-workflow-retry"][data-stage="taishiPeople"]').click();
 await page.locator('[data-action="taishi-workflow-retry"][data-stage="taishiSummary"]').waitFor();
 assert.deepEqual(await page.evaluate(()=>window.resumeCalls),['taishiWorld','taishiPeople','taishiPeople']);
 await page.locator('[data-action="taishi-workflow-retry"][data-stage="taishiSummary"]').click();
 await page.waitForFunction(()=>wanjie_wuku_general_instance.pendingArchiveReview?.data?.workflowState?.stages.taishiSummary.status==='success');
 assert.deepEqual(await page.evaluate(()=>window.resumeCalls),['taishiWorld','taishiPeople','taishiPeople','taishiSummary']);
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.read().revision),resumeBefore);
 await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.read().revision),resumeBefore+1);
 // Long worldbook preflight, one batch per click, explicit restart and persisted resume.
 await page.evaluate(async()=>{
   const app=wanjie_wuku_general_instance,ctx=SillyTavern.getContext();window.buildCalls=0;
   ctx.loadWorldInfo=async()=>({entries:{1:{uid:1,comment:'超长个人设定',content:'群岛世界中已有三座城市与稳定航路。'.repeat(6000)}}});
   app.model.request=async(prompt,{connection})=>{window.buildCalls++;window.buildTask=connection.task;const body=JSON.parse(prompt.user);window.buildPart=body.attachedWorldbooks.books[0].entries[0].part;return JSON.stringify({changes:[{name:'星潮界',type:'environment',status:'active',fields:{conditions:'群岛文明'},recordId:'world',details:{geography:'三座城市与稳定航路'},sourceIndex:-1}]});};
 });
 await page.locator('[data-action="taishi-setup"]').click();await page.locator('[data-taishi-build]').waitFor();
 await page.waitForFunction(()=>!wanjie_wuku_general_instance.taishiBuildDraft?.loading);
 assert(await page.locator('[data-action="taishi-build-run"]').isDisabled());
 await page.locator('[data-action="taishi-build-restart"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.taishiBuildDraft?.plan?.next===0&&!wanjie_wuku_general_instance.taishiBuildDraft.loading);
 assert.equal(await page.evaluate(()=>window.buildCalls),0);
 for(const width of [360,390,430]){await page.setViewportSize({width,height:850});assert.equal(await page.locator('[data-taishi-build]').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);await page.screenshot({path:out+`/taishi-build-${width}.png`});}
 const buildBefore=await page.evaluate(()=>wanjie_wuku_general_instance.store.read().revision);
 await page.locator('[data-action="taishi-build-run"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();
 assert.equal(await page.evaluate(()=>window.buildCalls),1);assert.equal(await page.evaluate(()=>window.buildTask),'setup');assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.read().revision),buildBefore);
 await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 await page.locator('[data-action="taishi-setup"]').click();await page.waitForFunction(()=>!wanjie_wuku_general_instance.taishiBuildDraft?.loading);
 const built=await page.evaluate(()=>{const app=wanjie_wuku_general_instance;return {progress:app.store.read().powers[app.powerId].taishiBuild,screen:app.taishiBuildDraft.plan.next,calls:window.buildCalls};});
 assert.equal(built.progress.next,1);assert(built.progress.total>1);assert.equal(built.screen,1);assert.equal(built.calls,1);
 await page.locator('[data-action="dialog-close"]').click();
 // Scoped story memory and deliberate private-memory override, using production UI.
 const knowledge=await page.evaluate(async()=>{
  const app=wanjie_wuku_general_instance,ctx=SillyTavern.getContext(),a=await import('/src/archives.js'),m=await import('/src/archive-memory.js');
  await app.store.transact(s=>{const p=s.powers[app.powerId],r=Object.values(p.archives).find(r=>r.name==='云岚');a.saveArchive(p,{...r,specific:{...r.specific,fields:{...r.specific.fields,knowledge:'已知灵圃受损，亲历；未知仓库密码',core_memory:'BROWSER_PRIVATE_MEMORY'}}},a.archiveSource(ctx.chat,'玩家确认'));s.archiveMemory={auto:true,budget:12000,selections:{}};});
  const state=app.store.read(),power=state.powers[app.powerId],r=Object.values(power.archives).find(r=>r.name==='云岚');
  const plan=m.memoryPlan(state,ctx.chat,'云岚'),explicit=m.memoryPlan(state,ctx.chat,'赤砂界',{auto:false,budget:12000,selections:{[power.id+'/'+r.id]:{mode:'next',token:'browser'}}});
  app.memoryQuery=()=> '云岚';app.openMemory();
  return {packet:plan.packet,explicit:explicit.packet,scope:a.sceneArchiveContext(power,ctx.chat,'云岚').items.map(r=>r.name),revision:state.revision};
 });
 assert(!knowledge.packet.includes('BROWSER_PRIVATE_MEMORY'));assert(!knowledge.packet.includes('赤砂界'));assert(knowledge.packet.includes('亲历'));assert(knowledge.explicit.includes('BROWSER_PRIVATE_MEMORY'));assert(!knowledge.scope.includes('赤砂界'));
 await page.getByText('范围不明时不自动带入。',{exact:false}).waitFor();
 for(const width of [360,390,430]){await page.setViewportSize({width,height:850});assert.equal(await page.locator('[data-memory-settings]').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);await page.screenshot({path:out+`/taishi-knowledge-${width}.png`});}
 assert.equal(await page.evaluate(()=>wanjie_wuku_general_instance.store.read().revision),knowledge.revision);
 await writeFile(out+'/taishi-knowledge-flow.json',JSON.stringify({...knowledge,errors,externalRequests,realHostTested:false},null,2));
 // Story elapsed-period discovery has no requests; confirm, preview, save and reroll.
 await page.locator('[data-action="dialog-close"]').click();
 const timeBefore=await page.evaluate(()=>{const app=wanjie_wuku_general_instance,ctx=SillyTavern.getContext();ctx.chat.push({is_user:false,swipe_id:0,mes:'海蓝界内部过去了3天。'});window.timeCalls=[];const p=app.store.read().powers[app.powerId],world=Object.values(p.archives).find(r=>r.name==='海蓝界');app.model.request=async(_prompt,{connection})=>{window.timeCalls.push(connection.task);return JSON.stringify(connection.task==='taishiSummary'?{message:'正文历时发展候选'}:{changes:connection.task==='taishiPeople'?[]:[{archiveId:world.id,name:world.name,type:'environment',status:'active',fields:{conditions:'本段历时内已有发展'},recordId:'world',details:{overview:'本段灵圃发展'},sourceIndex:-1}]});};app.refresh();return {worldId:world.id,clock:world.specific.fields.clock,index:ctx.chat.length-1};});
 await page.locator('[data-action="taishi-development"]').click();await page.locator('[data-action="taishi-story-evolve"]').waitFor();assert.deepEqual(await page.evaluate(()=>window.timeCalls),[]);
 for(const width of [360,390,430]){await page.setViewportSize({width,height:850});assert.equal(await page.locator('[data-taishi-development]').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);await page.screenshot({path:out+`/taishi-time-${width}.png`});}
 await page.locator('[data-action="taishi-story-evolve"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();
 assert.deepEqual(await page.evaluate(()=>window.timeCalls),['taishiWorld','taishiPeople','taishiSummary']);assert.equal(await page.evaluate(()=>Boolean(wanjie_wuku_general_instance.store.read().powers[wanjie_wuku_general_instance.powerId].taishiTime)),false);
 await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);
 await page.locator('[data-action="taishi-development"]').click();assert.equal(await page.locator('[data-action="taishi-story-evolve"]').count(),0);await page.locator('[data-action="dialog-close"]').click();
 const timeAfter=await page.evaluate(async(before)=>{const app=wanjie_wuku_general_instance,ctx=SillyTavern.getContext();ctx.chat[before.index].swipe_id=1;ctx.chat[before.index].mes='新的分支没有经过三天';await app.cleanupStoryRecords();const p=app.store.read().powers[app.powerId];return {clock:p.archives[before.worldId].specific.fields.clock,receipts:p.taishiTime.receipts.length,calls:window.timeCalls};},timeBefore);
 assert.equal(timeAfter.clock,timeBefore.clock);assert.equal(timeAfter.receipts,0);await writeFile(out+'/taishi-time-flow.json',JSON.stringify({timeBefore,timeAfter,errors,externalRequests,realHostTested:false},null,2));
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);
 await writeFile(out+'/taishi-flow.json',JSON.stringify({...evidence,advancedCalls:await page.evaluate(()=>window.advancedCalls),evolved,built,resumeCalls:await page.evaluate(()=>window.resumeCalls),errors,externalRequests,realHostTested:false,installed:false},null,2));console.log('PASS independent Taishi UI, routing, setting preview/save, background update, creation, undo, basic/advanced, people, autonomous evolution and long-worldbook and specialist resume at mobile widths; mock host, zero external calls.');
}finally{await browser?.close();server.close();}
