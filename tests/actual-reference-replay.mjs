// Local diagnostic: reads supplied files; never embeds or redistributes their text.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {preparePersonSources,attachPersonSources} from '../src/taishi-profile.js';
const [bookPath,logPath,outPath]=process.argv.slice(2);
const book=JSON.parse(await readFile(bookPath,'utf8')),log=JSON.parse(await readFile(logPath,'utf8'));
const send=log.records[0].steps.find(s=>s.phase==='发送请求');
const packet={payload:{books:send.references.map(ref=>({name:ref.name,entries:ref.entries.map(e=>{const source=Object.values(book.entries).find(r=>String(r.uid)===String(e.id));assert(source,'原文ID不存在');return {...e,content:source.content.slice(e.offset??0,e.end??source.content.length)};})}))}};
const rows=packet.payload.books.flatMap(b=>b.entries).filter(e=>/^【(?:世界|地域)】/.test(e.title));
const changes=rows.map(e=>({name:e.title.replace(/^【[^】]+】/,'').split('｜')[0].trim(),recordId:e.title.startsWith('【世界】')?'world':'region'}));
const prepared=preparePersonSources({changes},packet),batch={changes:changes.map((r,inputIndex)=>({inputIndex,name:r.name,specific:{recordId:r.recordId,fields:{},labels:{}}})),issues:[]};attachPersonSources(batch,prepared);
assert.equal(batch.issues.length,0);assert.equal(batch.changes.length,changes.length);
for(const c of batch.changes){const source=JSON.parse(c.specific.fields.source_profile);assert.equal(source[0].content,rows[c.inputIndex].content);}
const report={version:'1.4.8',worlds:changes.filter(r=>r.recordId==='world').length,regions:changes.filter(r=>r.recordId==='region').length,exactSourceCopies:batch.changes.length,rejected:batch.issues.length,modelCalls:0,privateTextInReport:false};
await writeFile(outPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
