// New read format only; old evidence hashes retain their original readers.
export { ARCHIVE_READ_FORMAT } from './state-validation.js';
export function withoutThoughts(value){
 const raw=String(value??''),stack=[];let out='',cursor=0;
 // Match block types: a tag example inside planning must not outlive its parent.
 for(const m of raw.matchAll(/(`+)[\s\S]*?\1|<(\/?)(think|thinking|analysis|reasoning|konatan_planning~?|WJWK-think|WJWK-option)(?=[\s>])[^>]*>/gi)){
  if(m[1])continue; // Markdown code contains literal examples, not block delimiters.
  const tag=m[3].toLowerCase().replace(/~$/,'');
  if(!stack.length)out+=raw.slice(cursor,m.index);
  if(m[2]){
   const matching=stack.lastIndexOf(tag);
   if(matching>=0)stack.length=matching;
   else if(!stack.length&&tag==='konatan_planning')out='';
  }else stack.push(tag);
  cursor=m.index+m[0].length;
 }
 if(!stack.length)out+=raw.slice(cursor);return out.trim();
}
export function statusSnapshots(value){
 return [...String(value??'').matchAll(/<WJWK-status\b[^>]*>([\s\S]*?)<\/WJWK-status\s*>/gi)].map(m=>withoutThoughts(m[1])).filter(Boolean);
}
export function readerReport(raw,content){return {rawCharacters:String(raw).length,readCharacters:content.length,thoughtBlocks:[...String(raw).matchAll(/<(?:think|thinking|analysis|reasoning|konatan_planning~?|WJWK-think)\b/gi)].length+( /<\/konatan_planning~?\s*>/i.test(raw)&&!/<konatan_planning/i.test(raw)?1:0),statusBlocks:statusSnapshots(raw).length,optionBlocks:[...String(raw).matchAll(/<WJWK-option\b/gi)].length,variableBlocks:[...String(raw).matchAll(/<UpdateVariable\b/gi)].length};}
