import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {createPower,emptyState,validateState,stable,clone} from '../src/core.js';
import {archiveDisplayFields} from '../src/archives.js';
import {archiveInputRecord} from '../src/archive-input.js';
import {normalizeArchiveBatch,applyArchiveChanges} from '../src/archive-review.js';
import {WorkbenchUI} from '../src/ui.js';
const quote='重要技能：冲锋、斩杀、旋风斩、战斗怒吼、盾牌格挡、盾墙、战地急救包扎、法理纹章学与贵族领地法辨识';
function basic(){
 const p=createPower(builtinEntries().find(e=>e.name==='人间游戏'));
 const b=normalizeArchiveBatch({changes:[{type:'skill',recordId:'skill',name:'冲锋',status:'active',sourceIndex:-1,quote}]},p,[],[],'玩家明确确认已掌握冲锋');
 assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map([[0,null]]),[]);
 return {p,r:Object.values(p.archives)[0]};
}
test('a base skill keeps its evidence outside all attribute fields and survives state validation',()=>{
 const {p,r}=basic();assert(!Object.values(r.fields).some(Boolean));assert.equal(r.source.quote,quote);assert.deepEqual(r.specific.fields,{});
 const s=emptyState();s.powers[p.id]=p;validateState(s);
 const ui=Object.create(WorkbenchUI.prototype),html=ui.archiveCard(r,[],false,true);
 assert(!html.includes(quote));assert(!html.includes('已达程度'));assert(html.includes('详情待补充'));assert(html.includes('查看详情'));
});
test('legacy list fallback is omitted from cards and AI context while raw evidence and history remain unchanged',()=>{
 const {r}=basic();r.fields.level=quote;const before=stable(r),ui=Object.create(WorkbenchUI.prototype);
 assert(!archiveDisplayFields(r).level);assert(!archiveInputRecord(r).fields.level);assert(!ui.archiveCard(r,[],false,true).includes(quote));assert.equal(stable(r),before);
 const grown=clone(r);grown.history=[clone(r)];grown.fields.level='熟练';assert.equal(archiveDisplayFields(grown).level,'熟练');
 const known=clone(r);known.specific.fields.effect='已确认的冲锋效果';assert.equal(archiveDisplayFields(known).level,quote);
 const short=clone(r);short.fields.level='3';short.source.quote='3';assert.equal(archiveDisplayFields(short).level,'3');
});
test('dedicated detail-only updates are not copied into an unrelated generic degree field',()=>{
 const {p,r}=basic();
 const b=normalizeArchiveBatch({changes:[{type:'skill',recordId:'skill',name:'斩杀',status:'active',sourceIndex:-1,details:{effect:'已确认的斩杀效果'}}]},p,[],[],'玩家确认已掌握斩杀');
 assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,[],new Map([[0,null]]),[]);
 const saved=Object.values(p.archives).find(x=>x.name==='斩杀');assert(!Object.values(saved.fields).some(Boolean));assert.equal(saved.specific.fields.effect,'已确认的斩杀效果');assert.equal(r.fields.level,'');
});
