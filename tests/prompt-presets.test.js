import test from 'node:test';
import assert from 'node:assert/strict';
import {importPromptPreset,exportPromptPreset,emptyPromptLibrary,validatePromptLibrary,composePromptPreset} from '../src/prompt-presets.js';
import {getPromptPresetLibrary,savePromptPresetLibrary,getSettings,saveSettings,getApiKey,DEFAULT_SETTINGS} from '../src/host.js';
import {promptPresetMethods} from '../src/prompt-preset-ui.js';
import {ModelConnection} from '../src/model.js';
import {MODULE_ID} from '../src/core.js';
const source=()=>({name:'测试预设',api_key:'never-import',model:'never-import',prompts:[
 {identifier:'tail',name:'末尾',role:'assistant',content:'好的'},
 {identifier:'first',name:'开头',role:'system',content:'{{setvar::tone::简洁}}{{getvar::tone}}地回答{{user}}'},
 {identifier:'chatHistory',name:'历史',marker:true},
 {identifier:'worldInfoBefore',name:'世界书',marker:true},
 {identifier:'off',name:'停用',content:'不应发送'}],prompt_order:[{character_id:100001,order:[{identifier:'first',enabled:true},{identifier:'worldInfoBefore',enabled:true},{identifier:'chatHistory',enabled:true},{identifier:'tail',enabled:true},{identifier:'off',enabled:false}]}]});
