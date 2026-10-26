import {assert,clone,hash} from './primitives.js';
import {isTaishi} from './taishi.js';
import {isMmlc} from './mmlc.js';
import {FRAMEWORK_CATEGORIES} from './record-framework-categories.js';

const define=(id,label,hint,columns)=>({id,label,hint,recordId:'framework_'+id,fields:columns.map(([id,label,description])=>({id,label,description,type:'text'}))});
export const RECORD_FRAMEWORKS=[
 define('abilities','能力与成长','已掌握能力、永久强化与关键成长；不逐次记录施展和练习。',[
  ['effect','实际能力','已经成立的效果；不从原文示例初始化能力。'],['conditions','使用条件与边界','正文或原规则明确的条件，不发明数值、冷却、等级和前置门槛。'],['mastery','当前掌握','实际掌握程度，未明确数值不推算。'],['origin','取得依据','真实来源与归属。'],['growth','重要深化','同一能力的真实补全；旧成果保留，不新建阶段副本。']]),
 define('assets','重要资产','需独立调用的重要装备、物品、种源与权益；普通杂物和到账流水不逐笔建档。',[
  ['nature','性质与用途','重要对象的真实功能；实物、信息和权益分清。'],['origin','真实来源','实际取得依据，不把奖励规则当已领取。'],['quantity','真实数量或剩余','仅记录明确数量或剩余份额；不是资源余额，不补算收支。'],['location','当前所在','已知位置与去向。'],['owner','归属与持有人','实际归属，借用和托管分清。'],['changes','重要变化','同一对象强化、转移、消耗与兑付接续原档，不再次发奖。']]),
 define('members','成员与编制','重要伙伴、负责人和独立军团；普通人口按真实群体汇总。',[
  ['identity','身份与归属','真实存在与关系；认识、访问或被攻击不等于归属。'],['abilities','关键能力','实际可用的独有本领。'],['role','职责与长期任务','已经建立的重要职责，不逐条记日常工作。'],['location','当前所在','实际部署；未联系不推算已完成任务。'],['scale','个体或编制规模','个人或真实群体及明确规模，不凭空逐人命名。'],['history','关键经历与关系','影响以后行动的事实；召回与重构延续原身份。']]),
 define('regions','区域与建设','重要领地、基地、农田、工坊及长期工程；扩建更新原对象。',[
  ['kind','区域或设施类型','区域、生产设施、基地或已启动重要工程，不凭功能重复建档。'],['parent','所在区域或上级','引用已有区域名称；不自动改变归属。'],['purpose','用途与真实能力','已具备的用途及产能依据；设计不等于建成。'],['people','负责人或管理关系','已实际确立的负责人、使用者和治理归属。'],['inputs','供给与运行条件','实际原料、能源和环境条件，未知保持未知。'],['outputs','重要产出与去向','正文确认的汇总及重要交付；不按回复或电脑时间增加产量。'],['progress','当前状态与瓶颈','已启动工程的未完部分、真实扩建和损伤，不逐工序记录。'],['arrangements','本区域持续安排','明确只属于此处的授权、灌溉、保护等；跨区域规则另存一次。']]),
 define('knowledge','知识与档案','重要可复用知识、配方、历史及研究成果；普通问答不逐条收藏。',[
  ['subject','对应对象或主题','真实对象、世界与版本；同一主题补全沿原档。'],['origin','来源与历史时点','明确的真实来源或时点，未知不编造。'],['content','已经获知内容','确认事实、实际知识与可复用方法。'],['scope','适用范围','已知范围与调用条件，不额外削弱原权柄。'],['uncertainty','未知与预测','未来可能、推测与已发生事实分开。'],['changes','重要补充','已确认的新信息，不把每次查询当新档案。']]),
 define('leads','长期线索','仍有行动价值的坐标、关键未知与探索目标；过期日常消息不常驻。',[
  ['target','目标与对应世界','玩家关注的重要具体对象。'],['basis','真实线索依据','已实际取得的信息，传闻和事实分清。'],['location','地点与坐标','已有位置联系，不因知道坐标取得当地资产。'],['progress','已确认进展','真实调查结果与未完部分；不写重复探索日志。'],['open_questions','关键未知','尚待解决的问题，计划不是已完成。'],['value','后续用途','为什么仍需保留，明确失效或结束才改状态。']]),
 define('arrangements','持续安排','跨对象生效的重要授权、契约、保护和规则；局部设置附原对象。',[
  ['scope','对象与作用范围','明确涉及的对象、区域和联系。'],['terms','当前有效安排','已经成立的规则、条款和授权；意向不算生效。'],['conditions','持续或解除条件','原规则与正文确认的条件，不凭沉默取消。'],['rights','已成立权利与义务','当前权益、实际履约和未来给付分清，不自动收付或发奖。'],['origin','成立依据','真实约定、操作或权柄结果。'],['changes','重要调整','更新原安排，保留未改变的条款，不另建每次变更流水。']])
];
const ids=RECORD_FRAMEWORKS.map(f=>f.id);
const defaults={combat:['abilities'],growth:['abilities'],collection:['assets'],companions:['members'],farming:['regions'],resources:['assets'],exploration:['knowledge','leads'],rules:['arrangements']};
export const FRAMEWORK_CATEGORY_LABELS={combat:'直接战斗型',growth:'自身成长型',collection:'收集构筑型',companions:'伙伴军团型',farming:'种田经营型',resources:'资源收益型',exploration:'探索求知型',rules:'规则干涉型'};

