import {assert,clone,hash,stable} from './primitives.js';
import {BUILD_OBJECT_LIMIT,objectMarkers,packetObjectCost} from './build-budget.js';

// Versioned deterministic segmentation: resume stores hashes and indices, never book text.
export const BUILD_VERSION=1;
export const BUILD_BATCH_LIMIT=24000;
const keys=['version','fingerprint','ruleVersion','next','total','skipped'];
export function validateTaishiBuild(value){
  if(value===undefined)return;
  assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k))&&value.version===BUILD_VERSION,'世界书构建进度格式无效');
  assert([value.fingerprint,value.ruleVersion].every(v=>typeof v==='string'&&/^[a-f0-9]{16}$/.test(v)),'世界书构建指纹无效');
  assert(Number.isSafeInteger(value.total)&&value.total>0&&value.total<=1000&&Number.isSafeInteger(value.next)&&value.next>=0&&value.next<=value.total,'世界书构建批次无效');
  assert(Array.isArray(value.skipped)&&value.skipped.length<=value.next&&new Set(value.skipped).size===value.skipped.length&&value.skipped.every(i=>Number.isSafeInteger(i)&&i>=0&&i<value.next),'世界书跳过批次无效');
}
export function planTaishiBuild(reference,ruleVersion,structure=null,{legacy=false}={}){
  const chunks=[];let books=[];
  const payload=()=>({kind:reference.payload.kind,books});
  const flush=()=>{if(books.length){chunks.push({payload:payload()});books=[];}};
  for(const book of reference.payload.books)for(const entry of book.entries){
    let start=0,part=0;const pieces=[];
    do{
      let end=Math.min(entry.content.length,start+3000);
      if(!legacy){const marks=objectMarkers(entry.content).filter(i=>i>=start&&i<end);if(marks.length>BUILD_OBJECT_LIMIT)end=marks[BUILD_OBJECT_LIMIT];}
      if(end<entry.content.length&&/[\uD800-\uDBFF]/.test(entry.content[end-1]))end--;
      pieces.push({...entry,content:entry.content.slice(start,end),offset:start,end,entryCharacters:entry.content.length,part:++part});start=end;
    }while(start<entry.content.length);
    for(const piece of pieces){
      piece.parts=pieces.length;
      const add=()=>{let b=books.find(b=>b.name===book.name);if(!b){b={name:book.name,entries:[]};books.push(b);}b.entries.push(piece);};
      const before=books;books=clone(books);add();
      if(JSON.stringify(payload()).length>BUILD_BATCH_LIMIT||!legacy&&packetObjectCost(books)>BUILD_OBJECT_LIMIT){books=before;flush();add();}
      assert(JSON.stringify(payload()).length<=BUILD_BATCH_LIMIT,'单条世界书片段过长');
    }
  }
  flush();assert(chunks.length>0&&chunks.length<=1000,'请先选择并保存个人世界书条目，或缩小过大的选择');
  const fingerprint=hash(stable({version:BUILD_VERSION,source:reference.fingerprint,ruleVersion,structure,...(legacy?{}:{objectLimit:BUILD_OBJECT_LIMIT})}));
  for(const chunk of chunks){chunk.fingerprint=hash(stable(chunk.payload));chunk.characters=chunk.payload.books.reduce((n,b)=>n+b.entries.reduce((s,e)=>s+e.content.length,0),0);chunk.summary=chunk.payload.books.map(b=>({name:b.name,entries:b.entries.map(({content,...e})=>({...e,characters:content.length}))}));}
  return {version:BUILD_VERSION,fingerprint,ruleVersion,total:chunks.length,next:0,skipped:[],chunks,characters:reference.characters};
}
export function buildProgress(plan){const {version,fingerprint,ruleVersion,next,total,skipped}=plan;return {version,fingerprint,ruleVersion,next,total,skipped:[...skipped]};}
export function assertBuildMatch(saved,plan){
  validateTaishiBuild(saved);
  assert(!saved||saved.version===plan.version&&saved.fingerprint===plan.fingerprint&&saved.ruleVersion===plan.ruleVersion&&saved.total===plan.total,'世界书选择、正文或规则已变化；请重新建立批次，已有档案保留');
}
export function advanceTaishiBuild(power,expected,{skip=false}={}){
  validateTaishiBuild(expected);assertBuildMatch(power.taishiBuild,expected);
  assert((power.taishiBuild?.next??0)===expected.next&&expected.next<expected.total,'构建批次已变化或已经完成，请重新打开');
  power.taishiBuild={...buildProgress(expected),next:expected.next+1,skipped:skip?[...expected.skipped,expected.next]:[...expected.skipped]};
  validateTaishiBuild(power.taishiBuild);
}
