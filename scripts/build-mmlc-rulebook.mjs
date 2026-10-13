// Rebuild the readable runtime snapshot from the checked-in author snapshot.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),book=JSON.parse(await readFile(resolve(root,'data/mmlc-worldbook.json'),'utf8'));
if(book.name!=='漫漫长路'||!/^\d{4}-\d{2}-\d{2}$/.test(book.snapshotDate)||!/^[a-f0-9]{64}$/.test(book.sourceSha256)||!Array.isArray(book.entries)||book.entries.length!==21)throw Error('Invalid author snapshot metadata');
const ids=new Set();for(const e of book.entries){if(!Number.isSafeInteger(e.uid)||ids.has(e.uid)||typeof e.enabled!=='boolean'||typeof e.title!=='string'||!e.title||typeof e.content!=='string'||!e.content)throw Error('Invalid author chapter');ids.add(e.uid);}
await writeFile(resolve(root,'src/mmlc-worldbook-data.js'),'// Generated from data/mmlc-worldbook.json; retain author text verbatim.\nexport const MMLC_RULEBOOK = '+JSON.stringify(book)+';\n');
console.log(JSON.stringify({chapters:book.entries.length,characters:book.entries.reduce((n,e)=>n+e.content.length,0),sourceSha256:book.sourceSha256}));
