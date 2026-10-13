import {MMLC_RULEBOOK} from './mmlc-worldbook-data.js';
export {MMLC_RULEBOOK} from './mmlc-worldbook-data.js';
export const MMLC_REFERENCE_BUDGET=16000;
const moduleChapters={land:[10,11,20,15,7,8],sect:[13,20,6,10],arts:[17,3,4,5,18,19,15,21],body:[15,6,7,9,3,5],items:[8,9,21,17,20,15],spirits:[8,12,13,9,6],fleet:[12,20,11,17,18,15],projects:[17,19,20,21,3,5,10]};
const topics={2:/结算|状态栏|回执/,3:/解析|计算|功法/,4:/八卦|符文|合卦/,5:/顺推|逆推|九宫|本源/,6:/筑基|金丹|元婴|元神|内修/,7:/金性|大罗|炼虚|内宇宙|不朽|自立世界/,8:/炼器|剑器|阵法|法宝|护身环/,9:/生命|丹药|体修|炼丹|医疗/,10:/福地|智脑|反应堆|玄兵地|炼仙炉|工坊|产线/,11:/时间|调时|洞天|道妙塔/,12:/舰|弥罗|天网/,13:/传承|道统|书院|弟子|宗门/,14:/总档|归档|长期维护/,15:/境界|尺度|吨位|产能|御器/,17:/图谱|法术族|术式|通用规律/,18:/战术|斗法|战斗|破法/,19:/跨界|魔法|血脉|神性|异界/,20:/工业|文明|城邦|工艺|批量|研究城/,21:/灵宝|真意|混沌珠|玲珑|洛书|古器/};
const chapter=e=>e.title+'\n'+e.content;
export const MMLC_GAMEPLAY=MMLC_RULEBOOK.entries.filter(e=>e.enabled).map(chapter).join('\n\n');
// Full source is local. Each request uses whole, attributable chapters and a
// declared budget, never a silent slice of the author's rules.
export function mmlcRuleSelection(operation='',goal=''){
 const enabled=MMLC_RULEBOOK.entries.filter(e=>e.enabled),candidates=enabled.filter(e=>e.uid>1&&topics[e.uid]?.test(goal));
 const ids=[...new Set([0,1,...candidates.map(e=>e.uid),...(moduleChapters[operation]||[3,17])])],selected=[],omitted=[];let text='';
 for(const id of ids){const entry=enabled.find(e=>e.uid===id);if(!entry)continue;const part=chapter(entry),next=text+(text?'\n\n':'')+part;if(next.length<=MMLC_REFERENCE_BUDGET){text=next;selected.push(entry);}else omitted.push(entry);}
 return {text,selected:selected.map(e=>({uid:e.uid,title:e.title})),omitted:omitted.map(e=>({uid:e.uid,title:e.title})),budget:MMLC_REFERENCE_BUDGET,sourceSha256:MMLC_RULEBOOK.sourceSha256};
}
export const MMLC_REFERENCES=Object.fromEntries(Object.keys(moduleChapters).map(id=>[id,mmlcRuleSelection(id).text]));
