// Exact current-rule declarations. These extend the existing archive model;
// they are not another database or another balance ledger.
import {hash,clone} from './primitives.js';
const table=(id,kind,retain,update,extra={})=>({id,kind,retain,update,...extra});
const record=(id,label,description,fields)=>({id,label,description,fields:fields.map(([id,label,description])=>({id,label,description,type:'text'}))});
export const ARCHIVE_TABLE_DEFINITIONS=[
 {name:'万界网购',hash:'93077dbfccd2e22b',adapter:'wuku.shopping',tables:[
  table('orders','event','独立真实订单与交付；同一商品的不同购买分别命名。','同一笔询价、付款、运输、交付沿用原订单；同段回执与叙事只记一次。'),
  table('mandates','entity','仍有效、影响后续执行的交易委托。','更新原委托授权与进展，明确完成或撤销才结束。'),
  table('assets','entity','需要长期追踪的暂存资产、重要物品与权益。','按同一资产更新数量、位置与处置；已交付订单不能再当新增资产收益。'),
  table('targets','entity','玩家明确收藏、需要以后关注的目标。','更新同一目标；普通看过的商品不入表。') ]},
 {name:'升变之印',hash:'37bcfcdefb668b9c',adapter:'wuku.possibility_seal',tables:[
  table('forms','entity','实际拥有且影响使用的升变形态。','新阶段更新原形态，不能把阶段名变更当作重复获得。'),
  table('branches','entity','玩家保留的重要分支选择。','未支付或未完成只记计划，实际取得后更新原目标。'),
  table('slot','singleton','唯一孵化任务槽。','同一主槽更新当前任务与进度；不得增加免费并行槽，也不按电脑时间推进。'),
  table('points','event','影响当前权益的重要实际投入与收支依据。','同一收支不重复；余额只读资源账本，不在文字中另存一份。') ]},
 {name:'天人骨血',hash:'e14ee03a5f6328a8',adapter:'wuku.statusbar_e14ee03a5f6328a8',records:[
  record('life_features','永久生命特征','已纳入的生命特征与永久适应；同一特征深化更新原行。',[
   ['origin','真实生命依据','实际接触、承受或取得的来源；不扩大为整个来源生命的能力。'],['effect','已纳入性质','真正成立的性质与实际程度。'],['limits','条件与边界','尚缺部分、作用范围和已知条件。'],['change','最近持久变化','本次补全或深化；普通恢复、重复接触不新增。']]),
  record('life_structures','统合生命结构','已形成的重要复合结构；可行构想只记计划。',[
   ['components','既有组成','已经拥有、实际参与统合的生命特征。'],['effect','实际结构与效果','实际形成的结构及作用。'],['form','显化与归属','自身显化方式；外部装备不冒充自身结构。'],['limits','条件与边界','未完成部分与实际限制。']])],tables:[
  table('life_features','entity','已取得且未来仍有用的生命特征、永久适应。','同一特征的补全、深化更新原行，不因再次接触复制；普通恢复不入表。'),
  table('life_structures','entity','需要长期保留的重大复合生命结构。','实际形成才有效；临时显化不另建，构筑方向不得冒充完成成果。') ]},
 {name:'熟练度状态栏',hash:'22f4a4f0e1322e10',adapter:'wuku.proficiency',tables:[
  table('skills','entity','实际掌握、需要持续追踪的技能。','同一技能升级沿用 ID，补充等级、理解和特性，不另建阶段副本。'),
  table('training','entity','玩家选定、尚有后续节点的重要训练。','同一训练更新进展，突破回填原技能；普通每次练习不建流水。') ]},
 {name:'先祖投资人',hash:'f1854dfa8f17defa',adapter:'wuku.ancestral_investor',tables:[
  table('investments','event','独立实际投资事件。','按具体投资沿用 ID；同种资产的不同投资不得合并。'),
  table('histories','entity','与具体投资对应、影响归返结果的历史演化。','同一投资的历史接续更新，不把历史所有权当作现有库存。'),
  table('lineage','singleton','当前统一的家系身份。','只更新一份当前家系，不按每段历史另立矛盾身份。'),
  table('inheritance','entity','归返后实际继承的重要资产和权益。','版本冲突待核对，不把不同历史版本相加。'),
  table('pending','entity','尚未兑现、确有依据的继承事项。','兑现更新原事项；未到手不得计为现有资产。') ]},
 {name:'道途',hash:'4323c0b7f09ae379',adapter:'wuku.path_contract',tables:[
  table('path','entity','实际建立的道途契约。','同一道途更新契约与限制；有代价不等于已经支付。'),
  table('practice','event','重要且已有结果的践行事件。','独立实践分别留档；普通尝试不逐次长期记录。'),
  table('milestone','entity','实际达到或明确选定的重大节点。','选定未达成记计划，达成后更新原节点，不重新发奖。') ]},
 {name:'自我束缚',hash:'80913d3c88a78f04',adapter:'wuku.statusbar_80913d3c88a78f04',records:[
  record('vows','束缚契约','本人已经宣告的独立束缚，条件变化更新原契约。',[
   ['declaration','成立的宣告','按实际成立的字面内容保留。'],['scope','对象与范围','必须作用于自身，记录实际覆盖范围。'],['duration','持续与解除条件','宣告时确定的持续时间、触发与解除方式。'],['weight','成立时分量','原文确认的分量，不重新估价或换算。'],['state','当前条件与状态','生效、未触发、解除等实际情况；未提及不自动解除。']]),
  record('vow_returns','重要兑付','与真实成立的束缚对应的重要收益记录，重复宣告不重复兑付。',[
   ['vow','对应束缚','明确对应的宣告或契约名称。'],['return','实际兑付','已经成立的正向结果；不补算规则收益。'],['ownership','归属与留存','实际归属、用途与当前留存。'],['limits','后续条件','原文实际存在的条件，不新增偿还义务。']])],tables:[
  table('vows','entity','会影响后续行动的独立束缚。','只按明确的条件生效、结束、解除更新原契约；原文未设的债务和违约惩罚不得添加。'),
  table('vow_returns','event','对应具体束缚的重要实际兑付。','一份成立分量只兑付一次；兑付后再提及不新建。') ]},
 {name:'心渊',hash:'2d4233e254e306d8',adapter:'wuku.statusbar_2d4233e254e306d8',records:[
  record('scars','永久渊痕','跨轮次保留的永久强化与升华构筑。',[
   ['origin','取得与升华依据','实际凝结或升华的来源。'],['effect','永久效果','已经固定的能力与强化。'],['limits','条件与联系','实际触发条件、联动和限制。']]),
  record('relics','重要遗藏与钥痕','需要后续使用的重要实物、传承与永久通路权限。',[
   ['kind','性质','实物、传承或钥痕权限，分别保留性质。'],['origin','实际取得来源','真实交付或开启依据。'],['current','留存与归属','实际持有数量、位置或已开权限；不推算库存。'],['limits','使用条件','原文确认的条件；钥痕不当作可花费碎片。']]),
  record('expeditions','探索与临时构筑','当前重要探索和未完成选择，临时效果不冒充永久渊痕。',[
   ['route','轮次与重要路线','具体轮次、路线和当前节点；寻常节点不逐条入表。'],['build','临时构筑','当前轮次的祝福与联动，尚未永久化。'],['pending','待定抉择','未取得收益与尚未完成的选择。'],['state','实际进展','归返或败退明确发生才结束；不得清除已得永久成果。']])],tables:[
  table('scars','entity','永久渊痕与真正升华的构筑。','同一渊痕深化更新，不复制临时版本。'),
  table('relics','entity','仍需追踪的重要遗藏、传承与深层钥痕权限。','同一资产更新留存；已得永久权限不因退出消失。'),
  table('expeditions','entity','当前重要探索与有后续影响的抉择。','每轮重要探索一行，归返结束原探索；不自动按退出删除任何其他档案。') ]},
 {name:'败家生财',hash:'3654c39ebd4a972e',adapter:'wuku.spending_growth',tables:[
  table('spending','event','真实发生且影响结算的独立支出。','同笔支出、返还与额外收获只结算一次；付款阶段更新原事件。'),
  table('wealth','entity','需要追踪的现有财富、物资或权益。','同种同归属资产更新当前数，不按每次收支复制库存；不同币种与权利不强行折价相加。'),
  table('arrangements','entity','需要后续执行的重要消费安排。','计划付款不是到账，执行与取消更新原安排。') ]}
];
export function archiveTableDefinition(power,config){
 const definition=ARCHIVE_TABLE_DEFINITIONS.find(d=>d.hash===hash(power?.primaryRules??power?.rules??''));
 return definition&&(!config||config.id===definition.adapter)?clone(definition):null;
}
export function withArchiveTables(config,power){
 const d=archiveTableDefinition(power,config);if(!d||!config)return config;
 const records=[...config.records,...(d.records||[]).filter(r=>!config.records.some(x=>x.id===r.id))];
 return {...config,records};
}
export function separateArchiveTables(power,a,b){
 const d=archiveTableDefinition(power);return Boolean(d&&a?.adapterId===d.adapter&&b?.adapterId===d.adapter&&a.recordId!==b.recordId&&d.tables.some(t=>t.id===a.recordId)&&d.tables.some(t=>t.id===b.recordId));
}
