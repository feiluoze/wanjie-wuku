import test from 'node:test';
import assert from 'node:assert/strict';
import {createPower,emptyState,buildInjection,stable,ASYNC_MARKER} from '../src/core.js';
import {MMLC_ENTRY} from '../src/mmlc.js';
import {MMLC_RULEBOOK,MMLC_GAMEPLAY,MMLC_BODY_RULES_MARKER,mmlcRuleSelection,MMLC_CORE_RULES,mmlcBodySelection} from '../src/mmlc-rulebook.js';
import {installInjection} from '../src/host.js';
import {WorkbenchUI} from '../src/ui.js';

const setup=()=>{const state=emptyState(),power=createPower(MMLC_ENTRY);state.powers[power.id]=power;return {state,power};};

test('bounded core is injected once, with macros replaced and no state mutations',()=>{
 const {state,power}=setup(),before=stable(state),packet=buildInjection(state,{user:'李启龙',character:'阿青'});
 assert(MMLC_GAMEPLAY.length>16000);assert.equal(packet.split(`[${MMLC_BODY_RULES_MARKER}]`).length-1,1);
 assert(packet.includes(MMLC_CORE_RULES));assert(packet.length<6000);assert(!packet.includes(MMLC_GAMEPLAY));
 assert(!packet.includes('{{user}}'));assert(!packet.includes(MMLC_ENTRY.content));assert.match(packet,/不是已经取得的成果清单/);assert.match(packet,/不每轮重新发放/);
 assert.equal(stable(state),before);assert.equal(Object.keys(power.archives||{}).length,0);assert.deepEqual(power.assets,{});
});

test('module pause, removal and switching chats stop full-rule injection',()=>{
 const {state,power}=setup();power.active=false;assert.equal(buildInjection(state),'');power.active=true;assert(buildInjection(state));delete state.powers[power.id];assert.equal(buildInjection(state),'');assert.equal(buildInjection(emptyState()),'');
});

test('chat and plain host hooks carry bounded rules once and exclude async/dry requests',()=>{
 const {state,power}=setup(),handlers=new Map(),ctx={name1:'主角',name2:'角色',chat:[],eventTypes:{CHAT_COMPLETION_PROMPT_READY:'chat',GENERATE_AFTER_COMBINE_PROMPTS:'plain'},eventSource:{on:(key,fn)=>handlers.set(key,fn),removeListener:key=>handlers.delete(key)}};
 const bridge=installInjection({context:()=>ctx,store:{read:()=>state}}),text=MMLC_CORE_RULES.replaceAll('{{user}}','主角').replaceAll('{{char}}','角色');
 const chat={chat:[{role:'user',content:'继续修行'}]};handlers.get('chat')(chat);handlers.get('chat')(chat);
 assert.equal(chat.chat.length,2);assert(chat.chat.at(-1).content.includes(text));
 const raw={chat:[{role:'system',content:ASYNC_MARKER}]};handlers.get('chat')(raw);assert.equal(raw.chat.length,1);
 const dry={dryRun:true,chat:[]};handlers.get('chat')(dry);assert.equal(dry.chat.length,0);
 const plain={prompt:'故事正文'};handlers.get('plain')(plain);handlers.get('plain')(plain);assert(plain.prompt.includes(text));assert.equal(plain.prompt.split(`[${MMLC_BODY_RULES_MARKER}]`).length-1,1);
 const rawPlain={prompt:ASYNC_MARKER};handlers.get('plain')(rawPlain);assert.equal(rawPlain.prompt,ASYNC_MARKER);
 power.active=false;handlers.get('chat')(chat);handlers.get('plain')(plain);assert.deepEqual(chat.chat,[{role:'user',content:'继续修行'}]);assert.equal(plain.prompt,'故事正文');
 bridge.cleanup();assert.equal(handlers.size,0);
});

test('draft selection stays bounded independently of full main-story rules',()=>{
 const {state}=setup();assert(buildInjection(state).includes(MMLC_CORE_RULES));assert(mmlcRuleSelection('arts','参悟混沌本源').text.length<=16000);
 const ui=Object.create(WorkbenchUI.prototype);ui.view={state};const html=ui.management(state,state.powers[MMLC_ENTRY.id],false,'off',null,[]);assert.match(html,/正文规则智能选取/);
});
