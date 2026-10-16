// New read format only; old evidence hashes retain their original readers.
export { ARCHIVE_READ_FORMAT } from './state-validation.js';
export function withoutThoughts(value,{legacy=false}={}){
 const original=String(value??''),raw=legacy?original:original.replace(/<!--\s*(?:plotThink|charThink|simple_thinking)\s*:[\s\S]*?-->/gi,''),stack=[];let out='',cursor=0;
 // Match block types: a tag example inside planning must not outlive its parent.
 const expression=/(`+)[\s\S]*?\1|<(\/?)(think|thinking|analysis|reasoning|konatan_planning~?|WJWK-think|WJWK-option|draft|logic_check)(?=[\s>])[^>]*>/gi;
 const pattern=legacy?new RegExp(expression.source.replace('|draft|logic_check',''),'gi'):expression;
 for(const m of raw.matchAll(pattern)){
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
export function statusSnapshots(value,options){
 return [...String(value??'').matchAll(/<WJWK-status\b[^>]*>([\s\S]*?)<\/WJWK-status\s*>/gi)].map(m=>withoutThoughts(m[1],options)).filter(Boolean);
}
export function readerReport(raw,content){return {rawCharacters:String(raw).length,readCharacters:content.length,thoughtBlocks:[...String(raw).matchAll(/<(?:think|thinking|analysis|reasoning|konatan_planning~?|WJWK-think|draft|logic_check)\b/gi)].length+( /<\/konatan_planning~?\s*>/i.test(raw)&&!/<konatan_planning/i.test(raw)?1:0),statusBlocks:statusSnapshots(raw).length,optionBlocks:[...String(raw).matchAll(/<WJWK-option\b/gi)].length,variableBlocks:[...String(raw).matchAll(/<UpdateVariable\b/gi)].length};}
