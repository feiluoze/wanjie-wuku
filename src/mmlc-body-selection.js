import {MMLC_RULEBOOK} from './mmlc-worldbook-data.js';
import {withoutThoughts} from './archive-reader.js';
export const MMLC_BODY_BUDGET=4200;
export const MMLC_CORE_RULES=`【漫漫长路 · 核心法度】
求真道基与本人本源绑定。解析辨明规律，计算推演用法，《万象参真经》把真实领悟化入身、气、神、识。所得知识真实归本人，可独立使用、改良和传授；智脑承担繁琐研究，不代替本人领悟或意志。
只在实际采用初授开局时，凡人完成完美筑基，八枚核心符文与六法成立，随身福地及智脑、固化设备、反应堆、萃灵器、天引仪和基础试验加工储存区运行。已有修为、人格、记忆与能力保留，不每轮重新发放。初始道域半径一公里，御器总质量十吨；护身可应对坦克级常规动能及同规模冲击，定向爆发可破坏同级常规载具工事；这些不是所有法式与工程的永久上限。
本人明确目标与偏好即可委托；道基承担推演、训练、试验与精细操作，已有方法可直接用。研究交付关键发现、已验证用途和可用部分；未知部分继续研究，不用空泛流程无限搁置。图纸、验证、实物各按实际完成记录，计划不提前成为成果。
本源演算、能源与安全保护常驻，不设演算币、研究槽、每日次数、随机失败或凭空的稀有燃料税。普通物料可按已知方法凝炼，特殊性质须真实解析；舰船与法器须实际建成并有供能。道场调时与并行制造不凭电脑时间自动产出；时间倍率、理论产能不直接换算库存。
既有知识与本领跨界保留。境界突破须有身魂生命的真实变化，器物强度不替代本体证成；旧丹婴、旧器、同一器灵的身份与经历持续承继。知识、实际改良、实物分别记，同一事实不重复结算。
危险知识先隔离，再安全转译；超出防护的危险默认应急归场，保全本人及指定随身对象与已取样本，但不等于击败敌人。外貌、人格、生命形态、对外大规模改变按本人真实意图，权限不能由外力冒充。当前所得以有效档案与实际剧情为准。`;

const topics={3:/解析|计算|功法/,4:/八卦|符文|合卦/,5:/顺推|逆推|九宫|本源/,6:/筑基|金丹|元婴|元神|内修|突破/,7:/金性|大罗|炼虚|内宇宙|不朽|自立世界/,8:/炼器|剑器|阵法|法宝|本命剑|护身环/,9:/生命|丹药|体修|炼丹|医疗/,10:/福地|智脑|反应堆|玄兵地|炼仙炉|工坊|产线/,11:/时间|调时|洞天|道妙塔|倍率/,12:/舰|弥罗|天网/,13:/传承|道统|书院|弟子|宗门/,14:/总档|归档|长期维护/,15:/境界|尺度|吨位|产能|御器/,17:/图谱|法术族|术式|通用规律/,18:/战术|斗法|战斗|破法|护盾/,19:/跨界|魔法|血脉|神性|异界/,20:/工业|文明|城邦|工艺|批量|研究城/,21:/灵宝|真意|混沌珠|玲珑|洛书|古器/};
const hits=(value,pattern)=>new Set(value.match(new RegExp(pattern.source,'gi'))||[]).size;
const clean=value=>withoutThoughts(value).replace(/<UpdateVariable\b[^>]*>[\s\S]*?(?:<\/UpdateVariable\s*>|$)/gi,'').replace(/<MMLC-(?:state|archive)\b[^>]*>[\s\S]*?<\/MMLC-(?:state|archive)\s*>/gi,'');
const units=MMLC_RULEBOOK.entries.filter(e=>e.enabled&&topics[e.uid]).flatMap(e=>{
 let section=e.title;const rows=[];
 for(const part of e.content.split(/\n\s*\n/)){
  const line=part.trim();if(/^<[^/][^>]*>$/.test(line)){section=line.slice(1,-1);continue;}
  const value=line.replace(/<\/[^>]+>/g,'').trim();if(value.length<40)continue;
  rows.push({uid:e.uid,title:e.title,section,text:value});
 }
 return rows;
});

export function mmlcBodySelection({query='',chat=[],user='{{user}}',character='{{char}}'}={}){
 const current=clean(String(query||chat.findLast(m=>m.is_user)?.mes||chat.findLast(m=>m.is_user)?.content||'')).slice(0,6000);
 const recent=clean(String(chat.findLast(m=>!m.is_user&&!m.is_system)?.mes||chat.findLast(m=>!m.is_user&&!m.is_system)?.content||'')).slice(0,4000);
 const substitute=s=>s.replaceAll('{{user}}',user).replaceAll('{{char}}',character);
 let text=substitute(MMLC_CORE_RULES);const selected=[],chapterCounts=new Map();
 const ranked=units.map(unit=>{const pattern=topics[unit.uid],chapterScore=hits(current,pattern)*20+hits(recent,pattern);return {...unit,score:chapterScore?chapterScore+(hits(current+' '+unit.section,pattern)>0?hits(unit.text,pattern):0):0};}).filter(u=>u.score>0).sort((a,b)=>b.score-a.score||a.uid-b.uid);
 for(const unit of ranked){
  if(selected.length>=6)break;if((chapterCounts.get(unit.uid)||0)>=2||!chapterCounts.has(unit.uid)&&chapterCounts.size>=3)continue;
  const part=substitute(`【${unit.title} · ${unit.section}】\n${unit.text}`);
  // Reserve room for the marker, provenance and guidance added by the caller.
  if(text.length+part.length+2>MMLC_BODY_BUDGET-400)continue;
  text+='\n\n'+part;selected.push({uid:unit.uid,title:unit.title,section:unit.section});chapterCounts.set(unit.uid,(chapterCounts.get(unit.uid)||0)+1);
 }
 return {text,selected,budget:MMLC_BODY_BUDGET,characters:text.length,fullCharacters:MMLC_RULEBOOK.entries.filter(e=>e.enabled).reduce((n,e)=>n+e.content.length,0)};
}
