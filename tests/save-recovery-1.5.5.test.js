import test from 'node:test';import assert from 'node:assert/strict';
import {WorkbenchUI} from '../src/ui.js';import {fixture} from './mvu-fixture.js';
test('save recovery distinguishes memory-only and local-backup states and never leaks across chats',()=>{
 const ui=Object.create(WorkbenchUI.prototype),view={state:{},chatKey:'one',save:{chatKey:'one',verified:false,local:false,storageError:'容量不足',server:'落盘内容未匹配'}};
 const html=ui.saveRecovery(view);assert.match(html,/暂停后续修改/);assert.match(html,/data-action="retry-save"/);assert.match(html,/data-action="export-all"/);assert.match(html,/保持页面开启/);assert.match(html,/容量不足/);
 assert.equal(ui.saveRecovery({...view,chatKey:'two'}),'');assert.equal(ui.saveRecovery({...view,save:{...view.save,verified:true}}),'');assert.equal(ui.saveRecovery({...view,save:{...view.save,saving:true}}),'');
 const backed={...view,save:{...view.save,local:true}};const note=ui.saveRecovery(backed);
 assert.match(note,/已有本机备份/);assert.match(note,/dismiss-save-notice/);assert.doesNotMatch(note,/role="alert"/);
 ui.dismissedSaveNotices=new Set(['one']);
 assert.equal(ui.saveRecovery({...backed,save:{...backed.save,at:123}}),'');
 assert.match(ui.saveRecovery({...backed,chatKey:'two',save:{...backed.save,chatKey:'two'}}),/已有本机备份/);
 assert.match(ui.saveRecovery({...backed,save:{...backed.save,conflict:true}}),/role="alert"/);
 assert.match(ui.saveRecovery(view),/role="alert"/);
 assert(!ui.saveRecovery({...view,busy:true}).match(/data-action="export-all"[^>]*disabled/));
});
test('retry failure always releases the UI lock; concurrent retries are rejected',async()=>{
 const f=fixture();let release;f.store.retrySave=()=>new Promise((_,reject)=>{release=()=>reject(Error('still unavailable'));});const running=f.app.action('retry-save',{});assert(f.app.committing);await assert.rejects(f.app.action('retry-save',{}),/正在提交/);release();await assert.rejects(running,/still unavailable/);assert.equal(f.app.committing,false);
});
