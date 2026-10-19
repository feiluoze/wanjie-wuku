import {clone,assert} from './primitives.js';
import {floorCoverage} from './archive-protocol.js';
// Isolated per-run overlay. Local provisional IDs never reach a model or disk.
export function createArchiveStaging(power,{normalize,apply,chat=[],state={}}){
 let working=clone(power);const originalIds=new Set(Object.keys(power.archives||{}));
 return {
  get power(){return working;},
  prompt(prompt){
   const payload=JSON.parse(prompt.user);
   payload.current=payload.current.map(r=>{if(!r.archiveId||originalIds.has(r.archiveId))return r;const {archiveId,...row}=r;return {...row,pendingInBatch:true};});
   payload.batchWorkingView='current 含本批前层已校验、尚未保存的工作副本。pendingInBatch=true 的对象没有正式 archiveId，继续更新时沿用完全相同的 name/recordId，operation=update，省略 archiveId；不要另起阶段名称。其余对象沿用正式 ID。候选仍需最终确认，工作副本不是已到账。';
   const user=JSON.stringify(payload);if(user.length>120000){const e=Error('发送前检查：批次工作副本超过120000字符，请缩小读取范围；尚未调用模型');e.requestStage='preflight';throw e;}
   return {...prompt,user,inputCharacters:{...prompt.inputCharacters,current:JSON.stringify(payload.current).length,batchWorkingView:payload.batchWorkingView.length}};
  },
  accept(data,source){
   const batch=normalize(data,working,[source],chat,'',state);
   const byInput=new Map(batch.changes.map(c=>[c.inputIndex,c]));
   const changes=(data.changes||[]).map((raw,i)=>{
    const c=byInput.get(i),pending=c?.id&&!originalIds.has(c.id);
    if(!pending)return raw;
    const row={...raw,name:c.name};delete row.archiveId;delete row.operation;return row;
   });
   // Invalid/uncertain floors never influence the next request. Raw proposals
   // still reach final validation and remain available for manual repair.
   if(!batch.issues.length&&floorCoverage(data,[source],batch.changes,batch.terminalResults,batch.creationResults)[0].status==='reviewed'){
    const next=clone(working);
    apply(next,batch.changes,[source],new Map(batch.changes.map((c,i)=>[i,c.id])),chat);
    working=next;
   }
   assert(Object.keys(working.archives||{}).length<=512,'批次工作副本超过单词条档案上限');
   return {...data,changes};
  }
 };
}
