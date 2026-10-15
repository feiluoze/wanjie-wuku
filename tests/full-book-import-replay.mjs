import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fixture} from './mvu-fixture.js';
import {referenceEntries,packReferences,REFERENCE_BUILD_LIMIT} from '../src/ai-worldbooks-data.js';
import {planTaishiBuild} from '../src/taishi-build.js';
import {decodeCheckpoint} from '../src/review-checkpoint.js';
import {archivePrompt} from '../src/archive-review.js';
import {clone} from '../src/core.js';
const [path,out]=process.argv.slice(2),book=JSON.parse(await readFile(path,'utf8')),bookName='太始星导入验收',entries=referenceEntries(book,bookName).filter(e=>!process.argv.includes('--without-people')||!e.title.startsWith('【人物】')),selection=[{name:bookName,entryIds:entries.map(e=>e.id)}];
const f=fixture();await f.app.openTaishi();f.app.settings.mode='st';f.app.ui.setTaishiLayout=()=>{};f.app.ui.showTaishiStructure=()=>{};f.app.ui.showTaishiBuild=d=>{f.screen=d;};f.app.ui.showArchiveReview=()=>{};f.app.ui.showAIWorldbooks=()=>{};
f.app.openTaishiStructure();await f.app.saveTaishiStructure({mode:'single',worldName:'太始星'});
f.ctx.loadWorldInfo=async()=>book;await f.store.transact(s=>{s.powers[f.app.powerId].taishiBuildReferences={mode:'manual',books:selection};});
const power=()=>f.store.read().powers[f.app.powerId],ref=packReferences(selection,new Map([[bookName,entries]]),{limit:REFERENCE_BUILD_LIMIT}),plan=planTaishiBuild(ref,power().ruleVersion,power().taishiWorldStructure);
const reconstructed=new Map();for(const c of plan.chunks)for(const e of c.payload.books[0].entries)reconstructed.set(e.id,(reconstructed.get(e.id)||'')+e.content);for(const e of entries)assert.equal(reconstructed.get(e.id),e.content);
let calls=0,maxInput=0,maxCurrent=0,full=0,slim=0;const expected=new Set(),metrics=[];
const map={世界:['world','environment','overview'],地域:['region','environment','overview'],人物:['companion','member','profile'],神灵:['companion','member','profile'],文明:['inhabitants','record','civilization'],族群:['inhabitants','record','civilization'],家族:['organization','record','overview'],政权:['organization','record','overview'],组织:['organization','record','overview'],规则:['available','record','current'],力量体系:['available','record','current'],'器物与资源':['available','record','current']};
// Test-only deterministic provider: explicit headings only. This tests the import
// pipeline and source preservation, not a real model's semantic extraction.
f.app.model.request=async p=>{
 calls++;const input=JSON.parse(p.user);maxInput=Math.max(maxInput,p.user.length);maxCurrent=Math.max(maxCurrent,JSON.stringify(input.current).length);full+=input.current.filter(r=>!r.identityOnly).length;slim+=input.current.filter(r=>r.identityOnly).length;
 const changes=new Map();
 for(const b of input.attachedWorldbooks.books)for(const e of b.entries){
  let matches=[...e.content.matchAll(/^【([^】\r\n]+)】([^\r\n]+)$/gm)].filter(m=>map[m[1]]);if(!matches.length){const m=/^【([^】]+)】([^｜]+)/.exec(e.title);if(m&&map[m[1]])matches=[m];}
  for(const m of matches){const [recordId,type,field]=map[m[1]];if(input.personImport&&recordId==='companion')continue;const name=m[2].trim(),key=recordId+'|'+name,old=input.current.find(r=>r.name===name&&r.specific?.recordId===recordId);expected.add(key);
   changes.set(key,{...(old?{archiveId:old.id}:{}),recordId,type,name,status:'active',fields:type==='environment'?{conditions:'世界书明确设定'}:type==='member'?{role:'世界书已有设定'}:{description:'世界书明确设定'},details:{[field]:'本批明确原文 '+e.id+'/'+e.part},settingRefs:[...(changes.get(key)?.settingRefs||[]),{book:b.name,id:e.id,part:e.part}],sourceIndex:-1});
  }
 }
 metrics.push({batch:calls,input:p.user.length,current:JSON.stringify(input.current).length,full:input.current.filter(r=>!r.identityOnly).length,identities:input.current.length,candidates:changes.size});return JSON.stringify({changes:[...changes.values()]});
};
const baseline=clone(f.store.read());await f.app.initializeTaishi();assert.equal(f.calls||0,0);let restored=false;
for(let i=0;i<plan.total;i++){
 if(i){f.app.taishiBuildDraft=null;await f.app.initializeTaishi();}assert.equal(f.screen.plan.next,i);f.screen.includePeople=!process.argv.includes('--without-people');await f.app.runTaishiBuild();let pending=f.app.pendingArchiveReview;assert(pending,'Missing preview '+JSON.stringify(f.app.ui.notice));assert.equal(pending.issues.length,0,JSON.stringify(pending.issues));
 if(i===Math.min(7,plan.total-1)){const s=f.app.contextSnapshot(),raw=f.storage.getItem('wanjie-wuku:review-checkpoint:'+s.chatKey);f.app.pendingArchiveReview=null;pending=decodeCheckpoint(raw,s);assert(pending);f.app.pendingArchiveReview=pending;restored=true;}
 await f.app.commitArchiveReview(pending,new Map(pending.changes.map((c,j)=>[j,c.id])));f.app.pendingArchiveReview=null;assert.equal(power().taishiBuild.next,i+1);
}
assert.equal(power().taishiBuild.next,plan.total);assert.equal(calls,plan.total);const archives=Object.values(power().archives);assert.equal(archives.filter(r=>r.specific?.recordId==='world').length,1);assert(archives.every(r=>!r.specific||r.specific.recordId==='world'||r.specific.fields.world_id===power().taishiWorldStructure.worldId));for(const key of expected){const [type,...rest]=key.split('|');assert.equal(archives.filter(r=>r.specific?.recordId===type&&r.name===rest.join('|')).length,1,key);}
// Dedicated long people must retain every split character in their local sources.
for(const e of entries.filter(e=>e.title.startsWith('【人物】'))){const name=/^【人物】([^｜]+)/.exec(e.title)[1],r=archives.find(r=>r.name===name),rows=JSON.parse(r.specific.fields.source_profile).filter(r=>r.id===e.id).sort((a,b)=>a.offset-b.offset);assert.equal(rows.map(r=>r.content).join('')===e.content,true,name+' offsets '+rows.map(r=>r.offset));}
// Recreate a state whose full archive payload exceeds the failing local limit.
const swollen=clone(power());for(const r of Object.values(swollen.archives)){r.fields={...r.fields,[r.type==='member'?'role':r.type==='environment'?'conditions':'description']:'保留的旧设定'.repeat(500)};}
const before=JSON.stringify(swollen.archives),request=archivePrompt(swollen,[],f.ctx.chat,'',{state:f.store.read(),setupReferences:true,referenceBatch:plan.chunks.at(-1)});assert(request.user.length<120000);assert.equal(JSON.stringify(swollen.archives),before);assert(JSON.parse(request.user).current.length===archives.length);
const evidence={bookEntries:entries.length,bookCharacters:entries.reduce((n,e)=>n+e.content.length,0),plannedBatches:plan.total,completedBatches:power().taishiBuild.next,sourceCharactersPreserved:true,uniqueArchives:archives.length,worlds:1,allWorldLinksValid:true,personOriginalsComplete:true,resumedCandidateWithoutNewCall:restored,maxRequestCharacters:maxInput,maxCurrentCharacters:maxCurrent,fullRecordOccurrences:full,identityOnlyOccurrences:slim,swollenFullArchiveCharacters:before.length,swollenRequestCharacters:request.user.length,mockedModelCalls:calls,paidCalls:0,realSemanticExtraction:'not tested',metrics};await writeFile(out,JSON.stringify(evidence,null,2));console.log(JSON.stringify({...evidence,metrics:undefined}));
