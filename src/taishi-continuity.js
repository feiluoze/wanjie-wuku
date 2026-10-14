// Read-only continuity planning. Facts still come from evidence or adopted evolution.
import {hash,stable} from './primitives.js';
import {archiveContextCurrent,archiveUpdateSummary} from './archives.js';
import {taishiPerson,personSelected} from './taishi-people.js';
const key=v=>String(v||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
const mentions=(body,value)=>key(value).length>=2&&key(body).includes(key(value));
export {TAISHI_CONTINUITY_POLICY} from './taishi-continuity-policy.js';
export function taskPhase(r){
 if(!['event','development'].includes(r.specific?.recordId))return '';
 const phase=r.specific.fields.phase;
 return ['进行中','受阻','搁置','已完成','已取消'].includes(phase)?phase:r.status==='working'?'进行中':r.status==='planned'?'计划中':'';
}
export function taishiFocus(power,records,query,{worldId=null,evolution=false}={}){
 const direct=new Set(records.filter(r=>[r.name,...(r.history||[]).map(v=>v.name)].some(n=>mentions(query,n))).map(r=>r.id));
 if(worldId)direct.add(worldId);
 const worldOf=r=>r.specific?.recordId==='world'?r.id:r.specific?.fields?.world_id||records.find(w=>w.specific?.recordId==='world'&&w.name===r.specific?.fields?.world)?.id;
 const worlds=new Set([...direct].map(id=>worldOf(records.find(r=>r.id===id)||{})).filter(Boolean));
 const relevant=r=>!worldId||worldOf(r)===worldId;
 const unfinished=records.filter(r=>relevant(r)&&['进行中','受阻','搁置','计划中'].includes(taskPhase(r)));
 const eligible=r=>!taishiPerson(r)||personSelected(power,r.id);
 const selected=new Set([...direct].filter(id=>eligible(records.find(r=>r.id===id)||{})));
 // Local, bounded selection replaces a separate selector-model request.
 for(const r of unfinished.filter(r=>evolution||worlds.has(worldOf(r))))selected.add(r.id);
 const actors=records.filter(r=>eligible(r)&&taishiPerson(r)&&relevant(r)&&r.status!=='ended'&&(direct.has(r.id)||evolution&&worlds.has(worldOf(r))||unfinished.some(t=>(evolution||worlds.has(worldOf(t)))&&mentions(t.specific?.fields?.participants||'',r.name))));
 actors.sort((a,b)=>Number(direct.has(b.id))-Number(direct.has(a.id))||a.id.localeCompare(b.id));
 for(const r of actors.slice(0,12))selected.add(r.id);
 for(const r of records.filter(r=>selected.has(r.id))){const f=r.specific?.fields||{};for(const id of [worldOf(r),f.region_id,f.organization_id,f.subject_id,f.target_id,f.event_id])if(id)selected.add(id);}
 return {ids:[...selected],unfinished:unfinished.filter(r=>selected.has(r.id)).map(r=>({id:r.id,phase:taskPhase(r),completion:r.specific.fields.completion||'',goal:r.specific.fields.goal||''})),instruction:'只对有本轮依据或允许演化的对象输出变化；先检查unfinished，不复述旧档。不在ids的对象保留原状；本轮明确涉及身份索引对象时仍可差量更新。'};
}
export function developmentGroups(power,chat){
 const rows=Object.values(power.archives||{}).filter(r=>archiveContextCurrent(r,chat));
 return {working:rows.filter(r=>['进行中','计划中'].includes(taskPhase(r))),attention:rows.filter(r=>['受阻','搁置'].includes(taskPhase(r))),completed:rows.filter(r=>taskPhase(r)==='已完成').sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,4)};
}
export function recentTaishiChanges(power,chat,query){
 const batch=archiveUpdateSummary(power,chat);if(!batch)return [];
 const records=Object.values(power.archives||{}),worlds=records.filter(r=>r.specific?.recordId==='world'&&mentions(query,r.name)).map(r=>r.id);
 return batch.rows.map(row=>({row,record:records.find(r=>r.id===row.id)})).filter(({record:r})=>r&&archiveContextCurrent(r,chat)&&!taishiPerson(r)&&r.specific?.recordId!=='relation'&&(mentions(query,r.name)||worlds.includes(r.specific?.fields?.world_id)||worlds.some(id=>power.archives[id]?.name===r.specific?.fields?.world))).slice(0,3).map(({row,record})=>({record,details:row.details.slice(0,6).map(d=>({label:d.label,value:d.value.slice(0,240)})),signature:hash(stable({id:record.id,kind:row.kind,details:row.details,source:record.source}))}));
}
