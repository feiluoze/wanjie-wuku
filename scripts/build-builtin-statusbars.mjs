// Use the actual shipped runtime book (including reviewed overrides), never a historic author export.
import {builtinEntries} from '../src/builtin-worldbook.js';import {writeFile} from 'node:fs/promises';import {hash} from '../src/primitives.js';
export function extractStatusbar(entry){
 const match=/<状态栏>\s*([\s\S]*?)(?=\n\s*<(?!\/状态栏)[^\n>]+>|<\/状态栏>|$)/.exec(entry.content),block=match?.[1].trim()||'',groups=[];let group;
 if(block.startsWith('【'))for(const line of block.split('\n')){
  const title=/^【([^】]+)】/.exec(line.trim());if(title){group={id:'statusbar_'+hash(title[1]).slice(0,10),title:title[1],fields:[]};groups.push(group);continue;}
  const f=/^([^\n：:]{1,50})[：:]\s*(.*)$/.exec(line.trim());if(group&&f&&!/^\d|^\[|^…/.test(f[1]))group.fields.push({id:'s_'+hash(f[1]).slice(0,10),label:f[1],description:f[2]||'按本节后续原文清单保留实际内容；没有明确事实则不填。',type:'text'});
 }
 for(const g of groups){if(!g.fields.length){const start=block.indexOf('【'+g.title+'】')+g.title.length+2,end=block.indexOf('【',start);const body=block.slice(start,end<0?undefined:end).trim();if(body)g.fields=[{id:'s_'+hash(g.title).slice(0,10),label:g.title,description:body,type:'text'}];}g.cardinality=g.title.includes('详情')&&!g.title.startsWith('当前')&&g.fields.some(f=>f.label==='名称')?'per-object':'singleton';if(g.cardinality==='per-object')g.keyField=g.fields.find(f=>f.label==='名称').id;}
 return {name:entry.name,contentHash:hash(entry.content),block:groups.some(g=>g.fields.length)?block:'',groups:groups.filter(g=>g.fields.length),disposition:groups.some(g=>g.fields.length)?entry.name.startsWith('太始天')?'dedicated':'statusbar':'no-statusbar'};
}
const rows=builtinEntries({includeDedicated:true}).map(extractStatusbar);
await writeFile(new URL('../src/builtin-statusbar-data.js',import.meta.url),'// Generated from the current bundled runtime book, not historical templates.\nexport const BUILTIN_STATUSBARS='+JSON.stringify(rows)+';\n');
console.log(JSON.stringify({entries:rows.length,statusbarEntries:rows.filter(r=>r.groups.length).length,groups:rows.reduce((n,r)=>n+r.groups.length,0)}));
