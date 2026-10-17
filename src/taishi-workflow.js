import {archiveResponseSchema} from './archive-contract.js';
import {assert,clone,hash,stable} from './primitives.js';
import {archiveResponseContract,archiveSummaryPreset} from './archive-preset.js';

export const TAISHI_ROLES=Object.freeze(['taishiWorld','taishiPeople','taishiSummary']);
export const TAISHI_STAGE_NAMES=Object.freeze({taishiWorld:'世界核对',taishiPeople:'人物更新',taishiSummary:'变化摘要'});
export const TAISHI_STAGE_ATTEMPTS=3;
const worldRecords=new Set(['world','inhabitants','development','growth','available','region','organization','event','manifestation']);
const owns=(role,record)=>role==='taishiWorld'?worldRecords.has(record):['companion','relation'].includes(record);
const failed=(role,reason,kind='专职任务',name=role)=>({kind,name,role,reason:String(reason).slice(0,500)});

// Cache lives in the pending preview only, never in chat data, keys or model profiles.
// A resumed action invokes exactly one role. The normal validator and commit queue
// still own archive writes and progress; summary can only replace the display text.
export async function runTaishiWorkflow(prompt,invoke,{signal,onStage=()=>{},parallel=true,resume=null,retryRole=null,validateChanges=()=>[],onAttempt=()=>{},onCheckpoint=()=>{}}={}){
  const check=()=>{if(signal?.aborted)throw new DOMException('查询已取消','AbortError');};
  const input=JSON.parse(prompt.user),promptHash=hash(stable(prompt));
  let state={version:1,promptHash,stages:Object.fromEntries(TAISHI_ROLES.map(role=>[role,{status:'pending',attempts:0,changes:[],issues:[],message:''}]))};
  if(resume){
    assert(resume.version===1&&resume.promptHash===promptHash,'剧情、档案或参考世界书已变化，请重新核对，不能续跑旧候选');
    assert(TAISHI_ROLES.includes(retryRole),'续跑阶段无效');state=clone(resume);
    for(const role of TAISHI_ROLES){const s=state.stages?.[role];assert(s&&['pending','success','failed'].includes(s.status)&&Number.isInteger(s.attempts)&&s.attempts>=0&&s.attempts<=TAISHI_STAGE_ATTEMPTS&&Array.isArray(s.changes)&&s.changes.length<=64&&Array.isArray(s.issues),'续跑缓存无效');}
    const stage=state.stages[retryRole];
    assert(stage.status==='failed'||retryRole==='taishiSummary'&&stage.status==='pending','已成功的阶段无需重跑');
    assert(stage.attempts<TAISHI_STAGE_ATTEMPTS,'本阶段已达到3次请求上限；请检查连接或缩小范围后重新核对');
    if(retryRole==='taishiSummary')assert(TAISHI_ROLES.slice(0,2).every(role=>state.stages[role].status==='success'),'请先完成世界与人物阶段，再生成摘要');
  }else assert(!retryRole,'缺少可续跑候选');
  const specialist=async role=>{
    check();const stage=state.stages[role],attempts=stage.attempts+1;
    state.stages[role]={status:'failed',attempts,changes:[],issues:[],message:''};const current=state.stages[role];onAttempt(role,attempts);onCheckpoint(clone(state));
    const payload={...input,explainRules:false,terminalOrders:[],creationItems:[],recordSchemas:(input.recordSchemas||[]).filter(r=>owns(role,r.id))};
    payload.responseContract=archiveResponseContract(payload);
    payload.specialist={role,recordIds:payload.recordSchemas.map(r=>r.id)};
    try{
      const data=await invoke({...prompt,archiveSchema:archiveResponseSchema(payload),user:JSON.stringify(payload),system:prompt.system+'\n<wjwk_specialist>\n本轮分工：'+(role==='taishiWorld'?'只处理世界、区域、组织、事件、文明与发展记录。':'只处理人物、眷属与关系记录，保留方向、原因、来源事件、设定细节与认知边界。')+' changes每项必须填写本轮recordSchemas中的recordId；已有对象必须沿用原archiveId和分类。不得返回terminalResults、creationResults或guide。不要处理另一专职角色的记录。floorReviews只统计本角色实际输出，不把另一专职未返回内容算入。\n</wjwk_specialist>'},role);
      check();assert(data&&Array.isArray(data.changes)&&data.changes.length<=64,'返回的变化列表无效');
      for(const row of data.changes){
        const before=row?.archiveId?(input.current||[]).find(r=>(r.archiveId||r.id)===row.archiveId):null;
        if(!row||!owns(role,row.recordId)||before&&(before.recordId||before.specific?.recordId)!==row.recordId){current.issues.push(failed(role,'越过专职分类或改变已有对象分类，已跳过','专职范围',String(row?.name||role).slice(0,200)));continue;}
        current.changes.push(row);
      }
      current.issues.push(...validateChanges(current.changes,role).map(i=>failed(role,i.reason,'专职校验',i.name)));
      current.floorReviews=Array.isArray(data.floorReviews)?data.floorReviews:[];
      current.message=String(data.message||'').slice(0,1500);current.status=current.issues.length?'failed':'success';
    }catch(error){check();current.issues.push(failed(role,error.message||'任务失败'));}
    onCheckpoint(clone(state));
  };
  const summary=async()=>{
    check();const stage=state.stages.taishiSummary,attempts=stage.attempts+1;
    state.stages.taishiSummary={status:'failed',attempts,changes:[],issues:[],message:''};const current=state.stages.taishiSummary;onAttempt('taishiSummary',attempts);onCheckpoint(clone(state));
    try{
      const result=await invoke(archiveSummaryPreset(TAISHI_ROLES.slice(0,2).flatMap(role=>state.stages[role].changes),TAISHI_ROLES.slice(0,2).map(role=>state.stages[role].message)),'taishiSummary');
      check();assert(typeof result?.message==='string','摘要返回无效，保留原候选');current.message=result.message.slice(0,3000);current.status='success';
    }catch(error){check();current.issues.push(failed('taishiSummary',error.message||'汇总失败'));}
    onCheckpoint(clone(state));
  };
  check();
  if(resume){onStage('单独续跑：'+TAISHI_STAGE_NAMES[retryRole]+'（1次请求）');await (retryRole==='taishiSummary'?summary():specialist(retryRole));}
  else{
    onStage(parallel?'世界与人物并行核对（2次请求）':'酒馆连接顺序核对世界与人物（2次请求）');
    if(parallel)await Promise.all(TAISHI_ROLES.slice(0,2).map(specialist));else for(const role of TAISHI_ROLES.slice(0,2))await specialist(role);
    check();if(TAISHI_ROLES.slice(0,2).every(role=>state.stages[role].status==='success')){onStage('汇总变化（第3次请求）');await summary();}
  }
  check();const changes=TAISHI_ROLES.slice(0,2).flatMap(role=>state.stages[role].changes);
  assert(changes.length<=64,'合并变化超过64项，请缩小读取范围');
  const issues=TAISHI_ROLES.flatMap(role=>state.stages[role].issues);
  // A deferred summary is visible and blocks progress until explicitly generated.
  if(state.stages.taishiSummary.status==='pending')issues.push(failed('taishiSummary','摘要尚未生成；完成专职后可单独生成','等待汇总'));
  const message=state.stages.taishiSummary.status==='success'?state.stages.taishiSummary.message:TAISHI_ROLES.slice(0,2).map(role=>state.stages[role].message).filter(Boolean).join('；');
  const floorReviews=(input.sources||[]).map(s=>{
    const rows=TAISHI_ROLES.slice(0,2).map(role=>(state.stages[role].floorReviews||[]).filter(r=>r.sourceIndex===s.index));
    const reviewed=rows.every(r=>r.length===1&&r[0].status==='reviewed'&&Number.isSafeInteger(r[0].changeCount)&&r[0].changeCount>=0);
    return {sourceIndex:s.index,status:reviewed?'reviewed':'uncertain',changeCount:reviewed?rows.reduce((sum,r)=>sum+r[0].changeCount,0):0};
  });
  return {changes,message,floorReviews,workflowIssues:issues,workflowState:state};
}
