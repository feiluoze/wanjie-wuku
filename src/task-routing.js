import {assert} from './primitives.js';
import {requestTimeoutSeconds} from './preferences.js';
export const AI_TASKS=Object.freeze({archive:'整理与自动更新',creation:'拟定新内容',terminal:'终端安排',setup:'世界书初始化',general:'其他核对与建议',taishiWorld:'太始天高级 · 世界核对（复杂因果建议 Pro）',taishiPeople:'太始天高级 · 人物更新（日常建议 Flash）',taishiSummary:'太始天高级 · 汇总（建议 Flash）'});
export function normalizeTaskRoutes(routes={},profiles=[]){
  assert(routes&&typeof routes==='object'&&!Array.isArray(routes)&&Object.keys(routes).every(k=>Object.hasOwn(AI_TASKS,k)),'AI任务分流格式无效');
  return Object.fromEntries(Object.keys(AI_TASKS).map(task=>{
    const id=routes[task]??'';assert(typeof id==='string'&&(!id||profiles.some(p=>p.id===id&&p.mode!=='off')),'任务方案不存在或已关闭：'+AI_TASKS[task]);return [task,id];
  }));
}
// Pure resolution; no credential persistence or global connection mutation.
export function taskConnection(task,settings,apiKey,profiles=[]){
  assert(Object.hasOwn(AI_TASKS,task),'未知AI任务');
  assert(settings.mode!=='off','异步模型已关闭');
  const id=settings.taskRoutes?.[task]||'',p=id?profiles.find(p=>p.id===id):null;
  assert(!id||p&&p.mode!=='off','指定任务的连接方案已不存在或已关闭，请重新选择');
  return p?{settings:{...settings,...p,customParameters:p.customParameters??'',thinkingMode:p.thinkingMode??'auto'},apiKey:p.apiKey||'',profileId:id,profileName:p.name,task}:{settings,apiKey,profileId:'',profileName:'当前连接',task};
}

// Public labels only; never pass settings, endpoints or credentials to task UI.
export function taskConnectionLabel(connection){
  const mode=connection.settings?.mode;
  const model=mode==='st'?'跟随酒馆当前模型':mode==='custom'?String(connection.settings.model||'未填写模型'):'异步模型已关闭';
  return `${AI_TASKS[connection.task]||'当前任务'} · ${connection.profileName||'当前连接'} · ${model}${connection.attempt>1?' · 备用'+(connection.attempt-1):''}${connection.task==='setup'?' · 单批最长'+requestTimeoutSeconds(connection.settings,connection.task)+'秒，可取消':''}`;
}

export function normalizeTaskFallbacks(routes={},profiles=[],primary={}){
 assert(routes&&typeof routes==='object'&&!Array.isArray(routes)&&Object.keys(routes).every(k=>Object.hasOwn(AI_TASKS,k)),'备用API配置无效');
 return Object.fromEntries(Object.keys(AI_TASKS).map(task=>{
  const ids=routes[task]??[];
  assert(Array.isArray(ids)&&ids.length<=2&&new Set(ids).size===ids.length,'每个任务最多两条不同备用API');
  for(const id of ids)assert(typeof id==='string'&&id&&id!==primary[task]&&profiles.some(p=>p.id===id&&p.mode!=='off'),'备用API不存在、已关闭或与主方案重复：'+AI_TASKS[task]);
  return [task,[...ids]];
 }));
}
export function taskConnectionPlan(task,settings,apiKey,profiles=[]){
 const primary=taskConnection(task,settings,apiKey,profiles);
 const ids=normalizeTaskFallbacks({[task]:settings.taskFallbacks?.[task]??[]},profiles,settings.taskRoutes||{})[task];
 const plan=[primary,...ids.map(id=>{const p=profiles.find(p=>p.id===id);return {settings:{...settings,...p,customParameters:p.customParameters??'',thinkingMode:p.thinkingMode??'auto'},apiKey:p.apiKey||'',profileId:id,profileName:p.name,task};})];
 // Aliases of the same transport are not a second chance or a second bill.
 const seen=new Set();return plan.filter(c=>{const s=c.settings,key=JSON.stringify(s.mode==='st'?['st']:[s.mode,String(s.baseUrl||'').replace(/\/+$/,''),s.model,c.apiKey]);if(seen.has(key))return false;seen.add(key);return true;});
}
