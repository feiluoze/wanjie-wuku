import {assertTaishiClaims,assertRelation,findRelation} from './taishi-relations.js';
import {createArchiveBatch,archiveBatchSources,advanceArchiveBatch} from './archive-batch.js';
import {resolveTaishiLinks} from './taishi-links.js';
import {reviewHistory} from './archive-history.js';
import {selectArchiveInput,inputCharacterBreakdown} from './archive-input.js';
import {assertTaishiOwnership} from './taishi-ownership.js';
import {archivePreset,archiveResponseContract,archiveScopePolicy} from './archive-preset.js';
import {preparePersonSources,attachPersonSources} from './taishi-profile.js';
import {assertStoryTime,recordStoryTime} from './taishi-time.js';
import {TAISHI_KNOWLEDGE_POLICY} from './taishi-context.js';
import {validateTaishiBuild,advanceTaishiBuild} from './taishi-build.js';
import {isTaishi, TAISHI_REVIEW, protectTaishiBaseline} from './taishi.js';
import {evolutionInstruction,evolutionWorld,protectEvolution,evolutionConsequence} from './taishi-evolution.js';
import {peoplePolicy,filterPeopleBatch,retainDraftPeople,protectPeopleIdentity} from './taishi-people.js';
import {taishiDraftInstruction,protectTaishiDraft} from './taishi-draft.js';
import {ownershipContext,foreignArchiveOwner} from './archive-ownership.js';
import { readerReport } from './archive-reader.js';
import {evidenceParts,canonicalFields,floorCoverage,assertSnapshotPatch,assertFactEvidence} from './archive-protocol.js';
import { journalSnapshot, saveArchiveUndo } from './archive-journal.js';
import { creationConfig } from './creation-config.js';
import { normalizeSpecific } from './specialized-records.js';
import { creationReviewItems, CREATION_RESULTS_PROMPT, normalizeCreationResults, applyCreationResults } from './creation-results.js';
import { terminalReviewOrders, TERMINAL_RESULT_PROMPT, normalizeTerminalResults, applyTerminalResults } from './terminal-results.js';
import { isArchiveDialogue } from './archives.js';
import { resolveArchiveEvidence } from './archive-evidence.js';
import { assert, clone, hash, stable, storyText, archiveText, archiveReadText, ARCHIVE_READ_FORMAT, ARCHIVE_TEXT_FORMAT, text, chatHashes, ASYNC_MARKER } from './core.js';
import { ARCHIVE_FIELDS, ARCHIVE_TYPES, ARCHIVE_STATUS, archiveCurrent, archiveContextCurrent, archiveEvidenceText, archiveSource, saveArchive, findArchiveObject, saveArchiveUpdate } from './archives.js';
import { isMmlc, MMLC_REVIEW, MMLC_MODULE_PROMPT, MMLC_CLASSIFICATION_PROMPT, MMLC_MODULES, mmlcModule } from './mmlc.js';
import { normalizePlayerGuide, currentPlayerGuide } from './player-guide.js';
import { normalizeArchiveRange, archiveRangeBounds, normalizeArchiveAuto } from './archive-scope.js';
import { getContext } from './host.js';