// Native row IDs keep their fields and identities. A template never duplicates them.
const native={
 "他化自在大法":{avatars:"members",invocations:"arrangements"},
 "诸天盲盒":{"souvenirs":"assets","entanglements":"arrangements"},
 "瓦学弟":{"mothers":"members","inheritances":"abilities"},
 "始源精灵":{"crystals":"assets","source_links":"members"},
 "骇客":{"systems":"arrangements","research":"knowledge"},
 "自动填坑":{"works":"assets"},
 '万界网购':{orders:'assets',assets:'assets'},'升变之印':{forms:'abilities'},'天人骨血':{life_features:'abilities'},'熟练度状态栏':{skills:'abilities'},
 '先祖投资人':{investments:'arrangements',inheritance:'knowledge'},'道途':{path:'abilities'},'自我束缚':{vows:'arrangements'},'心渊':{scars:'abilities',relics:'assets'},
 '败家生财':{wealth:'assets'},'生命球':{forms:'assets'},'拓印':{patterns:'abilities'},'万灵图鉴':{members:'members',missions:'arrangements'},
 '模板':{conquests:'abilities'},'挂机':{discoveries:'leads',assets:'assets'},'咨询法':{consultations:'knowledge'},'每日情报':{leads:'leads'},
 '装备栏':{equipment:'assets'},'图书馆':{pages:'knowledge',copies:'assets'},'力量构筑':{minor:'abilities'},'幻想具现':{prototypes:'knowledge'},
 '心智魔方':{partners:'members'},'旅法师':{places:'leads',repertoire:'knowledge'},'一言为定':{promises:'arrangements'},
 '同时穿越':{selves:'members'},'战争天网':{industry:'regions',assets:'members'},'牧群':{members:'members'},'人间游戏':{skill:'abilities',profession:'abilities'},
 '大贤者':{verified:'knowledge'},'绝对生产力':{mastery:'abilities'},'至高亡灵主宰':{members:'members'},'攻略系统':{people:'members'},'奇迹智子':{groups:'members'},
 '万物尽头':{lines:'regions',seeds:'assets'},'文明之光系统':{communities:'regions'},'知识荒野':{knowledge:'knowledge'},'抽奖系统':{curios:'assets',privileges:'abilities'},
 '置物栏':{record:'assets'},'完美融合':{products:'assets'},'万象神魔图录':{archetypes:'knowledge',generals:'members'},'早有先例':{precedent:'knowledge'},'光之钥':{tracks:'knowledge'},
 '源堡':{records:'knowledge',assets:'assets',manifestations:'arrangements',arrangements:'arrangements'},'混沌海':{creations:'assets'},'永暗之河':{residents:'members'},'暗影世界':{beings:'members'},'绝对适应（新版）':{resistances:'abilities'},'生物计算机':{model:'knowledge'}
};
export const supportsRecordFrameworks=power=>Boolean(power&&typeof (power.primaryRules??power.rules)==='string'&&(power.primaryRules??power.rules).trim()&&!isTaishi(power)&&!isMmlc(power));
export const frameworkCategory=power=>FRAMEWORK_CATEGORIES[hash(power?.primaryRules??power?.rules??'')]||null;
export const recommendedFrameworks=power=>clone(defaults[frameworkCategory(power)]||[]);
export const nativeFramework=(definition,id)=>native[definition?.name]?.[id]||null;
export function validateRecordFrameworks(selection){
 if(selection===undefined)return;
 assert(selection&&typeof selection==='object'&&!Array.isArray(selection)&&Object.keys(selection).every(k=>['version','enabled'].includes(k))&&selection.version===1,'记录框架设置版本或结构无效');
 assert(Array.isArray(selection.enabled)&&selection.enabled.length<=ids.length&&new Set(selection.enabled).size===selection.enabled.length&&selection.enabled.every(id=>ids.includes(id)),'记录框架选择无效或重复');
}
export function setRecordFrameworks(power,enabled){
 assert(supportsRecordFrameworks(power),'太始天和漫漫长路沿用专用结构，不叠加通用框架');
 const value={version:1,enabled};validatePowerFrameworks({...power,recordFrameworks:value});
 power.recordFrameworks={version:1,enabled:ids.filter(id=>enabled.includes(id))};
 return power.recordFrameworks;
}
export const frameworkConfigured=power=>supportsRecordFrameworks(power)&&power.recordFrameworks!==undefined;
export const legacyFrameworkForType=type=>({member:'members',population:'members',skill:'abilities',facility:'regions',environment:'regions',research:'knowledge',bond:'arrangements'})[type]||null;
export function validatePowerFrameworks(power){
 validateRecordFrameworks(power.recordFrameworks);
 if(frameworkConfigured(power))assert(!power.adapterBinding?.config?.records?.some(r=>RECORD_FRAMEWORKS.some(f=>f.recordId===r.id)),'自定义适配器占用了记录框架保留分类名，请先核对配置，不能覆盖旧字段');
}
export function withFrameworkRecords(config,power){
 if(!frameworkConfigured(power)||power.adapterBinding&&!config)return config;
 validateRecordFrameworks(power.recordFrameworks);
 const base=config||{format:'wjwk-adapter',schemaVersion:1,target:{primaryHashes:[hash(power.primaryRules??power.rules)]},id:'wuku.frameworks_'+hash(power.primaryRules??power.rules),version:'1.0.0',name:power.name+'记录框架',operations:[],records:[]};
 assert(!base.records.some(r=>RECORD_FRAMEWORKS.some(f=>f.recordId===r.id)),'自定义适配器占用了记录框架保留分类名，请先核对配置，不能覆盖旧字段');
 return {...base,records:[...base.records,...RECORD_FRAMEWORKS.filter(f=>!base.records.some(r=>r.id===f.recordId)).map(f=>({id:f.recordId,label:f.label,description:f.hint,fields:clone(f.fields)}))]};
}
export function selectedTableDefinition(power,config,original){
 if(!frameworkConfigured(power)||!config)return original;
 const enabled=power.recordFrameworks.enabled,chosen=id=>enabled.includes(id),existing=original||{name:power.name,hash:hash(power.primaryRules??power.rules),adapter:config.id,tables:[],retiredTables:[]};
 const nativeTables=existing.tables.map(t=>({...t,frameworkId:nativeFramework(existing,t.id)}));
 const tables=nativeTables.filter(t=>chosen(t.frameworkId));
 for(const f of RECORD_FRAMEWORKS)if(chosen(f.id)&&!tables.some(t=>t.frameworkId===f.id))tables.push({id:f.recordId,frameworkId:f.id,kind:'entity',retain:f.hint,update:'首次建档：当前正文确认了符合本表范围的长期对象、且尚无对应独立档案时，用insert建立记录。已有对象沿原archiveId更新新事实；同一事实重复提及才保持，不按日常动作另建流水。'});
 const activeIds=new Set(tables.map(t=>t.id));
 const retiredTables=config.records.filter(r=>!r.id.startsWith('statusbar_')&&!activeIds.has(r.id)).map(r=>{
  const old=existing.retiredTables.find(t=>t.id===r.id)||nativeTables.find(t=>t.id===r.id);
  const frameworkId=old?.frameworkId||nativeFramework(existing,old?.id)||nativeFramework(existing,old?.detailTarget)||RECORD_FRAMEWORKS.find(f=>f.recordId===r.id)?.id||null;
  return {...(old||{id:r.id,kind:'entity',retain:'只保留旧档。',update:'旧档沿原身份保留，不自动迁移。'}),frameworkId,updateOnly:true,disabled:!frameworkId||!chosen(frameworkId)};
 });
 return {...existing,tables,retiredTables,frameworkSelection:{version:1,enabled:clone(enabled)},
  nativePolicies:existing.tables.length?[{recordIds:tables.filter(t=>!t.id.startsWith('framework_')).map(t=>t.id),boundaries:existing.boundaries||[]}]:[],
  boundaries:['只有玩家选择的框架允许新建。原状态栏维护整体状态和当前重点，框架保存对象详情；同一事实一处保存，概况只摘要引用。',
   '同一对象改名、成长、转移与恢复沿原身份，重要事实持续保留；普通施展、生产、练习、查询、消费和奖励到账不逐次建立流水。',
   '已有专属表复用原字段和原ID，不另存同名通用副本；仅明确属于某对象的细节附该对象，多对象共享且重要的安排独立保存一次。',
   '未选择的框架不自动写入或更新，旧档仍可查看、手动编辑和重新启用；未提供字段保持原状。原权柄与余额账本不因框架选择改变。']};
}

export function frameworkSelectionPolicy(power,spec){
 if(!spec?.frameworkSelection)return null;
 return {version:1,enabled:spec.frameworkSelection.enabled,frameworks:RECORD_FRAMEWORKS.filter(f=>spec.frameworkSelection.enabled.includes(f.id)).map(f=>({id:f.id,label:f.label,retain:f.hint,recordIds:spec.tables.filter(t=>t.frameworkId===f.id).map(t=>t.id)})),
  rules:'玩家选的是记录范围，不是能力解锁。仅启用框架的真实重要对象可新增；关闭框架的旧档只读，不改写、不迁移、不转为无recordId的通用成果绕过选择。原文状态栏可继续维护整体状态，不复制框架长清单。未选内容不代表消失，不自动生成能力、资源、人口或产量。原专属表的retain/update和身份约束继续生效；其旧分工中交回总览的内容，若玩家启用对应框架，则改由该框架存详情、总览引用。原规则中完整权柄不受模板字段和分类限制。'};
}
