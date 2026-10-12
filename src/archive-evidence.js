function literalSpan(content, quote) {
 const exact=content.indexOf(quote);if(exact>=0)return content.slice(exact,exact+quote.length);
 const needle=quote.replace(/\s/gu,'');if(needle.length<6)return null;
 let plain='',positions=[];for(let i=0;i<content.length;i++)if(!/\s/u.test(content[i])){plain+=content[i];positions.push(i);}
 const index=plain.indexOf(needle);if(index<0)return null;
 return content.slice(positions[index],positions[index+needle.length-1]+1);
}

// Explicit indices may carry paraphrases. Missing/invalid indices need unique
// evidence; never silently attach an unknown fact to the newest reply.
export function resolveArchiveEvidence(rawIndex, quote, sources, playerNote='') {
 const index=Number(rawIndex),reference=typeof quote==='string'?quote.trim():'';
 if(playerNote)return {manual:true,source:{content:playerNote},quote:reference||playerNote.slice(0,4000),index:-1};
 if(!sources.length&&rawIndex===undefined)return {manual:true,source:{content:''},quote:reference,index:-1};
 const matches=reference?sources.filter(s=>literalSpan(s.content,reference)):[];
 const source=(matches.length===1?matches[0]:null)||sources.find(s=>Number.isSafeInteger(index)&&s.index===index)||(sources.length===1?sources[0]:null);
 if(!source)throw Error('来源楼层缺失或不在本批，且无法唯一定位引用；未归到最新楼层，请重查');
 return {manual:false,source,quote:literalSpan(source.content,reference)||reference,index:source.index};
}
