import {relationLinks} from './taishi-relations.js';
import {archiveCurrent} from './archives.js';
const key=v=>String(v||'').normalize('NFKC').trim();
export function worldForRecord(power,record,chat=[]){
 const worlds=Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='world'&&r.status!=='ended'&&archiveCurrent(r,chat));
 if(record.specific?.recordId==='world')return worlds.find(w=>w.id===record.id)||null;
 const f=record.specific?.fields||{};
 if(f.world_id)return worlds.find(w=>w.id===f.world_id)||null; // An invalid ID never falls back to a guessed name.
 if(!f.world)return null;
 const matches=worlds.filter(w=>[w.name,...(w.history||[]).map(h=>h.name)].some(n=>key(n)===key(f.world)));
 return matches.length===1?matches[0]:null;
}
export function worldBriefData(power,worldId,chat=[]){
 const world=power.archives?.[worldId];
 if(!world||worldForRecord(power,world,chat)?.id!==worldId)return null;
 const records=Object.values(power.archives||{}).filter(r=>r.id!==worldId&&r.status!=='ended'&&archiveCurrent(r,chat)&&worldForRecord(power,r,chat)?.id===worldId);
 const groups=[['区域','region'],['组织与势力','organization'],['人物','companion'],['关系网络','relation'],['事件','event'],['发展事项','development'],['众生与文明','inhabitants'],['可调用成果','available'],['界主所得','growth'],['垂天与降界','manifestation']].map(([label,id])=>({label,id,records:records.filter(r=>r.specific?.recordId===id)})).filter(g=>g.records.length);
 return {world,groups};
}
export function worldLinksHTML(power,record,chat,esc){
 const world=worldForRecord(power,record,chat);if(!world)return '';
 const data=worldBriefData(power,world.id,chat);
 const direct=Object.entries(record.specific?.fields||{}).filter(([key])=>['region_id','organization_id','civilization_id'].includes(key)).map(([,id])=>power.archives?.[id]).filter(r=>r&&r.status!=='ended'&&archiveCurrent(r,chat));
 const relations=relationLinks(power,record);
 for(const id of ['subject_id','target_id','event_id']){const r=power.archives?.[record.specific?.fields[id]];if(r&&!direct.some(d=>d.id===r.id))direct.push(r);}
 for(const r of Object.values(power.archives||{}))if(r.id!==record.id&&r.status!=='ended'&&archiveCurrent(r,chat)&&(r.specific?.fields.organization_id===record.id||r.specific?.fields.region_id===record.id||r.specific?.fields.civilization_id===record.id)&&!direct.some(d=>d.id===r.id))direct.push(r);
 const link=r=>`<button type="button" class="wjwk-link" data-action="open-archive" data-id="${esc(r.id)}">${esc(r.name)}</button>`;
 return `<section data-world-links><h3>${record.id===world.id?'此世界关联档案':'所属世界'}</h3>${record.id!==world.id?link(world)+direct.map(link).join('')+relations.map(r=>`<p>${link(r)} · ${esc(r.specific.fields.direction)} · ${esc(r.specific.fields.state)}</p>`).join(''):data.groups.map(g=>`<details><summary>${g.label} · ${g.records.length}</summary>${g.records.map(link).join('')}</details>`).join('')||'<p class="wjwk-muted">暂无明确关联的独立档案。</p>'}</section>`;
}
