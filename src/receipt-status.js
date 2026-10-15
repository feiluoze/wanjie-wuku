// Derive visible settlement stages from the existing ledger and queues only.
export function receiptStatus(state,transaction){
 const write=state.roleWrites?.find(r=>r.id===transaction.id),story=state.narrativeActions?.find(r=>r.id===transaction.id);
 const stages=[['operation','story'].includes(transaction.type)?'账本已结算':'记录已保存'];
 if(write)stages.push({pending:'角色待同步',applied:'角色已同步',abandoned:'角色同步已停止'}[write.status]||'角色状态待核对');
 else if(transaction.roleWrite)stages.push({pending:'角色待同步',applied:'角色已同步',abandoned:'角色同步已停止'}[transaction.roleWrite]||'角色状态待核对');
 if(story)stages.push({waiting:'正文待承接',generating:'正文承接中',presented:'正文已生成，待核对',confirmed:'正文已确认',stopped:'正文承接已停止'}[story.status]||'正文待核对');
 return {stages,pendingRole:write?.status==='pending'};
}
