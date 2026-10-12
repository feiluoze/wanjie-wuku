import {withoutThoughts} from './archive-reader.js';
import {assert,hash,stable,clone} from './primitives.js';
import {archiveContextCurrent,isArchiveDialogue} from './archives.js';
import {storyText} from './core.js';
import {isTaishi} from './taishi.js';

export {validateTaishiTime} from './state-validation.js';
import {validateTaishiTime} from './state-validation.js';
export const timeReceiptCurrent=(receipt,chat)=>archiveContextCurrent({source:{type:'story',anchor:receipt.anchor}},chat);
// Deliberately narrow narration grammar: standalone factual statements, Arabic
// positive amounts, explicit internal time. No ratios, vague jumps or user intent.
export function storyTimeEvents(power,chat){
 if(!isTaishi(power)||!power.active)return [];
 const worlds=Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='world'&&r.status!=='ended'&&archiveContextCurrent(r,chat)),events=[];
 const receipts=(power.taishiTime?.receipts||[]).filter(r=>timeReceiptCurrent(r,chat));
 for(let index=Math.max(0,chat.length-24);index<chat.length;index++){
  const m=chat[index];if(!isArchiveDialogue(m))continue;
  const body=storyText(m.mes??m.content??'');let offset=0,rows=[],fence=null;
  for(const line of body.split('\n')){
   const quote=line.trim();offset+=line.length+1;
   const delimiter=/^(```+|~~~+)/.exec(quote)?.[1]?.[0];if(delimiter){fence=fence===delimiter?null:fence||delimiter;continue;}
   const prefix=body.slice(0,Math.min(offset-1,body.length));
   if(fence||!withoutThoughts(prefix).endsWith(quote)||prefix.lastIndexOf('<blockquote')>prefix.lastIndexOf('</blockquote'))continue;
   for(const world of worlds){
    if(!quote.startsWith(world.name+'内部'))continue;
    const rest=quote.slice(world.name.length),match=/^内部(?:已经|已)?(?:过去|经过|推进)(?:了)?\s*([0-9]+(?:\.[0-9]+)?)\s*(小时|天|年)[。.!！]?$/u.exec(rest);
    if(!match)continue;const elapsed=Number(match[1]);if(!(elapsed>0&&elapsed<=1e9))continue;
    const unit={'小时':'hours','天':'days','年':'years'}[match[2]],anchor={index,swipeId:m.swipe_id??0,length:Math.min(offset-1,body.length),textHash:hash(body.slice(0,Math.min(offset-1,body.length)))};
    const id=hash(stable({worldId:world.id,anchor,elapsed,unit}));
    if(!receipts.some(r=>r.id===id))rows.push({id,worldId:world.id,worldName:world.name,elapsed,unit,anchor,quote});
   }
  }
  if(rows.length<=8)events.push(...rows); // Ambiguous/oversized floors require manual input.
 }
 return events;
}
export function assertStoryTime(power,chat,event){
 const current=storyTimeEvents(power,chat).find(r=>r.id===event?.id);
 assert(current&&stable(current)===stable(event),'正文历时已变化、已经采用或世界已失效，请重新打开自主发展');return current;
}
export function recordStoryTime(power,chat,event){
 assertStoryTime(power,chat,event);
 const receipts=(power.taishiTime?.receipts||[]).filter(r=>timeReceiptCurrent(r,chat)&&r.anchor.index>=Math.max(0,chat.length-24));
 receipts.push({id:event.id,worldId:event.worldId,anchor:clone(event.anchor)});power.taishiTime={receipts};validateTaishiTime(power.taishiTime);
}
