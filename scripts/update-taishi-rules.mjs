// Apply the explicitly supplied author text without rebuilding unrelated entries.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {BUILTIN_WORLDBOOK} from '../src/builtin-worldbook-data.js';
import {taishiConfig} from '../src/taishi.js';
import {hash,stable,assert,clone} from '../src/primitives.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
assert(process.argv[2],'Usage: node scripts/update-taishi-rules.mjs author.txt');
const body=(await readFile(process.argv[2],'utf8')).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
assert(body.startsWith('<太始天>')&&body.trimEnd().endsWith('</太始天>')&&body.includes('【天地归主】'),'太始天规则文本不完整');
const book=clone(BUILTIN_WORLDBOOK),entry=book.entries.find(e=>e.name.startsWith('太始天（完整版'));
assert(entry,'内置完整版不存在');
const configs=JSON.parse(await readFile(resolve(root,'data/creation-adapters.json'),'utf8'));
const config=configs.find(c=>c.id==='wuku.primordial_world');
if(entry.content!==body){
  const legacy={name:entry.name,entryId:entry.entryId,contentHash:hash(entry.content),length:entry.content.length,target:entry.name};
  if(!book.legacy.some(e=>e.contentHash===legacy.contentHash))book.legacy.push(legacy);
  book.legacyAdapterDigests=[...new Set([...book.legacyAdapterDigests,hash(stable(config)),hash(stable(taishiConfig(config)))])];
}
entry.content=body;book.version='2026-10-12';
book.overrides={...book.overrides,taishi:{source:'太始天.txt（用户提供）',sha256:createHash('sha256').update(body).digest('hex'),contentHash:hash(body)}};
config.target.primaryHashes=[...new Set([hash(body),...config.target.primaryHashes])];
config.version='1.1.0';config.description='匹配太始天完整版及已识别旧版；保留既有档案与历史。';
config.operations[0].ruleQuote='已有知识、设施与法则可直接调用';
const recipes=JSON.parse(await readFile(resolve(root,'data/management-recipes.json'),'utf8'));
const recipe=recipes.recipes.find(r=>r.entryId===entry.entryId);
for(const template of recipe.templates){const quote=body.split('\n').find(line=>line.startsWith(template.label+'：'));assert(quote,'新版缺少字段依据：'+template.label);template.ruleQuote=quote;}
await writeFile(resolve(root,'data/management-recipes.json'),JSON.stringify(recipes,null,2)+'\n');
await writeFile(resolve(root,'data/taishi-rules.txt'),body);
await writeFile(resolve(root,'data/creation-adapters.json'),JSON.stringify(configs,null,2)+'\n');
await writeFile(resolve(root,'data/builtin-worldbook.json'),JSON.stringify({name:'万界武库V4.1',entries:Object.fromEntries(book.entries.map(e=>[e.entryId,{uid:Number(e.entryId),comment:e.name,content:e.content,disable:!e.enabledInBook}]))},null,2)+'\n');
await writeFile(resolve(root,'src/builtin-worldbook-data.js'),'// Generated author data; use build-worldbook.mjs and update-taishi-rules.mjs. Never execute embedded text.\nexport const BUILTIN_WORLDBOOK = '+JSON.stringify(book)+';\n');
console.log(JSON.stringify({entry:entry.name,characters:body.length,hash:hash(body),legacy:book.legacy.length}));
