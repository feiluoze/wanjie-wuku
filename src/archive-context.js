import {archiveReadText} from './core.js';
export function archiveContextWindow(chat,first,depth){
 let remaining=6000;const result=[];
 const eligible=chat.slice(0,first).map((m,index)=>({index,content:archiveReadText(m.mes??m.content??''),is_user:m.is_user,is_system:m.is_system&&m.extra?.bbs_hidden!==true})).filter(m=>!m.is_user&&!m.is_system&&m.content.trim()).slice(-depth);
 for(const row of eligible.reverse()){
  if(!remaining)break;const length=Math.min(row.content.length,2000,remaining);
  result.push({index:row.index,content:row.content.slice(-length),...(length<row.content.length?{excerpt:true,originalCharacters:row.content.length}:{})});remaining-=length;
 }
 return result.reverse();
}
