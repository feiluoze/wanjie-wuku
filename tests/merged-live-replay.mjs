// Read only the current logged fragments. Reports contain counts, not book contents.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {preparePersonSources} from '../src/taishi-profile.js';
const [bookPath,logPath,out]=process.argv.slice(2),book=JSON.parse(await readFile(bookPath,'utf8')),log=JSON.parse(await readFile(logPath,'utf8'));
const input=log.records[0].steps.find(s=>s.phase==='发送请求');
const packet={payload:{books:input.references.map(b=>({name:b.name,entries:b.entries.map(e=>{const source=Object.values(book.entries).find(r=>String(r.uid)===e.id);assert(source);return {...e,content:source.content.slice(e.offset,e.end)};})}))}};
const candidates=new Map();
for(const b of packet.payload.books)for(const e of b.entries)for(const m of e.content.matchAll(/^【(地域|人物)】([^\r\n]+)\s*$/gm)){
 const name=m[2].trim();if(name.endsWith('·地域与城镇')||name.endsWith('·政权与统治者'))continue;
 const recordId=m[1]==='地域'?'region':'companion';candidates.set(recordId+name,{name,recordId});
}
const changes=[...candidates.values()],prepared=preparePersonSources({changes},packet);
for(const name of ['七冠诸国','曦冠林海','玉霄龙廷','月翳古林','九霄仙境','三十三天域']){const index=changes.findIndex(c=>c.name===name);assert(index>=0);assert(prepared.sources.has(index),prepared.errors.get(index));}
const report={version:'1.4.8',build:'merged-fix',selectedFragments:packet.payload.books.flatMap(b=>b.entries).length,explicitInternalObjects:changes.length,linked:prepared.sources.size,ambiguousOrMissing:prepared.errors.size,screenshotExamplesLinked:6,externalRequests:0,modelCalls:0};await writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
