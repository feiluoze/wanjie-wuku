import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.env.WJWK_NODE_MODULES+'/package.json'),{chromium}=require('playwright');
const out=process.env.WJWK_SCREENSHOTS;await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),path);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const page=await browser.newPage({viewport:{width:1400,height:980}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.locator('[data-action="toggle"]').click();await page.locator('[data-action="settings"]').click();await page.locator('[data-action="prompt-presets"]').click();
 const raw={name:'玩家自带预设',api_key:'SHOULD_NOT_IMPORT',prompts:[{identifier:'prefix',name:'开头',role:'system',content:'保持客观，{{user}}'},{identifier:'chatHistory',name:'任务位置',marker:true},{identifier:'tail',name:'末尾',role:'user',content:'只提供结果'},{identifier:'cot',name:'思维链',role:'assistant',content:'不需要这个'}]};
 await page.locator('[data-prompt-preset-file]').setInputFiles({name:'preset.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});await page.locator('[data-preset-editor]').waitFor();
 await page.locator('[data-preset-block="cot"] [data-preset-enabled]').uncheck();await page.locator('[data-preset-block="tail"] [data-action="prompt-preset-up"]').click();
 await page.locator('[data-action="prompt-preset-preview"]').click();assert((await page.locator('[data-preset-preview]').textContent()).includes('武库本次任务格式'));assert(!(await page.locator('[data-preset-preview]').textContent()).includes('不需要这个'));
 await page.screenshot({path:out+'/editor-desktop.png'});await page.locator('[data-action="prompt-preset-save"]').click();
 const id=await page.locator('[name="preset:archive"] option').filter({hasText:'玩家自带预设'}).getAttribute('value');await page.locator('[name="preset:archive"]').selectOption(id);await page.locator('[data-action="prompt-preset-routes"]').click();
 assert.equal(await page.locator('[name="preset:archive"]').inputValue(),id);assert.equal(await page.locator('[name="preset:creation"]').inputValue(),'');
 await page.reload();await page.locator('[data-action="toggle"]').click();await page.locator('[data-action="settings"]').click();await page.locator('[data-action="prompt-presets"]').click();assert.equal(await page.locator('[name="preset:archive"]').inputValue(),id);
 await page.locator('[data-action="prompt-preset-edit"]').click();assert.deepEqual(await page.locator('[data-preset-block]').evaluateAll(rows=>rows.map(r=>r.dataset.presetBlock)),['prefix','tail','chatHistory','cot']);assert.equal(await page.locator('[data-preset-block="cot"] [data-preset-enabled]').isChecked(),false);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/editor-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:320,height:740});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('[data-action="prompt-presets"]').click();const download=page.waitForEvent('download');await page.locator('[data-action="prompt-preset-export"]').click();assert((await download).suggestedFilename().endsWith('.json'));
 await page.locator('[data-action="prompt-preset-delete"]').click();await page.locator('[data-action="prompt-preset-delete-confirm"]').click();assert.equal(await page.locator('[name="preset:archive"]').inputValue(),'');
 assert.deepEqual(errors,[]);await writeFile(out+'/result.json',JSON.stringify({ok:true,checks:['file import','block selection','reorder','preview','save','per-task route','reload snapshot','export','delete clears routes','390px layout'],pageErrors:errors,realTavern:false},null,2));console.log('Prompt preset browser checks passed');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
