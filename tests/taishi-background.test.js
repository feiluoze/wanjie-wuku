import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkbenchUI} from '../src/ui.js';
import {fixture} from './mvu-fixture.js';

test('background dialog suppression is scoped to one power and chat and can be explicitly resumed',()=>{
 const ui=Object.create(WorkbenchUI.prototype);ui.view={chatKey:'chat-a'};ui.suspendTaishiDialogs('power-a');
 assert.equal(ui.taishiDialogsSuspended('power-a'),true);assert.equal(ui.taishiDialogsSuspended('power-b'),false);
 ui.view={chatKey:'chat-b'};assert.equal(ui.taishiDialogsSuspended('power-a'),false);
 ui.view={chatKey:'chat-a'};ui.resumeTaishiDialogs();assert.equal(ui.taishiDialogsSuspended('power-a'),false);
});
test('hidden worldbook loading and completion do not reopen a dialog; explicit reopen works',()=>{
 const ui=Object.create(WorkbenchUI.prototype);ui.view={chatKey:'chat-a'};let calls=0;ui.dialog=()=>calls++;
 const d={powerId:'p',loading:true,error:'',structure:{mode:'multiple'}};ui.suspendTaishiDialogs('p');ui.showTaishiBuild(d);assert.equal(calls,0);
 d.loading=false;d.error='模拟读取错误';ui.showTaishiBuild(d);assert.equal(calls,0);
 ui.resumeTaishiDialogs();ui.showTaishiBuild(d);assert.equal(calls,1);
});
test('successful world creation releases its input context without committing the preview',async()=>{
 const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.showTaishiDraft=()=>{};f.app.ui.showArchiveReview=()=>{};
 f.app.model.request=async()=>JSON.stringify({changes:[{name:'海蓝界',type:'environment',status:'active',fields:{conditions:'海洋世界'},recordId:'world',details:{overview:'群岛文明'},sourceIndex:-1}]});
 f.app.openTaishiDraft('world');await f.app.submitTaishiDraft({kind:'world',description:'建立成熟的海洋修仙世界'});
 assert.equal(f.app.taishiDraft,null);assert.equal(f.app.pendingArchiveReview.changes.length,1);assert.equal(Object.keys(f.store.read().powers[f.app.powerId].archives).length,0);clearTimeout(f.app.roleTimer);
});
