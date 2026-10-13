import {assert,clone,hash} from './primitives.js';

export const PERSON_SETTING_FIELDS=Object.freeze(['profile','appearance','personality','background','motivation','speech','preferences','abilities','combat_style','crafts','goals','social','origin']);
export const PERSON_SOURCE_LIMIT=60000;
// References identify exact input pieces. The model chooses references; only this
// code copies source text. A quotation supplied by the model is never an original.
export function preparePersonSources(data,referenceBatch){
  const cleaned=clone(data),sources=new Map(),errors=new Map();
  if(!Array.isArray(cleaned.changes))return {data:cleaned,sources,errors};
  cleaned.changes.forEach((raw,index)=>{
    if(!raw||typeof raw!=='object')return;
    const refs=raw.settingRefs;delete raw.settingRefs;
    if(refs===undefined){if(referenceBatch&&['companion','world'].includes(raw.recordId))errors.set(index,(raw.recordId==='world'?'世界':'人物')+'候选缺少settingRefs原文引用；请重试本批，不会把摘要当完整原文');return;}
    try{
      assert(referenceBatch&&['companion','world'].includes(raw.recordId)&&Array.isArray(refs)&&refs.length>0&&refs.length<=64,'设定原文引用只用于本批世界书人物或世界构建');
      const rows=refs.map(ref=>{
        assert(ref&&Object.keys(ref).every(k=>['book','id','part'].includes(k)),'人物原文引用格式无效');
        const book=referenceBatch.payload.books.find(b=>b.name===ref.book);
        const entry=book?.entries.find(e=>String(e.id)===String(ref.id)&&(e.part??1)===(ref.part??1));
        assert(entry,'人物原文引用不在本次所选词条片段中');
        return {book:book.name,id:String(entry.id),title:entry.title||'',part:entry.part??1,offset:entry.offset??0,end:entry.end??entry.content.length,fingerprint:hash(entry.content),content:entry.content};
      });
      sources.set(index,rows);
    }catch(e){errors.set(index,e.message);}
  });
  return {data:cleaned,sources,errors};
}
export function attachPersonSources(batch,prepared){
  batch.changes=batch.changes.filter(c=>{
    try{
      assert(!prepared.errors.has(c.inputIndex),prepared.errors.get(c.inputIndex));
      const rows=prepared.sources.get(c.inputIndex);if(!rows)return true;
      const old=c.before?.specific?.fields.source_profile;
      const retained=old?JSON.parse(old):[];assert(Array.isArray(retained),'已有原文档案格式无效');
      for(const row of rows)if(!retained.some(r=>r.book===row.book&&r.id===row.id&&r.offset===row.offset&&r.fingerprint===row.fingerprint))retained.push(row);
      const value=JSON.stringify(retained);
      assert(value.length<=PERSON_SOURCE_LIMIT,'人物原文累计超过60000字符；本人物候选未保存，请缩小来源范围或分人物整理，不会截断原文');
      c.specific.fields.source_profile=value;c.specific.labels.source_profile='世界书原文片段';
      return true;
    }catch(e){batch.issues.push({kind:'人物原文',name:c.name,reason:e.message});return false;}
  });
  return batch;
}
export const PERSON_BUILD_INSTRUCTION=`\n【人物设定保真】世界可以概括轮廓；人物不得只提取职责、位置和当前行动。按所选原文分别保留外貌与仪态appearance、性格与行为personality、经历background、动机motivation、说话方式speech、喜好preferences、能力及限制abilities、目标goals、关系social。战斗人物另外保留战斗方式combat_style，包括武器、战术、招式配合、应敌习惯、代价与弱点；日常世界改为能力与技艺crafts，记录职业技能、手艺与生活专长，不强行补战斗。两者原文均有则分别保留。保留有辨识度的细节及能力代价，不要求把全部人物压成同一长度。未提供的内容留空，不擅自补造世界书事实。profile为阅读简介，不能代替其他人物字段；动态状态action/location/progress与人物设定分开。\n仅世界书分批构建时，world和companion变化额外返回settingRefs:[{book:"本批世界书完整名称",id:"本批词条id",part:1}]，只选择确实描述该世界或人物的片段。程序将复制该片段原文供玩家核对，不得捏造id或引用未选片段。不得自行写details.source_profile。后续批次复用已有archiveId，补充新细节，已知冲突说明并留待玩家确认；不能把原有设定缩成更短摘要。\n`;
