// Persist only source coordinates and fingerprints, never a second private transcript.
import {assert,hash} from './primitives.js';
import {ARCHIVE_READ_FORMAT} from './state-validation.js';
import {archiveRangeBounds,normalizeArchiveRange} from './archive-scope.js';
const dialogue=m=>m&&!m.is_user&&(!m.is_system||m.extra?.bbs_hidden===true);
export function validateArchiveBatch(p){
 if(p===undefined)return;
 assert(p&&Object.keys(p).every(k=>['id','cursor','parts','floors','characters','range'].includes(k))&&typeof p.id==='string'&&p.id.length<=200,'分批断点无效');
 assert(Number.isSafeInteger(p.cursor)&&Array.isArray(p.parts)&&p.parts.length>0&&p.parts.length<=20000&&p.cursor>=0&&p.cursor<=p.parts.length,'分批进度无效');
 assert(Number.isSafeInteger(p.floors)&&p.floors>=1&&p.floors<=12&&Number.isSafeInteger(p.characters)&&p.characters>=4000&&p.characters<=40000,'分批大小无效');normalizeArchiveRange(p.range);
 for(const part of p.parts){assert(Array.isArray(part)&&part.length>0&&part.length<=p.floors,'分批楼层无效');for(const s of part)assert(s&&Object.keys(s).every(k=>['index','swipeId','offset','length','textHash'].includes(k))&&[s.index,s.swipeId,s.offset,s.length].every(Number.isSafeInteger)&&s.index>=0&&s.swipeId>=0&&s.offset>=0&&s.length>s.offset&&s.length-s.offset<=p.characters&&/^[a-f0-9]{16}$/.test(s.textHash),'分批来源无效');assert(part.reduce((n,s)=>n+s.length-s.offset,0)<=p.characters,'分批正文过长');}
 let previous=null;for(const s of p.parts.flat()){assert(s.index<=1000000&&(!previous?s.offset===0:s.index===previous.index?s.swipeId===previous.swipeId&&s.offset===previous.length:s.index>previous.index&&s.offset===0),'分批来源顺序重复或存在缺段');previous=s;}
}
export function createArchiveBatch(chat,values,read){
 const range=normalizeArchiveRange(values),floors=Number(values.floors??3),characters=Number(values.characters??18000);
 assert(Number.isSafeInteger(floors)&&floors>=1&&floors<=12&&Number.isSafeInteger(characters)&&characters>=4000&&characters<=40000,'每批须为1—12条角色正文、4000—40000字符');
 const bounds=archiveRangeBounds({archiveReadRange:range},chat.length),parts=[];let part=[],size=0;
 const flush=()=>{if(part.length){parts.push(part);part=[];size=0;}};
 for(let index=bounds.from;index<bounds.to;index++){
  const m=chat[index];if(!dialogue(m))continue;const content=read(m.mes??m.content??'');if(!content.trim())continue;
  for(let offset=0;offset<content.length;){
   if(part.length>=floors||size+Math.min(characters,content.length-offset)>characters)flush();
   let end=Math.min(content.length,offset+characters);if(end<content.length){const breaks=['\n','。','；'].map(c=>content.lastIndexOf(c,end-1)).filter(i=>i>offset+characters*.6);if(breaks.length)end=Math.max(...breaks)+1;else if(/[\uD800-\uDBFF]/.test(content[end-1]))end--;}
   // Keep settlement/status envelopes intact: a cut must never turn the tail of
   // an unselected opportunity into apparent narrative evidence.
   for(const block of content.matchAll(/<([a-z][a-z0-9_]*-(?:settle|status|state)|MMLC-archive)\b[^>]*>[\s\S]*?<\/\1\s*>/gi))if(block.index<end&&block.index+block[0].length>end){
    assert(block[0].length<=characters,'单个结算或状态块超过每批字符上限，请提高上限后重新划分；尚未调用API');
    end=block.index>offset?block.index:block.index+block[0].length;
   }
   part.push({index,swipeId:m.swipe_id??0,offset,length:end,textHash:hash(content.slice(0,end))});size+=end-offset;offset=end;
   if(offset<content.length)flush();
  }
 }
 flush();assert(parts.length,'所选范围没有可整理的角色正文');
 const plan={id:'batch_'+hash(String(Date.now())+Math.random()),cursor:0,parts,floors,characters,range};validateArchiveBatch(plan);return plan;
}
export function archiveBatchSources(plan,chat,read){
 validateArchiveBatch(plan);assert(plan.cursor<plan.parts.length,'所有批次已完成');
 const checked=new Map();for(const part of plan.parts.slice(0,plan.cursor+1))for(const s of part){const m=chat[s.index];let content=checked.get(s.index);if(content===undefined){content=read(m?.mes??m?.content??'');checked.set(s.index,content);}assert(dialogue(m)&&(m.swipe_id??0)===s.swipeId&&hash(content.slice(0,s.length))===s.textHash,'已处理或当前批次的正文已变化，请重新划分；原档案和日志保留');}
 return plan.parts[plan.cursor].map(s=>{const m=chat[s.index],content=read(m?.mes??m?.content??'');assert(dialogue(m)&&(m.swipe_id??0)===s.swipeId&&hash(content.slice(0,s.length))===s.textHash,'本批正文已改写或切换回复，请重新划分读取范围；旧档案和日志保留');return {...s,content:content.slice(s.offset,s.length),format:ARCHIVE_READ_FORMAT};});
}
export function advanceArchiveBatch(power,token,sources){
 const p=power.archiveBatch;validateArchiveBatch(p);assert(p?.id===token.id&&p.cursor===token.cursor,'分批断点已变化');
 assert(p.parts[p.cursor].length===sources.length&&p.parts[p.cursor].every((s,i)=>s.index===sources[i].index&&s.offset===sources[i].offset&&s.length===sources[i].length&&s.textHash===sources[i].textHash),'分批来源不一致');p.cursor++;
}
