import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAccount,scope} from '../src/host.js';
import {emptyState,createPower,buildInjection} from '../src/core.js';
import {builtinTaishiEntry,builtinEntries} from '../src/builtin-worldbook.js';
import {MMLC_ENTRY,isMmlc} from '../src/mmlc.js';
import {isTaishi} from '../src/taishi.js';
import {moduleEnabled,spaceMethods} from '../src/space-controller.js';

test('single-user host accepts authoritative default-user without unsupported account request',async()=>{
 let calls=0;
 assert.equal(await resolveAccount({}, {loadUsers:async()=>({getCurrentUserHandle:()=> 'default-user',accountsEnabled:false}),fetchImpl:async()=>{calls++;throw Error('must not fetch');}}),'default-user');
 assert.equal(calls,0);
 assert.match(scope({chatMetadata:{},chat:[],chatId:'a',characterId:0}).key,/^user:/);
});
test('multi-user pre-login placeholder cannot bypass failed authentication',async()=>{
 let calls=0;
 await assert.rejects(resolveAccount({getRequestHeaders:()=>({})},{loadUsers:async()=>({getCurrentUserHandle:()=> 'default-user',accountsEnabled:true,currentUser:null}),fetchImpl:async()=>{calls++;return {ok:false,status:401};}}),/账户识别失败/);
 assert.equal(calls,1);
});
test('actual default-user login remains valid on account-enabled hosts',async()=>{
 assert.equal(await resolveAccount({}, {loadUsers:async()=>({getCurrentUserHandle:()=> 'default-user',accountsEnabled:true,currentUser:{handle:'default-user'}})}),'default-user');
});
test('module switches preserve records, suppress disabled rules and restore same identities',async()=>{
 const state=emptyState(),m=createPower(MMLC_ENTRY),t=createPower({...builtinTaishiEntry(),id:'test_taishi'});
 state.powers[m.id]=m;state.powers[t.id]=t;
 t.fields.keep={label:'保留记录',value:'已有世界'};
 state.transactions.push({type:'setup',powerId:t.id,label:'太始天私有历史',changes:[]});
 const ctx={chat:[]}, app={ensureStable:()=>({state,ctx,chatKey:'c',hashes:[]}),store:{transact:async f=>f(state)},record(){},ui:{closeDialog(){}},refresh(){},notice(){}};
 assert.equal(moduleEnabled(state,'taishi'),true);
 await spaceMethods.saveModules.call(app,{});
 assert.equal(moduleEnabled(state,'taishi'),false);assert.equal(moduleEnabled(state,'mmlc'),false);
 assert.equal(buildInjection(state),'');assert.equal(t.fields.keep.value,'已有世界');
 await spaceMethods.saveModules.call(app,{mmlc:'on',taishi:'on'});
 assert.equal(Object.values(state.powers).filter(isTaishi).length,1);assert.equal(Object.values(state.powers).filter(isMmlc).length,1);
 assert.equal(state.powers[t.id].fields.keep.value,'已有世界');assert.match(buildInjection(state),/太始天/);
});
test('fresh module switches create only explicitly enabled modules without model calls',async()=>{
 const state=emptyState(),app={ensureStable:()=>({state,ctx:{chat:[]},chatKey:'c'}),store:{transact:async f=>f(state)},record(){},ui:{closeDialog(){}},refresh(){},notice(){}};
 await spaceMethods.saveModules.call(app,{});assert.equal(Object.keys(state.powers).length,0);
 await spaceMethods.saveModules.call(app,{mmlc:'on'});
 assert.equal(moduleEnabled(state,'mmlc'),true);assert.equal(moduleEnabled(state,'taishi'),false);
});