const nameKey = s => s.normalize('NFKC').replace(/\s/g, '').toLowerCase();
export function archiveSources(chat, state, power, { rescan = false, automatic = false } = {}) {
  const sources = [], bounds = automatic ? {from:power.autoArchiveStart ?? Math.max(power.archiveStart ?? state.managementStart ?? 0, chat.length-24),to:chat.length} : archiveRangeBounds(power, chat.length, { rescan });
  const eligible = chat.map((m,i) => i>=bounds.from && i<bounds.to && isArchiveDialogue(m) ? i : -1).filter(i=>i>=0);
  const recent = rescan && !power.archiveReadRange ? eligible.slice(-12) : eligible;
  if (rescan && power.archiveReadRange) assert(recent.length<=80, '所选范围超过80条角色正文，请缩小范围后分批重查；尚未调用API');
  const start = automatic ? bounds.from : rescan ? recent[0] ?? bounds.to : power.archiveReadRange?.mode === 'range' ? bounds.from : Math.max(power.archiveStart ?? state.managementStart ?? 0, bounds.from);
  const limit = rescan && power.archiveReadRange ? 80 : 12;
  for (let index = start; index < bounds.to && sources.length < limit; index++) {
    const m = chat[index]; if (!isArchiveDialogue(m)) continue;
    const raw = m.mes ?? m.content ?? '', content = archiveReadText(raw), swipeId = m.swipe_id ?? 0;
    const previous = !rescan && (power.archiveReviewed || []).find(a => a.index === index && a.swipeId === swipeId && hash(archiveEvidenceText(raw, a).slice(0, a.length)) === a.textHash);
    // Recheck a legacy floor once if its earlier scan omitted settlement text.
    const offset = previous && (previous.format === ARCHIVE_READ_FORMAT || content === storyText(raw)) ? previous.length : 0;
    if (content.slice(offset).trim()) sources.push({ index, swipeId, offset, content: content.slice(offset), length: content.length, textHash: hash(content), format: ARCHIVE_READ_FORMAT });
  }
  return sources;
}
export function archivePrompt(power, sources, chat, playerNote = '', { automatic = false, terminalOrders = [], creationItems = [], state = {}, setupReferences = false, taishiDraft = null, taishiEvolution = null } = {}) {
  const depth = automatic ? normalizeArchiveAuto(power.archiveAuto).context : 0, first = sources[0]?.index ?? 0;
  const context = depth ? chat.slice(0,first).map((m,index)=>({index,content:archiveReadText(m.mes??m.content??''),is_user:m.is_user,is_system:m.is_system && m.extra?.bbs_hidden !== true})).filter(m=>!m.is_user&&!m.is_system&&m.content.trim()).slice(-depth).map(({index,content})=>({index,content})) : [];

  const payload = { ownership:ownershipContext(state,power), task: '核对经营档案变化', rules: power.rules, fieldTypes: ARCHIVE_FIELDS, statuses: ARCHIVE_STATUS,
    staleIdentities:Object.values(power.archives||{}).filter(r=>!archiveContextCurrent(r,chat)).map(r=>({id:r.id,name:r.name,type:r.type,recordId:r.specific?.recordId})), current: selectArchiveInput(Object.values(power.archives || {}).filter(r=>!foreignArchiveOwner(r,power,state)&&archiveContextCurrent(r,chat)),[...sources.map(s=>s.content),...context.map(s=>s.content)].join('\n'),{compact:!playerNote&&!setupReferences&&!taishiDraft&&!taishiEvolution}), sources: sources.map(s => ({ ...s, floor: s.index + 1 })),
    terminalOrders: playerNote ? [] : terminalOrders, creationItems:playerNote?[]:creationItems,recordSchemas:creationConfig(power)?.records||[], context, playerNote, setupReferences, explainRules: !isTaishi(power) && !isMmlc(power) && !currentPlayerGuide(power) };
  if(isTaishi(power)){payload.peopleSelection=peoplePolicy(power);payload.protectedRelations=power.taishiLocks||{};payload.informationPolicy=TAISHI_KNOWLEDGE_POLICY;}
  if(taishiDraft){assert(isTaishi(power),'只有太始天可以生成建档草案');taishiDraftInstruction(taishiDraft);payload.taishiDraft=taishiDraft;payload.task='生成待玩家确认的建档草案';}
  if(taishiEvolution){payload.taishiEvolution={...taishiEvolution,worldName:evolutionWorld(power,taishiEvolution).name};payload.task='世界自主发展候选';evolutionInstruction(power,taishiEvolution);}
  if(creationConfig(power)?.id==='wuku.precedent')payload.collectionPolicy='独立先例、援引与新事实分别保存。sources中每条明确先例逐条处理，不只保留最近几条，不将不同事件合成先例合集。重复援引引用已有先例，不重复新建；名称用具体事件与结果区分。旧通用合集不自动拆分删除，不能把它覆盖成单条。批次最多256项，超出需缩小读取范围分批整理。';
  if(['wuku.harvest','wuku.cost_reduction','wuku.all_rewards','wuku.exponential','wuku.mass_energy','wuku.story_points'].includes(creationConfig(power)?.id))payload.settlementPolicy='仅整理正文明确事实，不执行规则中的自动结算。每次独立事件使用稳定名称和已有archiveId；回执与正文描述同一事件只保存一次。原始收获、实际最终结果、已交付及剩余待兑现分别记录；补交更新原权益，不重建整份奖励。原始成本和实际付出分别保存，不以节省额入账。余额快照不是收入，不自动修改插件资源账本；负余额依正文保留。规则倍率、公式、每日额度不是本轮已发生事实，不按电脑时间发放。永久成长、临时强化、货币与节点分别核对；同份源量的当前承载不能重复当库存。缺少实际结果或规则自相矛盾时留空并在message说明，禁止自行选择更大倍率或推算余额。旧通用档案保留，不自动拆分或删除。';
  payload.sources=sources.map(s=>{const parts=evidenceParts(s.content);return {...s,content:parts.body,settlements:parts.settlements,statusSnapshots:parts.statusSnapshots,floor:s.index+1};});
  payload.context=context.map(s=>({...s,content:evidenceParts(s.content).body}));
  payload.readingPolicy='逐层核对 sources，不能只处理最后一层。settlements.facts 是本轮正式结算的主要依据；statusSnapshots（含MMLC-archive长期总档）只核对现状；旧存量不作为本轮新收益重复累加，首次出现的明确现状可作为存量建档；content 是补充叙事。opportunities 是未选择的机会，不是行动或到账。每项先判定所属金手指，不按出现位置推断归属。跨楼层同一对象沿用 ID；较新的状态更新不抹除旧的独立成果，重复记载不重复建档。快照遗漏不等于明确删除，前后冲突标 uncertain，不擅自选最新或更大值。无结算时可使用明确叙事事实；无法确定则保留待核对。';
  payload.taskMode=taishiDraft?'draft':taishiEvolution?'evolution':setupReferences?'worldbook':playerNote?'supplement':'narrative';
  payload.moduleKind=isTaishi(power)?'taishi':isMmlc(power)?'mmlc':'wuku';
  payload.limits={changes:creationConfig(power)?.id==='wuku.precedent'?256:64,fieldCharacters:4000,terminalResults:24,creationResults:24};
  if(payload.taskMode!=='narrative')payload.readingPolicy={supplement:'只整理playerNote明确补充，不把sources或参考资料扩成新收益。',worldbook:'只提取本批所选世界书片段的原始设定；不是本轮结算，不自行续写。',draft:'仅按taishiDraft范围补全待确认草案，不冒充正文事实。',evolution:'仅按taishiEvolution范围和内部历时生成待确认发展候选，不冒充正文事实。'}[payload.taskMode];
  payload.scopePolicy=archiveScopePolicy(payload);
  payload.responseContract=archiveResponseContract(payload);
  const preset=archivePreset(payload,{
    marker:ASYNC_MARKER,
    domain:isTaishi(power)?TAISHI_REVIEW+'\n'+TAISHI_KNOWLEDGE_POLICY:isMmlc(power)?MMLC_REVIEW+'\n'+MMLC_MODULE_PROMPT+'\n'+MMLC_CLASSIFICATION_PROMPT:'',
    task:taishiDraftInstruction(taishiDraft)+evolutionInstruction(power,taishiEvolution)+(isTaishi(power)?'人物筛选以peopleSelection为准：只更新selected或pinned范围（mode=all除外）；未选人物保留。玩家指定joining不可由AI改变。手动建档草案不受此次筛选限制。':''),
    terminal:terminalOrders.length&&!playerNote?TERMINAL_RESULT_PROMPT:'',
    creation:creationItems.length&&!playerNote?CREATION_RESULTS_PROMPT:''
  });
  payload.preset={id:preset.id,mode:preset.mode,groups:preset.groups};
  const body=JSON.stringify(payload);assert(body.length<=120000,'本批规则与正文超过120000字符，请减少参考前文或缩小手动读取范围');
  return {setupReferences,system:preset.system,user:body,inputCharacters:inputCharacterBreakdown(payload)};
}
export function normalizeArchiveChanges(data, power, sources, chat, playerNote = '') {
  assert(Array.isArray(data.changes) && data.changes.length <= (creationConfig(power)?.id==='wuku.precedent'?256:64), '档案变化列表无效或超过本批上限');
  const seen = new Map();
  return data.changes.map((raw,inputIndex) => {
    assert(raw && typeof raw === 'object' && !Array.isArray(raw), '档案变化无效');
    assert(Object.keys(raw).every(k => ['archiveId', 'type', 'name', 'status', 'fields', 'sourceIndex', 'quote', 'ruleQuote', 'recordId', 'details', 'ownerPowerId', ...(isMmlc(power) ? ['module'] : [])].includes(k)), '档案核对包含不允许的操作字段');
    assert(raw.ownerPowerId===undefined||raw.ownerPowerId===power.id,'变化所属金手指与当前词条不符');
    let type = raw.type; const name = text(raw.name, 200).trim();
    assert(Object.hasOwn(ARCHIVE_TYPES, type) && name, '档案类型或名称无效');
    const before = raw.archiveId ? power.archives?.[raw.archiveId] : (isTaishi(power)&&raw.recordId==='relation'?findRelation(power,raw.details):null)||findArchiveObject(power,name,raw.module);
    assert(!raw.archiveId || before, '引用的档案不存在');
    try{raw=canonicalFields({...raw,type:before?.type||type},ARCHIVE_FIELDS,creationConfig(power)?.records.find(r=>r.id===raw.recordId));}
    catch(error){if(before&&before.type!==type)throw Error(`「${before.name}」AI分类与原档案不符，且字段不兼容：${error.message}`);throw error;}
    if (before && before.type !== type) {
      assert(raw.fields && Object.keys(raw.fields).length && Object.keys(raw.fields).every(k => Object.hasOwn(ARCHIVE_FIELDS[before.type], k)), `「${before.name}」AI分类与原档案不符，且字段不兼容；请重新AI整理，沿用原类型${before.type}`);
      type = before.type;
    }
    const recovery = Boolean(before&&!archiveContextCurrent(before,chat));
    const module = isMmlc(power) ? raw.module ?? mmlcModule(before || { type, name }) : undefined;
    assert(!isMmlc(power) || MMLC_MODULES.some(m => m.id === module), '漫漫长路模块归属无效');
    assert(!recovery||raw.status!==undefined,'旧分支状态失效，请从当前正文重新确认状态');
    const status = raw.status ?? before?.status; assert(Object.hasOwn(ARCHIVE_STATUS, status), '请区分计划、进行中和已建立状态');
    assert(raw.fields && typeof raw.fields === 'object' && !Array.isArray(raw.fields) && Object.keys(raw.fields).length && Object.keys(raw.fields).every(k => Object.hasOwn(ARCHIVE_FIELDS[type], k)), '档案字段无效');
    const patch = Object.fromEntries(Object.entries(raw.fields).map(([k, v]) => [k, text(v, 4000).trim()]));
    const evidence = resolveArchiveEvidence(raw.sourceIndex, text(raw.quote ?? '', 4000), sources, playerNote);
    const { manual, source, quote, index: sourceIndex } = evidence, ruleQuote = text(raw.ruleQuote ?? '', 1200);
    if(!manual)assertFactEvidence(quote,source.content);
    if(!manual)assertTaishiOwnership(power,raw,before,quote,source.content);
    if(!manual&&!before&&creationConfig(power)?.id==='wuku.idle_campaign'){
      const alias=power.name.split(/[（(]/)[0].trim();
      const owned=Object.values(power.archives||{}).filter(r=>r.specific?.adapterId==='wuku.idle_campaign').map(r=>r.name);
      assert(quote&&source.content.includes(quote)&&quote.split(/[。！？\n]/).some(sentence=>sentence.includes(name)&&(sentence.includes(alias)||owned.some(n=>sentence.includes(n)))),'挂机归属缺少连续原文依据：新任务或产出须明确关联挂机或已有专用对象；普通学习、借用设施不自动记入');
    }
    if(!before&&creationConfig(power)?.id==='wuku.idle_campaign')assert(!creationConfig(power)?.records.some(r=>r.label===name),'对象名称不能使用分类标题；请填写具体任务、事件或对象名称');
    const specific=normalizeSpecific(raw,power,before,{recovery,chat});
    assertTaishiClaims(power,{...raw,fields:patch},before,specific);
    if(!manual&&!recovery)assertSnapshotPatch(before,patch,raw.details,quote,source.content);
    if(isTaishi(power)){assert(!Object.hasOwn(raw.details||{},'time_state'),'时间记录由时间面板登记，AI不得修改');const linked={id:before?.id,specific,specificPatch:clone(raw.details||{})};resolveTaishiLinks(power,linked);assertRelation(power,linked);if(specific?.recordId==='manifestation')assert(specific.fields.world_id&&['整界','局部','法则','收回'].includes(specific.fields.mode),'降界须关联已有世界并选择有效模式');}
    const identity = before?.id || `${type}:${nameKey(name)}`;
    const prior = seen.get(identity);
    if (prior) {
      assert(stable(prior) === stable({ status, patch, sourceIndex, ...(specific?{specific}:{}), ...(module ? { module } : {}) }), '同一对象的重复变化存在冲突，请重新整理或分批核对');
      return null; // The same fact quoted from prose and settlement is one update.
    }
    seen.set(identity, { status, patch, sourceIndex, ...(specific?{specific}:{}), ...(module ? { module } : {}) });
    return {inputIndex,...(raw.ownerPowerId?{ownerPowerId:text(raw.ownerPowerId,200)}:{}),...(specific?{specific,specificPatch:clone(raw.details||{})}:{}), ...(recovery ? { recovery: true } : {}), ...(module ? { module } : {}), type, name: before?.name || name, status, patch, id: before?.id || null, before: clone(before || null), source: manual ? { ...archiveSource(chat, '玩家确认AI整理的口述补充'), quote, ruleQuote } : { type: 'story', note: '玩家确认正文档案变化', ...(recovery?{contextReset:true}:{}), anchor: { index: source.index, swipeId: source.swipeId, length: source.length, textHash: source.textHash, ...(source.format ? { format: source.format } : {}) }, quote, ruleQuote } };
  }).filter(Boolean);
}
export function normalizeArchiveBatch(data,power,sources,chat,playerNote='',state={}, {strictProtocol=false,chronological=false}={}){
 assert(data&&typeof data==='object'&&!Array.isArray(data),'AI整理返回无效');
 assert(Array.isArray(data.changes)&&data.changes.length<=Math.min(4096,(creationConfig(power)?.id==='wuku.precedent'?256:64)*(chronological?Math.max(1,sources.length):1)),'档案变化超过本批上限或列表无效，请缩小读取范围分批整理');
 const issues=[],skippedOwnership=[],blockedFloors=new Set();
 const reject=(kind,index,raw,error)=>{issues.push({kind,index,name:String(raw?.name||raw?.orderId||raw?.creationId||'未知条目').slice(0,200),sourceIndex:raw?.sourceIndex,quote:String(raw?.quote||'').slice(0,4000),reason:error.message,...(error.fieldConflicts?{conflicts:error.fieldConflicts,candidate:clone(raw)}:{})});try{const evidence=resolveArchiveEvidence(raw?.sourceIndex,String(raw?.quote||''),sources,playerNote);if(!evidence.manual)blockedFloors.add(evidence.source.index);}catch{for(const source of sources)blockedFloors.add(source.index);}};
 const isolate=(kind,raw,max,normalize,identity,signature)=>{
  if(raw===undefined)return [];assert(Array.isArray(raw)&&raw.length<=max,kind+'列表无效');
  const groups=new Map();raw.forEach((item,index)=>{try{const row=normalize(item,index);if(!row)return;const id=identity(row);if(!groups.has(id))groups.set(id,[]);groups.get(id).push({row,index,item});}catch(e){reject(kind,index,item,e);}});
  const rows=[];for(const group of groups.values()){if(group.some(g=>signature(g.row)!==signature(group[0].row))){for(const g of group)reject(kind,g.index,g.item,Error('同一对象出现互相冲突的更新，整组留待重查'));}else rows.push(group[0].row);}return rows;
 };
 const changes=isolate('成果',data.changes,Math.min(4096,(creationConfig(power)?.id==='wuku.precedent'?256:64)*(chronological?Math.max(1,sources.length):1)),(raw,index)=>{const owner=foreignArchiveOwner(raw,power,state);if(owner){skippedOwnership.push({name:String(raw?.name||'未知对象').slice(0,200),ownerId:owner.id,ownerName:owner.name,reason:owner.reason});return null;}
 // A dedicated adapter does not invalidate an otherwise valid generic archive.
 // Explicit recordId/details still pass normalizeSpecific; never guess a category.
 const c=normalizeArchiveChanges({changes:[raw]},power,sources,chat,playerNote)[0];return c?{...c,inputIndex:index}:null;},c=>(c.id||c.type+':'+nameKey(c.name))+(chronological?':floor:'+c.source.anchor.index:''),c=>stable({status:c.status,patch:c.patch,source:c.source,specific:c.specific,module:c.module}));
 const terminalResults=isolate('安排进展',data.terminalResults,24,raw=>normalizeTerminalResults([raw],state,power,sources,chat)[0],c=>c.orderId,c=>stable({...c.progress,at:0}));
 const creationResults=isolate('拟定进展',playerNote?undefined:data.creationResults,24,raw=>normalizeCreationResults([raw],state,power,sources,chat,changes)[0],c=>c.creationId,c=>stable({progress:{...c.progress,at:0},refs:c.refs}));
 if(chronological)for(const c of changes)c.chronological=true;
 return {changes,terminalResults,creationResults,issues,skippedOwnership,blockedFloors:[...blockedFloors]};
}
export function archiveChangeTarget(change, power, target, chat) {
  const before = target ? power.archives?.[target] : null;
  assert(!change.recovery || target === change.id, '恢复档案必须保存到原对象');
  assert(!target || before && before.type === change.type, '所选原对象不存在或类型不符');
  assert(!before?.specific||!change.specific||before.specific.adapterId===change.specific.adapterId&&before.specific.recordId===change.specific.recordId,'所选对象属于另一种专用统计分类');
  return { ...change, id: before?.id || null, name: before?.name || change.name, before: clone(before || null) };
}
export function applyArchiveChanges(power, changes, sources, chosen, chat, { blockedFloors = new Set() } = {}) {
  const used = new Map(), saved = [];
  for (const [i, target] of chosen) {
    const original = changes[i]; assert(original, '所选变化不存在');
    let c = archiveChangeTarget(original, power, target, chat);
    const identity = c.id || `${c.type}:${nameKey(c.name)}`;const prior=used.get(identity);
    assert(!prior||c.chronological&&prior.chronological&&c.source.anchor.index>prior.floor,'多个变化指向同一对象，请分批核对');
    if(prior){const existing=power.archives[prior.id];c={...c,id:existing.id,before:clone(existing),...(c.specific?{specific:{...c.specific,fields:{...existing.specific?.fields,...c.specificPatch}}}:{})};}
    used.set(identity,{chronological:c.chronological,floor:c.source.anchor?.index,id:c.id});
    // All records were captured at preview time. A reassigned target must also
    // come from that captured state (the controller checks the state revision).
    assertTaishiClaims(power,{fields:c.patch,details:c.specificPatch,status:c.status},c.before,c.specific);
    if(isTaishi(power))assertRelation(power,c);
    const fields = c.recovery ? { ...c.patch } : { ...c.before?.fields, ...c.patch };
    if (!c.recovery && c.before && (!isMmlc(power) || mmlcModule(c.before) === c.module) && stable({ fields, status: c.status,specific:c.specific,owner:c.ownerPowerId||c.before.ownerPowerId }) === stable({ fields: c.before.fields, status: c.before.status,specific:c.before.specific,owner:c.before.ownerPowerId })) continue;
    const dependencies = [...(c.recovery||c.before?.source?.type!=='story'?[]:[c.before.source.anchor, ...(c.before.source.anchors || [])]), ...(c.source.anchors||[]), c.source.anchor].filter(Boolean);
    const anchors = [...new Map(dependencies.map(a => [stable(a), a])).values()].slice(-1000);
    const stored=saveArchive(power, { id: c.id, type: c.type, name: c.name, status: c.status, fields,...(c.ownerPowerId?{ownerPowerId:c.ownerPowerId}:{}),...(c.specific?{specific:c.specific}:{}), ...(c.module ? { module: c.module } : {}) }, { ...c.source, anchors });saved.push(stored);used.get(identity).id=stored.id;
  }
  if(isTaishi(power))for(const record of saved)resolveTaishiLinks(power,{id:record.id,specific:record.specific});
  // Unchecked proposals stay pending. Only fully accepted floors advance.
  const completed = sources.filter(s => !blockedFloors.has(s.index) && changes.every((c, i) => c.source.type !== 'story' || c.source.anchor.index !== s.index || chosen.has(i)));
  power.archiveReviewed = [...(power.archiveReviewed || []).filter(a => !blockedFloors.has(a.index) && !completed.some(s => s.index === a.index)), ...completed.map(({ index, swipeId, length, textHash, format }) => ({ index, swipeId, length, textHash, ...(format ? { format } : {}) }))];
  assert(power.archiveReviewed.length <= 100000, '核对进度过多，请导出整理');
  return saved;
}
export const archiveReviewMethods = {
  openArchiveBatch(){const s=this.ensureStable(),p=s.state.powers[this.powerId];assert(p?.active&&!this.pendingArchiveReview,'请先处理待确认结果');this.ui.showArchiveBatch(p,s.ctx.chat.length);},
  async createArchiveBatch(data){assert(!this.busy&&!this.committing&&!this.archiveReviewJob&&!this.pendingArchiveReview&&!this.manualBatchRun,'请先完成当前操作');const s=this.ensureStable(),id=this.powerId;const plan=createArchiveBatch(s.ctx.chat,data.values,archiveReadText);await this.store.transact(next=>{next.powers[id].archiveBatch=plan;},{captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision},facts:false});this.refresh();this.openArchiveBatch();},
  async runArchiveBatch(continuous=false){
    assert(!this.busy&&!this.mainBusy&&!this.committing&&!this.archiveReviewJob&&!this.pendingArchiveReview,'请先保存或放弃当前候选');
    const capture=this.ensureStable(),id=this.powerId,run={stopped:false};assert(capture.state.powers[id]?.archiveBatch,'请先划分批次');this.manualBatchRun=run;
    try{do{const s=this.ensureStable();assert(s.chatKey===capture.chatKey&&s.state.id===capture.state.id&&this.powerId===id,'聊天或词条已切换，分批整理停止');const p=s.state.powers[id],plan=p.archiveBatch;if(!plan||plan.cursor>=plan.parts.length)break;const cursor=plan.cursor;this.ui.closeDialog();await this.reviewArchives({rescan:true,manualBatch:{id:plan.id,cursor},batchContinuous:continuous});if(run.stopped||!continuous||this.pendingArchiveReview||this.ensureStable().state.powers[id].archiveBatch.cursor===cursor)break;}while(!run.stopped);
    }finally{if(this.manualBatchRun===run)this.manualBatchRun=null;this.refresh();}
  },
  async clearArchiveBatch(){assert(!this.busy&&!this.archiveReviewJob&&!this.pendingArchiveReview&&!this.manualBatchRun,'请先取消任务或处理候选');const s=this.ensureStable(),id=this.powerId;await this.store.transact(next=>{delete next.powers[id].archiveBatch;},{captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision},facts:false});this.openArchiveBatch();this.refresh();},
  openArchiveRange() {
    const s=this.ensureStable(), p=s.state.powers[this.powerId]; assert(p?.active,'请先选择当前金手指');
    this.archiveRangeDraft={powerId:p.id,captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}};
    this.ui.showArchiveRange(p,s.ctx.chat.length);
  },
  async saveArchiveRange(data) {
    assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前操作完成');
    const d=this.archiveRangeDraft;assert(d,'读取范围窗口已失效');this.ensureStable();
    const range=normalizeArchiveRange(data.values), auto=normalizeArchiveAuto(data.values);
    await this.store.transact(next=>{assert(next.powers[d.powerId]?.active,'接入已变化');next.powers[d.powerId].archiveReadRange=range;next.powers[d.powerId].archiveAuto=auto;},{captured:d.captured,facts:false});
    this.archiveRangeDraft=null;this.ui.closeDialog();this.refresh();this.notice('更新设置已保存。自动按角色回复间隔处理新内容；读取范围用于手动补漏。');
  },

  reviewArchives(options = {}) {
    const snapshot = {...this.ensureStable({ model: true }), referenceOnly:!options.workflowResume}, power = snapshot.state.powers[options.powerId || this.powerId]; assert(power?.active, '请先选择已接入的金手指');
    const identity = stable({ chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision, hashes: snapshot.hashes, powerId: power.id, rescan: Boolean(options.rescan || options.initial), automatic: Boolean(options.automatic), autoSave: Boolean(options.autoSave), playerNote: text(options.values?.playerNote || '', 4000).trim(), supplement: Boolean(options.supplement), setupReferences:Boolean(options.setupReferences),taishiDraft:options.taishiDraft||null,taishiEvolution:options.taishiEvolution||null,taishiBuild:options.taishiBuild||null,workflowRetryRole:options.workflowRetryRole||null,workflowResume:options.workflowResume||null, manualBatch:options.manualBatch||null, taishiScheduleEvent:options.taishiScheduleEvent?.id||null });
    const running = this.archiveReviewJob;
    if (running && !running.cancelled) {
      assert(running.identity === identity, '已有成果整理正在校验或保存，请等待完成');
      return running.promise;
    }
    assert(!this.pendingArchiveReview || Boolean(options.workflowResume), '已有待确认结果，请先保存或放弃，再开始新的整理');
    if(options.taishiBuild){validateTaishiBuild(options.taishiBuild);assert(isTaishi(power)&&options.setupReferences&&!options.autoSave&&!options.automatic&&options.referenceBatch,'世界书批次必须预览后保存');}
    if(options.taishiDraft){assert(isTaishi(power)&&!options.automatic&&!options.autoSave&&!options.setupReferences,'建档草案必须由玩家预览后保存');taishiDraftInstruction(options.taishiDraft);}
    if(options.taishiEvolution){assert(isTaishi(power)&&!options.automatic&&!options.autoSave&&!options.setupReferences&&!options.taishiDraft,'自主发展必须由玩家预览后保存');assert(text(options.values?.playerNote||'',4000).trim().length>=6,'请说明本次确认的内部历时');evolutionInstruction(power,options.taishiEvolution);}
    const request = { ...options, ...(options.taishiEvolution?{taishiEvolution:{...options.taishiEvolution}}:{}), ...(options.taishiDraft?{taishiDraft:{...options.taishiDraft}}:{}), powerId: power.id, ...(options.values ? { values: { ...options.values } } : {}) };
    const job = { identity, cancelled: false }; this.archiveReviewJob = job;
    job.promise = Promise.resolve().then(() => {
      if (job.cancelled) throw new DOMException('查询已取消', 'AbortError');
      this.store.assertCapture({ chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision });
      // Chat/state capture above protects this job; source text is reference only.
      return this.performArchiveReview(request, job);
    }).finally(() => {
      if (this.archiveReviewJob === job) { this.archiveReviewJob = null; this.refresh(); }
    });
    return job.promise;
  },
  async performArchiveReview(options = {}, job = null) {
    const snapshot = {...this.ensureStable({ model: true }), referenceOnly:!options.workflowResume}, power = snapshot.state.powers[options.powerId || this.powerId]; assert(power?.active, '请先选择已接入的金手指');
    assert(!options.setupReferences||isTaishi(power),'只有太始天可以建立世界设定底稿');
    const playerNote = options.setupReferences ? '玩家请求从选定个人世界书中建立现有太始天设定底稿；逐项预览，确认后保存。' : text(options.values?.playerNote || '', 4000).trim();
    let sources = playerNote || options.manualBatch ? [] : archiveSources(snapshot.ctx.chat, snapshot.state, power, { rescan: Boolean(options.rescan || options.initial), automatic: Boolean(options.automatic) });
    if(options.manualBatch){assert(!playerNote&&!options.automatic&&!options.autoSave,'手动分批任务参数无效');const plan=power.archiveBatch;assert(plan?.id===options.manualBatch.id&&plan.cursor===options.manualBatch.cursor,'分批断点已变化');sources=archiveBatchSources(plan,snapshot.ctx.chat,archiveReadText);}
    if(options.automatic&&!playerNote)sources=sources.slice(0,1); // Existing scheduler drains one confirmed floor at a time.
    if (options.supplement) assert(playerNote.length >= 6, '请用一句话说明已有情况或计划（至少6字）');
    this.runtimeLog?.step(this.logTask,'读取范围',{automatic:Boolean(options.automatic),rescan:Boolean(options.rescan||options.initial),range:power.archiveReadRange||{mode:'recent',recent:24},totalFloors:snapshot.ctx.chat.length,sources:sources.map(s=>({floor:s.index+1,swipe:s.swipeId+1,offset:s.offset,...readerReport(snapshot.ctx.chat[s.index]?.mes??snapshot.ctx.chat[s.index]?.content??'',s.content)}))});
    if (!sources.length && !playerNote) return this.notice(options.rescan || options.initial ? '当前聊天没有可核对的角色正文。' : '本轮没有未核对的新增正文；手动整理可重查近期内容。');
    const terminalOrders=terminalReviewOrders(snapshot.state,power,snapshot.ctx.chat),creationItems=creationReviewItems(snapshot.state,power,snapshot.ctx.chat);
    // Existing settlement jobs retain their single-model contract. Advanced
    // specialists only handle ordinary archive review, never reward settlement.
    const taishiWorkflow=isTaishi(power)&&power.taishiWorkflow===true&&(!playerNote||options.taishiEvolution)&&!options.setupReferences&&!options.taishiDraft&&!terminalOrders.length&&!creationItems.length;
    assert(!options.workflowResume||taishiWorkflow,'高级工作流已关闭或当前任务不支持续跑');
    const request = selectedSources => this.query(archivePrompt(power, selectedSources, snapshot.ctx.chat, playerNote, {automatic: Boolean(options.automatic), terminalOrders,creationItems,state:snapshot.state,setupReferences:Boolean(options.setupReferences),taishiDraft:options.taishiDraft||null,taishiEvolution:options.taishiEvolution||null}), snapshot, {task:options.workflowRetryRole||(options.taishiDraft?'creation':options.setupReferences?'setup':'archive'),taishiWorkflow,referenceBatch:options.referenceBatch||null,workflowResume:options.workflowResume||null,workflowRetryRole:options.workflowRetryRole||null,validateWorkflowChanges:changes=>{const checked=normalizeArchiveBatch({changes},power,sources,snapshot.ctx.chat,playerNote,snapshot.state);if(options.taishiEvolution)for(const c of checked.changes){const reason=evolutionConsequence(c,power);if(reason)checked.issues.push({kind:"高影响后果",name:c.name,reason});}return checked.issues;},workflowOnAttempt:options.workflowOnAttempt});
    const layered=sources.length>1&&!playerNote&&!taishiWorkflow&&!terminalOrders.length&&!creationItems.length;
    const check=()=>{if(job&&(job.cancelled||this.archiveReviewJob!==job))throw new DOMException('查询已取消','AbortError');this.store.assertCapture({chatKey:snapshot.chatKey,stateId:snapshot.state.id,revision:snapshot.state.revision});assert(hash(stable(chatHashes(getContext().chat)))===hash(stable(snapshot.hashes)),'整理期间剧情已变化，请重查');};
    const result=layered?await reviewHistory(sources,source=>request([source]),{check,progress:(part,total,floor)=>{this.notice(`历史逐层整理 ${part}/${total} · 第 ${floor} 层；每层一次请求，可取消`);this.runtimeLog?.step(this.logTask,'分层进度',{part,total,floor});}}):await request(sources);
    if(!result.captured){result.captured={chatKey:snapshot.chatKey,stateId:snapshot.state.id,revision:snapshot.state.revision};result.contextHash=hash(stable(snapshot.hashes));result.logId=this.logTask;}

    if (job && (job.cancelled || this.archiveReviewJob !== job)) throw new DOMException('查询已取消', 'AbortError');
    const prepared=isTaishi(power)?preparePersonSources(result.data,options.setupReferences?options.referenceBatch:null):{data:result.data};
    let guide=null;const batch=normalizeArchiveBatch(prepared.data,power,sources,snapshot.ctx.chat,playerNote,snapshot.state,{strictProtocol:!playerNote,chronological:layered});
    if(layered&&result.data.historyIssues?.length){batch.issues.push(...result.data.historyIssues);batch.blockedFloors=[...new Set([...batch.blockedFloors,...result.data.historyIssues.map(i=>i.sourceIndex)])];}
    if(isTaishi(power))attachPersonSources(batch,prepared);
    if(taishiWorkflow&&result.data.workflowIssues?.length){batch.issues.push(...result.data.workflowIssues);batch.blockedFloors=[...new Set([...batch.blockedFloors,...sources.map(s=>s.index)])];}
    if(isTaishi(power)&&!options.taishiDraft&&!options.setupReferences&&!playerNote)filterPeopleBatch(batch,power);
    if(options.taishiScheduleEvent&&!batch.issues.length)this.ensureScheduledTimeCandidate(batch,power,options.taishiScheduleEvent);
    if(options.taishiEvolution)protectEvolution(batch,power,options.taishiEvolution);
    if(isTaishi(power)&&!options.setupReferences)protectPeopleIdentity(batch,power,options.taishiDraft);
    if(options.taishiTimeEvent){assertStoryTime(power,snapshot.ctx.chat,options.taishiTimeEvent);for(const c of batch.changes){c.source={type:'story',...(c.recovery?{contextReset:true}:{}),note:'玩家采用正文历时的发展候选（AI创作） #'+options.taishiTimeEvent.id,quote:options.taishiTimeEvent.quote,anchor:clone(options.taishiTimeEvent.anchor)};if(c.id===options.taishiTimeEvent.worldId)c.specific.fields.clock=((c.before?.specific?.fields.clock||'起点未登记')+'；已采用正文历时：'+options.taishiTimeEvent.quote).slice(-4000);}}
    if(options.taishiScheduleEvent){
      this.assertTaishiScheduleEvent(power,options.taishiScheduleEvent,snapshot.ctx.chat);
      this.ensureScheduledTimeCandidate(batch,power,options.taishiScheduleEvent);
      for(const c of batch.changes)c.source={type:'story',note:'AI 自主发展候选，经玩家确认采用；按剧情时间 #'+options.taishiScheduleEvent.id,quote:'剧情时间：'+options.taishiScheduleEvent.from.raw+' → '+options.taishiScheduleEvent.to.raw,anchor:clone(options.taishiScheduleEvent.to.anchor),anchors:[clone(options.taishiScheduleEvent.from.anchor),clone(options.taishiScheduleEvent.to.anchor)]};
    }
    if(options.taishiDraft)protectTaishiDraft(batch,options.taishiDraft);
    if(!playerNote&&!options.taishiEvolution&&!options.taishiTimeEvent){
      batch.floorReviews=floorCoverage(prepared.data,sources,batch.changes,batch.terminalResults,batch.creationResults).map(row=>batch.blockedFloors.includes(row.sourceIndex)?{...row,status:'uncertain',reason:'本层存在未通过校验的候选'}:row);
      const uncertain=batch.floorReviews.filter(r=>r.status!=='reviewed');
      batch.blockedFloors=[...new Set([...batch.blockedFloors,...uncertain.map(r=>r.sourceIndex)])];
      if(uncertain.length)batch.issues.push({kind:'逐层核对',name:'读取进度',reason:`${uncertain.map(r=>r.floor).join('、')} 层未完成一致的逐层核对，保留待重查；有效候选仍可保存`});
      this.runtimeLog?.step(result.logId,'逐层核对',{floors:batch.floorReviews.map(({floor,accepted,status})=>({floor,accepted,status}))});
    }
    if(options.setupReferences){
      protectTaishiBaseline(batch);
      const names=(this.referenceLast?.books||[]).map(b=>b.name).join('、');
      for(const c of batch.changes)c.source.note=('玩家确认个人世界书设定底稿'+(options.taishiBuild?' · 第 '+(options.taishiBuild.next+1)+'/'+options.taishiBuild.total+' 批':'')+(names?'：'+names:'')).slice(0,600);
    }
    if(!isMmlc(power)&&result.data.guide){try{guide=normalizePlayerGuide(result.data.guide,power);}catch(e){batch.issues.push({kind:'玩法说明',name:power.name,reason:e.message});}}
    const reviewed={...result,...batch,layered,guide,...(options.taishiScheduleEvent?{taishiScheduleEvent:clone(options.taishiScheduleEvent)}:{}),...(options.manualBatch?{manualBatch:{...options.manualBatch},batchContinuous:Boolean(options.batchContinuous)}:{}),...(options.taishiTimeEvent?{taishiTimeEvent:clone(options.taishiTimeEvent)}:{}),...(taishiWorkflow?{workflowOptions:{...(options.taishiScheduleEvent?{taishiScheduleEvent:clone(options.taishiScheduleEvent)}:{}),...(options.manualBatch?{manualBatch:{...options.manualBatch}}:{}),rescan:Boolean(options.rescan),initial:Boolean(options.initial),automatic:Boolean(options.automatic),...(options.taishiEvolution?{taishiEvolution:clone(options.taishiEvolution),...(options.taishiTimeEvent?{taishiTimeEvent:clone(options.taishiTimeEvent)}:{}),supplement:true,values:{playerNote}}:{})}}:{}),...(options.taishiBuild?{taishiBuild:{...options.taishiBuild,skipped:[...options.taishiBuild.skipped]}}:{}),...(options.taishiEvolution?{taishiEvolution:options.taishiEvolution}:{}),...(options.taishiDraft?{taishiDraft:options.taishiDraft}:{}),message:[String(result.data.message||''),batch.skippedPeople?.length?'按筛选跳过 '+batch.skippedPeople.length+' 名人物，已有档案保留。':'',batch.skippedOwnership.length?`已跳过 ${batch.skippedOwnership.length} 项其他金手指对象：${batch.skippedOwnership.map(r=>r.name+'（'+r.ownerName+'）').join('、')}`:''].filter(Boolean).join('；'),playerNote,setupReferences:Boolean(options.setupReferences),powerId:power.id,automaticStart:options.automatic?power.autoArchiveStart??sources[0]?.index:undefined,sources};
    if(options.taishiDraft)this.taishiDraft=null;
    if(options.taishiEvolution)this.taishiEvolutionDraft=null;
    this.runtimeLog?.step(result.logId,'校验结果',{accepted:batch.changes.length,arrangements:batch.terminalResults.length,creations:batch.creationResults.length,issues:batch.issues,skippedOwnership:batch.skippedOwnership,blockedFloors:batch.blockedFloors.map(i=>i+1)});
    if(batch.issues.length){this.runtimeLog?.patch(result.logId,{partial:true});this.aiActivity?.warning?.('部分条目未通过校验，可用更新已单独整理；详情见运行日志。');}
    if(batch.issues.length&&!batch.changes.length&&!batch.terminalResults.length&&!batch.creationResults.length&&!guide){reviewed.readOnly=true;if(taishiWorkflow||batch.issues.some(i=>i.conflicts?.length))this.pendingArchiveReview=reviewed;this.runtimeLog?.patch(result.logId,{noUpdates:true});this.notice(`本次 ${batch.issues.length} 项未通过校验，未推进读取进度。请查看运行日志后重查。`,true);if(!options.silent)this.ui.showArchiveReview({...reviewed,readOnly:true},power,snapshot.ctx.chat);return;}
    const needsScopeConfirmation=isTaishi(power)&&reviewed.changes.some(c=>!c.before);
    if(options.manualBatch&&options.batchContinuous&&!batch.issues.length&&!needsScopeConfirmation){
      await this.commitArchiveReview(reviewed,new Map(reviewed.changes.map((c,i)=>[i,c.id])),{terminalChosen:new Set(reviewed.terminalResults.map((_,i)=>i)),creationChosen:new Set(reviewed.creationResults.map((_,i)=>i))});this.notice('本批已保存；连续处理可随时取消，已保存批次和日志保留。');return;
    }
    if (!(taishiWorkflow&&batch.issues.length) && !needsScopeConfirmation && !options.setupReferences && options.autoSave && !reviewed.creationResults.some(c=>c.recovery) && !reviewed.changes.some(c => c.recovery) && !reviewed.terminalResults.some(c => c.recovery)) {
      assert(!this.pendingArchiveReview, '已有待确认结果，自动更新暂停');
      const committed = await this.commitArchiveReview(reviewed, new Map(reviewed.changes.map((c, i) => [i, c.id])), { automatic: true });
      this.archiveAutoIncomplete ||= {};this.archiveAutoIncomplete[power.id]=Boolean(reviewed.blockedFloors.length);
      this.archiveAutoStatus ||= {}; this.archiveAutoStatus[power.id] = committed?.save?.verified===false?'本机已保存，酒馆待核实':'已保存本批成果';
      if(committed?.save?.verified===false)this.runtimeLog?.patch(result.logId,{partial:true});
      return this.notice(`${reviewed.issues.length?'部分更新已保存，'+reviewed.issues.length+' 项待重查（见运行日志）。':''}自动更新已保存：${reviewed.changes.length} 项成果、${reviewed.terminalResults.length} 项安排进展、${reviewed.creationResults.length} 项拟定进展。${reviewed.skippedOwnership.length?' 已跳过 '+reviewed.skippedOwnership.length+' 项其他金手指对象。':''}${committed?.save?.verified === false ? committed.save.note : ''}`);
    }
    this.pendingArchiveReview = reviewed;
    if (!options.silent) this.ui.showArchiveReview(this.pendingArchiveReview, power, snapshot.ctx.chat);
    else this.notice(needsScopeConfirmation?'太始天发现新的关联对象，请打开待确认核对归属；本轮未自动保存。':[...reviewed.changes,...reviewed.terminalResults,...reviewed.creationResults].some(c => c.recovery) ? 'AI已重新整理来源失效的档案，请打开首页确认恢复；尚未自动保存。' : 'AI已整理本轮变化，打开首页查看并接受。');
    this.refresh();
  },
  async retryTaishiWorkflow(role){
    assert(!this.busy&&!this.mainBusy&&!this.committing&&!this.archiveReviewJob,'请等待当前任务结束');
    const pending=this.pendingArchiveReview,s=this.ensureStable({model:true});
    assert(pending?.data?.workflowState&&pending.powerId===this.powerId,'续跑候选已失效，请重新核对');
    this.store.assertCapture(pending.captured);
    assert(hash(stable(s.hashes))===pending.contextHash,'剧情已变化，请放弃旧候选后重新核对');
    const stage=pending.data.workflowState.stages[role];assert(stage&&(stage.status==='failed'||role==='taishiSummary'&&stage.status==='pending'),'此阶段无需续跑');
    return this.reviewArchives({...pending.workflowOptions,autoSave:false,silent:false,workflowResume:clone(pending.data.workflowState),workflowRetryRole:role,workflowOnAttempt:(task,attempts)=>{assert(this.pendingArchiveReview===pending,'续跑候选已失效');pending.data.workflowState.stages[task].attempts=attempts;}});
  },
  repairArchiveConflict(data) {
    assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前任务结束');
    const pending=this.pendingArchiveReview;assert(pending,'预览已失效，请重查');
    const snapshot=this.ensureStable();this.store.assertCapture(pending.captured);
    assert(hash(stable(snapshot.hashes))===pending.contextHash,'剧情已变化，请重查');
    const issue=pending.issues[Number(data.index)];assert(issue?.conflicts?.length&&issue.candidate,'此候选无需修正或已失效');
    const power=snapshot.state.powers[pending.powerId],raw=issue.candidate,before=raw.archiveId?power.archives[raw.archiveId]:findArchiveObject(power,raw.name,raw.module);
    const resolutions={};for(let i=0;i<issue.conflicts.length;i++){const conflict=issue.conflicts[i],choice=data.values?.['conflict:'+data.index+':'+i];assert(['left','right','custom'].includes(choice),'请选择字段内容');resolutions[conflict.key]=choice==='custom'?String(data.values?.['conflict-text:'+data.index+':'+i]||''):conflict[choice];}
    const fixed=canonicalFields({...raw,type:before?.type||raw.type},ARCHIVE_FIELDS,creationConfig(power)?.records.find(r=>r.id===raw.recordId),{resolutions});
    // Revalidate against the whole captured batch, including same-floor duplicates.
    const index=pending.data.changes.findIndex(c=>stable(c)===stable(raw));assert(index>=0,'候选原文已变化');
    const trialData={...pending.data,changes:pending.data.changes.map((c,i)=>i===index?fixed:c)};
    const trial=normalizeArchiveBatch(trialData,power,pending.sources,snapshot.ctx.chat,'',snapshot.state,{chronological:Boolean(pending.layered)});
    assert(!trial.issues.some(i=>i.kind==='成果'&&i.index===index),trial.issues.find(i=>i.kind==='成果'&&i.index===index)?.reason||'修正内容与同层候选冲突');
    const checked=normalizeArchiveBatch({changes:[fixed]},power,pending.sources,snapshot.ctx.chat,'',snapshot.state);
    assert(checked.changes.length===1&&!checked.issues.length,checked.issues[0]?.reason||'修正内容未通过校验');
    checked.changes[0].chronological=Boolean(pending.layered);pending.changes.push(checked.changes[0]);pending.changes.sort((a,b)=>a.source.anchor.index-b.source.anchor.index);
    // Match the captured response; repairs never send a second model request.
    pending.data.changes[index]=fixed;
    pending.issues.splice(Number(data.index),1);pending.issues=pending.issues.filter(i=>i.kind!=='逐层核对');
    const blocked=new Set();for(const i of pending.issues){if(Number.isSafeInteger(i.sourceIndex)&&pending.sources.some(s=>s.index===i.sourceIndex))blocked.add(i.sourceIndex);else for(const source of pending.sources)blocked.add(source.index);}
    pending.floorReviews=floorCoverage(pending.data,pending.sources,pending.changes,pending.terminalResults,pending.creationResults).map(row=>blocked.has(row.sourceIndex)?{...row,status:'uncertain'}:row);
    for(const row of pending.floorReviews)if(row.status!=='reviewed')blocked.add(row.sourceIndex);
    pending.blockedFloors=[...blocked];pending.readOnly=false;
    this.ui.showArchiveReview(pending,power,snapshot.ctx.chat);this.notice('字段已修正，尚未写入档案；请核对后接受更新。');
  },
  async applyArchiveReview(data) {
    assert(!this.busy && !this.mainBusy && !this.committing, '请等待当前操作完成');
    const pending = this.pendingArchiveReview; assert(pending, '预览已失效，请重新核对'); this.ensureStable();
    const form = new FormData(data.form), chosen = new Map(form.getAll('archive-change').map(i => [Number(i), form.get(`target:${i}`) || null]));
    const terminalChosen = new Set(form.getAll('terminal-result').map(Number)),creationChosen=new Set(form.getAll('creation-result').map(Number));
    assert([...creationChosen].every(i=>Number.isInteger(i)&&i>=0&&i<(pending.creationResults||[]).length),'拟定进展选择项无效');
    assert(!pending.changes.length && !pending.terminalResults?.length && !pending.creationResults?.length || chosen.size || terminalChosen.size || creationChosen.size, '请选择要保存的变化；取消不会推进核对进度');
    assert([...terminalChosen].every(i=>Number.isInteger(i)&&i>=0&&i<(pending.terminalResults||[]).length),'安排结果选择项无效');
    assert([...chosen.keys()].every(i => Number.isInteger(i) && i >= 0 && i < pending.changes.length), '选择项无效');
    const committed=await this.commitArchiveReview(pending, chosen, {terminalChosen,creationChosen});
    const unverified=committed?.save?.verified===false;
    this.runtimeLog?.patch(pending.logId,{status:unverified?'本机已保存，酒馆待核实':pending.issues?.length?'部分保存':'已保存'});this.pendingArchiveReview = null; this.ui.closeDialog(); this.notice(unverified?committed.save.note:pending.taishiBuild?'所选底稿已保存；从世界书构建入口查看批次进度并继续。':pending.issues?.length?'有效成果已保存；未通过的条目留待重查，详情见运行日志。':'所选成果与进展已保存；未勾选的变化留待下次核对。'); this.refresh();if(pending.manualBatch)this.openArchiveBatch();
  },
  async commitArchiveReview(pending, chosen, { automatic = false, terminalChosen = new Set(),creationChosen=new Set() } = {}) {
    this.ensureStable();
    assert(!pending.readOnly,'本轮没有可保存候选，请续跑失败阶段或放弃本轮');
    assert(!this.busy && !this.mainBusy && !this.committing, '请等待当前操作完成');
    this.committing = true; this.refresh();
    let counts;
    try {
      const result=await this.store.transact(next => {
        const p = next.powers[pending.powerId]; assert(p?.active, '接入已变化');
        if(pending.taishiEvolution){assert(p.taishiAutonomy===true,'自主发展已关闭');assert([...chosen].every(([i,target])=>target===pending.changes[i]?.id),'自主发展候选必须保存到原对象，不能改派给其他世界或人物');assert(pending.changes.every((c,i)=>!chosen.has(i)||c.id===pending.taishiEvolution.worldId||[...chosen.keys()].some(j=>pending.changes[j]?.id===pending.taishiEvolution.worldId)),'保存人物发展时必须一并保存本次世界历时');}
        if(pending.taishiTimeEvent){assert(!automatic,'正文历时发展需玩家确认');assertStoryTime(p,getContext().chat,pending.taishiTimeEvent);assert([...chosen.keys()].some(i=>pending.changes[i]?.id===pending.taishiTimeEvent.worldId),'采用正文历时必须同时保存世界候选');}
        if (automatic) assert(p.autoArchiveReview && p.autoArchiveSave, '自动保存已关闭');
        if (automatic && pending.automaticStart !== undefined) p.autoArchiveStart ??= pending.automaticStart;
        const results=pending.terminalResults||[], selected=automatic?new Set(results.map((_,i)=>i)):terminalChosen;
        const creationResults=pending.creationResults||[],requested=automatic?new Set(creationResults.map((_,i)=>i)):creationChosen;
         const acceptedCreations=new Set([...requested].filter(i=>creationResults[i]?.refs.every(r=>r.archiveId||chosen.has(r.changeIndex))));
         const blockedFloors=new Set([...(pending.blockedFloors||[]),...results.filter((_,i)=>!selected.has(i)).map(c=>c.progress.anchor.index).concat(creationResults.filter((_,i)=>!acceptedCreations.has(i)).map(c=>c.progress.anchor.index))]);
        if(pending.taishiScheduleEvent){assert(!automatic&&!pending.issues.length&&chosen.size===pending.changes.length&&pending.changes.some((c,i)=>chosen.has(i)&&c.id===pending.taishiScheduleEvent.worldId),'按时演化需全部核对通过并接受，时间和成果一起保存');this.assertTaishiScheduleEvent(p,pending.taishiScheduleEvent,getContext().chat);}
        const undoBefore=journalSnapshot(next,p.id);
        if(pending.taishiBuild){
          assert(!automatic,'世界书批次不能自动保存');
          assert([...chosen].every(([i,target])=>target===pending.changes[i]?.id),'世界书底稿必须保存到原对象或新建，不能改派');
          if(chosen.size===pending.changes.length&&!(pending.issues||[]).some(i=>i.kind!=='设定冲突'))advanceTaishiBuild(p,pending.taishiBuild);
        }
        const before = { ...p.archives };
        const saved = applyArchiveChanges(p, pending.changes, pending.sources, chosen, getContext().chat, {blockedFloors});
        if(pending.taishiScheduleEvent)this.recordTaishiSchedule(p,pending.taishiScheduleEvent,getContext().chat);
        if(pending.taishiTimeEvent)recordStoryTime(p,getContext().chat,pending.taishiTimeEvent);
        if(pending.taishiDraft?.kind==='companion')retainDraftPeople(p,saved,pending.taishiDraft.joining);
        const progressed=applyTerminalResults(next,results,selected,p.id,getContext().chat);
        const created=applyCreationResults(next,creationResults,acceptedCreations,p,pending.changes,chosen,getContext().chat);
        counts={saved:saved.length,arrangements:progressed.length,creations:created.length,rejected:pending.issues?.length||0,floors:pending.sources.map(s=>({floor:s.index+1,saved:saved.filter(r=>r.source?.anchor?.index===s.index).length,reviewed:p.archiveReviewed.some(a=>a.index===s.index&&a.swipeId===s.swipeId&&!blockedFloors.has(s.index))}))};
        if(pending.manualBatch&&!blockedFloors.size&&chosen.size===pending.changes.length&&selected.size===results.length&&acceptedCreations.size===creationResults.length)advanceArchiveBatch(p,pending.manualBatch,pending.sources);
        saveArchiveUpdate(p,before,saved,pending.sources,{automatic,arrangements:progressed.length+created.length,chat:getContext().chat});
        if (pending.guide) p.playerGuide = pending.guide;
        saveArchiveUndo(next,p.id,undoBefore,automatic ? '自动整理' : '整理剧情');
        this.record(next, `${p.name} · ${automatic ? '自动更新' : '核对经营档案'}`, [...saved.map(r => r.name),...progressed.map(o=>`${o.title}：${o.progress.summary}`),...created.map(o=>`${o.title}：${o.progress.summary}`)], 'archive', p.id);
      }, { captured: pending.captured });
      this.runtimeLog?.step(pending.logId,'保存结果',{...counts,verified:result?.save?.verified!==false});
      return result;
    } catch(error){this.runtimeLog?.step(pending.logId,'保存失败',{error:error.message});this.runtimeLog?.patch(pending.logId,{status:'保存失败'});throw error;} finally { this.committing = false; this.refresh(); }
  },
};
