import {builtinEntries} from '../src/builtin-worldbook.js';import {hash} from '../src/primitives.js';import {writeFile} from 'node:fs/promises';
const declarations=[
 ['万界网购','兑换点','point','兑换点余额'],['深蓝','源质点','point','源质点余额'],['故事点','故事点','point','故事点余额'],['攻略系统','恋爱点数','point','恋爱点数'],['升变之印','升变点','point','升变点'],['蝴蝶效应','因果点','point','因果点余额'],['指数增长','势差值Δ','point','势差值Δ'],['诸天投影镜','源力','point','源力余额'],['心渊','心相碎片','point','心相碎片'],
 ['无龙心法','心能','energy','心能'],['念气体系','念气','energy','念气储量'],['人生模拟','模拟次数','quota','可用模拟次数'],['抽奖系统','今日抽奖次数','quota','今日剩余抽奖']
];
const aliases={'升变点':['当前升变点','升变点余额'],'恋爱点数':['恋爱点余额'],'心能':['心能储量'],'念气':['念气余额'],'模拟次数':['今日模拟次数','今日模拟','今日剩余模拟','模拟次数余额'],'今日抽奖次数':['今日剩余次数']};
const legacyBindings={
 '故事点':[{recordId:'account',recordLabel:'点数账户快照',fieldId:'balance',fieldLabel:'已确认故事点余额'}],
 '恋爱点数':[{recordId:'points',recordLabel:'全局恋爱点数与交易',fieldId:'balance',fieldLabel:'已确认总余额'}],
 '今日抽奖次数':[{recordId:'schedule',recordLabel:'个人日程与剩余抽奖',fieldId:'remaining',fieldLabel:'已确认剩余次数'}],
 '势差值Δ':[{recordId:'delta',recordLabel:'势差账户快照',fieldId:'balance',fieldLabel:'正文确认的Δ余额'}],
 '升变点':[{recordId:'points',recordLabel:'升变点与实际资源流水',fieldId:'balance',fieldLabel:'已确认余额'}]
};
const rows=builtinEntries({includeDedicated:true}).map(e=>{const defs=declarations.filter(d=>d[0]===e.name).map(([,name,kind,label])=>{if(!e.content.includes(label+'：'))throw Error('缺少当前原文余额字段：'+e.name);return {id:'res_'+hash(name==='模拟次数'?'今日模拟次数':name),name,kind,label,...(legacyBindings[name]?{legacyBindings:legacyBindings[name]}:{}),labels:[...new Set([label,...(aliases[name]||[]),name+'余额',name])],negativeSnapshot:e.name==='指数增长',note:kind==='energy'?'当前值与上限分开；定性状态不强制数字化。':kind==='quota'?'次数按剧情周期与已确认结算更新，不按电脑时间自动补充。':'当前余额与报价、成长属性、累计消费分开。',evidence:e.content.split('\n').find(l=>l.startsWith(label+'：'))};});return {name:e.name,contentHash:hash(e.content),classification:defs.length?defs[0].kind:'no-dedicated-resource',resources:defs,reviewed:true};});
for(const d of declarations)if(!rows.some(r=>r.name===d[0]&&r.resources.length))throw Error('当前词条不存在：'+d[0]);
await writeFile(new URL('../src/builtin-resource-data.js',import.meta.url),'// Explicitly reviewed against the current builtin book. Not inferred from number-like labels.\nexport const BUILTIN_RESOURCES='+JSON.stringify(rows)+';\n');
let doc=`# 当前内置词条专属资源核对\n\n核对${rows.length}条当前内置原文：9条专属消费点数、2条可消耗能量、2条可用次数；其余${rows.filter(r=>!r.resources.length).length}条不新增专属钱包。不将库存总览、技能进度、次数累计、产能、势能或成长属性当货币。普通货币与多币种资产仍由实际叙事定义，不能凭空创建名为“主要余额”的钱包。\n\n## 已声明资源\n\n| 词条 | 资源 | 类型 | 原文状态栏字段 | 边界 |\n|---|---|---|---|---|\n`;
for(const r of rows.filter(r=>r.resources.length))for(const d of r.resources)doc+='| '+[r.name,d.name,{point:'专属点数',energy:'可消耗能量',quota:'可用次数'}[d.kind],d.label,d.note+(d.negativeSnapshot?' 原文允许负值快照；不自动扩大交易预支下限。':'')].join(' | ')+' |\n';
doc+='\n## 唯一数据源与写入边界\n\n未绑定MVU时使用当前聊天的资源账本；已绑定时仍通过现有MVU读取与提交机制。原文状态栏只读引用同一份余额，不保存第二份数字。旧状态记录保留用于历史核对，但显示、整理输入与记忆读取均使用当前账本投影。发现重名钱包或未知余额时不自动合并或初始化。新读到的正文快照只作核对候选，不在成果整理中发奖或补扣；需要通过已有余额核对或结算入口确认。无龙心法原文允许定性状态，不强迫为其编造数字。\n\n## 全量核对索引\n\n| 条目 | 分类 | 原文校验值 |\n|---|---|---|\n';for(const r of rows)doc+='| '+r.name+' | '+({point:'专属点数',energy:'可消耗能量',quota:'可用次数','no-dedicated-resource':'无固定专属钱包'}[r.classification])+' | `'+r.contentHash+'` |\n';
doc+='\n## 旧专用分类中的只读余额\n\n';for(const row of rows)for(const d of row.resources)for(const binding of d.legacyBindings||[])doc+='- '+row.name+'：'+binding.recordLabel+' / '+binding.fieldLabel+'。只读引用同一资源账本；原收支依据仍可更新，历史值原样保留。\n';
await writeFile(new URL('../docs/专属资源-当前原文核对.md',import.meta.url),doc);console.log(JSON.stringify({reviewed:rows.length,resourceEntries:rows.filter(r=>r.resources.length).length}));
