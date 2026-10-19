import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,relative,isAbsolute,extname} from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright'),out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;

try {
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const checks=[],errors=[];let externalRequests=0;
 for(const width of [1440,390,320])for(const theme of ['dark','light']){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>Boolean(window.wanjie_wuku_general_instance));
  await page.evaluate(async theme=>{
   const a=wanjie_wuku_general_instance,{createPower,importBook,chatHashes}=await import('/src/core.js');const ctx=SillyTavern.getContext();ctx.chat=[];
   const p=createPower(importBook({entries:{1:{comment:'深蓝',content:'根据已有能力锚点推演实际缺口，消耗源质点，取得永久能力，保留旧成果。'}}},'自编UI验收')[0]);Object.values(p.resources)[0].balance='6';
   p.assets.a={id:'a',name:'拂风绵掌',kind:'能力',permanent:true,quantity:'1',description:'已掌握的掌法，限制与身体负担均保留。'.repeat(20)};p.assets.b={id:'b',name:'暖石',kind:'物资',permanent:false,quantity:'2',description:'已有材料'};
   await a.store.transact(s=>{s.powers={[p.id]:p};s.historyAnchor=chatHashes([]);s.syncCursor=0;});a.powerId=p.id;a.settings.theme=theme;a.settings.mode='st';a.ui.space='wuku';a.ui.tab='management';a.refresh();a.ui.setOpen(true);window.testPowerId=p.id;window.modelCalls=0;window.uiBefore=JSON.stringify(a.store.read());
   a.model.request=async()=>{window.modelCalls++;return JSON.stringify({operations:[{label:'新掌法',ready:true,description:'保留旧掌法，推演下一阶段',ruleQuote:p.rules.slice(0,12),costs:[{kind:'resource',id:Object.keys(p.resources)[0],amount:'1'}],effects:[{type:'asset_grant',name:'穿云掌',kind:'能力',permanent:true,quantity:'1',description:'经确认的掌法，旧能力保留。'}]}]});};
  },theme);
  assert.deepEqual(await page.locator('.wjwk-tabs [role="tab"] > span:first-child').allTextContents(),['现在','行动','背包','记录']);
  await page.locator('.wjwk-inventory-peek [data-target="assets"]').click();assert.equal(await page.locator('.wjwk-tabs [aria-selected="true"]').getAttribute('data-tab'),'assets');
  assert(await page.getByText('能力与永久所得',{exact:true}).isVisible());assert(await page.getByText('物品与消耗品',{exact:true}).isVisible());
  await page.locator('.wjwk-tabs [data-tab="assets"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.wjwk-tabs [aria-selected="true"]').getAttribute('data-tab'),'receipts');assert.equal(await page.evaluate(()=>document.activeElement?.dataset.tab),'receipts');
  assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())===uiBefore),true);
  await page.locator('.wjwk-tabs [data-tab="assets"]').click();await page.locator('[data-asset-id="a"] [data-action="asset-goal"]').click();assert.match(await page.locator('[data-goal]').inputValue(),/拂风绵掌/);assert.equal(await page.evaluate(()=>modelCalls),0);
  await page.locator('[data-action="generate"]').click();await page.locator('[data-action="execute-later"]').waitFor();await page.locator('[data-action="execute-later"]').click();await page.waitForFunction(()=>wanjie_wuku_general_instance.store.read().transactions.some(t=>t.label==='新掌法'));
  const result=await page.evaluate(()=>{const s=wanjie_wuku_general_instance.store.read(),p=s.powers[testPowerId];return {balance:Object.values(p.resources)[0].balance,transactions:s.transactions.filter(t=>t.label==='新掌法').length,oldAbility:!!p.assets.a,newQuantity:Object.values(p.assets).find(a=>a.name==='穿云掌').quantity};});assert.deepEqual(result,{balance:'5',transactions:1,oldAbility:true,newQuantity:'1'});
  await page.locator('.wjwk-tabs [data-tab="management"]').click();assert(await page.locator('.wjwk-story-action').isVisible());await page.screenshot({path:resolve(out,`home-${width}-${theme}.png`)});
  await page.locator('.wjwk-tabs [data-tab="operations"]').click();assert(await page.locator('.wjwk-pending-strip').isVisible());await page.locator('.wjwk-pending-strip [data-action="open-tab"]').click();assert(await page.locator('.wjwk-story-action').isVisible());
  await page.locator('.wjwk-tabs [data-tab="receipts"]').click();assert(await page.getByText('完整变化与花费',{exact:true}).isVisible());
  // Empty table categories remain reachable after DS folds them by default.
  await page.evaluate(async()=>{const a=wanjie_wuku_general_instance,{createPower}=await import('/src/core.js'),{builtinEntries}=await import('/src/builtin-worldbook.js');const p=createPower(builtinEntries().find(e=>e.name==='咨询法'));await a.store.transact(s=>{s.powers[p.id]=p;});a.powerId=p.id;a.ui.tab='management';a.refresh();window.beforeEmpty=JSON.stringify(a.store.read());});
  const more=page.locator('.wjwk-long-term-more');assert.equal(await more.getAttribute('open'),null);assert.equal(await more.locator('[data-long-term-table]').count(),3);await more.locator(':scope > summary').click();await more.locator('[data-long-term-table="consultations"] [data-action="archive-library"]').click();assert.match(await page.locator('[data-library-category]').inputValue(),/consultations$/);await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>JSON.stringify(wanjie_wuku_general_instance.store.read())===beforeEmpty),true);
  for(const selector of ['.wjwk-window','.wjwk-main','.wjwk-long-term-grid']){const b=await page.locator(selector).first().evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));assert(b.client>0&&b.scroll<=b.client+2,JSON.stringify({width,theme,selector,...b}));}
  assert.equal(await page.evaluate(()=>modelCalls),1);checks.push({width,theme,navigationReadOnly:true,keyboardFocus:true,emptyTableReachable:true,oneConfirmedDebit:true,...result});await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);const report={checks,errors,externalRequests,paidCalls:0,realHostAcceptance:false};await writeFile(resolve(out,'evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.close();}
