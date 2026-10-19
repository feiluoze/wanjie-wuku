// null routes to the original statusbar. Existing rows are never migrated/deleted.
export const TABLE_COMPACTION = {
 '万界网购':{mandates:'orders',targets:null},
 '升变之印':{slot:null,points:'forms',branches:'forms'},
 '天人骨血':{life_structures:null},
 '熟练度状态栏':{training:'skills'},
 '先祖投资人':{histories:'investments',lineage:null,pending:'investments'},
 '道途':{practice:'path',milestone:'path'},
 '自我束缚':{vow_returns:'vows'},
 '心渊':{expeditions:null},
 '败家生财':{arrangements:null,spending:null},
 '生命球':{definitions:null,features:'forms',core:null},
 '拓印':{states:'patterns',actions:'patterns'},
 '万灵图鉴':{ecology:null,shadows:null},
 '模板':{loadout:null,conflicts:null,personal:null},
 '挂机':{shadow:null,growth:'assets'},
 '咨询法':{inheritances:'consultations',combinations:'consultations'},
 '每日情报':{focus:null},
 '装备栏':{attributes:'equipment',integrations:'equipment'},
 '图书馆':{loadout:null,combat:null},
 '力量构筑':{plans:null,major:null},
 '幻想具现':{manifestations:'prototypes',skills:'prototypes',links:'prototypes',exclusive:'prototypes'},
 '等价交换':{exchanges:null,pending:null,results:null},
 '我全都要':{reward_group:null,compatibility:null,retained:null},
 '多倍收获系统':{harvest:null,retained:null},
 '心智魔方':{rigging:'partners',prototypes:null},
 '旅法师':{space:null,manifestations:null},
 '一言为定':{},
 '同时穿越':{shared:null,energy:null,items:null,cooperation:null},
 '战争天网':{infiltration:null,research:null},
 '牧群':{contributions:'members',reserves:null},
 '人间游戏':{quest:null,achievement:null,reward:null},
 '大贤者':{analysis:null,parallel:null,delegation:null},
 '绝对生产力':{projects:null,products:null},
 "至高亡灵主宰":{"feedback": null, "domains": null, "undertakings": null},
 "攻略系统":{"thresholds": "people", "rewards": "people", "points": null, "shop": null},
 "奇迹智子":{"industry": null, "research": null},
 "万物尽头":{"areas": null, "stock": null, "flows": null},
 "文明之光系统":{"projects": "communities", "benefits": "communities"},
 "知识荒野":{"creations": null, "transmission": null, "domain": null},
 "抽奖系统":{"schedule": null, "uses": "curios"},
 "置物栏":{},
 "完美融合":{"projects": "products", "materials": "products"},
 "万象神魔图录":{"challenges": "archetypes", "inheritance": "archetypes"},
 "早有先例":{"invocation": "precedent", "new_history": "precedent"},
 "光之钥":{"beacons": null, "interventions": null, "cycles": null},
 "源堡":{"assets": null, "manifestations": null, "arrangements": null},
 "混沌海":{"results": null, "worlds": null, "arrangements": null},
 "永暗之河":{"marks": "residents", "kingdom": null, "protections": null},
 "暗影世界":{"anomalies": "beings", "ecology": null, "arrangements": null},
 "绝对适应（新版）":{"evolutions": null, "symbiosis": null, "reality": null},
 "生物计算机":{"knowledge": null, "connection": null, "computation": null}
};
export function compactTableDefinition(definition){
 const routes=TABLE_COMPACTION[definition.name]||{};
 return {...definition,tables:definition.tables.filter(t=>!Object.hasOwn(routes,t.id)),
  retiredTables:definition.tables.filter(t=>Object.hasOwn(routes,t.id)).map(t=>({...t,updateOnly:true,detailTarget:routes[t.id]}))};
}
export function compactTableSchemas(records,definition){
 return records.map(record=>{
  const sources=definition.retiredTables.filter(t=>t.detailTarget===record.id);
  // Previously exposed fields stay valid for old archives even after their table retires.
  const legacyDetails={'败家生财':['spending'],'力量构筑':['major'],'等价交换':['exchanges'],'我全都要':['reward_group'],'多倍收获系统':['retained']};
  const legacy=legacyDetails[definition.name]?.includes(record.id);
  if((!sources.length&&!legacy)||record.fields.some(f=>f.id==='related_details'))return record;
  return {...record,fields:[...record.fields,{id:'related_details',label:'相关进展与已得成果',type:'text',
   description:'仅在确有后续影响时更新本对象相关明细：'+(sources.map(t=>records.find(r=>r.id===t.id)?.label||t.id).join('、')||'已有旧档的相关明细，仅兼容更新')+'。计划、当前效果与永久所得分清；保留未改变的重要事实，不复制整段主表、不新建阶段副本。多对象共同成果只在明确的主要对象保存一次，其余引用名称；没有明确归属则报告待核对，不自动猜测。'}]};
 });
}
