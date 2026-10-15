// Resolve only within the exact packet sent to the model. No fuzzy or prose matching.
const normalized=v=>String(v??'').normalize('NFKC').trim();
const fail=(code,message)=>{throw Object.assign(Error(message),{referenceCode:code});};
const rowsOf=packet=>(packet?.payload?.books||[]).flatMap(book=>book.entries.map(entry=>({book,entry})));
const titleName=title=>normalized(title).replace(/^【(?:世界|地域|人物|文明|族群|组织|势力)】\s*/,'').split(/[｜|]/)[0].trim();
const markerKinds={world:['世界'],region:['地域'],companion:['人物'],organization:['组织','势力','政权'],inhabitants:['文明','族群']};
function explicitSections(raw,packet){
 const name=normalized(raw.name),markers=markerKinds[raw.recordId]||[];if(!name||!markers.length)return [];
 return rowsOf(packet).flatMap(({book,entry})=>{
  const text=entry.content||'',matches=[...text.matchAll(/^(?:#{1,6}\s+)?【([^】]+)】([^\r\n]+)\s*$/gm)]
    .filter(m=>markers.includes(m[1])&&normalized(m[2])===name);
  return matches.map(m=>({book:book.name,id:String(entry.id),part:entry.part??1,offset:(entry.offset??0)+m.index}));
 });
}
export function inferSettingRefs(raw,packet){
 const name=normalized(raw.name);if(!name)return [];
 const rows=rowsOf(packet).filter(({entry})=>titleName(entry.title)===name);
 const identities=new Set(rows.map(({book,entry})=>JSON.stringify([book.name,String(entry.id)])));
 if(identities.size>1)fail('reference_ambiguous','本批有多个同名原文，需指定词条ID');
 if(rows.length)return rows.map(({book,entry})=>({book:book.name,id:String(entry.id),part:entry.part??1}));
 const sections=explicitSections(raw,packet);
 if(sections.length>1)fail('reference_ambiguous','本批存在多个同名明确段落，需指定原文片段');
 if(!sections.length)return [];
 const section=sections[0];
 return rowsOf(packet).filter(({book,entry})=>book.name===section.book&&String(entry.id)===section.id).map(({book,entry})=>({book:book.name,id:String(entry.id),part:entry.part??1}));
}
export function resolveSettingRefs(refs,packet){
 if(!packet?.payload?.books)fail('reference_packet_missing','本次原文片段未传入引用校验');
 if(typeof refs==='string'||typeof refs==='number'||refs&&typeof refs==='object'&&!Array.isArray(refs)&&('id'in refs||'uid'in refs))refs=[refs];
 if(!Array.isArray(refs)||!refs.length||refs.length>128)fail('reference_format','原文引用列表须为非空列表且不超过128项');
 const result=[];
 for(let ref of refs){
  if(typeof ref==='string'||typeof ref==='number')ref={id:ref};
  if(!ref||typeof ref!=='object'||Array.isArray(ref)||Object.keys(ref).some(k=>!['book','id','uid','part'].includes(k)))fail('reference_format','原文引用格式无效，仅接受book、id/uid、part');
  if(ref.id!==undefined&&ref.uid!==undefined&&String(ref.id)!==String(ref.uid))fail('reference_format','原文引用id与uid不一致');
  const id=ref.id??ref.uid;if(!['string','number'].includes(typeof id))fail('reference_format','原文引用缺少词条ID');
  const part=ref.part===undefined?undefined:Number(ref.part);if(part!==undefined&&(!Number.isSafeInteger(part)||part<1))fail('reference_format','原文引用片段序号无效');
  const rows=rowsOf(packet).filter(({book,entry})=>String(entry.id)===String(id)&&(ref.book===undefined||normalized(book.name)===normalized(ref.book))&&(part===undefined||(entry.part??1)===part));
  if(!rows.length)fail('reference_not_selected','原文引用不在本批所选书、词条或片段中');
  if(new Set(rows.map(({book})=>book.name)).size>1)fail('reference_ambiguous','多个所选书拥有相同ID，需指定书名');
  for(const {book,entry}of rows){const row={book:book.name,id:String(entry.id),title:entry.title||'',part:entry.part??1,offset:entry.offset??0,end:entry.end??entry.content.length,content:entry.content};if(!result.some(r=>r.book===row.book&&r.id===row.id&&r.part===row.part&&r.offset===row.offset))result.push(row);}
 }
 return result;
}