function fixture(){const p=importPromptPreset(JSON.stringify(source())),lib=emptyPromptLibrary();lib.presets.push(p);lib.routes.archive=p.id;return {p,lib};}
const prompt={system:'只返回JSON，必须遵守归属与账目规则',user:'{"task":"整理","fact":"已经成立"}'};
test('ST order, enabled state, roles and task slots import without credentials or model parameters',()=>{
 const {p}=fixture();assert.deepEqual(p.blocks.map(b=>b.id),['first','worldInfoBefore','chatHistory','tail','off']);
 assert.equal(p.blocks[1].enabled,false);assert.equal(p.blocks[4].enabled,false);assert.equal(p.blocks[3].role,'assistant');assert(!JSON.stringify(p).includes('never-import'));
 const q=importPromptPreset(JSON.stringify(exportPromptPreset(p)));assert.deepEqual(q.blocks,p.blocks);assert.equal(q.name,p.name);assert.notEqual(q.id,p.id);
});
test('task insertion is once, presets are per task, final task boundary is retained and inputs are untouched',()=>{
 const {lib}=fixture(),before=JSON.stringify({lib,prompt}),settings={promptPresetLibrary:lib};
 const out=composePromptPreset(prompt,settings,'archive',{user:'小明'});
 assert.equal(out.messages[0].content,'简洁地回答小明');assert.deepEqual(out.messages.slice(1,3),[{role:'system',content:prompt.system},{role:'user',content:prompt.user}]);assert.equal(out.messages[3].role,'assistant');assert.match(out.messages.at(-1).content,/只返回武库任务/);
 assert.equal(composePromptPreset(prompt,settings,'creation'),prompt);assert.equal(JSON.stringify({lib,prompt}),before);
 lib.presets[0].blocks=lib.presets[0].blocks.filter(b=>b.kind!=='task');const fallback=composePromptPreset(prompt,settings,'archive');assert.equal(fallback.messages.filter(m=>m.content===prompt.user).length,1);
 const multi={...prompt,messages:[{role:'system',content:'现有数据库预设'},{role:'user',content:'原任务事实'}]};assert(composePromptPreset(multi,settings,'archive').messages.some(m=>m.content==='原任务事实'));
});
test('unsupported macros, malformed files, duplicates and invalid references fail explicitly',()=>{
 for(const raw of ['[]','{}','{bad',JSON.stringify({prompts:[{identifier:'a',content:'x'},{identifier:'a',content:'y'}]})])assert.throws(()=>importPromptPreset(raw));
 const {lib,p}=fixture();p.blocks[0].content='{{run::danger}}';assert.throws(()=>composePromptPreset(prompt,{promptPresetLibrary:lib},'archive'),/不支持的宏/);
 p.blocks[0].enabled=false;assert.doesNotThrow(()=>composePromptPreset(prompt,{promptPresetLibrary:lib},'archive'));
 lib.routes.archive='missing';assert.throws(()=>validatePromptLibrary(lib),/引用不存在/);
});
test('local/global macro values remain isolated across requests and never execute host evaluation',()=>{
 const {lib,p}=fixture();p.blocks[0].content='{{setglobalvar::x::你好}}{{getglobalvar::x}} {{char}}';assert.equal(composePromptPreset(prompt,{promptPresetLibrary:lib},'archive',{char:'甲'}).messages[0].content,'你好 甲');
 p.blocks[0].content='{{getglobalvar::x}}';assert.throws(()=>composePromptPreset(prompt,{promptPresetLibrary:lib},'archive'),/未初始化/);
});
test('account snapshot survives stale connection saves, rejects stale library writes and preserves secrets',async()=>{
 const ctx={userHandle:'preset-test',extensionSettings:{[MODULE_ID]:{...DEFAULT_SETTINGS,apiKey:'secret'}},saveSettingsDebounced(){}};
 const stale=getSettings(ctx),{lib}=fixture();const saved=savePromptPresetLibrary(lib,ctx);assert.equal(saved.revision,1);assert.throws(()=>savePromptPresetLibrary(lib,ctx),/另一窗口/);
 await saveSettings({...stale,theme:'dark'},ctx);assert.equal(getPromptPresetLibrary(ctx).presets.length,1);assert.equal(getApiKey(ctx),'secret');assert.equal(getSettings(ctx).theme,'dark');
 const other={...ctx,userHandle:'another',extensionSettings:{}};assert.deepEqual(getPromptPresetLibrary(other),emptyPromptLibrary());
});
test('custom HTTP and ST raw generation receive chosen blocks, while a disabled route restores baseline',async()=>{
 const {lib}=fixture();let body,params;
 const settings={mode:'custom',baseUrl:'https://example.test/v1',model:'test',timeoutSeconds:10,promptPresetLibrary:lib};
 const model=new ModelConnection({context:()=>({name1:'玩家',name2:'角色'}),settings:()=>settings,getKey:()=>'',fetchImpl:async(_u,r)=>{body=JSON.parse(r.body);return {ok:true,json:async()=>({choices:[{message:{content:'{}'}}]})};}});
 await model.request(prompt,{connection:{settings,task:'archive'}});assert.equal(body.messages[0].content,'简洁地回答玩家');assert(body.messages.some(m=>m.content===prompt.user));
 settings.promptPresetLibrary.routes.archive='';await model.request(prompt,{connection:{settings,task:'archive'}});assert.deepEqual(body.messages,[{role:'system',content:prompt.system},{role:'user',content:prompt.user}]);
 settings.promptPresetLibrary.routes.archive=lib.presets[0].id;const stSettings={...settings,mode:'st'};
 const st=new ModelConnection({context:()=>({generateRaw:p=>{params=p;return '{}';},name1:'玩家'}),settings:()=>stSettings,getKey:()=>''});await st.request(prompt,{connection:{settings:stSettings,task:'archive'}});assert(Array.isArray(params.prompt));assert(params.prompt.some(m=>m.content===prompt.system));assert.equal(params.systemPrompt,'');
 settings.promptPresetLibrary.presets[0].blocks[0].content='{{unsupported}}';let calls=0;model.fetchImpl=async()=>{calls++;};await assert.rejects(model.request(prompt,{connection:{settings,task:'archive'}}),/不支持/);assert.equal(calls,0);
});
test('installed preset copy is read-only and captures an independent snapshot',()=>{
 const raw=source(),ctx={userHandle:'installed-test',extensionSettings:{},getPresetManager:id=>{assert.equal(id,'openai');return {getCompletionPresetByName:name=>{assert.equal(name,'原预设');return raw;}};}};
 const previous=globalThis.SillyTavern;globalThis.SillyTavern={getContext:()=>ctx};
 try{const app={promptPresetCapture:{user:ctx.userHandle,settings:ctx.extensionSettings},showPromptPresetEditor(){}};promptPresetMethods.importInstalledPromptPreset.call(app,'原预设');const before=JSON.stringify(app.promptPresetDraft);raw.prompts[1].content='改动原预设';assert.equal(JSON.stringify(app.promptPresetDraft),before);assert.equal(ctx.extensionSettings[MODULE_ID],undefined);}finally{globalThis.SillyTavern=previous;}
});
