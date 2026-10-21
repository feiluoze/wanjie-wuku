import test from 'node:test';
import assert from 'node:assert/strict';
import {manualAttentionCount} from '../src/workbench-design.js';
const state=()=>({id:'chat-a',revision:2,powers:{p:{active:true},other:{active:true}},roleWrites:[],narrativeActions:[]});
test('attention survives opening and switching selected powers, clears with candidates',()=>{
 const view={state:state(),pendingArchiveReview:{powerId:'other',captured:{stateId:'chat-a',revision:2},changes:[{},{}]}};
 assert.equal(manualAttentionCount(view),2);
 view.open=true;view.power=view.state.powers.p;assert.equal(manualAttentionCount(view),2);
 view.pendingArchiveReview=null;assert.equal(manualAttentionCount(view),0);
});
test('stale, removed and other-chat candidates never leave a red dot',()=>{
 const view={state:state(),pendingArchiveReview:{powerId:'other',captured:{stateId:'chat-a',revision:1},changes:[{}]}};
 assert.equal(manualAttentionCount(view),0);view.pendingArchiveReview.captured.revision=2;
 view.state.id='chat-b';assert.equal(manualAttentionCount(view),0);
 view.state=undefined;assert.equal(manualAttentionCount(view),0);
});
test('only actionable statuses count; completion clears the indicator',()=>{
 const view={state:state()};view.state.roleWrites=[{status:'pending'},{status:'done'}];
 view.state.narrativeActions=[{powerId:'p',status:'presented'},{powerId:'p',status:'generating'},{powerId:'p',status:'waiting'}];
 assert.equal(manualAttentionCount(view),2);view.state.roleWrites[0].status='done';view.state.narrativeActions[0].status='confirmed';
 assert.equal(manualAttentionCount(view),0);
});
