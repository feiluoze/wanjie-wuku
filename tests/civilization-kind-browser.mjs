import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
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
  const a=wanjie_wuku_general_instance;await a.openTaishi();
  const {saveArchive,archiveSource}=await import('/src/archives.js'),{creationConfig}=await import('/src/creation-config.js');
  const ids={};await a.store.transact(s=>{const p=s.powers[a.powerId],c=creationConfig(p);
   const add=(name,kind,fields)=>{const def=c.records.find(r=>r.id===kind);return saveArchive(p,{type:'record',name,status:'active',fields:{description:'已确认的世界内部档案'},specific:{adapterId:c.id,recordId:kind,version:c.version,label:def.label,labels:Object.fromEntries(def.fields.map(f=>[f.id,f.label])),fields}},archiveSource(SillyTavern.getContext().chat,'模拟界面验证'))};
   ids.w=add('合流世界','world',{overview:'同一片天地容纳多种文明，拥有共同的历史与法则。',era:'城邦与学会并存',geography:'东方林海、西方高原、南方群岛',factions:'各文明保留自身组织与社会联系',clock:'内历三百一十二年'}).id;
   ids.other=add('远海世界','world',{overview:'独立于主世界的海洋天地'}).id;
   ids.east=add('东方林海','region',{world_id:ids.w,world:'合流世界',overview:'森林与河流交错的大地'}).id;
   ids.a=add('青岚文明','inhabitants',{world_id:ids.w,world:'合流世界',region_id:ids.east,civilization:'灵植、炼丹与星象学共同发展的林海文明。'}).id;
   ids.b=add('白塔文明','inhabitants',{world_id:ids.w,world:'合流世界',civilization:'以学院、工坊和远行者联盟为核心，兼修魔药与血脉技艺。'}).id;
   ids.member=add('林海学者','companion',{world_id:ids.w,world:'合流世界',civilization_id:ids.a,profile:'研究草木与法则交融的学者',action:'正在整理已有研究记录'}).id;
   add('白塔药剂手册','available',{world_id:ids.w,world:'合流世界',civilization_id:ids.b,current:'已形成的常用药剂方法'});
   ids.shared=add('世界公共典籍库','available',{world_id:ids.w,world:'合流世界',current:'多个文明共享的基础知识，不重复发放'}).id;
   for(let i=0;i<8;i++)add('林海研究记录 '+(i+1),'development',{world_id:ids.w,world:'合流世界',civilization_id:ids.a,goal:'核对已有研究',progress:'记录整理中'});
  });
  a.model.request=async()=>{window.layoutModelCalls=(window.layoutModelCalls||0)+1;throw Error('AI calls forbidden');};
  a.refresh();a.ui.setOpen(true);window.layoutIds=ids;return ids;
 });
 await page.evaluate(async()=>{
  const a=wanjie_wuku_general_instance,{saveArchive,archiveSource}=await import('/src/archives.js'),{creationConfig}=await import('/src/creation-config.js');
  await a.store.transact(s=>{const p=s.powers[a.powerId],c=creationConfig(p),def=c.records.find(r=>r.id==='inhabitants');
   for(const [name,kind] of [['树人',null],['妖精','population'],['林缘人类','population']])saveArchive(p,{name,type:'population',status:'active',fields:{purpose:'既有居民'},specific:{adapterId:c.id,recordId:def.id,version:c.version,label:def.label,labels:Object.fromEntries(def.fields.map(f=>[f.id,f.label])),fields:{world_id:layoutIds.w,world:'合流世界',region_id:layoutIds.east,...(kind?{kind}:{})}}},archiveSource(SillyTavern.getContext().chat,'模拟族群资料'));
  });a.refresh();
 });
 const before=await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read()));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  await page.evaluate(()=>{const a=wanjie_wuku_general_instance;a.ui.taishiSection=null;a.ui.setTaishiLayout({mode:'single',worldId:layoutIds.w,civilizationId:''});});
  assert.equal(await page.locator('[data-civilization-card]').count(),2);
  const names=await page.locator('[data-taishi-civilization] option').allTextContents();assert.deepEqual(names,['全部文明','青岚文明','白塔文明']);
  await page.evaluate(()=>wanjie_wuku_general_instance.selectTaishiSection('civilizations'));
  await page.locator('[data-taishi-civilization]').selectOption(ids.a);
  for(const name of ['树人','妖精','林缘人类'])assert(await page.locator(`[data-taishi-group="${ids.a}"]`).innerText().then(s=>s.includes(name)),name);
  const dims=await page.locator('.wjwk-main').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));assert(dims.scroll<=dims.width+2);
  await page.locator('.wjwk-window').screenshot({path:resolve(out,`civilization-${width}.png`)});
 }
 assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())),before);
 assert.equal(await page.evaluate(()=>window.layoutModelCalls||0),0);assert.equal(external,0);assert.deepEqual(errors,[]);
 const result={widths:[1440,390],navigationCivilizations:2,populationsRetained:3,legacyPopulationHiddenFromSelector:true,geographicGrouping:true,stateUnchanged:true,externalRequests:external,modelCalls:0,consoleErrors:errors};
 await writeFile(resolve(out,'evidence.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();server.close();}
