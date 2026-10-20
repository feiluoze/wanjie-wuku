// One contract for narrative review, setting import, drafts and evolution.
// History/knowledge fields never become disposable just because they are old.
const snapshots={
 world:['stage','condition','scale','era','factions','resources','geography','descent','connections','limits'],
 region:['location','overview','limits'],
 organization:['location','overview','limits'],
 inhabitants:['scale','location','condition','limits'],
 companion:['location','role','action','progress','limits'],
 relation:['state'],
 development:['progress','next','limits'],
 available:['quantity','stock','location','condition','limits'],
 manifestation:['anchor','geometry','condition','clock']
};
export function taishiWorldKey(power,fields={}){
 if(fields?.world_id)return fields.world_id;
 if(!fields?.world)return '';
 const matches=Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='world'&&[r.name,...(r.history||[]).map(h=>h.name)].includes(fields.world));
 return matches.length===1?matches[0].id:'';
}
export function separateTaishiWorlds(power,a,b){
 if(a?.adapterId!=='wuku.primordial_world'||b?.adapterId!==a.adapterId)return false;
 const left=taishiWorldKey(power,a.fields),right=taishiWorldKey(power,b.fields);
 return Boolean(left&&right&&left!==right&&power.archives?.[left]?.specific?.recordId==='world'&&power.archives?.[right]?.specific?.recordId==='world');
}
export const TAISHI_HISTORY_RECORDS=Object.freeze(['event','growth']);
export function taishiSnapshotField(record,section,field){
 if(record?.specific?.adapterId!=='wuku.primordial_world')return null;
 return section==='details'&&!TAISHI_HISTORY_RECORDS.includes(record.specific.recordId)&&Boolean(snapshots[record.specific.recordId]?.includes(field));
}
export function taishiFillPolicy(mode,schemas=[]){
 return {
  mode,storage:'所有视图共用现有档案；只输出变化字段，不重建整行或另写概况副本。',
  identity:'先定位世界，再复用对象archiveId。world_id及关系端点只引用真实已登记ID；同名不能跨世界合并。改名、迁移、阶段变化不新建对象。新对象的世界尚未登记时，先建世界或用连续正文明确纳入证据，不编造ID。',
  tables:schemas.map(r=>({recordId:r.id,kind:TAISHI_HISTORY_RECORDS.includes(r.id)?'history':r.id==='development'?'task':'object',snapshotFields:(snapshots[r.id]||[]).filter(id=>r.fields.some(f=>f.id===id))})),
  history:'event与growth保存独立事件及实际反哺，按同一事实接续；旧楼层漏记的重要事件仍补录，不按发生早晚删除。人物能力、设定、认知、关系依据与三层记忆保留长期价值，不登记每轮动作和流水。',
  conflicts:'staleFields只可使用tables声明的snapshotFields；通用摘要可能混有独立事实，不能整段当过期快照。来源优先对照current.fieldSourceIndexes中各栏目最后实际变化的正文索引；缺少索引表示不能证明时间先后。来源必须由同字段实际更新历史证明，不能按记录最后保存楼层、数值大小或电脑时间判断。uncertainFields只隔离真正不明字段，其他明确事实继续提取。',
  authority:mode==='narrative'?'仅提取正文事实；较新正文可更新当前状态，缺项不清空。':mode==='worldbook'?'只从本批明确选中的世界书片段提取底稿，保留引用；已有现状优先，只补空白，不冒充剧情。':mode==='evolution'?'只在所选世界、确认内部历时和人物范围内创作候选；确认后采用。不以候选使正文过期，不乘时间倍率、不自动授予眷属身份，不绕过重大后果限制。':mode==='draft'?'仅生成指定对象的待确认设定草案，不推演已执行事件或奖励。':'只采用玩家明确补充的事实，不扩展为其他世界或角色收益。',
  protected:['source_profile','time_state','玩家锁定的关系字段','眷属加入方式','程序确认的历时与改设资格']
 };
}

// Read-only table projection: no second status or summary store.
export function taishiTableRows(records){
 return records.map(r=>({id:r.id,name:r.name,status:r.status,recordId:r.specific?.recordId||'',
  label:r.specific?.label||'其他档案',
  facts:Object.entries(r.specific?.fields||r.fields||{}).filter(([k,v])=>v&&!k.endsWith('_id')&&!['source_profile','time_state','world'].includes(k)).map(([id,value])=>({id,label:r.specific?.labels?.[id]||id,value:String(value)})),
  source:/自主发展|发展候选/.test(r.source?.note||'')?'已采用发展候选':/草案/.test(r.source?.note||'')?'已采用设定草案':/世界书|设定底稿/.test(r.source?.note||'')?'世界书底稿':r.source?.type==='story'&&Number.isSafeInteger(r.source.anchor?.index)?'正文第 '+(r.source.anchor.index+1)+' 层':'玩家确认记录'}));
}
