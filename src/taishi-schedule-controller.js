import {assert,clone,hash,stable,storyText} from './core.js';
import {isTaishi} from './taishi.js';
import {isArchiveDialogue,archiveContextCurrent} from './archives.js';
import {normalizeSchedule,parseNarrativeTime,readTaggedTime,readTimePointer,scheduleSignature,scheduleDue} from './taishi-schedule.js';
const formValues=values=>Object.fromEntries(Object.entries(values).map(([k,v])=>[k.startsWith('schedule:')?k.slice(9):k,v]));
export const taishiScheduleMethods={
 readTaishiSchedule(config,snapshot=this.ensureStable()){
  const chat=snapshot.ctx.chat,index=chat.findLastIndex(isArchiveDialogue);assert(index>=0,'当前没有角色正文可读取');const message=chat[index],content=storyText(message.mes??message.content??'');let raw;
  if(config.source==='tag')raw=readTaggedTime(content,config.tags);
  else {const data=this.role.read();assert(data.capture.option.type!=='message'||data.capture.option.message_id===index,'当前角色楼层的时间变量尚未就绪');raw=readTimePointer(data.stat,config.path);}
  return {raw,stamp:parseNarrativeTime(raw,config.calendar),anchor:{index,swipeId:message.swipe_id??0,length:content.length,textHash:hash(content)}};
 },
 scheduleSettingsStatus(power){
  const schedule=power.taishiSchedule;if(!schedule)return '尚未设置。开启高级自动触发前，请先配置时间来源。';
  try{const current=this.readTaishiSchedule(schedule.config);const status=schedule.config.enabled?(schedule.paused?'已暂停，等待采用候选或重新保存设置':'已开启'):'已关闭';if(!schedule.baseline)return status+'；时间起点失效，请重新读取并保存。';const event=scheduleDue({...schedule,config:{...schedule.config,enabled:true}},current);return `${status}；当前读取：${current.raw}；${event?'已达到更新间隔':'尚未达到更新间隔'}`;}catch(e){return '时间读取待处理：'+e.message;}
 },
 testTaishiSchedule(values){values=formValues(values);const d=this.taishiEvolutionDraft;assert(d&&d.powerId===this.powerId,'发展窗口已失效');this.ensureStable();this.store.assertCapture(d.captured);const config=normalizeSchedule({...values,scheduleEnabled:undefined,enabled:false}),observation=this.readTaishiSchedule(config);this.ui.setSchedulePreview(`读取成功：${observation.raw}；第${observation.anchor.index+1}层。尚未保存设置，不调用AI。`);},
 async saveTaishiSchedule(values){
  values=formValues(values);
  assert(!this.busy&&!this.mainBusy&&!this.committing&&!this.archiveReviewJob&&!this.pendingArchiveReview,'请先结束任务或处理待确认候选');const d=this.taishiEvolutionDraft;assert(d&&d.powerId===this.powerId,'发展窗口已失效');const s=this.ensureStable();this.store.assertCapture(d.captured);const p=s.state.powers[d.powerId],config=normalizeSchedule(values);let observation=null;
  if(config.enabled){assert(p.taishiAutonomy===true,'先开启“允许AI合理创作发展候选”');assert(p.archives[config.worldId]?.specific?.recordId==='world'&&p.archives[config.worldId].status!=='ended','请选择已有世界');observation=this.readTaishiSchedule(config,s);if(['minute','hour'].includes(config.unit))assert(observation.stamp.precision==='minute','分钟/小时触发须读到时分，请完善时间标签');}
  await this.store.transact(next=>{const power=next.powers[d.powerId],old=power.taishiSchedule;const same=old&&scheduleSignature(old.config)===scheduleSignature(config),valid=old?.baseline&&archiveContextCurrent({source:{type:'story',anchor:old.baseline.anchor}},s.ctx.chat),keep=same&&valid&&values.resetBaseline!=='on';power.taishiSchedule={config,history:keep?clone(old.history):[],...(keep?{baseline:clone(old.baseline)}:observation?{baseline:observation}:{}),paused:false};},{captured:d.captured,facts:false});
  this.openTaishiDevelopment();this.refresh();this.notice(config.enabled?'时间设置已保存。仅在新角色回复达到剧情间隔后生成候选；首次起点以前不补算。':'已关闭按剧情时间自动触发，手动推进仍可使用。');
 },
 async runTaishiScheduled(powerId){
  const s=this.ensureStable(),p=s.state.powers[powerId],schedule=p?.taishiSchedule;if(this.settings.mode==='off'||!isTaishi(p)||!p.active||p.taishiAutonomy!==true||!schedule?.config.enabled||schedule.paused)return false;
  let event;try{assert(schedule.baseline&&archiveContextCurrent({source:{type:'story',anchor:schedule.baseline.anchor}},s.ctx.chat),'时间起点来源已变化，请重新设置');event=scheduleDue(schedule,this.readTaishiSchedule(schedule.config,s));if(!event)return false;}catch(e){this.archiveAutoStatus ||= {};this.archiveAutoStatus[powerId]='时间触发跳过：'+e.message;if(schedule.config.onParseFail==='notify')this.notice(this.archiveAutoStatus[powerId],true);return false;}
  await this.store.transact(next=>{next.powers[powerId].taishiSchedule.paused=true;},{captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision},facts:false});
  const world=p.archives[event.worldId];assert(world?.specific?.recordId==='world'&&world.status!=='ended','演化世界已失效，请重新设置');
  this.archiveAutoStatus ||= {};this.archiveAutoStatus[powerId]='已达剧情时间间隔，正在生成演化候选';
  await this.reviewArchives({powerId,silent:this.powerId!==powerId,supplement:true,taishiEvolution:{worldId:world.id,elapsed:event.elapsed,unit:'hours'},taishiScheduleEvent:event,values:{playerNote:`根据已配置的剧情时间，从「${event.from.raw}」至「${event.to.raw}」，仅为「${world.name}」生成这段内部 ${event.elapsed} 小时的发展候选。时间已经来自剧情，不再额外推进同一段，不重复兑现正文已有成果；新增细节是AI候选，采用前不成为已发生成果。`}});
  this.archiveAutoStatus[powerId]='按时演化已暂停，等待确认候选';return true;
 },
 ensureScheduledTimeCandidate(batch,power,event){
  if(batch.changes.some(c=>c.id===event.worldId))return;
  const world=power.archives[event.worldId];assert(world?.specific?.recordId==='world','时间更新对应世界已失效');const specific=clone(world.specific);specific.labels.clock ||= '本世界内历';specific.fields.clock=((specific.fields.clock||'起点未登记')+'；本次确认剧情时间对应内部 '+event.elapsed+'小时').slice(-4000);
  batch.changes.unshift({id:world.id,name:world.name,type:world.type,status:world.status,patch:{},before:clone(world),specific,specificPatch:{clock:specific.fields.clock},source:{type:'manual',note:'待确认的剧情时间更新'}});
 },
 assertTaishiScheduleEvent(power,event,chat){
  const value=power.taishiSchedule;assert(value?.config.enabled&&value.baseline&&scheduleSignature(value.config)===event.configHash&&stable(value.baseline)===stable(event.from),'演化时间设置或起点已变化，请重新生成');
  for(const o of [event.from,event.to])assert(archiveContextCurrent({source:{type:'story',anchor:o.anchor}},chat),'演化时间来源已改写或切换分支');
  const current=this.readTaishiSchedule(value.config,{ctx:{chat}}),fresh=scheduleDue(value,current);assert(fresh?.id===event.id,'当前时间已变化，请重新生成演化候选');
 },
 recordTaishiSchedule(power,event,chat){this.assertTaishiScheduleEvent(power,event,chat);assert(power.taishiSchedule.history.length<128,'演化历时超过128段，请备份后重新设定起点');power.taishiSchedule.history.push({id:event.id,from:clone(event.from),to:clone(event.to)});power.taishiSchedule.baseline=clone(event.to);power.taishiSchedule.paused=false;}
};
