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
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];let external=0;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(external++,r.abort()));
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/preview.html`);await page.waitForFunction(()=>globalThis.wanjie_wuku_general_instance);
 await page.exposeFunction('importProgress',v=>console.log(JSON.stringify(v)));
 const book=JSON.parse(await readFile(process.argv[2],'utf8'));
 const result=await page.evaluate(async book=>{
  const a=wanjie_wuku_general_instance;await a.openTaishi();a.settings.mode='st';a.ui.setOpen(true);const ctx=SillyTavern.getContext();ctx.loadWorldInfo=async()=>book;
  const {referenceEntries}=await import('/src/ai-worldbooks-data.js'),entries=referenceEntries(book,'验收书');
  a.ui.showAIWorldbooks=()=>{};a.openTaishiStructure();await a.saveTaishiStructure({mode:'single',worldName:'太始星'});
  a.ui.setOpen(false);await a.store.transact(s=>{s.powers[a.powerId].taishiBuildReferences={mode:'manual',books:[{name:'验收书',entryIds:entries.map(e=>e.id)}]};});
  let calls=0,maxInput=0;const map={世界:['world','environment','overview'],地域:['region','environment','overview'],人物:['companion','member','profile'],神灵:['companion','member','profile'],文明:['inhabitants','record','civilization'],族群:['inhabitants','record','civilization'],家族:['organization','record','overview'],政权:['organization','record','overview'],组织:['organization','record','overview'],规则:['available','record','current'],力量体系:['available','record','current'],'器物与资源':['available','record','current']};
  a.model.request=async p=>{calls++;maxInput=Math.max(maxInput,p.user.length);const input=JSON.parse(p.user),changes=new Map();
   for(const b of input.attachedWorldbooks.books)for(const e of b.entries){let matches=[...e.content.matchAll(/^【([^】\r\n]+)】([^\r\n]+)$/gm)].filter(m=>map[m[1]]);if(!matches.length){const m=/^【([^】]+)】([^｜]+)/.exec(e.title);if(m&&map[m[1]])matches=[m];}
    for(const m of matches){const [recordId,type,field]=map[m[1]],name=m[2].trim(),key=recordId+'|'+name,old=input.current.find(r=>r.name===name&&r.specific?.recordId===recordId);changes.set(key,{...(old?{archiveId:old.id}:{}),recordId,type,name,status:'active',fields:type==='environment'?{conditions:'世界书明确设定'}:type==='member'?{role:'世界书已有设定'}:{description:'世界书明确设定'},details:{[field]:'本批明确原文 '+e.id+'/'+e.part},settingRefs:[...(changes.get(key)?.settingRefs||[]),{book:b.name,id:e.id,part:e.part}],sourceIndex:-1});}
   }return JSON.stringify({changes:[...changes.values()]});};
  await a.initializeTaishi();const total=a.taishiBuildDraft.plan.total;for(let i=0;i<total;i++){await importProgress({batch:i+1,phase:'start'});if(i)await a.initializeTaishi();await a.runTaishiBuild();const p=a.pendingArchiveReview;if(!p||p.issues.length)throw Error('批次 '+i+' 校验失败');
   if(i===7){const {decodeCheckpoint}=await import('/src/review-checkpoint.js'),s=a.contextSnapshot();a.pendingArchiveReview=decodeCheckpoint(localStorage.getItem('wanjie-wuku:review-checkpoint:'+s.chatKey),s);if(!a.pendingArchiveReview)throw Error('候选恢复失败');}
   await a.commitArchiveReview(a.pendingArchiveReview,new Map(a.pendingArchiveReview.changes.map((c,j)=>[j,c.id])));a.pendingArchiveReview=null;await importProgress({batch:i+1,phase:'saved'});
  }
  a.ui.setOpen(true);await a.initializeTaishi();const power=a.contextSnapshot().state.powers[a.powerId],rows=Object.values(power.archives);return {entries:entries.length,batches:total,completed:power.taishiBuild.next,archives:rows.length,worlds:rows.filter(r=>r.specific?.recordId==='world').length,maxInput,mockedModelCalls:calls};
 },book);
 assert.equal(result.entries,55);assert.equal(result.batches,result.completed);assert.equal(result.archives,439);assert.equal(result.worlds,1);assert(result.maxInput<120000);assert.equal(result.mockedModelCalls,result.batches);
 await page.locator('.wjwk-dialog').screenshot({path:resolve(out,'completed-mobile.png')});
 const evidence={...result,externalRequests:external,consoleErrors:errors,width:390};assert.equal(external,0);assert.deepEqual(errors,[]);await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));

}finally{await browser?.close();server.close();}
