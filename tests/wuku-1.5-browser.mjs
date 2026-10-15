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
 const errors=[],checks=[];let external=0;
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external++;return r.abort();});
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
  await page.evaluate(async()=>{
   const a=wanjie_wuku_general_instance,{createPower,importBook}=await import('/src/core.js');
   await a.store.transact(s=>{const p=createPower(importBook({entries:{1:{comment:'深蓝',content:'根据已有能力锚点推演实际缺口，消耗源质点，取得永久能力，保留旧成果。'}}},'自编浏览器验收')[0]);s.powers[p.id]=p;Object.values(p.resources)[0].balance='6';p.assets.a={id:'a',name:'拂风绵掌',kind:'能力',permanent:true,quantity:'1',description:'已掌握的掌法，轻灵连贯，保留当前力量与限制。'.repeat(20)};p.assets.b={id:'b',name:'暖石',kind:'物资',permanent:false,quantity:'2',description:'已有的温暖石材。'};window.testPowerId=p.id;});
   a.powerId=testPowerId;a.settings.mode='st';a.ui.space='wuku';a.ui.tab='management';a.refresh();a.ui.setOpen(true);window.modelCalls=0;
   a.model.request=async()=>{window.modelCalls++;const p=a.store.read().powers[testPowerId];return JSON.stringify({operations:[{label:'新掌法',ready:true,description:'保留旧掌法，推演下一阶段',ruleQuote:p.rules.slice(0,12),costs:[{kind:'resource',id:Object.keys(p.resources)[0],amount:'1'}],effects:[{type:'asset_grant',name:'穿云掌',kind:'能力',permanent:true,quantity:'1',description:'经确认的完整掌法，旧能力保留。'}]}]});};
  });
  await page.locator('.wjwk-window').waitFor({state:'visible'});
  assert(await page.locator('.wjwk-design-actions [data-action="archive-batch"]').isVisible());
  assert(await page.locator('[data-action="delete-power"]').isVisible());
  await page.locator('[data-tab="assets"]').first().click();assert(await page.getByText('能力与永久所得',{exact:true}).isVisible());assert(await page.getByText('物资与消耗品',{exact:true}).isVisible());
  const before=await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read()));
  await page.locator('[data-asset-id="a"] [data-action="asset-goal"]').click();assert.match(await page.locator('[data-goal]').inputValue(),/拂风绵掌/);assert.equal(await page.evaluate(()=>window.modelCalls),0);assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())),before);
  await page.locator('[data-action="generate"]').click();await page.locator('[data-action="execute-later"]').waitFor();
  await page.locator('[data-action="execute-later"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.store.read().transactions.some(t=>t.label==='新掌法'));
  const ledger=await page.evaluate(()=>{const s=wanjie_wuku_general_instance.store.read(),p=s.powers[testPowerId];return {balance:Object.values(p.resources)[0].balance,count:s.transactions.filter(t=>t.label==='新掌法').length,oldAbility:!!p.assets.a,quantity:Object.values(p.assets).find(x=>x.name==='穿云掌').quantity};});assert.deepEqual(ledger,{balance:'5',count:1,oldAbility:true,quantity:'1'});
  await page.locator('[data-tab="management"]').first().click();assert(await page.getByText('最近结算',{exact:true}).isVisible());assert(await page.getByText('账本已结算',{exact:true}).first().isVisible());assert(await page.getByText('正文待承接',{exact:true}).first().isVisible());
  const dims=await page.locator('.wjwk-main').evaluate(n=>({width:n.clientWidth,scroll:n.scrollWidth}));assert(dims.scroll<=dims.width+2);await page.locator('.wjwk-window').screenshot({path:resolve(out,`wuku-${width}.png`)});
  await page.locator('[data-tab="receipts"]').first().click();assert(await page.getByText('完整账目变化与投入',{exact:true}).isVisible());
  const stableBefore=await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read()));await page.locator('[data-action="delete-power"]').click();assert(await page.getByText('确认删除此词条',{exact:true}).isVisible());await page.getByText('取消',{exact:true}).click();assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())),stableBefore);
  assert.equal(await page.evaluate(()=>window.modelCalls),1);checks.push({width,...ledger,mockModelCalls:1,deleteCancelled:true,noOverflow:true});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(external,0);const result={checks,errors,externalRequests:external,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();server.close();}
