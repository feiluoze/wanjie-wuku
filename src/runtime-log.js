// Local, bounded diagnostics. Kept separate from chat facts, prompts and backups.
import {hash} from './primitives.js';
export function validationIssueCode(issue){
 if(['result_list','batch_validation','relation_validation'].includes(issue.diagnostic?.stage))return issue.diagnostic.code||'result_list_invalid';
 if(issue.diagnostic?.stage==='reference_validation')return issue.diagnostic.code||'reference_validation';
 const reason=String(issue.reason||'');
 if(issue.kind==='设定冲突'||/冲突/.test(reason))return 'conflict';
 if(/引用.*档案.*不存在|档案ID不存在|引用对象.*不存在/.test(reason))return 'missing_archive';
 if(/归属|其他金手指|所属世界/.test(reason))return 'ownership';
 if(/来源|楼层|逐层|读取进度/.test(reason)||issue.kind==='逐层核对')return 'invalid_source';
 if(/身份|玩家保护|受保护|不可覆盖/.test(reason))return 'protected_identity';
 if(/字段|专用统计/.test(reason))return 'invalid_fields';
 return 'validation_rejected';
}
// Default logs explain structural failures without exporting player names or field values.
export function safeValidationReason(issue){
 const reason=String(issue.reason||'');
 const messages=['档案核对包含不允许的操作字段','专用统计存储结构与当前适配声明不符','专用统计存储结构包含不允许的操作字段','专用统计分类与存储结构冲突','专用统计字段结构无效','专用统计字段结构与存储结构冲突','专用统计分类或字段不在当前适配声明中','已有对象不能自动换成另一种专用统计身份','旧专用统计来源失效，需AI重新确认专用字段','引用的档案不存在','档案字段无效','同一对象出现互相冲突的更新，整组留待重查','同一对象的重复变化存在冲突，请重新整理或分批核对'];
 return messages.find(message=>reason.includes(message))||({conflict:'候选内容存在冲突',missing_archive:'引用档案不存在',ownership:'所属范围未通过核对',invalid_source:'来源或逐层核对未通过',protected_identity:'受保护身份不能修改',invalid_fields:'字段结构或值未通过校验',validation_rejected:'候选未通过校验'}[validationIssueCode(issue)]||'候选未通过校验');
}
export function redactLog(value,secrets=[],{limit=100000}={}){
 const cleanString=s=>{for(const secret of secrets)if(secret)s=s.split(secret).join('[已隐藏]');return s.replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [已隐藏]').replace(/sk-[\w-]+/g,'[已隐藏]').replace(/((?:api[-_]?key|(?:access[-_]?)?token|authorization|password)["']?\s*[=:]\s*["']?)[^\s"'&,}]+/gi,'$1[已隐藏]');};
 const walk=(v,depth=0)=>{if(depth>12)return '[层级过深]';if(typeof v==='string')return cleanString(v).slice(0,limit);if(Array.isArray(v))return v.slice(0,200).map(x=>walk(x,depth+1));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['__proto__','constructor','prototype'].includes(k)).map(([k,x])=>[k,/api[-_]?key|token|authorization|password|secret/i.test(k)&&!(['promptTokens','completionTokens','reasoningTokens','requestedMaxTokens'].includes(k)&&typeof x==='number')?'[已隐藏]':walk(x,depth+1)]));return v;};return walk(value);
}
export const LOG_RETENTION={records:40,bytes:512000,days:7};
const failed=row=>['失败','部分完成','部分保存','保存失败'].includes(row.status);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
export function trimRuntimeLogs(rows,now){
 let removed=0,compacted=0;
 for(let i=rows.length-1;i>=0;i--)if(rows[i].status!=='运行中'&&now-(rows[i].endedAt??rows[i].startedAt)>LOG_RETENTION.days*86400000){rows.splice(i,1);removed++;}
 const evict=()=>{let i=rows.findIndex((r,index)=>index<rows.length-1&&r.status!=='运行中'&&!failed(r));if(i<0)i=rows.findIndex((r,index)=>index<rows.length-1&&r.status!=='运行中');if(i<0)i=0;rows.splice(i,1);removed++;};
 while(rows.length>LOG_RETENTION.records)evict();
 if(bytes(rows)>LOG_RETENTION.bytes){
  for(const row of rows){for(const step of row.steps)if(Object.hasOwn(step,'content')){delete step.content;step.contentOmitted=true;row.detailOmitted=true;compacted++;if(bytes(rows)<=LOG_RETENTION.bytes)break;}if(bytes(rows)<=LOG_RETENTION.bytes)break;}
 }
 while(rows.length>1&&bytes(rows)>LOG_RETENTION.bytes)evict();
 if(rows.length&&bytes(rows)>LOG_RETENTION.bytes){rows[0].steps=rows[0].steps.slice(-8);rows[0].detailOmitted=true;compacted++;}
 if(rows.length&&bytes(rows)>LOG_RETENTION.bytes){const r=rows[0];rows[0]={id:r.id,version:r.version,scopeHash:r.scopeHash,label:String(r.label).slice(0,240),status:r.status,startedAt:r.startedAt,endedAt:r.endedAt,durationMs:r.durationMs,error:String(r.error||'').slice(0,400),steps:[],detailOmitted:true};}
 return {removed,compacted};
}
export class RuntimeLog{
 constructor({storage,fallbackStorage,scope=()=>'',secret=()=>[],version='',now=()=>Date.now()}={}){if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}if(fallbackStorage===undefined){try{fallbackStorage=globalThis.sessionStorage;}catch{fallbackStorage=null;}}this.fallbackStorage=fallbackStorage;this.storageFallback='';this.storageCompacted=false;this.storage=storage;this.scope=scope;this.secret=secret;this.version=version;this.now=now;this.accounts=new Map();this.detail=false;this.sequence=0;this.storageFailed=!storage;}
 account(scope=this.scope()){return scope.split('|')[0]||'unavailable';}
 key(account){return 'wanjie_wuku_general:diagnostics:'+hash(account);}
 rows(account=this.account()){
  if(!this.accounts.has(account)){let rows=[];try{const read=storage=>{try{return storage?.getItem(this.key(account));}catch{return null;}};const local=read(this.storage),session=read(this.fallbackStorage);const newest=raw=>{try{const row=JSON.parse(raw)?.at(-1);return row?.endedAt||row?.steps?.at(-1)?.at||row?.startedAt||0;}catch{return 0;}};const raw=newest(session)>newest(local)?session:local;if(raw===session&&session){this.storageFallback='session';this.storageFailed=true;}if(raw&&raw.length<=1000000){const parsed=JSON.parse(raw);if(Array.isArray(parsed))rows=parsed.filter(r=>r&&typeof r.id==='string'&&Array.isArray(r.steps)).slice(-40).map(r=>r.status==='运行中'?{...r,status:'页面已关闭，任务未完成'}:r);}}catch{this.storageFailed=true;}const trim=trimRuntimeLogs(rows,this.now());this.autoPruned=(this.autoPruned||0)+trim.removed;this.storageCompacted ||= trim.compacted>0;this.accounts.set(account,rows);}return this.accounts.get(account);
 }
 persist(account){const rows=this.rows(account),trim=trimRuntimeLogs(rows,this.now());this.autoPruned=(this.autoPruned||0)+trim.removed;this.storageCompacted ||= trim.compacted>0;
  const key=this.key(account);try{if(!this.storage)throw Error('unavailable');this.storage.setItem(key,JSON.stringify(rows));this.storageFailed=false;this.storageFallback='';try{this.fallbackStorage?.removeItem(key);}catch{}return;}catch{this.storageFailed=true;}
  const compact=rows.slice(-8).map(row=>({...row,detailOmitted:true,steps:row.steps.slice(-15).map(({content,...step})=>({...step,...(content?{contentOmitted:true}:{})}))}));
  try{if(!this.storage)throw Error('unavailable');this.storage.setItem(key,JSON.stringify(compact));this.storageFailed=false;this.storageCompacted=true;this.storageFallback='';try{this.fallbackStorage?.removeItem(key);}catch{}return;}catch{}
  try{if(!this.fallbackStorage)throw Error('unavailable');this.fallbackStorage.setItem(key,JSON.stringify(compact));this.storageFallback='session';}catch{this.storageFallback='memory';}
 }
 begin(label,metadata={}){const scope=this.scope(),account=this.account(scope);const id=this.now().toString(36)+'-'+(++this.sequence);const ticket={account,id};const row=redactLog({id,version:this.version,scopeHash:hash(scope),label,startedAt:this.now(),status:'运行中',steps:[],detail:this.detail,...metadata},this.secret());row.id=id;this.rows(account).push(row);this.persist(account);return ticket;}
 find(ticket){return ticket&&this.rows(ticket.account).find(r=>r.id===ticket.id);}
 patch(ticket,data){const row=this.find(ticket);if(!row)return;Object.assign(row,redactLog(data,this.secret()));this.persist(ticket.account);}
 step(ticket,phase,data={}){const row=this.find(ticket);if(!row)return;
  if(!row.detail&&phase==='校验结果')data={...data,issues:(data.issues||[]).map(i=>({kind:i.kind,sourceIndex:i.sourceIndex,code:validationIssueCode(i),reason:safeValidationReason(i),...(i.diagnostic?{diagnostic:i.diagnostic}:{})})),skippedOwnership:(data.skippedOwnership||[]).map(()=>({code:'foreign_owner'}))};
  row.steps.push(redactLog({phase,at:this.now(),...data},this.secret()));if(row.steps.length>30)row.steps.shift();this.persist(ticket.account);}
 failureResponse(ticket,value,task=''){const clean=redactLog(String(value??''),this.secret(),{limit:400});this.step(ticket,'失败回复摘要',{task,characters:String(value??'').length,excerpt:clean,...(String(value??'').length>400?{endingExcerpt:redactLog(String(value??'').slice(-400),this.secret(),{limit:400})}:{}),truncated:String(value??'').length>400});}
 capture(ticket,phase,value){if(this.find(ticket)?.detail){const characters=(typeof value==='string'?value:JSON.stringify(value)).length,clean=redactLog(value,this.secret(),{limit:220000}),body=typeof clean==='string'?clean:JSON.stringify(clean);this.step(ticket,phase,{content:body.slice(0,100000),characters,truncated:characters>100000||body.length>100000});}}
 finish(ticket,status,error=''){const row=this.find(ticket);if(!row)return;this.patch(ticket,{status:row.noUpdates&&status==='成功'?'未更新':row.partial&&status==='成功'?'部分完成':status,error,endedAt:this.now(),durationMs:Math.max(0,this.now()-row.startedAt)});}
 list(){return redactLog([...this.rows()].reverse(),this.secret());}
 export(){return {format:'wjwk-runtime-log-v1',version:this.version,exportedAt:this.now(),detailEnabled:this.detail,storageFailed:this.storageFailed,storageFallback:this.storageFallback,storageCompacted:this.storageCompacted,autoPruned:this.autoPruned||0,retention:LOG_RETENTION,records:this.list()};}
 clear(){const account=this.account();this.accounts.set(account,[]);this.persist(account);}
}
