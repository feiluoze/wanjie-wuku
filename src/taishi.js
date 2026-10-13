// Independent space, shared archive storage. No demo worlds or second ledger.
import { hash, clone } from './primitives.js';
import {PERSON_SETTING_FIELDS,PERSON_BUILD_INSTRUCTION} from './taishi-profile.js';
import { CREATION_PRESETS } from './creation-presets.js';
const preset = CREATION_PRESETS.find(c => c.id === 'wuku.primordial_world');
export const isTaishi = power => Boolean(power && preset.target.primaryHashes.includes(hash(power.primaryRules ?? power.rules ?? '')));
export const TAISHI_SECTIONS = Object.freeze([
  {id:'worlds',title:'诸界',hint:'每个世界自己的格局、时间与变化'},
  {id:'companions',title:'眷属与人物',hint:'人物的所在、职责、行动与关系；普通人物不自动缔约'},
  {id:'civilizations',title:'众生与文明',hint:'区域、族群、组织与文明成果'},
  {id:'development',title:'发展事项',hint:'正在推进的建设、研究与跨界安排'},
  {id:'available',title:'可调用成果',hint:'世界内现存的资源、知识与支持'},
  {id:'growth',title:'界主所得',hint:'已经归身的成长、神通与历次反哺'},
  {id:'other',title:'其他记录',hint:'保留旧档案与尚未归类的对象'}
]);
const field = (id,label,description=label+'；仅记明确现状，不猜数值') => ({id,label,type:'text',description});
// Keep original adapter and record IDs so old values/history need no migration.
export function taishiConfig(base = preset) {
  const c=clone(base);
  if(['1.0.0','1.1.0'].includes(c.version))c.version='1.2.0';
  const additions={
    world:[field('connections','界域联通'),field('limits','世界边界与禁制'),field('overview','世界概况'),field('geography','区域与地理'),field('era','时代与社会'),field('factions','主要势力'),field('resources','资源与经济轮廓'),field('events','当前局势与事件'),field('abilities','能力体系'),field('combat_style','战斗方式'),field('crafts','能力与技艺'),field('ability_title','能力分区名称','玩家可自定显示名称，不改变能力事实'),field('source_profile','世界书原文片段','仅程序按所选引用复制，AI不得填写')],
    inhabitants:[field('world','所属世界')],
    available:[field('world','所属世界')],
    growth:[field('world','反馈来路与所属世界')]
  };
  for(const r of c.records)for(const f of additions[r.id]||[])if(!r.fields.some(x=>x.id===f.id))r.fields.push(f);
  const world=c.records.find(r=>r.id==='world');
  if(world){
    world.description='每个实际世界独立建档；个人初始成熟世界无需重走历史。内历、联通、主从定位以已采用设定及剧情为准。';
    const clock=world.fields.find(f=>f.id==='clock');if(clock){clock.label='本世界内历';clock.description='这个世界的已确认历时与本轮推进依据；不同世界不混算，不使用电脑时间。';}
    const rates=world.fields.find(f=>f.id==='rates');if(rates)rates.label='本世界与局部时速';
    const reset=world.fields.find(f=>f.id==='reset');if(reset)reset.description='仅主世界记录千年改设资格；其他世界不自行生成资格，未知留空。';
  }
  for(const r of [
    {id:'companion',label:'眷属与行动',description:'仅记录具有明确太始天身份的人物；同伴不自动成为眷属。',fields:[field('world','所在世界'),field('location','具体所在'),field('role','身份与职责'),field('action','当前行动'),field('progress','行动进展'),field('relationship','关系与约定'),field('limits','限制与未决事项')]},
    {id:'development',label:'发展事项',description:'每项建设、研究或跨界安排独立追踪，计划和已完成分开。',fields:[field('world','所属世界'),field('participants','参与者'),field('goal','目标'),field('progress','实际进展'),field('result','已形成成果'),field('next','后续事项'),field('limits','限制与阻碍')]}
  ])if(!c.records.some(x=>x.id===r.id))c.records.push(r);
  for(const [id,label,description] of [['region','区域','只记录明确区域与地理现状'],['organization','组织与势力','仅记录明确存在的独立组织，不把世界简介里的名称扩写成事实'],['event','事件','实际事件与计划区分；本版只登记概况，不自动推演因果']])if(!c.records.some(r=>r.id===id))c.records.push({id,label,description,fields:[field('world','所属世界'),field('location','所在区域'),field('overview','当前概况'),field('participants','明确参与者'),field('result','实际结果与状态'),field('limits','限制与未知事项')]});
  for(const r of c.records)if(r.id!=='world'&&!r.fields.some(f=>f.id==='world_id'))r.fields.push(field('world_id','所属世界档案ID','仅填写输入current中存在的world档案ID；未知留空，不能编造ID'));
  const companion=c.records.find(r=>r.id==='companion');
  if(companion){
    companion.description='眷属与相关人物独立建档；普通人物、拟邀约者与已缔约眷属明确区分，不自动缔约。';
    for(const f of [field('profile','人物简介'),field('appearance','外貌与仪态'),field('personality','性格与行为'),field('background','身世与经历'),field('motivation','核心动机'),field('speech','说话方式'),field('preferences','喜好与习惯'),field('source_profile','世界书原文片段','由程序按本批词条引用复制保存；AI不得填写'),field('abilities','能力与专长'),field('combat_style','战斗方式','依据原文保留武器、战术、招式配合、应敌习惯和限制；日常人物无此设定时留空，不强行补战斗'),field('crafts','能力与技艺','日常或职业世界记录手艺、职业技能、生活专长、熟练程度及限制；不改写成战斗能力'),field('goals','长期目标'),field('social','社交关系'),field('knowledge','知道与不知道'),field('recent_memory','近期记忆'),field('settled_memory','沉淀记忆'),field('core_memory','核心记忆'),field('origin','设定来源')])if(!companion.fields.some(x=>x.id===f.id))companion.fields.push(f);
    const knowledge=companion.fields.find(f=>f.id==='knowledge');
    if(knowledge)knowledge.description='分开记录已知、未知、误信和获知途径（亲历/告知者/公开消息/已确认能力）；传闻不等于真相。未登记不代表全知，同世界与社交关系不自动传递秘密。';
  }
  return c;
}
export function taishiSection(record) {
  const id=record.specific?.recordId;
  const declared={world:'worlds',companion:'companions',development:'development',inhabitants:'civilizations',region:'civilizations',organization:'civilizations',event:'development',available:'available',growth:'growth'}[id];
  if(declared)return declared;
  if(record.type==='member'||record.type==='bond')return 'companions';
  return record.type==='research'?'development':'other';
}
// Initial setting imports may fill gaps, never overwrite later saved facts.
export function protectTaishiBaseline(batch) {
  batch.changes=batch.changes.filter(c=>{
    if(!c.before)return true;
    const conflicts=[];
    for(const [k,v] of Object.entries(c.patch))if(c.before.fields[k]){
      if(c.before.fields[k]!==v)conflicts.push(k);
      delete c.patch[k];
    }
    let newSpecific=false;
    if(c.specific){
      for(const [k,v]of Object.entries(c.specific.fields)){
        const old=c.before.specific?.fields[k];
        if(old&&k==='source_profile'){if(old!==v)newSpecific=true;continue;}
        if(old){
          const setting=c.specific.recordId==='companion'&&PERSON_SETTING_FIELDS.includes(k);
          if(setting&&v&&!old.includes(v)&&!v.includes(old)){
            const combined=old+'\n补充设定（需核对是否冲突）：'+v;
            if(combined.length<=4000){c.specific.fields[k]=combined;newSpecific=true;}
            else {c.specific.fields[k]=old;batch.issues.push({kind:'人物设定',name:c.name,reason:k+'补充后超过4000字符；原有设定保留，请分字段整理'});}
          }else if(setting&&v&&v.includes(old)&&v!==old){c.specific.fields[k]=v;newSpecific=true;}
          else {if(old!==v)conflicts.push(k);c.specific.fields[k]=old;}
        }
        else if(v)newSpecific=true;
      }
    }
    if(c.status!==c.before.status)conflicts.push('status');
    c.status=c.before.status;
    if(conflicts.length)batch.issues.push({kind:'设定冲突',name:c.name,reason:'已有现状保留；底稿未覆盖字段：'+[...new Set(conflicts)].join('、')});
    return Object.keys(c.patch).length>0||newSpecific;
  });
  return batch;
}
export const TAISHI_REVIEW = PERSON_BUILD_INSTRUCTION+`这是独立太始天记录任务。先确认实际归属，再分类；其他金手指的领域、人物和成果不得搬入。正文自动整理只登记明确纳入太始天的世界及关联对象；外界相遇不自动注册世界或眷属。新对象需要玩家确认。每个已纳入的实际世界独立建档，既有成熟世界可直接记录当前成熟状态，不要求从荒地重走历史。世界名、世界数量、眷属和规则由玩家设定与正文决定，不套用固定示例。
世界记录使用world，眷属使用companion，建设研究与跨界安排使用development；众生文明inhabitants、可调用成果available、永久反馈growth分开。旧对象沿用原archiveId、type和recordId。眷属的所在、职责、行动和进展分别填入details，不把意向写成完成。区域region、独立组织organization和事件event按明确资料独立记录，不把概述扩写为虚构细节。世界能力体系使用abilities、战斗combat_style、日常技艺crafts；未知留空。关联世界使用已知完整名称，已有world档案存在时填写其world_id，不猜测ID。
各世界内历、主世界历时、局部倍率分开保留，变速不倒改历史；不用电脑时钟推进剧情。世界引擎已写入的变化只登记一次，不进行第二轮后台演化。世界资产可调用不等于已取出，知识或权能调用不自动消耗本体；实物仅按明确交付记现状。万象可用、本源同升与神通归身不得互相替代，永久归身只记已成立反馈。`;
