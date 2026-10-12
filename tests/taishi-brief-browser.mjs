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
 const id=await page.evaluate(async()=>{const a=wanjie_wuku_general_instance,h=await import('/src/host.js');h.saveConnectionProfile({name:'基础验收',settings:{...h.DEFAULT_SETTINGS,mode:'custom',baseUrl:'https://fake-model.test/v1',model:'basic-test'},apiKey:'FAKE-TEST-ONLY'});a.settings=h.getSettings();a.apiKey=h.getApiKey();await a.store.transact(s=>{s.aiWorldbooks={mode:'manual',books:[]};});a.refresh();return a.powerId;});
 const power=()=>page.evaluate(id=>wanjie_wuku_general_instance.store.read().powers[id],id);
 async function mock(changes){await page.evaluate(changes=>{window.calls??=0;wanjie_wuku_general_instance.model.request=async()=>{window.calls++;return JSON.stringify({changes});};},changes);}
 async function save(){await page.locator('[data-action="apply-archive-review"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.ui.modal.hidden);}
 async function draft(action,name,kind){await mock([{name,type:kind==='world'?'environment':'member',status:'active',fields:kind==='world'?{conditions:'成熟群岛文明'}:{role:'主持灵圃',location:'晨光界'},recordId:kind,details:kind==='world'?{overview:'海洋世界'}:{world:'晨光界',action:'主持灵圃',core_memory:'PRIVATE_CHAIN_SECRET'},sourceIndex:-1}]);await page.locator(`[data-action="${action}"]`).click();await page.locator('[name="description"]').fill(`建立${name}，采用海洋文明与灵圃的设定。`);await page.locator('[data-action="taishi-draft-submit"]').click();await page.locator('[data-action="apply-archive-review"]').waitFor();}
 assert.equal(Object.keys((await power()).archives||{}).length,0);
 await draft('taishi-create-world','晨光界','world');assert.equal(Object.keys((await power()).archives||{}).length,0);
 assert(await page.evaluate(async()=>{const a=wanjie_wuku_general_instance,p=a.pendingArchiveReview,n=window.calls;try{await a.reviewArchives({rescan:true});return false;}catch(e){return /已有待确认结果/.test(e.message)&&a.pendingArchiveReview===p&&window.calls===n;}}));
 await page.locator('[data-action="dialog-close"]').click();await page.locator('[data-action="player-pending"]').click();await save();
 await draft('taishi-add-companion','云岚','companion');await save();
 const initial=await power(),world=Object.values(initial.archives).find(r=>r.name==='晨光界'),person=Object.values(initial.archives).find(r=>r.name==='云岚');assert(initial.taishiPeople.pinned.includes(person.id));

 await page.evaluate(({id,world})=>{
  const a=wanjie_wuku_general_instance,p=a.store.read().powers[id];
  const r=structuredClone(p.archives[world.id]);
  r.name='太始天·维尔萨兰';
  Object.assign(r.specific.fields,{overview:'多大陆与岛链相连的成熟奇幻世界。界脉魔力循环稳定，各文明沿自己的道路发展。',geography:'七冠诸国居于大陆腹地；曦冠林海守护古老树门；炉脊山盟沿山脉营建工坊。',era:'诸国并立，城邦贸易与族群传统共存。',factions:'七冠诸国、曦冠林海、炉脊山盟',resources:'界脉魔力、林地物产与山地矿材；跨区域贸易依赖既有航路。',events:'东岸航路已经建成，灵圃播种完成。',clock:'当前已确认推进三天',rates:'默认与外界等速（1:1）',connections:'自然石环与树门连接始生原界；神殿天门连接曜穹天界。',limits:'未确认的跨界通道尚不可调用'});
  for(const [k,v]of Object.entries({overview:'世界概况',geography:'区域与地理',era:'时代与社会',factions:'主要势力',resources:'资源与经济轮廓',events:'当前局势与事件',clock:'本世界内历',rates:'本世界与局部时速',connections:'界域联通',limits:'世界边界与禁制'}))r.specific.labels[k]=v;
  a.ui.showArchive(p,r,SillyTavern.getContext().chat,a.store.read());
 },{id,world});
 assert.equal(await page.locator('[data-taishi-brief="world"]').count(),1);
 assert.equal(await page.locator('.wjwk-brief-card').count(),4);
 assert.equal(await page.locator('[data-archive-edit]').count(),1);
 for(const width of [1440,360,390,430]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.locator('[data-taishi-brief]').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);
  await page.screenshot({path:out+`/world-brief-${width}.png`});
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);
 await writeFile(out+'/world-brief-flow.json',JSON.stringify({viewports:[1440,360,390,430],sections:4,externalRequests,errors,fixture:'visual sample; not real player archive'},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
