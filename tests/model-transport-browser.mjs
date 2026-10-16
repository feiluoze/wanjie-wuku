import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.WJWK_NODE_MODULES+'/package.json')('playwright');
const calls=[],errors=[];let external=0,browser;
const server=createServer(async(req,res)=>{try{
 if(req.url==='/transport-preview'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Independent transport test</title>');return;}
 if(req.url.startsWith('/api/backends/chat-completions/')){
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);calls.push({path:req.url,method:req.method,csrf:req.headers['x-csrf-token'],body});
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.endsWith('/status')?{data:[{id:'test-chat-model'}]}:{choices:[{message:{content:'{"changes":[]}'},finish_reason:'stop'}]}));return;
 }
 const p=resolve('.','.'+decodeURIComponent(new URL(req.url,'http://local').pathname)),rel=relative(process.cwd(),p);if(rel.startsWith('..')||isAbsolute(rel))throw Error('path');
 res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(p)]||'application/octet-stream');res.end(await readFile(p));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.WJWK_BROWSER_EXECUTABLE});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(external++,route.abort()));
 await page.goto(`http://127.0.0.1:${server.address().port}/transport-preview`);
 const result=await page.evaluate(async()=>{
  const {ModelConnection}=await import('/src/model.js'),ctx={extensionSettings:{primaryModel:'unchanged'}},before=JSON.stringify(ctx.extensionSettings);
  const m=new ModelConnection({context:()=>({getRequestHeaders:()=>({'X-CSRF-Token':'test-local-csrf'})}),settings:()=>({mode:'custom',baseUrl:'https://provider.invalid/v1',model:'test-chat-model',timeoutSeconds:10}),getKey:()=> 'fake-generation-key'});
  const models=await m.listModels({baseUrl:'https://provider.invalid/v1',apiKey:'fake-draft-key'});
  const content=await m.request({system:'内部格式',user:'本次事实'});
  m.settings=()=>({mode:'custom',baseUrl:'https://provider.invalid/v1',model:'deepseek-flash',timeoutSeconds:10,thinkingMode:'on',customParameters:JSON.stringify({thinking:{type:'disabled'},reasoning_effort:'low',top_p:0.8,extra_body:{vendor:{flag:true}}})});await m.request({system:'格式',user:'事实'});
  return {models,content,settingsUnchanged:JSON.stringify(ctx.extensionSettings)===before};
 });
 assert.deepEqual(result,{models:['test-chat-model'],content:'{"changes":[]}',settingsUnchanged:true});assert.equal(calls.length,3);
 assert.equal(calls[0].path,'/api/backends/chat-completions/status');assert.equal(calls[1].path,'/api/backends/chat-completions/generate');
 for(const call of calls){assert.equal(call.method,'POST');assert.equal(call.csrf,'test-local-csrf');assert.equal(call.body.custom_url,'https://provider.invalid/v1');}
 assert.equal(JSON.parse(calls[0].body.custom_include_headers).Authorization,'Bearer fake-draft-key');
 assert.equal(JSON.parse(calls[1].body.custom_include_headers).Authorization,'Bearer fake-generation-key');
 assert.equal(JSON.parse(calls[2].body.custom_include_body).thinking.type,'disabled');assert.equal(calls[2].body.model,'deepseek-flash');assert.equal(JSON.parse(calls[2].body.custom_include_body).extra_body.vendor.flag,true);assert.equal(JSON.parse(calls[2].body.custom_include_body).top_p,0.8);
 assert.equal(calls[1].body.model,'test-chat-model');assert.equal(external,0);assert.deepEqual(errors,[]);
 const evidence={version:'1.5.3',sameOriginRequests:3,discoveryAndGenerationPassed:true,keysAndModelsIndependent:true,customNestedParametersPassed:true,noBrowserCrossOriginRequests:true,errors,paidCalls:0,realHostAcceptance:false};
 await mkdir(process.env.WJWK_SCREENSHOTS,{recursive:true});await writeFile(resolve(process.env.WJWK_SCREENSHOTS,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();server.close();}
