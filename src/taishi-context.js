import {archiveOrigin} from './archive-origin.js';
import {isTaishi} from './taishi.js';

const normalize=value=>String(value||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
const mentions=(query,name)=>normalize(name).length>=2&&normalize(query).includes(normalize(name));
export const TAISHI_KNOWLEDGE_POLICY='人物认知逐人独立：世界概况、其他人物档案、私人记忆和叙事者掌握的事实不等于该人物知道。knowledge区分已知、未知、误信与获知途径；只有亲历、明确告知、公开消息或已确认能力才能更新其认知。传闻保留传闻身份与来源，不自动升级为真相；未知留空不代表全知。允许合理创作行动与世界发展，但不得凭空补出人物已经收到秘密、跨界情报或玩家指令。社交关系与同处一个世界不自动传播信息。';

// Matching is explicit and bounded by the caller's query, never the whole chat.
// If several worlds are mentioned we include their union, without inferring travel.
export function taishiScope(power,records,query=''){
  if(!isTaishi(power))return null;
  const named=records.filter(r=>mentions(query,r.name));
  const worlds=new Set(named.filter(r=>r.specific?.recordId==='world').map(r=>normalize(r.name)));
  for(const r of named){const f=r.specific?.fields,w=f?.world_id?records.find(w=>w.id===f.world_id&&w.specific?.recordId==='world'):null;if(w)worlds.add(normalize(w.name));else if(!f?.world_id&&f?.world)worlds.add(normalize(f.world));}
  const direct=new Set(named.map(r=>r.id));
  return {worlds:[...worlds],direct:[...direct],includes:r=>direct.has(r.id)||worlds.has(normalize(r.specific?.recordId==='world'?r.name:(records.find(w=>w.id===r.specific?.fields.world_id)?.name||(!r.specific?.fields.world_id?r.specific?.fields.world:''))))};
}

// Automatic story feedback omits goals/social networks and all private memories.
// Explicit next/pinned selections remain a deliberate narrator-reference override.
export function taishiProjection(record,{explicit=false}={}){
  const kind=record.specific?.recordId,person=kind==='companion'||!kind&&record.type==='member';
  const allowed=person?new Set(['world_id','region_id','organization_id','world','location','role','action','progress','relationship','limits','profile','appearance','personality','background','motivation','speech','preferences','abilities','combat_style','crafts','knowledge']):kind==='world'?new Set(['stage','clock','overview','geography','era','factions','resources','events','connections','limits','descent','abilities','combat_style','crafts','rates','reset']):null;
  const fields=explicit||!person?{...record.fields}:Object.fromEntries(Object.entries(record.fields||{}).filter(([k])=>['role','location','condition','limits'].includes(k)));
  const specific=record.specific?{...record.specific,fields:Object.fromEntries(Object.entries(record.specific.fields).filter(([k])=>!['source_profile','time_state'].includes(k)&&(explicit||!allowed||allowed.has(k))))}:undefined;
  return {provenance:archiveOrigin(record),id:record.id,name:record.name,type:record.type,status:record.status,fields,...(specific?{specific}:{}),informationBoundary:{audience:'叙事者连续性参考，不是角色共同知识',...(person?{known:record.specific?.fields.knowledge||'尚未登记；不推定全知',privateMemories:explicit?'玩家明确选择发送；仍不向其他角色公开':'未自动发送'}:{})}};
}
