import {FRAMEWORK_CATEGORIES} from './record-framework-categories.js';
import {isSupplementEntry,managementProfile} from './management-profiles.js';
import {hash,isDedicatedEntry} from './primitives.js';

const categories=[
  ['战斗与成长',[['combat','直接战斗'],['growth','成长修炼']]],
  ['经营与资源',[['farming','种田建设'],['resources','资源交易']]],
  ['探索与收藏',[['exploration','探索情报'],['collection','收集造物']]],
  ['角色与规则',[['companions','伙伴关系'],['rules','规则权能']]],
];
const compare=new Intl.Collator('zh-CN-u-co-pinyin',{numeric:true}).compare;
const order=(a,b)=>compare(a.name,b.name)||compare(a.book,b.book)||compare(a.id,b.id);

export function catalogGroups(entries){
  const main=categories.map(([label,groups],index)=>({id:'group'+index,label,groups:groups.map(([id,label])=>({id,label,entries:[]}))}));
  const byCategory=new Map(main.flatMap(root=>root.groups.map(group=>[group.id,group])));
  const external=new Map(), supplements=new Map();
  for(const entry of entries){
    if(isDedicatedEntry(entry))continue;
    const profile=managementProfile(entry);
    if(isSupplementEntry(entry,profile)){
      const name=profile.verified?(profile.parent||'通用附加规则'):entry.book;
      if(!supplements.has(name))supplements.set(name,[]);
      supplements.get(name).push(entry);
      continue;
    }
    const group=byCategory.get(FRAMEWORK_CATEGORIES[hash(entry.content)]);
    if(group)group.entries.push(entry);
    else{
      if(!external.has(entry.book))external.set(entry.book,[]);
      external.get(entry.book).push(entry);
    }
  }
  const misc=[...external].sort(([a],[b])=>compare(a,b)).map(([label,entries],index)=>({id:'book'+index,label,entries}));
  if(misc.length)main.push({id:'other',label:'其他与自定义',groups:misc});
  for(const root of main){
    root.groups=root.groups.filter(group=>group.entries.length);
    for(const group of root.groups)group.entries.sort(order);
  }
  return {main:main.filter(root=>root.groups.length),supplements:[...supplements].sort(([a],[b])=>compare(a,b)).map(([label,entries])=>({label,entries:entries.sort(order)}))};
}
