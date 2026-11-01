import {assert,clone,hash,stable} from './primitives.js';
import {archiveResponseSchema} from './archive-contract.js';
import {archiveResponseContract,archiveSummaryPreset} from './archive-preset.js';
import {collaborationSettings} from './taishi-collaboration-config.js';
export {collaborationSettings} from './taishi-collaboration-config.js';

export const COLLABORATION_ROLES=['taishiWorld','taishiPeople','taishiReview','taishiSummary'];
export const COLLABORATION_NAMES={taishiWorld:'世界发展',taishiPeople:'人物活动',taishiReview:'因果复核',taishiSummary:'世界简报'};
export const WORLD_RECORDS=['world','inhabitants','development','growth','available','region','organization','event','manifestation'];
const owns=(role,id)=>(role==='taishiWorld'?WORLD_RECORDS:['companion','relation']).includes(id);
const key=v=>String(v||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
export function collaborationPlan(input,config){
 config=collaborationSettings(config);
 const evolution=input.taskMode==='evolution',schemas=input.recordSchemas||[];
 // Do not guess that an unfamiliar name is not a person. Automatic omission is
 // allowed only when the provided schema or explicit player selection excludes it.
 const peopleOff=input.peopleSelection?.mode==='selected'&&!(input.peopleSelection.selected?.length||input.peopleSelection.pinned?.length)&&!schemas.some(r=>r.id==='relation');
 const roles=['taishiWorld','taishiPeople'].filter(role=>schemas.some(r=>owns(role,r.id))&&!(role==='taishiPeople'&&peopleOff)&&
  (evolution||!['world','people'].includes(config.scope)||role===(config.scope==='world'?'taishiWorld':'taishiPeople')));
 return {roles,evolution,limited:!evolution&&['world','people'].includes(config.scope),maxRequests:roles.length*config.maxAttempts+(config.mode==='deep'?config.maxAttempts:0)+(config.summary?config.maxAttempts:0)};
}
const issue=(role,reason,row={},kind='专职任务')=>({kind,role,name:row.name||COLLABORATION_NAMES[role],...(Number.isSafeInteger(row.sourceIndex)?{sourceIndex:row.sourceIndex}:{}),reason:String(reason).slice(0,600)});
const blank=()=>({status:'pending',attempts:0,changes:[],issues:[],floorReviews:[],message:''});
export const candidateRef=row=>'c_'+hash(stable({id:row.archiveId||'',kind:row.recordId,name:key(row.name),world:row.details?.world_id||key(row.details?.world)}));
const refValue=v=>typeof v==='string'&&v.startsWith('@candidate:')?v.slice(11):null;
const referenceFields=new Set(['world_id','region_id','organization_id','civilization_id','subject_id','target_id','event_id']);
const sourceFingerprint=input=>hash(stable(Object.fromEntries(['sources','context','playerNote','rules','attachedWorldbooks','taskMode','taishiEvolution','peopleSelection','protectedRelations','worldStructure','recordSchemas'].map(k=>[k,input[k]??null]))));

// Model-only metadata is removed before the normal archive validator sees rows.
// References remain preview dependencies until targets have actually been saved.
export function collaborationOutput(state,input){
 const exact=new Set(),items=['taishiWorld','taishiPeople'].flatMap(role=>state.stages[role].changes.map(row=>({row,role}))).filter(({row})=>{const signature=stable(row);if(exact.has(signature))return false;exact.add(signature);return true;}),issues=[];
 const known=new Set((input.current||[]).map(r=>r.archiveId||r.id)),byRef=new Map(),duplicates=new Set();
 for(const [i,{row}]of items.entries()){const ref=row.candidateRef||candidateRef(row);if(byRef.has(ref))duplicates.add(ref);else byRef.set(ref,i);}
 const invalid=new Set(),dependencies=[],clean=items.map(({row,role},inputIndex)=>{
  const {candidateRef:ignored,dependsOn=[],...copy}=clone(row);
  if(!Array.isArray(dependsOn)||dependsOn.length>16||!dependsOn.every(r=>typeof r==='string'&&r.length<=200)){invalid.add(inputIndex);issues.push(issue(role,'候选依赖格式无效；本项保留待处理',row,'候选依赖'));}
  else for(const ref of dependsOn)if(!known.has(state.adoptedRefs?.[ref]))dependencies.push({inputIndex,targetInputIndex:byRef.get(ref),ref,role});
  for(const [field,value]of Object.entries(copy.details||{})){
   const ref=refValue(value);if(!referenceFields.has(field)||!ref)continue;
   const targetInputIndex=byRef.get(ref),target=items[targetInputIndex]?.row;
   if(known.has(state.adoptedRefs?.[ref]))copy.details[field]=state.adoptedRefs[ref];
   else if(target?.archiveId&&known.has(target.archiveId))copy.details[field]=target.archiveId;
   else {delete copy.details[field];dependencies.push({inputIndex,targetInputIndex,ref,field,role});}
  }
  return copy;
 });
 const held=new Set(invalid);
 for(const [i,conflict]of (state.conflicts||[]).entries())if(state.conflictDecisions?.[i]!=='keep')for(const ref of conflict.candidateRefs){const target=byRef.get(ref);if(target!==undefined)held.add(target);}
 for(const d of dependencies)if(d.targetInputIndex===undefined||duplicates.has(d.ref)||d.targetInputIndex===d.inputIndex){held.add(d.inputIndex);issues.push(issue(d.role,'所依赖候选不存在、重复或引用自身；本项留待处理',items[d.inputIndex].row,'候选依赖'));}
 for(const ref of duplicates){const i=byRef.get(ref);held.add(i);items.forEach(({row},j)=>{if((row.candidateRef||candidateRef(row))===ref)held.add(j);});issues.push(issue(items[i].role,'同一对象出现多项候选，请核对后重新生成',items[i].row,'候选冲突'));}
 // Topological cycle detection and transitive holds affect only related rows.
 const active=new Set(),done=new Set();
 const visit=i=>{if(active.has(i)){held.add(i);return;}if(done.has(i))return;active.add(i);for(const d of dependencies.filter(d=>d.field&&d.inputIndex===i&&d.targetInputIndex!==undefined)){visit(d.targetInputIndex);if(held.has(d.targetInputIndex))held.add(i);}active.delete(i);done.add(i);};
 clean.forEach((_,i)=>visit(i));
 let changed=true;while(changed){changed=false;for(const d of dependencies)if(held.has(d.targetInputIndex)&&!held.has(d.inputIndex)){held.add(d.inputIndex);changed=true;}}
 const map=new Map(),changes=clean.filter((row,i)=>{if(held.has(i)){issues.push(issue(items[i].role,'本项有待处理的复核或关联问题，其他独立候选仍可接受',row,'协作待处理'));return false;}map.set(i,map.size);return true;});
 return {changes,workflowRefs:items.filter((_,i)=>map.has(i)).map(({row})=>row.candidateRef||candidateRef(row)),workflowDependencies:dependencies.filter(d=>map.has(d.inputIndex)&&map.has(d.targetInputIndex)).map(d=>({...d,inputIndex:map.get(d.inputIndex),targetInputIndex:map.get(d.targetInputIndex),expectedRecordId:items[d.targetInputIndex].row.recordId,name:items[d.targetInputIndex].row.name})),issues};
}
export function rebaseCollaboration(state,accepted){
 const result=clone(state);result.rebaseAfterSave=true;
 result.adoptedRefs={...result.adoptedRefs,...Object.fromEntries(accepted)};
 for(const role of ['taishiWorld','taishiPeople']){const stage=result.stages[role];stage.changes=stage.changes.filter(r=>!accepted.has(r.candidateRef||candidateRef(r))).map(r=>{
  r.dependsOn=(r.dependsOn||[]).filter(ref=>!accepted.has(ref));for(const [field,v]of Object.entries(r.details||{})){const ref=refValue(v);if(ref&&accepted.has(ref))r.details[field]=accepted.get(ref);}return r;});
  stage.floorReviews=stage.floorReviews.map(r=>({...r,changeCount:stage.changes.filter(c=>c.sourceIndex===r.sourceIndex).length}));
 }
 // Conflicts always refer to the original candidate set. Retain only unresolved
 // groups; saved references were explicitly accepted by the player already.
 result.conflicts=(result.conflicts||[]).filter((c,i)=>result.conflictDecisions?.[i]!=='keep').map(c=>({...c,candidateRefs:c.candidateRefs.filter(ref=>!accepted.has(ref))})).filter(c=>c.candidateRefs.length);result.conflictDecisions={};
 if(result.config.summary)result.stages.taishiSummary.status='pending';
 return result;
}

export async function runCollaboration(prompt,invoke,{config={},signal,parallel=true,resume=null,retryRole=null,validateChanges=()=>[],onStage=()=>{},onAttempt=()=>{},onCheckpoint=()=>{},coordinateOnly=false}={}){
 const input=JSON.parse(prompt.user),settings=collaborationSettings(config),plan=collaborationPlan(input,settings),promptHash=hash(stable({prompt,settings}));
 let state={version:2,promptHash,sourceFingerprint:sourceFingerprint(input),config:settings,plan,stages:Object.fromEntries(COLLABORATION_ROLES.map(r=>[r,blank()])),coordination:{status:'pending'},reviewHolds:[]};
 const check=()=>{if(signal?.aborted)throw new DOMException('查询已取消','AbortError');};
 const checkpoint=()=>{check();onCheckpoint(clone(state));};
 if(resume){assert(resume.version===2&&(resume.promptHash===promptHash||resume.rebaseAfterSave&&resume.sourceFingerprint===sourceFingerprint(input)&&stable(resume.config)===stable(settings)),'剧情、档案、参考或分工设置已变化，请重新核对');state={...clone(resume),promptHash,rebaseAfterSave:false};assert(COLLABORATION_ROLES.includes(retryRole),'续跑岗位无效');
  for(const role of COLLABORATION_ROLES){const s=state.stages[role];assert(s&&['pending','success','failed','skipped'].includes(s.status)&&Number.isInteger(s.attempts)&&s.attempts>=0&&s.attempts<=settings.maxAttempts&&Array.isArray(s.changes)&&s.changes.length<=128&&Array.isArray(s.issues),'协作恢复缓存无效');}
  const s=state.stages[retryRole];assert(coordinateOnly?retryRole==='taishiWorld'&&state.coordination.status==='pending':s.status==='failed'||s.status==='pending','此岗位无需续跑');assert(s.attempts<settings.maxAttempts,'本岗位已达到请求上限，请检查连接或缩小范围');
  if(['taishiReview','taishiSummary'].includes(retryRole))assert(plan.roles.every(r=>['success','skipped'].includes(state.stages[r].status)),'请先完成世界与人物岗位');
  if(plan.evolution&&retryRole==='taishiPeople')assert(state.stages.taishiWorld.status==='success','请先完成世界岗位，再继续人物发展');
 }
 const request=async(p,role)=>{
  assert(p.user.length+p.system.length<=1200000,'本岗位携带的资料和候选过长，请缩小发展范围后重试；尚未调用模型');
  const s=state.stages[role];assert(s.attempts<settings.maxAttempts,'本岗位请求预算已耗尽');s.attempts++;onAttempt(role,s.attempts);checkpoint();
  const value=await invoke(p,role,{remainingAttempts:settings.maxAttempts-s.attempts+1,onExtraAttempt(){assert(s.attempts<settings.maxAttempts,'本岗位请求预算已耗尽');s.attempts++;onAttempt(role,s.attempts);checkpoint();}});check();return value;
 };
 const specialistPrompt=(role,correction=null,coordinate=false)=>{
  const payload={...input,explainRules:false,terminalOrders:[],creationItems:[],recordSchemas:(input.recordSchemas||[]).filter(r=>owns(role,r.id))};
  if(input.fillPolicy)payload.fillPolicy={...input.fillPolicy,tables:input.fillPolicy.tables.filter(r=>owns(role,r.recordId))};
  payload.current=(input.current||[]).map(r=>owns(role,r.recordId)?r:{archiveId:r.archiveId,name:r.name,type:r.type,recordId:r.recordId,identityOnly:true,...(r.details?.world_id?{details:{world_id:r.details.world_id}}:{})});
  payload.specialist={role,recordIds:payload.recordSchemas.map(r=>r.id)};
  if(plan.evolution&&role==='taishiPeople'||coordinate)payload.peerCandidates=clone(coordinate?state.stages.taishiPeople.changes:state.stages.taishiWorld.changes);
  if(coordinate){payload.worldImpacts=clone(state.stages.taishiPeople.worldImpacts||[]);payload.previousWorldCandidates=clone(state.stages.taishiWorld.changes);payload.adoptedCandidateIds=state.adoptedRefs||{};}
  if(correction)payload.correction=correction;
  payload.responseContract=archiveResponseContract(payload);
  const archiveSchema=archiveResponseSchema(payload),common={candidateRef:{type:'string',maxLength:200},dependsOn:{type:'array',maxItems:16,items:{type:'string',maxLength:200}}};
  for(const v of archiveSchema.properties.changes.items.anyOf||[])Object.assign(v.properties,common);
  if(role==='taishiPeople')archiveSchema.properties.worldImpacts={type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['reason','candidateRefs'],properties:{reason:{type:'string',maxLength:600},candidateRefs:{type:'array',minItems:1,maxItems:8,items:{type:'string',maxLength:200}}}}};
  return {...prompt,archiveSchema,user:JSON.stringify(payload),system:prompt.system+'\n<wjwk_specialist>\n本轮仅处理'+COLLABORATION_NAMES[role]+'负责的recordSchemas，已有对象沿用archiveId。不得返回guide、terminalResults、creationResults。每层floorReviews只统计自己输出的changes。'+
   '可为候选提供唯一candidateRef，依赖其他候选时用dependsOn列出其candidateRef。新对象的关联ID可写@candidate:对应candidateRef；仅限world_id、region_id、organization_id、civilization_id、subject_id、target_id、event_id。不得编造正式ID。候选引用不代表已保存。'+
   (plan.evolution?'这是指定世界和历时内的自主发展，先预览再采用。世界候选不等于人物已经得知，人物仍须按既有认知与获知途径行动。人物若导致世界进一步变化，用worldImpacts写明原因及依赖的人物candidateRefs，留给世界岗位协调。':'这是正文事实提取，不能把推测、未来安排或其他岗位候选当成已发生事实。')+
   (coordinate?'本次只协调worldImpacts涉及的世界变化；changes沿用原候选candidateRef以修改原项，新事项才新建。保留未受影响的原候选，不重新推进历时，不重复发奖，不改人物表。':'')+'\n</wjwk_specialist>'};
 };
 const specialist=async(role)=>{
  const s=state.stages[role];Object.assign(s,{status:'failed',changes:[],issues:[],floorReviews:[],worldImpacts:[],message:''});
  let correction=null;
  for(let round=0;round<2&&s.attempts<settings.maxAttempts;round++){
   try{onStage(COLLABORATION_NAMES[role]+(correction?'：修正返回格式':'：正在处理'));const data=await request(specialistPrompt(role,correction),role);
    assert(data&&Array.isArray(data.changes)&&data.changes.length<=64,'返回的changes不是有效候选列表');
    const errors=[];s.changes=[];
    for(const row of data.changes){const before=row?.archiveId?(input.current||[]).find(r=>r.archiveId===row.archiveId):null;
     if(!row||!owns(role,row.recordId)||before&&before.recordId!==row.recordId){errors.push(issue(role,'越过岗位范围或改变原对象分类',row||{},'专职范围'));continue;}
    const ref=row.candidateRef||candidateRef(row);assert(typeof ref==='string'&&/^[\w.-]{1,200}$/.test(ref),'候选临时编号格式无效');s.changes.push({...row,candidateRef:ref});}
    if(correction?.validCandidates?.length){const current=new Set(s.changes.map(r=>r.candidateRef));for(const row of correction.validCandidates)if(!current.has(row.candidateRef))s.changes.push(row);}
    s.floorReviews=Array.isArray(data.floorReviews)?clone(data.floorReviews.filter(r=>r&&typeof r==='object')):[];
    for(const source of input.sources||[]){const reports=s.floorReviews.filter(r=>r?.sourceIndex===source.index),r=reports[0];if(reports.length!==1||r.status!=='reviewed'||r.changeCount!==data.changes.filter(c=>c?.sourceIndex===source.index).length)errors.push(issue(role,r?.reason||'本岗位未完成这层正文核对',{name:'第 '+(source.index+1)+' 层',sourceIndex:source.index},'逐层核对'));}
    if(correction?.validCandidates?.length&&!errors.length)s.floorReviews=s.floorReviews.map(r=>({...r,changeCount:s.changes.filter(c=>c.sourceIndex===r.sourceIndex).length}));
    if(role==='taishiPeople'&&plan.evolution&&data.worldImpacts!==undefined){assert(Array.isArray(data.worldImpacts)&&data.worldImpacts.length<=8&&data.worldImpacts.every(r=>r&&typeof r.reason==='string'&&r.reason.trim()&&r.reason.length<=600&&Array.isArray(r.candidateRefs)&&r.candidateRefs.length>=1&&r.candidateRefs.length<=8&&r.candidateRefs.every(ref=>s.changes.some(c=>c.candidateRef===ref))),'世界影响说明必须引用本次真实人物候选');s.worldImpacts=clone(data.worldImpacts);}
    s.message=String(data.message||'').slice(0,1500);s.issues=errors;s.status=errors.length?'failed':'success';break;
   }catch(error){check();s.issues=[issue(role,error.message)];
    // Transport retry belongs to the connection layer. Only syntactic/shape failures
    // get one correction here, sharing the same total wire-attempt allowance.
    if(round===0&&(error.jsonDiagnostic||/changes|JSON|临时编号|世界影响说明/.test(error.message))&&!error.transportKind){correction={reason:error.message,validCandidates:clone(s.changes)};continue;}break;
   }
  }
  checkpoint();
 };
 const coordinate=async()=>{
  const people=state.stages.taishiPeople,world=state.stages.taishiWorld;
  if(!plan.evolution||!people.worldImpacts?.length||world.status!=='success'||people.status!=='success'||state.coordination.status!=='pending')return;
  state.coordination.status='failed';
  try{assert(world.attempts<settings.maxAttempts,'世界岗位预算已用完，影响建议保留待处理');onStage('协调人物行动对世界的影响（最多一轮）');
   const data=await request(specialistPrompt('taishiWorld',null,true),'taishiWorld');assert(Array.isArray(data?.changes)&&data.changes.length<=64,'协调返回候选列表无效');
   const before=clone(world.changes),replacement=new Map(before.map(r=>[r.candidateRef,r]));
   for(const row of data.changes){assert(owns('taishiWorld',row.recordId),'协调不能修改人物表');const prior=before.filter(r=>row.archiveId&&r.archiveId===row.archiveId),ref=row.candidateRef&&replacement.has(row.candidateRef)?row.candidateRef:prior.length===1?prior[0].candidateRef:row.candidateRef||candidateRef(row),old=replacement.get(ref);assert(!old||old.recordId===row.recordId&&(row.archiveId===undefined||old.archiveId===row.archiveId)&&key(old.name)===key(row.name),'协调不能更换原对象身份');replacement.set(ref,{...old,...row,fields:{...old?.fields,...row.fields},details:{...old?.details,...row.details},candidateRef:ref,dependsOn:[...new Set([...(old?.dependsOn||[]),...(row.dependsOn||[]),...people.worldImpacts.flatMap(r=>r.candidateRefs)])]});}
   for(const [ref,value]of replacement)if(value.archiveId===undefined){const old=before.find(r=>r.candidateRef===ref);if(old?.archiveId)value.archiveId=old.archiveId;}
   assert(replacement.size<=128,'协调后世界候选过多');
   const trial=clone(state);trial.stages.taishiWorld.changes=[...replacement.values()];const out=collaborationOutput(trial,input),checked=validateChanges(out.changes,'combined',out.workflowDependencies),problems=Array.isArray(checked)?checked:checked.issues;
   assert(!out.issues.length&&!problems.length,'协调候选未通过校验：'+(out.issues[0]?.reason||problems[0]?.reason||'关联无效')+'；保留协调前的有效候选');
   world.changes=[...replacement.values()];state.coordination={status:'success',message:String(data.message||'已协调').slice(0,1000)};
  }catch(error){check();state.coordination={status:'failed',message:String(error.message).slice(0,600)};}
  checkpoint();
 };
 const review=async()=>{
  const s=state.stages.taishiReview;s.status='failed';s.issues=[];
  try{onStage('复核世界与人物之间的因果');const candidates=['taishiWorld','taishiPeople'].flatMap(r=>state.stages[r].changes);
   const p={system:'你只复核太始天候选之间的因果冲突。正文事实优先；自主发展是待确认创作。不得修改档案、不得发奖。只报告有具体候选依据的矛盾：同一唯一物争用、地点与人物行动不相容、因果缺失或秘密无途径传播。传闻不是事实。输出纯JSON {"conflicts":[{"candidateRefs":["实际候选编号"],"reason":"具体矛盾","suggestion":"建议如何处理"}],"message":"简报"}。没有矛盾时conflicts为空。',user:JSON.stringify({taskMode:input.taskMode,sources:input.sources,current:input.current,candidates}),archiveSchema:{type:'object',additionalProperties:false,required:['conflicts','message'],properties:{message:{type:'string'},conflicts:{type:'array',maxItems:32,items:{type:'object',additionalProperties:false,required:['candidateRefs','reason','suggestion'],properties:{candidateRefs:{type:'array',minItems:1,maxItems:16,items:{type:'string'}},reason:{type:'string',maxLength:600},suggestion:{type:'string',maxLength:600}}}}}}};
   const data=await request(p,'taishiReview');assert(Array.isArray(data?.conflicts)&&data.conflicts.length<=32,'复核返回格式无效');
   for(const c of data.conflicts)assert(Array.isArray(c.candidateRefs)&&c.candidateRefs.length&&c.candidateRefs.length<=16&&c.candidateRefs.every(ref=>candidates.some(r=>r.candidateRef===ref))&&typeof c.reason==='string'&&c.reason.trim()&&c.reason.length<=600&&typeof c.suggestion==='string'&&c.suggestion.length<=600,'复核引用不存在或说明无效');
   state.conflicts=clone(data.conflicts);state.conflictDecisions={};s.message=String(data.message||'').slice(0,1500);s.status='success';
  }catch(error){check();s.issues=[issue('taishiReview',error.message)];}checkpoint();
 };
 const summary=async()=>{const s=state.stages.taishiSummary;s.status='failed';s.issues=[];try{const output=collaborationOutput(state,input),checked=validateChanges(output.changes,'combined',output.workflowDependencies),rows=Array.isArray(checked)?output.changes:checked.changes;
   const value=await request(archiveSummaryPreset(rows,[]),'taishiSummary');assert(typeof value?.message==='string','摘要返回无效');s.message=value.message.slice(0,3000);s.status='success';
  }catch(error){check();s.issues=[issue('taishiSummary',error.message)];}checkpoint();};
 const validateMerged=()=>{
  for(const role of plan.roles){const s=state.stages[role],had=s.issues.some(i=>i.kind==='专职校验');s.issues=s.issues.filter(i=>i.kind!=='专职校验');if(had&&!s.issues.length)s.status='success';}
  const output=collaborationOutput(state,input),checked=validateChanges(output.changes,'combined',output.workflowDependencies),problems=Array.isArray(checked)?checked:checked.issues;
  for(const problem of problems){const ref=output.workflowRefs[problem.index],roles=plan.roles.filter(role=>ref?state.stages[role].changes.some(r=>r.candidateRef===ref):state.stages[role].changes.some(r=>r.name===problem.name));
   for(const role of roles.length?roles:plan.roles){state.stages[role].status='failed';state.stages[role].issues.push({...problem,kind:'专职校验',role});}}
  checkpoint();
 };
 if(!resume){
  for(const role of ['taishiWorld','taishiPeople'])if(!plan.roles.includes(role))Object.assign(state.stages[role],{status:'skipped',message:'按本次范围跳过，未调用模型'});
  if(!settings.summary)state.stages.taishiSummary.status='skipped';if(settings.mode!=='deep')state.stages.taishiReview.status='skipped';
  onStage('本次岗位：'+plan.roles.map(r=>COLLABORATION_NAMES[r]).join('、')+'；默认使用程序摘要');checkpoint();
  if(parallel&&!plan.evolution)await Promise.all(plan.roles.map(specialist));else for(const role of plan.roles){if(plan.evolution&&role==='taishiPeople'&&state.stages.taishiWorld.status==='failed'){state.stages[role].message='等待世界岗位完成';continue;}await specialist(role);if(plan.evolution&&role==='taishiWorld')validateMerged();}
  await coordinate();
 }else{await (coordinateOnly?coordinate():retryRole==='taishiReview'?review():retryRole==='taishiSummary'?summary():specialist(retryRole));if(['taishiWorld','taishiPeople'].includes(retryRole)){state.conflicts=[];state.conflictDecisions={};if(settings.mode==='deep')state.stages.taishiReview.status='pending';if(settings.summary)state.stages.taishiSummary.status='pending';}}
 validateMerged();
 const finished=plan.roles.every(r=>state.stages[r].status==='success');
 // A manual resume invokes only the selected role; downstream stages are offered
 // explicitly, never silently billed after a retry.
 if(!resume&&finished){if(settings.mode==='deep')await review();if(settings.summary)await summary();}
 const output=collaborationOutput(state,input),checked=validateChanges(output.changes,'combined',output.workflowDependencies),validationIssues=Array.isArray(checked)?checked:checked.issues;
 const issues=[...plan.roles.flatMap(r=>state.stages[r].issues.filter(i=>i.kind!=='专职校验')),...output.issues];
 if(plan.limited)for(const source of input.sources||[])issues.push(issue('taishiWorld','本次只核对玩家指定类别，未推进整层读取进度',{sourceIndex:source.index},'局部核对'));
 const warnings=[...state.stages.taishiReview.issues,...state.stages.taishiSummary.issues,...(state.coordination.status==='failed'?[issue('taishiWorld',state.coordination.message,{},'影响协调')]:[])];
 const floorReviews=(input.sources||[]).map(source=>{const reviewed=!plan.limited&&plan.roles.every(role=>{const stage=state.stages[role],rows=stage.floorReviews.filter(r=>r.sourceIndex===source.index);return rows.length===1&&rows[0].status==='reviewed'&&rows[0].changeCount===stage.changes.filter(r=>r.sourceIndex===source.index).length;})&&![...issues,...validationIssues].some(i=>i.sourceIndex===source.index||i.sourceIndex===undefined);return {sourceIndex:source.index,status:reviewed?'reviewed':'uncertain',changeCount:output.changes.filter(r=>r.sourceIndex===source.index).length,...(!reviewed?{reason:'尚有未完成岗位、局部范围或关联问题；有效候选仍可接受'}:{})};});
 const counts=plan.roles.map(role=>COLLABORATION_NAMES[role]+' '+state.stages[role].changes.length+' 项').join('、');
 const message=state.stages.taishiSummary.status==='success'?state.stages.taishiSummary.message:counts+'候选，尚未保存。'+(warnings.length?'部分可选任务未完成，已使用基础摘要。':'');
 return {changes:output.changes,message,floorReviews,workflowRefs:output.workflowRefs,workflowDependencies:output.workflowDependencies,workflowIssues:issues,workflowWarnings:warnings,workflowState:state};
}
