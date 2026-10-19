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
  table('arrangements','entity','需要后续执行的重要消费安排。','计划付款不是到账，执行与取消更新原安排。') ]},
 {name:'生命球',hash:'c4eb21c52f073d3d',adapter:'wuku.life_orb',
  sourceQuotes:['真正成为过的生命进入生命库。','熔铸成果归入当前形态，原形态已有的特征继续保留。'],
  boundaries:['识别定义不是已化身；切换不新增生命、不清空旧形态成长。','同一特征熔铸到不同接收形态分别记清关系，不从源形态扣除，也不自动推广到全库。','共同位格只保留正文确认的共同成长，不把单个形态的升级扩为所有形态升级。'],tables:[
   table('definitions','entity','有行动价值、尚未首次化身的重要生命定义。','同一定义补充原记录；真正首次化身后更新采用状态，普通见闻不逐个常驻。'),
   table('forms','entity','每种亲自成为过的生命及其长期成长。','按生命形态更新原档案；切换为当前或库中待用，不因切走而结束或重复入库。'),
   table('features','entity','已取得特征向具体接收形态的实际熔铸关系。','同一特征与同一接收形态更新原行；不同接收形态明确区分，源形态继续保有原特征。'),
   table('core','singleton','同一自身的共同意识、经验与已确认共同位格。','共同主体只维护一条；形态独有成长仍留各自档案，不重复计算共享成长。') ]},
 {name:'拓印',hash:'a42db7155cd23a7b',adapter:'wuku.imprint',
  sourceQuotes:['一印发挥当前原版10%的效果，印数可以持续叠加，释放不消耗。','状态期间真正取得的成果，在状态结束后继续保留。'],
  boundaries:['模式印数是对应蓝图的永久状态，不是可消费的通用点数；只保存正文确认的印数，不自动加印或按释放扣减。','同一次显现的多种观察或复述仍是一份来源；结构不同的融合模式独立保留，原模式不删除。','临时状态调用与永久状态蓝图分开；时效以正文为准，不按电脑时间结束，也不把期间成果一并回收。'],tables:[
   table('patterns','entity','实际入库的重要模式、原版基准与融合谱系。','同结构叠印与基准补全更新原模式；只有实际形成的不同结构另存分支，重复更名不新建。'),
   table('states','entity','会影响后续的实际状态复刻及留存成果。','同一次持续调用接续进展，明确结束后保留历史；蓝图与实际所得继续保留。'),
   table('actions','event','影响后续的关键释放、防御与真实实战结果。','每次重要独立调用一份依据；同一次攻击或首拓防护不重复建档，普通招式不逐次入表。') ]},
 {name:'万灵图鉴',hash:'859d97e402c399a8',adapter:'wuku.spirit_catalogue',
  sourceQuotes:['尚未与{{user}}形成归属关系的目标进入影页。','图鉴成员可以组成队伍，前往外部世界探索、采集、交易、救援、战斗、调查或寻找新的生命。'],
  boundaries:['影页不是正册。已有影页形成正式关系时沿原 archiveId/recordId 更新关系与实际状态，不再复制一名同名成员；旧分类保留，不能自动迁移。','火种、温养、重构与恢复可提供的助力分别依实际状态保留；不可因保存火种就宣称完全恢复。','任务接到、成员派出、取得成果与实际带回分别记录；普通生活、反复借力和未形成产出的协作不逐次建档。'],records:[
   record('missions','远行与重要敕令','已授权、影响后续的远行或长期任务；不替成员自动完成行动。',[
    ['members','实际成员与队伍','只列实际参加者，保留原成员身份，不复制派出的个体。'],['goal','已授权目标','具体敕令、路线与任务范围；拟定未采用不算已出发。'],['progress','实际进展与阻碍','依正文已经发生的行动、风险和当前状态。'],['results','已得与待带回','已取得、已带回和仍在途中分别保留；不再次发放同份成果。']])],tables:[
   table('members','entity','真实建立关系的成员、火种与重要成长。','同一生命持续更新身份与状态；温养和远行不另建个体。',{exclusiveWith:['shadows']}),
   table('shadows','entity','实际接触、仍有后续价值的观察对象和关系线索。','同一对象补全原影页；正式加入更新原档关系，不另复制正册成员。',{exclusiveWith:['members']}),
   table('ecology','entity','实际成立的重要栖所、区域与稳定生态协作。','同一区域更新发展、资源去向与实际产出，不按天生成收益流水。'),
   table('missions','entity','需要后续接续的远行与重要长期敕令。','独立任务分别保留，进展和带回结果更新原任务；普通日常工作不逐项常驻。') ]},
 {name:'模板',hash:'03f8ad0ef1f4a262',adapter:'wuku.existence_template',
  sourceQuotes:['已经解锁的位格永久归属于{{user}}。','{{user}}可以永久收藏征服模板，并同时搭载至多两枚。'],
  boundaries:['各层个人位格、真名和稳定特性分别保留；当前切换不是再次晋升，也不删除已解锁位格。','征服模板库存与当前最多两枚搭载分开。模板倍率只记录正文结果，不写回自身基准或递归放大。','同一连续冲突的阶段首次恢复记录接续；降低阶段、切换模板、短暂脱战不重置。真正结束后保留原冲突历史，不回收永久模板。'],tables:[
   table('personal','entity','各层已解锁个人位格、真名和稳定特性。','同一位格真名与特性变化更新原行；修改主题不抹除已稳定形成的特性。'),
   table('conquests','entity','实际完成提炼、可长期收藏的征服模板。','同一来源模板补全更新；只有资格或未展现的隐藏力量不当作已取得。'),
   table('loadout','singleton','唯一当前个人阶段与征服搭载配置。','更换阶段或搭载更新原配置，库存保持；不补算倍率或额外触发恢复。'),
   table('conflicts','entity','正在持续或需追溯的关键冲突与已用恢复。','同一因果连续冲突更新原行；明确稳定结束才结束此记录，不按回复次数重置。') ]},
 {name:'挂机',hash:'0ba7218b0379a023',adapter:'wuku.idle_campaign',
  sourceQuotes:['普通敌人的战利、区域探索与资源收集会随着实际行动持续积累。','已经结算的收益在调拨或交付时只改变状态，不重复记录为新收获。'],
  boundaries:['只有征伐之影真实完成的行动归入挂机；普通本体学习和其他词条收益不能因同场出现就纳入。','同一征伐之影败后重新形成仍接续原身份，不新增一具平行影子；失败不删除已得收益。','实际归属、影子在用、本体可用与待交付分别记录。唯一实物只有实际去向，知识共享与双向同步不复制成长。','查看状态、电脑时间和再次领取不创造征伐；战界模板不得自动套用独立“模板”权柄的倍率和槽位。'],tables:[
   table('shadow','singleton','唯一征伐之影的行动、伤势、战区与配置。','暂停、失败、恢复和重新形成更新原影子；没有真实进展不生成新战报。',{singletonName:'征伐之影'}),
   table('discoveries','entity','有后续价值的真实战区、事件、首通与首杀记录。','同一目标更新发现与进展，完成后沿用原记录，不因再访或换装重复首通收益。'),
   table('assets','entity','重要既得战利、唯一装备及待回流成果。','同一资产调拨和交付更新原去向，不同时复制为本体与影子两件实物。'),
   table('growth','entity','已经成立、需要长期保留的知识与成长。','同份成长回流与同步更新原依据，不把往返承接重复当作新增能力。') ]},
 {name:'咨询法',hash:'04597dd5a11d6e55',adapter:'wuku.statusbar_04597dd5a11d6e55',
  sourceQuotes:['咨询以具体形象为准，不凭名字混同不同版本。','每个对象的独立有效共鸣按次累积；每满三次至少兑现一次实质深化。','各对象分别积累，不形成通用点数。'],
  boundaries:['对象名称、形象来源与具体版本共同区分咨询；自我之形也按真实时期与版本独立保留。','切换当前重点不结束其他咨询、收回既得力量或清空共鸣；未固化与已固化均保留已取得效力。','共鸣是每个已建立对象的未兑现进展，不设共享钱包，不由插件按回复数加一或自行三次发奖；正文明确的实际兑现和剩余积累分别保留。','同一真实事件可推进多个已有对象，但回顾和拆分同一行动不重复计次；普通训练确有独立有效共鸣也应更新对应对象，不要求达到重大事件才记进展。','主要特质已完整承接即可固化，不追加试炼。既得力量的新应用不拆成重复领取，组合须已实际形成。'],records:[
   record('consultations','咨询对象与版本','逐对象保存具体版本、主要特质、剩余共鸣与固化状态。',[
    ['figure','对象名称','具体被铭记之形；自我咨询也写明实际对象。'],['version','来源与具体版本','区分史实、神话、文学演绎、具体作品版本或自我形象时期；新对象必须明确，不能用同名混同。'],['traits','主要特质承接','已完整承接、正在深化和尚未承接分别保留；未知不补全。'],['resonance','未兑现共鸣积累','只保留正文确认的当前剩余积累和对应事件；不作通用点数，不自动加减。'],['progress','咨询与固化状态','已建立、继续深化或已固化；当前重点变化不等于原咨询失效。'],['basis','重要经历与兑现依据','本次真实事件、已经兑现的深化与未兑现部分，避免重复记次。']]),
   record('inheritances','已承接力量','已经实际取得的核心能力、技艺、知识与象征；不把特质方向当成果。',[
    ['source','对象与版本来源','明确对应的咨询对象及版本，不从同名其他版本补入力量。'],['effect','实际可用内容','已经完整取得的效力、理解与对应经验，不人为拆成大量同义招式。'],['growth','真实深化','后续真正增加的性质与能力；反复使用原有应用不重新领取。'],['limits','作用与边界','既得能力的实际条件和适配；切换咨询不回收已得能力。']]),
   record('combinations','已成传说组合','不同既得力量共同运用后真正形成、仍需长期使用的组合。',[
    ['sources','已得组成与来源','真实已有的能力、知识、象征与来源版本。'],['effect','实际组合效果','正文真正形成的联动，不自动创立没有依据的独立权柄。'],['progress','当前掌握与发展','实际掌握及后续真实深化，构想未形成记计划。'],['limits','作用条件','实际成立的条件与未完成部分。']])],tables:[
   table('consultations','entity','实际建立、可接续或已固化的对象与具体版本。','同一对象与同一版本持续更新；不同版本独立建档，普通新用法不推翻已固化状态。',{identityFields:['figure','version']}),
   table('inheritances','entity','已承接且需要跨回合保留的核心力量。','同一能力深化更新原行；来源版本明确，不把应用变式不断复制为新能力。'),
   table('combinations','entity','真实形成、后续仍有意义的重要组合。','同一组合持续发展更新原行，未实际形成的构想保持计划，不从参考资料直接发放。') ]},
 {name:'每日情报',hash:'c5a32d7a6efc3d90',adapter:'wuku.intelligence',
  sourceQuotes:['锁定名额为十条，独立于每日十讯。','失去时效的普通简讯可退出长期总览；仍会影响未来行动的重要事实与线索持续保留，供{{user}}随时查询。'],
  boundaries:['每日十讯、锁定追踪和危机插播是不同机制，不能把保存了几条档案当作已占锁定名额，也不按电脑日期自动刷新。','只长期保留仍需行动、明确锁定、关键联动或持续影响后续的情报；不强制把每期十条简讯全部常驻。','区分已证实事实、可靠推导、条件与实际结果，预期收益不是到账。','窗口失效不等于情报从未成立；重要后续可接续，普通过期内容不继续反复注入，不自动删除旧记录。'],tables:[
   table('leads','entity','被锁定、尚待处理或仍影响后续的关键情报与事件。','同一事件更新锁定、窗口与结果；无新进展不重建，浏览与展开不自动计作已执行。'),
   table('focus','singleton','当前已生效的关注方向与重要情报网络。','切换方向和新增可靠联动更新原主记录；普通每期刷新不另建一份网络。') ]}
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
