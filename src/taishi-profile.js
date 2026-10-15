import {classifyInhabitantInput} from './taishi-civilization-kind.js';
import {assert,clone,hash} from './primitives.js';
import {inferSettingRefs,resolveSettingRefs} from './setting-references.js';

export const PERSON_SETTING_FIELDS=Object.freeze(['profile','appearance','personality','background','motivation','speech','preferences','abilities','combat_style','crafts','goals','social','origin']);
export const PERSON_SOURCE_LIMIT=60000;
// References identify exact input pieces. The model chooses references; only this
// code copies source text. A quotation supplied by the model is never an original.
export function preparePersonSources(data,referenceBatch,power=null){
  const cleaned=clone(data),sources=new Map(),errors=new Map(),errorCodes=new Map(),originalChanges=clone(data.changes||[]);
  if(!Array.isArray(cleaned.changes))return {data:cleaned,sources,errors,errorCodes,originalChanges};
  cleaned.changes.forEach((raw,index)=>{
    if(!raw||typeof raw!=='object')return;
    classifyInhabitantInput(raw,referenceBatch,power);
    let refs=raw.settingRefs;delete raw.settingRefs;
    const profile=['companion','world','region'].includes(raw.recordId);
    if(refs===undefined&&!referenceBatch)return;
    if(refs===undefined&&!profile)return;
    try{
      if(refs===undefined||Array.isArray(refs)&&!refs.length){refs=inferSettingRefs(raw,referenceBatch);if(!refs.length)throw Object.assign(Error('候选缺少原文引用，且本批没有唯一同名词条；请本地核对引用'),{referenceCode:'reference_missing'});}
      const rows=resolveSettingRefs(refs,referenceBatch).map(row=>({...row,fingerprint:hash(row.content)}));
      sources.set(index,rows);
    }catch(e){errors.set(index,e.message);errorCodes.set(index,e.referenceCode||'reference_validation');}
  });
  return {data:cleaned,sources,errors,errorCodes,originalChanges};
}
export function attachPersonSources(batch,prepared){
  batch.changes=batch.changes.filter(c=>{
    try{
      assert(!prepared.errors.has(c.inputIndex),prepared.errors.get(c.inputIndex));
      const rows=prepared.sources.get(c.inputIndex);if(!rows)return true;
      if(c.specific?.recordId&&!['world','region','companion'].includes(c.specific.recordId)){
        c.source.note=(c.source.note+'；世界书引用：'+rows.map(r=>r.book+'#'+r.id+'/'+r.part).join('、')).slice(0,600);return true;
      }
      const old=c.before?.specific?.fields.source_profile;
      const retained=old?JSON.parse(old):[];assert(Array.isArray(retained),'已有原文档案格式无效');
      for(const row of rows)if(!retained.some(r=>r.book===row.book&&r.id===row.id&&r.offset===row.offset&&r.fingerprint===row.fingerprint))retained.push(row);
      const value=JSON.stringify(retained);
      assert(value.length<=PERSON_SOURCE_LIMIT,'设定原文累计超过60000字符；本候选未保存，请缩小来源范围或分对象整理，不会截断原文');
      c.specific.fields.source_profile=value;c.specific.labels.source_profile='世界书原文片段';
      return true;
    }catch(e){const raw=prepared.originalChanges?.[c.inputIndex],recordId=c.specific?.recordId||raw?.recordId;
      const kind=recordId==='world'?'世界原文':recordId==='region'?'地域原文':recordId==='companion'?'人物原文':'设定原文';
      batch.issues.push({kind,index:c.inputIndex,name:c.name,reason:e.message,referenceRepairable:true,...(raw?{candidate:clone(raw)}:{}),diagnostic:{stage:'reference_validation',recordId,code:prepared.errorCodes?.get(c.inputIndex)||(/60000/.test(e.message)?'reference_over_limit':'reference_validation')}});return false;}
  });
  return batch;
}
export const PERSON_BUILD_INSTRUCTION=`\n【人物设定保真】世界可以概括轮廓；人物不得只提取职责、位置和当前行动。按所选原文分别保留外貌与仪态appearance、性格与行为personality、经历background、动机motivation、说话方式speech、喜好preferences、能力及限制abilities、目标goals、关系social。战斗人物另外保留战斗方式combat_style，包括武器、战术、招式配合、应敌习惯、代价与弱点；日常世界改为能力与技艺crafts，记录职业技能、手艺与生活专长，不强行补战斗。两者原文均有则分别保留。保留有辨识度的细节及能力代价，不要求把全部人物压成同一长度。未提供的内容留空，不擅自补造世界书事实。profile为阅读简介，不能代替其他人物字段；动态状态action/location/progress与人物设定分开。\n仅世界书分批构建时，world、region和companion变化额外返回settingRefs:[{book:"本批世界书完整名称",id:"本批词条id",part:1}]，只选择确实描述该世界、地域或人物的片段。程序将复制该片段原文供玩家核对，不得捏造id或引用未选片段。不得自行写details.source_profile。后续批次复用已有archiveId，补充新细节，已知冲突说明并留待玩家确认；不能把原有设定缩成更短摘要。\n`;
