import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,emptyState,clone,validateState} from '../src/core.js';
import {builtinStatusbar} from '../src/builtin-statusbar.js';
import {archiveTables} from '../src/archive-tables.js';
import {archivePrompt,normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';

const power=()=>createPower(builtinEntries().find(e=>e.name==='源堡'));

test('one update can create the main status row and a base subtable record together',()=>{
 const p=power(),status=builtinStatusbar(p).groups[0],table=archiveTables(p).tables.find(t=>t.id==='records');
 const request=archivePrompt(p,[],[],'玩家确认已有状态与独立记录'),prompt=JSON.parse(request.user);
 assert(prompt.originalStatusbar);assert(prompt.longTermTables.tables.some(t=>t.id===table.id));assert.match(request.system,/主状态栏和所有已启用子表/);assert(!request.archiveSchema.required.includes('floorReviews'));assert(!prompt.responseContract.outputs.includes('floorReviews'));

 const data={changes:[
  {type:'record',name:status.title,status:'active',recordId:status.id,sourceIndex:-1,details:{[status.fields[0].id]:'灰雾之上收纳了北门钥匙。'}},
  {type:'record',name:'北门探索记录',status:'active',recordId:table.id,sourceIndex:-1,quote:'源堡记录了一次北门探索，尚未展开细节。'}
 ]};
 const batch=normalizeArchiveBatch(data,p,[],[],'玩家确认状态与独立记录');
 assert.deepEqual(batch.issues,[]);assert.equal(batch.changes.length,2);
 applyArchiveChanges(p,batch.changes,[],new Map([[0,null],[1,null]]),[]);
 const rows=Object.values(p.archives);assert.equal(rows.length,2);
 const main=rows.find(r=>r.specific?.recordId===status.id),base=rows.find(r=>r.specific?.recordId===table.id);
 assert(main.specific.fields[status.fields[0].id].includes('北门钥匙'));assert.equal(base.name,'北门探索记录');assert.deepEqual(base.specific.fields,{});assert.equal(base.fields.description,'源堡记录了一次北门探索，尚未展开细节。');

 const update={changes:[
  {type:'record',name:status.title,status:'active',recordId:status.id,sourceIndex:-1,details:{[status.fields[1].id]:'北门探索已进入长期记录。'}},
  {type:'record',name:base.name,status:'active',recordId:table.id,sourceIndex:-1,details:{content:'北门探索已经开始，细节仍待补充。'}}
 ]};
 const next=normalizeArchiveBatch(update,p,[],[],'玩家确认本次更新');assert.deepEqual(next.issues,[]);assert.equal(next.changes.length,2);
 applyArchiveChanges(p,next.changes,[],new Map([[0,main.id],[1,base.id]]),[]);
 assert.equal(Object.keys(p.archives).length,2);assert.equal(p.archives[base.id].fields.description,base.fields.description);assert.equal(p.archives[base.id].specific.fields.content,'北门探索已经开始，细节仍待补充。');assert.equal(p.archives[main.id].specific.fields[status.fields[1].id],'北门探索已进入长期记录。');
 const state=emptyState();state.powers[p.id]=p;validateState(clone(state));
});
