import {resourceBalanceAllowed} from './src/core.js';
import {archiveRequestScope} from './src/archive-input.js';
import {databasePromptTrial,DATABASE_PROMPT_TRIAL_ID} from './src/database-prompt-trial.js';
import {reviewCheckpointMethods,encodeCheckpoint} from './src/review-checkpoint.js';
import {taishiScheduleMethods} from './src/taishi-schedule-controller.js';
import {taishiControlMethods} from './src/taishi-controls.js';
import {requestWithFallback} from './src/api-fallback.js';
import {exportModule,validateModuleBackup,mergeModuleBackup,MODULE_NAMES} from './src/module-backup.js';
import {archiveBranchMethods} from './src/archive-branch.js';
import {taishiStructureMethods} from './src/taishi-structure-controller.js';
import {taishiCivilizationMethods} from './src/taishi-civilization-controller.js';
import { spaceMethods, powerSpace, moduleEnabled } from './src/space-controller.js';
import { mountEntry } from './src/entry.js';
import { isTaishi } from './src/taishi.js';
import {runTaishiWorkflow,TAISHI_ROLES} from './src/taishi-workflow.js';
import { resolveTaskConnectionPlan, saveTaskRoutes, accountSecrets } from './src/host.js';
import { RuntimeLog } from './src/runtime-log.js';
import { withBuiltinCatalog, upgradeBuiltinPower, builtinPowerId, removeCatalogBook } from './src/builtin-worldbook.js';
import { aiWorldbookMethods, readReferencePacket } from './src/ai-worldbooks.js';
import { attachReferences } from './src/ai-worldbooks-data.js';
import { archiveToolMethods } from './src/archive-tools.js';
import { connectionValues, connectionKey, themeId } from './src/preferences.js';
import { adapterLibraryMethods, autoAssociateAdapter, autoAssociateAdapters } from './src/adapter-library.js';
import { adapterMethods } from './src/adapters.js';
import { installAIActivity } from './src/ai-activity.js';
import { outboxSummary } from './src/outbox.js';
import { creationMethods } from './src/creation.js';
import { mmlcMethods } from './src/mmlc-controller.js';
import { terminalMethods } from './src/terminal.js';
import { MMLC_ENTRY, isMmlc } from './src/mmlc.js';
import { MODULE_ID, VERSION, assert, amount, normAmount, hash, stable, clone, uid, key, importBook, createPower, upgradeResources, chatHashes, historyChanged, continuesMessage, storyText, narrativeMessages, builtInOperations, normalizeOperation, applyOperation, parseJSON, extractPanelBalances, validateState, setAssetRemoved } from './src/core.js';
import { getContext, getSettings, getApiKey, saveSettings, getConnectionProfiles, saveConnectionProfile, applyConnectionProfile, deleteConnectionProfile, resolveAccount, events, scope, worldInfoNames, loadBook, ChatStore, installInjection, verifyRoleSaved, verifyReceiptSaved } from './src/host.js';
import { ModelConnection, operationPrompt, reconcilePrompt, roleMappingPrompt, endpoints, chooseListedModel } from './src/model.js';
import { queueAction, unsettledNarrative } from './src/narrative.js';
import { narrativeMethods } from './src/narrative-controller.js';
import { assertProfileRegistration } from './src/management-profiles.js';
import { workflowMethods } from './src/workflow.js';
import { managementMethods } from './src/management.js';
import { archiveMethods } from './src/archives.js';
import { archiveReviewMethods } from './src/archive-review.js';
import { archiveMemoryMethods } from './src/archive-memory.js';
import { playerHomeMethods } from './src/player-home.js';
import { WorkbenchUI } from './src/ui.js';
import { RoleBridge, COMMIT_KEY, at, bindingKey, suggestedBindings, validateRoleLink } from './src/mvu.js';

export class WukuApp {
  constructor() {
    this.settings = getSettings(); this.apiKey = getApiKey(); this.store = new ChatStore(); this.plans = []; this.selected = null; this.powerId = null; this.busy = false; this.committing = false; this.mainBusy = false; this.controller = null; this.pendingSync = null; this.restoreCandidate = null; this.pendingManagement = null; this.managementDraft = null; this.adapterDraft = null; this.archiveDraft = null; this.pendingArchiveReview = null; this.memoryDraft = null; this.memoryAttempt = null; this.manualStoryDraft = null; this.workflowDraft = null; this.currentKey = null;
    this.settings.catalog = withBuiltinCatalog(this.settings.catalog);
    this.model = new ModelConnection({ context: getContext, settings: () => this.settings, getKey: () => this.apiKey });
    this.chatHooks = []; this.destroyed = false;
    this.runtimeLog=new RuntimeLog({scope:()=>{try{return scope(getContext()).key;}catch{return getContext()?.userHandle?'user:'+hash(getContext().userHandle):'';}},secret:()=>[this.apiKey,...(this.requestSecrets||[]),...accountSecrets()],version:VERSION});
    this.store.onPersistence = report => {
      if (scope(getContext()).key !== report.chatKey) return;
      const ticket = this.runtimeLog.begin('档案保存诊断');
      const { chatKey, ...details } = report;
      this.runtimeLog.step(ticket, '保存结果', details);
      this.runtimeLog.finish(ticket, report.verified ? '成功' : report.local ? '部分完成' : '失败');
    };
    this.role = new RoleBridge(); this.roleDraft = null; this.roleError = ''; this.roleHooks = null;
  }
  async start() {
    assert(!this.destroyed, '已释放的实例不能重新启动，请创建新实例');
    assert(!document.getElementById('wjwk-root'), '操作台已经存在');
    try {
      this.ui = new WorkbenchUI({ action: (name, data) => this.action(name, data), settings: () => this.settings });
      this.bridge = installInjection({ store: this.store, injectionChat:()=>this.memoryContextChat(), onRequest: evidence => { this.observeMemoryRequest(evidence); this.observeCreationRequest(evidence); this.observeTerminalRequest(evidence); }, onStatus: message => { this.bridgeStatus = message; }, extraInjection: state => this.roleInjection(state) + this.narrativeInjection(state) + this.memoryInjection(state) + this.terminalInjection(state) + this.creationInjection(state) });
      this.storeListener = () => this.refresh(); this.store.listeners.add(this.storeListener);
      this.attachChatHooks();
      this.refresh();
      if (this.currentKey) {
        this.prepareResources().catch(error => this.notice(error.message, true));
        this.scheduleRoleRead();
      }
    } catch (error) { this.destroy(); throw error; }
  }
  detachChatHooks() {
    for (const cleanup of this.chatHooks.splice(0)) cleanup();
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resetChatTransient();
    this.detachChatHooks(); this.roleHooks?.cleanup(); this.roleHooks = null;
    this.bridge?.cleanup?.(); this.store.listeners.delete(this.storeListener);
    this.ui?.destroy?.();
    const flag = `${MODULE_ID}_instance`;
    if (globalThis[flag] === this) delete globalThis[flag];
  }
  attachChatHooks() {
    if (this.destroyed) return;
    this.detachChatHooks();
    const { source, types } = events(getContext());
    const listen = (name, handler) => {
      if (!source?.on || !types[name]) return;
      const event = types[name], guarded = (...args) => { if (!this.destroyed) return handler(...args); };
      source.on(event, guarded); this.chatHooks.push(() => source.removeListener?.(event, guarded));
    };
    listen('CHAT_CHANGED', () => { this.refresh({ chatChanged: true }); if (!this.currentKey) return; this.prepareResources().then(() => this.scheduleRoleRead()).catch(error => this.notice(error.message, true)); });
    // ST emits STARTED even when a slash command consumes the input. Those
    // paths may never emit ENDED; AFTER_COMMANDS means real generation began.
    const generationStart = types.GENERATION_AFTER_COMMANDS ? 'GENERATION_AFTER_COMMANDS' : 'GENERATION_STARTED';
    listen(generationStart, async (type, _options, dryRun) => {
      if (dryRun) return; this.narrativeGenerationType = type; this.beginArchiveMemory(type); this.beginTerminal(type); this.beginCreation(type);
      if (type === 'quiet') return;
      if (type === 'continue') {
        const snapshot = this.contextSnapshot(), index = snapshot.ctx.chat.length - 1, floor = snapshot.ctx.chat[index];
        if (floor && !snapshot.state.roleWrites?.some(w => w.status === 'pending')) this.continuation ||= { chatKey: snapshot.chatKey, stateId: snapshot.state.id, hashes: snapshot.hashes, index, floor, before: clone({ mes: floor.mes ?? floor.content ?? '', name: floor.name || '', is_user: Boolean(floor.is_user), is_system: Boolean(floor.is_system), swipe_id: floor.swipe_id ?? 0 }) };
        if (this.continuation) this.continuation.ready = false;
      }
      this.mainBusy = true; await this.beginNarrative(type); this.refresh();
    });
    listen('GENERATION_STOPPED', async () => { this.finishMemoryRequest('stopped'); this.creationAttempt=null; this.terminalAttempt = null; this.memoryAttempt = null; this.mainBusy = false; if (this.continuation) this.continuation.ready = true; await this.stopNarrative(); await this.cleanupStoryRecords().catch(e=>this.notice(`旧分支清理未提交：${e.message}`,true)); this.refresh(); this.scheduleRoleRead(); });
    listen('GENERATION_ENDED', async () => { this.finishMemoryRequest('ended'); if(this.creationAttempt)this.creationAttempt.ended=true; this.mainBusy = false; await this.completeCreation(); if(this.terminalAttempt){this.terminalAttempt.ended=true;await this.completeTerminal();} if (this.memoryAttempt && this.memoryGenerationType !== 'quiet') { this.memoryAttempt.ended = true; if (this.memoryAttempt.plan?.packet) await this.completeArchiveMemory().catch(e => this.notice(`正文记忆带入记录未保存：${e.message}`, true)); else this.completeArchiveMemory().catch(e => this.notice(`正文记忆带入记录未保存：${e.message}`, true)); } if (this.narrativeAttempt) { this.narrativeAttempt.ended = true; await this.completeNarrative(); } await this.cleanupStoryRecords().catch(e=>this.notice(`旧分支清理未提交：${e.message}`,true)); this.refresh(); this.scheduleRoleRead(); this.schedulePlayerReview(this.narrativeGenerationType); if (this.settings.autoSync && this.settings.mode !== 'off') this.scheduleSync(); });
    for (const name of ['MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED']) listen(name, async () => { this.continuation = null; await this.cleanupStoryRecords().catch(e=>this.notice(`旧分支清理未提交：${e.message}`,true)); this.refresh(); this.scheduleRoleRead(); });
    listen('MESSAGE_RECEIVED', () => { this.refresh(); this.scheduleRoleRead(); });
    listen('CHARACTER_MESSAGE_RENDERED', async (index, type) => { if(this.creationAttempt&&(!type||type===this.creationAttempt.type)){this.creationAttempt.rendered=Number(index);await this.completeCreation();} if(this.terminalAttempt&&(!type||type===this.terminalAttempt.type)){this.terminalAttempt.rendered=Number(index);await this.completeTerminal();} if (this.memoryAttempt && (!type || type === this.memoryAttempt.type)) { this.memoryAttempt.rendered = Number(index); if (this.memoryAttempt.plan?.packet) await this.completeArchiveMemory().catch(e => this.notice(`正文记忆带入记录未保存：${e.message}`, true)); else this.completeArchiveMemory().catch(e => this.notice(`正文记忆带入记录未保存：${e.message}`, true)); } if (this.continuation?.index === Number(index) && (type === 'continue' || !type && !this.mainBusy)) this.continuation.ready = true; if (this.narrativeAttempt && (!type || ['normal', 'continue', 'regenerate', 'swipe'].includes(type))) { this.narrativeAttempt.rendered = Number(index); await this.completeNarrative(); } await this.cleanupStoryRecords().catch(e=>this.notice(`旧分支清理未提交：${e.message}`,true)); this.refresh(); this.scheduleRoleRead(); this.schedulePlayerReview(type); });
  }
  contextSnapshot() { const ctx = getContext(); return { ctx, state: this.store.read(), hashes: chatHashes(ctx.chat), chatKey: scope(ctx).key }; }
  names(ctx = getContext()) { return { user: ctx?.name1 || '{{user}}', character: ctx?.name2 || '{{char}}' }; }
  bridgeAvailable() { const api = getContext()?.mainApi; return api === 'openai' ? this.bridge.chat : api ? this.bridge.plain : this.bridge.available; }
  refresh({ chatChanged = false } = {}) {
    if (this.destroyed) return;
    let snapshot, error = '';
    try { snapshot = this.contextSnapshot(); } catch (e) { error = e.message; }
    const state = snapshot?.state || null;
    let noChat = false; try { scope(getContext()); } catch { noChat = true; }
    if (this.pendingArchiveReview && (this.pendingArchiveReview.captured.revision !== state?.revision || this.pendingArchiveReview.captured.stateId !== state?.id)) this.pendingArchiveReview = null;
    if (this.pendingManagement && (this.pendingManagement.captured.revision !== state?.revision || this.pendingManagement.captured.stateId !== state?.id || this.pendingManagement.contextHash !== hash(stable(snapshot?.hashes || [])))) this.pendingManagement = null;
    if (chatChanged || snapshot?.chatKey !== this.currentKey) {
      this.resetChatTransient(); this.currentKey = snapshot?.chatKey;
      const available=Object.values(state?.powers||{}).filter(p=>powerSpace(p)==='wuku'||p.active);
      this.ui.space=available.some(p=>powerSpace(p)==='wuku')?'wuku':powerSpace(available[0]);
      this.ui.taishiSection=null;this.ui.mmlcSection=null;
    }
    this.restoreReviewCheckpoint(snapshot);
    if(this.pendingArchiveReview&&!this.busy&&!this.archiveReviewJob)this.saveReviewCheckpoint();
    if (this.ui.space !== 'wuku' && !moduleEnabled(state,this.ui.space)) this.ui.space='wuku';
    const visiblePowers = Object.values(state?.powers || {}).filter(p => powerSpace(p) === (this.ui.space || 'wuku'));
    let power = visiblePowers.find(p => p.id === this.powerId); if (!power) { power = visiblePowers[0]; this.powerId = power?.id; }
    const contextHash = snapshot ? hash(stable(snapshot.hashes)) : '';
    this.plans = this.plans.filter(op => op.stateId === state?.id && op.baseRevision === state?.revision && op.contextHash === contextHash && op.powerId === power?.id && op.ruleVersion === power?.ruleVersion);
    const fixed = power?.active ? builtInOperations(power, state, contextHash).map(op => ({ ...op, builtIn: true })) : [];
    // Keep the same operation identity until something relevant changes; double clicks share one receipt.
    const fixedKey = `${state?.id}:${state?.revision}:${contextHash}:${power?.id}:${power?.ruleVersion}:${power?.active}`;
    if (fixedKey !== this.fixedKey) { this.fixed = fixed; this.fixedKey = fixedKey; }
    const operations = [...(this.fixed || []), ...this.plans];
    this.selected = operations.find(op => op.id === this.selected?.id) || null;
    const mismatch = false;
    let roleManagement = null;
    if (state?.roleLink && this.ui.tab === 'management') {
      try {
        const role = this.role.read(state.roleLink), latest = snapshot.ctx.chat.findLastIndex(m => !m.is_user && !m.is_system);
        assert(role.capture.option.type === 'chat' || role.capture.option.message_id >= latest, '角色变量仍在更新，当前不展示旧快照');
        roleManagement = { roots: state.roleLink.roots.map(path => ({ path, value: at(role.stat, path) })), error: '' };
      } catch (e) { roleManagement = { roots: [], error: e.message }; }
    }
    this.ui.render({ noChat, chatKey: snapshot?.chatKey, memoryDiagnostic: snapshot ? this.memoryDiagnostics(snapshot) : null, manualStoryBusy: this.busy || this.mainBusy || this.committing || Boolean(this.narrativeLaunching), roleManagement, managementChat: snapshot?.ctx.chat || [], archiveAutoStatus: this.archiveAutoStatus || {}, pendingArchiveReview: this.pendingArchiveReview, state, power, selected: this.selected, operations, busy: this.busy || this.mainBusy || this.committing || this.narrativeLaunching || Boolean(this.continuation), querying: this.busy, committing: this.committing, continuing: Boolean(this.continuation), settings: this.settings, save: this.store.lastSave?.chatKey === snapshot?.chatKey ? this.store.lastSave : null, historyMismatch: mismatch, bridge: this.bridgeAvailable(), sceneCandidates: state && this.sceneCandidates && this.sceneCandidates.powerId === power?.id && this.sceneCandidates.revision === state?.revision && this.sceneCandidates.contextHash === contextHash ? this.sceneCandidates.actions : [], error, roleError: this.roleError });
    if (!state) { clearTimeout(this.roleTimer); return; }
    this.resumePlayerReview();
    if (this.roleReadPending && !this.busy && !this.mainBusy && !this.committing) this.scheduleRoleRead();
  }
  notice(message, error = false) { if (this.destroyed) return; this.ui.setNotice(message, error); if (error) this.aiActivity?.problem(message); }
  ensureStable({ model = false } = {}) {
    assert(!this.destroyed, '插件实例已释放');
    const snapshot = this.contextSnapshot();
    assert(!this.committing, '正在提交账目，请稍候');
    assert(!this.mainBusy, '主叙事正在生成，请等它结束后再操作');
    assert(!this.continuation, '正在承接续写，请稍候');

    assert(!(snapshot.state.roleWrites || []).some(w => w.status === 'pending'), '有一笔角色写回待完成，请先重试该笔写回或在角色接入页解除接入');
    if (model) assert(this.settings.mode !== 'off', '请先自行启用异步模型连接');
    return snapshot;
  }
  resetChatTransient() {
    this.cancel();
    for (const name of ['playerReviewTimer', 'roleTimer', 'syncTimer']) {
      clearTimeout(this[name]); this[name] = null;
    }
    for (const name of [
      'playerAutoQueued', 'lastPlayerAuto', 'narrativeAttempt', 'sceneCandidates',
      'continuation', 'roleDraft', 'powerId', 'pendingSync', 'restoreCandidate',
      'pendingManagement', 'managementDraft', 'adapterDraft', 'archiveDraft',
      'pendingArchiveReview', 'memoryDraft', 'memoryAttempt', 'manualStoryDraft',
      'logTask', 'referenceDraft', 'referenceLast', 'archiveToolRequest', 'archiveToolDraft', 'workflowDraft', 'creationAttempt', 'creationDraft', 'creationRequest', 'taishiDraft', 'taishiControlDraft', 'taishiWorkflowDraft', 'taishiPeopleDraft', 'taishiEvolutionDraft', 'taishiBuildDraft', 'outboxCapture',
      'terminalAttempt', 'terminalDraft', 'terminalRequest', 'selected',
    ]) if (name in this) this[name] = null;
    this.mainBusy = false; this.roleReadPending = false; this.roleError = '';
    this.archiveAutoStatus = {}; this.plans = [];
    this.ui?.closeDialog();
  }
  cancel() {
    if (this.controller) { this.controller.abort(); this.controller = null; this.busy = false; }
    this.playerAutoRunning = null;
    if (this.archiveReviewJob) { this.archiveReviewJob.cancelled = true; this.archiveReviewJob = null; }
    if(this.manualBatchRun)this.manualBatchRun.stopped=true;
    this.aiActivity?.cancel(); this.modelListController?.abort();
  }
  async query(prompt, snapshot, { task = 'general', taishiWorkflow = false, referenceBatch = null, workflowResume = null, workflowRetryRole = null, validateWorkflowChanges = () => [], workflowOnAttempt = () => {}, workflowOnCheckpoint = () => {} } = {}) {
    assert(!this.destroyed, '插件实例已释放');
    assert(!this.busy, '已有查询进行中');
    const connectionPlan = resolveTaskConnectionPlan(task,getContext(),this.settings,this.apiKey), connection=connectionPlan[0];this.requestSecrets=[this.apiKey,...accountSecrets()];
    const rolePlans=taishiWorkflow?Object.fromEntries((workflowRetryRole?[workflowRetryRole]:TAISHI_ROLES).map(role=>[role,resolveTaskConnectionPlan(role,getContext(),this.settings,this.apiKey)])):null;
    const roleConnections=rolePlans?Object.fromEntries(Object.entries(rolePlans).map(([role,plan])=>[role,plan[0]])):null;
    if(!taishiWorkflow)this.aiActivity?.connection(connection);
    const controller = new AbortController(); this.controller = controller; this.busy = true; this.ui.notice = null; this.refresh();
    const captured = { chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision };
    const archiveScope=prompt.archivePowerId?stable(archiveRequestScope(snapshot.state,prompt.archivePowerId)):null;
    const checkCapture=()=>{
      try{this.store.assertCapture(captured);}catch(error){
        const latest=this.store.capture(),state=this.store.read();
        if(!archiveScope||latest.chatKey!==captured.chatKey||latest.stateId!==captured.stateId||stable(archiveRequestScope(state,prompt.archivePowerId))!==archiveScope)throw error;
        captured.revision=latest.revision;snapshot.state=state;
        this.runtimeLog?.step(this.logTask,'请求状态核对',{unrelatedRevisionRebased:true,revision:latest.revision});
      }
    };
    const contextHash = hash(stable(snapshot.hashes));
    let referenceReport,rawResponse,requestStage='preflight';const logId=this.logTask;
    this.runtimeLog?.step(logId,'准备请求',{task,profile:connection.profileName,mode:connection.settings.mode,model:connection.settings.model||'酒馆当前连接',revision:captured.revision});
    try {
      this.aiActivity?.phase('准备附加世界书');
      assert(!referenceBatch||prompt.setupReferences||prompt.archiveRepair||prompt.personReferences&&task==='creation','所选世界书参考只能用于底稿、眷属录入或候选修复任务');
      const reference=referenceBatch||(snapshot.state.aiWorldbooks?await readReferencePacket(snapshot.state.aiWorldbooks,{ctx:snapshot.ctx,signal:controller.signal}):{payload:{books:[]},summary:[],characters:0,fingerprint:""});
      if(controller.signal.aborted||this.controller!==controller)throw new DOMException('查询已取消','AbortError');checkCapture();
      assert(snapshot.referenceOnly || hash(stable(chatHashes(getContext().chat)))===contextHash,'准备世界书期间剧情已变化，请重试');
      if(prompt.setupReferences)assert(reference.payload.books.some(b=>b.entries.length),'请先选择并保存个人世界书条目；尚未调用模型');
      const actualPrompt=attachReferences(prompt,reference);
      referenceReport={books:reference.summary,characters:reference.characters,fingerprint:reference.fingerprint,at:Date.now(),status:'发送中'};this.referenceLast=referenceReport;
      this.runtimeLog?.step(logId,'发送请求',{systemCharacters:String(actualPrompt.system||'').length,userCharacters:String(actualPrompt.user||'').length,inputCharacters:prompt.inputCharacters||{},references:reference.summary});
      let input;try{input=JSON.parse(prompt.user);}catch{}
      const carried=input?.selectedRules||[input?.selectedRule||{id:input?.ownership?.currentPower?.id||snapshot.state.powers[this.powerId]?.id,name:input?.ownership?.currentPower?.name||snapshot.state.powers[this.powerId]?.name,fullText:input?.rules}];
      this.runtimeLog?.step(logId,'携带规则',{rules:carried.filter(p=>typeof p?.fullText==='string').map(p=>({id:p.id,name:p.name,characters:p.fullText.length})),references:reference.summary,referenceCharacters:reference.characters,scope:'插件主动携带的规则与所选参考；不代表酒馆主正文的全部世界书'});
      this.runtimeLog?.capture(logId,'完整请求',actualPrompt);
      this.aiActivity?.phase('等待 AI 回复');
      const send=async(p,plan)=>{const wire=databasePromptTrial(p,Boolean(prompt.databasePromptTrial));if(wire.messages){this.runtimeLog?.step(logId,'数据库预设试验',{presetId:DATABASE_PROMPT_TRIAL_ID,messages:wire.messages.length,characters:wire.messages.reduce((n,m)=>n+m.content.length,0)});this.runtimeLog?.capture(logId,'实际多消息请求',wire);}return requestWithFallback(plan,selected=>this.model.request(wire,{signal:controller.signal,connection:selected,onResponse:diagnostic=>this.runtimeLog?.step(logId,'接口响应诊断',{task:selected.task,attempt:selected.attempt,...diagnostic})}),{
        signal:controller.signal,check:()=>{if(this.controller!==controller)throw new DOMException('查询已取消','AbortError');checkCapture();assert(snapshot.referenceOnly||hash(stable(chatHashes(getContext().chat)))===contextHash,'查询期间剧情发生变化，本次旧结果已丢弃');},
        onAttempt:selected=>{this.aiActivity?.connection(selected);this.aiActivity?.phase(selected.attempt>1?'等待备用 API 回复':'等待 AI 回复');this.runtimeLog?.step(logId,'API尝试',{task:selected.task,attempt:selected.attempt,limit:selected.attemptLimit,profile:selected.profileName,model:selected.settings.mode==='st'?'酒馆当前连接':selected.settings.model});},
        onFailure:(selected,error)=>this.runtimeLog?.step(logId,'API尝试失败',{task:selected.task,attempt:selected.attempt,kind:error.transportKind||'non-transport',httpStatus:error.httpStatus}),
        onSwitch:info=>this.runtimeLog?.step(logId,'切换备用API',{task:info.from.task,from:info.from.profileName,to:info.to.profileName,kind:info.kind,httpStatus:info.httpStatus})
      });};
      const invoke=async(p,role)=>{
        if(controller.signal.aborted||this.controller!==controller)throw new DOMException('查询已取消','AbortError');
        checkCapture();
        const selected=roleConnections?.[role]||connection;
        this.aiActivity?.connection(selected);
        this.runtimeLog?.step(logId,'专职请求',{task:role,profile:selected.profileName,model:selected.settings.model||'酒馆当前连接'});
        this.runtimeLog?.capture(logId,'专职请求 '+role,p);
        const reply=await send(p,rolePlans?.[role]||connectionPlan);
        if(controller.signal.aborted||this.controller!==controller)throw new DOMException('查询已取消','AbortError');
        checkCapture();
        this.runtimeLog?.capture(logId,'专职返回 '+role,reply);
        try{return parseJSON(reply);}catch(error){error.requestStage='response';this.runtimeLog?.failureResponse(logId,reply,role);if(error.jsonDiagnostic)this.runtimeLog?.step(logId,'JSON诊断',{...error.jsonDiagnostic,task:role});throw error;}
      };
      requestStage='transport';
      const raw = taishiWorkflow?null:await send(actualPrompt,connectionPlan);
      requestStage='response';rawResponse=raw;
      if(!taishiWorkflow)this.runtimeLog?.capture(logId,'原始返回',raw);
      const data = taishiWorkflow?await runTaishiWorkflow(actualPrompt,invoke,{signal:controller.signal,parallel:!workflowRetryRole&&!TAISHI_ROLES.slice(0,2).some(role=>rolePlans[role].some(c=>c.settings.mode==='st')),resume:workflowResume,retryRole:workflowRetryRole,validateChanges:validateWorkflowChanges,onAttempt:workflowOnAttempt,onCheckpoint:state=>workflowOnCheckpoint(state,reference.fingerprint),onStage:stage=>this.aiActivity?.phase(stage)}):parseJSON(raw);
      referenceReport.status='已返回';
      this.runtimeLog?.step(logId,'模型已返回',{characters:String(raw).length});
      if (this.controller === controller) this.aiActivity?.phase('整理与校验结果');
      if (controller.signal.aborted || this.controller !== controller) throw new DOMException('查询已取消', 'AbortError'); checkCapture();
      assert(snapshot.referenceOnly || hash(stable(chatHashes(getContext().chat))) === contextHash, '查询期间剧情发生变化，本次旧结果已丢弃');
      if (snapshot.roleView) this.role.assertCapture(snapshot.roleView.capture, snapshot.state.roleLink);
      return { data, captured, contextHash, logId,referenceFingerprint:reference.fingerprint,...(prompt.setupReferences||prompt.personReferences?{referencePacket:reference}:{}) };
    } catch(error){if(['查询期间剧情发生变化，本次旧结果已丢弃','准备世界书期间剧情已变化，请重试','档案已经变化，本次旧结果已丢弃','聊天已经切换，本次结果不会写入其他聊天'].includes(error.message)){error.name='ContextChangedError';error.requestStage='context';}error.requestStage ||= requestStage;if(error.jsonDiagnostic&&rawResponse!==undefined){this.runtimeLog?.failureResponse(logId,rawResponse,'',error.jsonDiagnostic);if(prompt.archivePowerId&&!prompt.setupReferences&&!prompt.personReferences&&!taishiWorkflow&&typeof rawResponse==='string'&&rawResponse.length<=120000)error.archiveResponseFailure={raw:rawResponse,error:error.message,diagnostic:error.jsonDiagnostic,contract:prompt.archiveSchema,captured:{...captured},contextHash,referenceFingerprint:referenceReport?.fingerprint||''};}if(error.jsonDiagnostic)this.runtimeLog?.step(logId,'JSON诊断',error.jsonDiagnostic);this.runtimeLog?.step(logId,'请求失败',{stage:error.requestStage,error:error.message});if(referenceReport)referenceReport.status=controller.signal.aborted?'已取消':'请求或校验失败';throw error;} finally { if (this.controller === controller) { this.controller = null; this.busy = false; this.refresh(); } }
  }
  async manage() {
    let names = []; try { names = await worldInfoNames(); } catch { /* JSON import is always available. */ }
    let state; try { state = this.store.read(); } catch { /* Can still read a worldbook before opening chat. */ }
    this.ui.showManage(this.settings.catalog, names, { state, draft: this.roleDraft, error: this.roleError });
  }
  attachRoleHooks() {
    if (this.destroyed) return;
    const engine = this.role.engine(), { source } = events(getContext());
    if (!engine?.events || !source?.on || this.roleHooks?.engine === engine && this.roleHooks?.source === source) return;
    this.roleHooks?.cleanup();
    const handler = () => { this.scheduleRoleRead(); this.resumePlayerReview(); }, name = engine.events.VARIABLE_UPDATE_ENDED;
    if (name) source.on(name, handler);
    this.roleHooks = { engine, source, cleanup: () => { if (name) source.removeListener?.(name, handler); } };
  }
  scheduleRoleRead(attempt = 0) {
    if (this.destroyed) return;
    this.attachRoleHooks(); clearTimeout(this.roleTimer); this.roleReadPending = false;
    this.roleTimer = setTimeout(() => {
      if (this.busy || this.mainBusy || this.committing) { this.roleReadPending = true; return; }
      this.pullRoleBalances().catch(error => {
        this.roleError = error.message; this.refresh();
        if (attempt < 5 && /MVU 正在|角色变量仍在更新|续写仍在完成/.test(error.message)) this.scheduleRoleRead(attempt + 1);
      });
    }, attempt ? 600 : 200);
  }
  continuationMatches(snapshot) {
    const pending = this.continuation;
    return Boolean(pending && pending.chatKey === snapshot.chatKey && pending.stateId === snapshot.state.id && snapshot.ctx.chat.length >= pending.hashes.length && snapshot.ctx.chat[pending.index] === pending.floor && !historyChanged({ historyAnchor: pending.hashes.slice(0, pending.index) }, snapshot.hashes) && !historyChanged(snapshot.state, pending.hashes) && continuesMessage(pending.before, pending.floor));
  }
  async acceptContinuation() {
    if (!this.continuation || this.mainBusy) return;
    if (this.continuationWork) return this.continuationWork;
    const pending = this.continuation;
    const work = async () => {
      const snapshot = this.contextSnapshot();
      if (!this.continuationMatches(snapshot)) { if (this.continuation === pending) this.continuation = null; return; }
      const expected = hash(stable(snapshot.hashes));
      await this.store.transact(next => {
        assert(this.continuation === pending && !this.mainBusy && this.continuationMatches({ ...this.contextSnapshot(), state: next }) && hash(stable(chatHashes(getContext().chat))) === expected, '续写期间剧情又发生变化，请等待正文完成');
        if (next.historyAnchor.length > pending.index) next.historyAnchor[pending.index] = snapshot.hashes[pending.index];
        if (pending.index < next.syncCursor && !next.syncTail && storyText(pending.floor.mes ?? pending.floor.content ?? '') !== storyText(pending.before.mes)) next.syncTail = { index: pending.index, offset: storyText(pending.before.mes).length };
      }, { captured: { chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision }, facts: false });
      if (this.continuation === pending) this.continuation = null;
    };
    this.continuationWork = work();
    try { await this.continuationWork; } finally { this.continuationWork = null; this.refresh(); }
  }
  roleInjection(state) {
    if (!state.roleLink) return '';
    const pending = (state.roleWrites || []).filter(w => w.status === 'pending');
    if (pending.length) return `\n[武库角色写回待完成] 以下操作只在武库记账，尚未确认角色写回，不得描述为角色已掌握或再次扣款：${JSON.stringify(pending.map(w => ({ id: w.id, changes: w.changes })))}。先完成同一笔写回。`;
    try {
      const view = this.role.read(state.roleLink);
      const values = state.roleLink.roots.map(path => ({ path, value: at(view.stat, path) }));
      const text = JSON.stringify(values); assert(text.length <= 300000, '角色状态过长');
      return `\n[武库已接入角色 MVU] 当前变量事实：${text}\n武库回执中已写回的所得与投入已成立。按变量与所得的完整效力继续正文；不要再次扣款、重新添加同一条功法或将旧状态栏覆盖到当前变量。正常的新剧情变化仍按角色更新规则处理。`;
    } catch (error) { return `\n[武库角色状态未读到] ${error.message}。不要根据旧面板猜测角色变量或重复扣付武库已记账投入。`; }
  }
  async pullRoleBalances() {
    assert(!this.mainBusy, '主叙事正在生成，请等它结束后再读取余额');
    if (this.continuation) {
      assert(this.continuation.ready, '续写仍在完成，正文重绘后会自动读取当前余额');
      if (this.store.read().roleLink) this.role.runtime();
    }
    await this.acceptContinuation();
    const snapshot = this.contextSnapshot(), link = snapshot.state.roleLink;
    if (!link) return null;
    assert(!(snapshot.state.roleWrites || []).some(w => w.status === 'pending'), '角色写回待完成，暂不从旧角色余额覆盖已记账投入');
    const last = [...(snapshot.state.roleWrites || [])].reverse().find(w => w.status === 'applied' && w.capture.chatKey === snapshot.chatKey && w.capture.character === link.character);
    if (last) {
      // The ledger checkpoint is shared between tabs, whereas MVU floor data is
      // held by each tab. A stale tab must not refill a wallet from its old copy.
      let written; try { written = this.role.read(link, last.capture); } catch { /* Edited or swiped history is handled by explicit history接续. */ }
      if (written) assert(written.raw[COMMIT_KEY]?.[last.id] === last.afterStatHash, '当前页面角色变量未包含已完成的写回回执，请重新载入当前聊天以同步后再操作');
    }
    const view = this.role.read(link);
    if (link.scope === 'message') {
      const latestAssistant = snapshot.ctx.chat.findLastIndex(m => !m.is_user && !m.is_system);
      assert(view.capture.option.message_id >= latestAssistant, '角色变量仍在更新，完成后会自动读取当前余额');
    }
    const next = clone(snapshot.state), changes = this.role.balances(next, link, view);
    if (changes.length) await this.store.transact(state => {
      this.role.assertCapture(view.capture, link); const updated = this.role.balances(state, link, view);
      this.record(state, '读取角色当前余额', updated, 'role-read');
      state.historyAnchor = chatHashes(getContext().chat);
    }, { captured: { chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision } });
    this.roleError = ''; this.refresh(); return view;
  }
  roleSnapshot(snapshot) {
    if (snapshot.state.roleLink) { snapshot.roleView = this.role.read(snapshot.state.roleLink); snapshot.roleContract = this.role.contract(snapshot.state.roleLink, snapshot.roleView); }
    return snapshot;
  }
  async readRole() {
    assert(!this.busy && !this.mainBusy && !this.committing, '请等待当前生成或提交结束');
    try {
      const draft = await this.role.discover(), state = this.store.read(), saved = state.roleLink;
      draft.roots = saved?.character === draft.capture.character ? saved.roots.filter(p => at(draft.stat, p) !== undefined) : draft.roots;
      draft.bindings = { ...suggestedBindings(Object.values(state.powers), draft.fields, draft.roots), ...(saved?.character === draft.capture.character ? saved.bindings : {}) };
      draft.selectedRules = saved?.character === draft.capture.character ? saved.rules.map(r => r.id) : draft.rules.filter(r => r.enabledInBook).map(r => r.id);
      this.roleDraft = draft; this.roleError = ''; this.attachRoleHooks(); await this.manage();
      this.notice(`已读取 ${draft.characterName} 的 ${draft.fields.length} 个变量字段。核对规则、写回区域和余额绑定后保存接入。`);
    } catch (error) { this.roleDraft = null; this.roleError = error.message; await this.manage(); this.notice(error.message, true); }
  }
  async saveRole(data) {
    const snapshot = this.ensureStable(), draft = this.roleDraft; assert(draft, '请先读取当前角色'); this.role.assertCapture(draft.capture, null);
    const fd = new FormData(data.form), roots = fd.getAll('role-root'), ids = new Set(fd.getAll('role-rule'));
    const rules = draft.rules.filter(r => ids.has(r.id)).map(r => ({ id: r.id, name: r.name, book: r.book, content: r.content }));
    const bindings = {};
    for (const p of Object.values(snapshot.state.powers)) for (const r of Object.values(p.resources)) {
      const value = data.values[`role-balance:${p.id}:${r.id}`]; if (!value) continue;
      assert(draft.fields.some(f => f.path === value && f.numeric), '余额只能绑定实际存在的数值字段');
      assert(!Object.values(bindings).includes(value), '同一角色余额不能重复绑定给两个武库资源'); bindings[bindingKey(p.id, r.id)] = value;
    }
    for (const path of roots) assert(draft.fields.some(f => f.path === path), '写回区域不存在');
    const link = { enabled: true, character: draft.capture.character, scope: draft.capture.option.type, roots, rules, ruleVersion: hash(stable(rules)), bindings };
    validateRoleLink(link); this.role.contract(link, draft);
    await this.store.transact(next => { this.role.assertCapture(draft.capture, null); next.roleLink = link; const changes = this.role.balances(next, link, draft); this.record(next, '接入角色 MVU 状态', [`角色：${draft.characterName}`, `${rules.length} 条规则；${roots.length} 个写回区域；${Object.keys(bindings).length} 项余额绑定`, ...changes], 'setup'); }, { captured: { chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision } });
    this.plans = []; this.roleError = ''; this.ui.closeDialog(); this.refresh(); this.notice('角色状态已接入，绑定余额已读入。下一次生成将同时预览角色变量变化。');
  }
  async makeRolePlan(operation, raw, snapshot) {
    const simulated = clone(snapshot.state); applyOperation(simulated, operation, operation.contextHash, snapshot.hashes);
    return this.role.prepare({ updates: raw.variableUpdates || [], roleRuleQuote: raw.roleRuleQuote || '', roleChecks: raw.roleChecks, operation, link: snapshot.state.roleLink, view: snapshot.roleView, resultingPower: simulated.powers[operation.powerId] });
  }
  async prepareSelectedRole() {
    await this.pullRoleBalances();
    const snapshot = this.roleSnapshot(this.ensureStable({ model: true })), op = this.selected; assert(snapshot.roleView && op, '请接入角色并选择操作');
    const { data } = await this.query(roleMappingPrompt({ operation: op, power: snapshot.state.powers[op.powerId], roleContract: snapshot.roleContract }), snapshot);
    this.busy = true; this.refresh();
    try { op.rolePlan = await this.makeRolePlan(op, data, snapshot); this.store.assertCapture({ chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision }); }
    finally { this.busy = false; this.refresh(); }
    this.notice('角色写回预览已通过当前 MVU 校验；核对后确认执行。');
  }
  async finishRoleWrite(id, prechecked = null) {
    const identity = scope(getContext()).key;
    const work = () => { assert(scope(getContext()).key === identity, '聊天已切换'); return this.finishRoleWriteUnlocked(id, prechecked); };
    return this.store.lockManager?.request ? this.store.lockManager.request(`${MODULE_ID}:role:${identity}`, work) : work();
  }
  async finishRoleWriteUnlocked(id, prechecked = null) {
    const snapshot = this.contextSnapshot(), write = snapshot.state.roleWrites?.find(w => w.id === id);
    assert(write?.status === 'pending' && snapshot.state.roleLink, '没有可重试的角色写回');
    try {
      await this.role.write(write, snapshot.state.roleLink, prechecked);
      const observedHash = this.role.read(snapshot.state.roleLink, write.capture).capture.statHash;
      // MVU replacement can be a debounced in-memory write. Save the whole chat
      // and verify the actual floor variables before acknowledging the outbox.
      await this.store.transact(next => { const row = next.roleWrites.find(w => w.id === id); assert(row?.status === 'pending', '写回记录已改变'); row.lastSaveAttempt = uid('save'); }, { captured: { chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision }, facts: false });
      await verifyRoleSaved(write.capture, write.afterStatHash, write.id, { context: this.store.context, fetchImpl: this.store.fetchImpl, observedHash });
      await this.store.transact(next => {
        const row = next.roleWrites.find(w => w.id === id); assert(row?.status === 'pending', '写回记录已改变'); row.status = 'applied'; row.appliedAt = Date.now();
        const receipt = next.transactions.find(t => t.id === id); if (receipt) receipt.roleWrite = 'applied';
      }, { captured: { chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision }, facts: false });
      // Receipt failure comes after acknowledged MVU persistence. It must never
      // turn an applied write back into a misleading "retry variable update".
      const recorded = await this.appendRoleReceipt(id).catch(error => ({ ok: false, error: error.message }));
      let redrawn = false; try { redrawn = await this.role.redraw(write.capture, recorded.target); } catch { /* A display failure must not retry the settlement. */ }
      this.roleError = ''; this.notice(`已写回角色并读回核对。${recorded.ok ? '本次变化已并入状态栏简报，旧简报已收起。' : `状态栏简报待补充：${recorded.error}。角色变量不会再执行。`}${redrawn ? '相关楼层显示已刷新。' : '可重绘状态栏查看。'}`, !recorded.ok);
      return true;
    } catch (error) { this.roleError = error.message; this.notice(`武库已记账，角色写回待完成：${error.message}。请重试这笔写回，不要重新执行或再次扣费。`, true); return false; }
  }
  async appendRoleReceipt(id) {
    const snapshot = this.contextSnapshot(), write = snapshot.state.roleWrites?.find(w => w.id === id), receipt = snapshot.state.transactions.find(t => t.id === id);
    assert(write?.status === 'applied' && receipt, '角色写回尚未确认成功，不能生成完成回执');
    const related = snapshot.state.roleWrites.filter(w => w.status === 'applied' && w.capture.chatKey === snapshot.chatKey && w.capture.character === write.capture.character && snapshot.state.transactions.find(t => t.id === w.id)?.powerId === receipt.powerId);
    assert(related.at(-1)?.id === id, '消息只保留该词条最近一笔简报；请整理最近一笔，历史变化仍在武库回执中');
    const previousIds = related.filter(w => w.id !== id).map(w => w.id);
    const previousTargets = related.filter(w => w.id !== id && w.receiptTarget).map(w => ({ id: w.id, messageId: w.receiptTarget.messageId, swipeId: w.receiptTarget.swipeId }));
    const captured = { chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision }; let target;
    try {
      target = await this.role.appendReceipt(write, receipt.label, { powerName: snapshot.state.powers[receipt.powerId]?.name || '万界武库', previousIds, previousTargets });
      await this.store.transact(next => { next.roleWrites.find(w => w.id === id).receiptSaveAttempt = uid('save'); }, { captured, facts: false });
      await verifyReceiptSaved(write.capture, target, id, { context: this.store.context, fetchImpl: this.store.fetchImpl });
      await this.store.transact(next => {
        const row = next.roleWrites.find(w => w.id === id); row.receiptStatus = 'written'; row.receiptFormat = 'status'; row.receiptTarget = target; delete row.receiptError;
        for (const old of next.roleWrites.filter(w => previousIds.includes(w.id))) { old.receiptStatus = 'archived'; old.receiptFormat = 'status'; delete old.receiptError; }
      }, { captured, facts: false });
      return { ok: true, target };
    } catch (error) {
      try { await this.store.transact(next => { const row = next.roleWrites.find(w => w.id === id); if (row) { row.receiptStatus = 'pending'; row.receiptError = error.message; } }, { captured, facts: false }); } catch { /* Keep the applied MVU state even if receipt metadata cannot save. */ }
      return { ok: false, error: error.message };
    }
  }
  async catalog(entries) {
    const bookNames = new Set(entries.map(e => e.book));
    this.settings.catalog = withBuiltinCatalog([...this.settings.catalog.filter(e => !bookNames.has(e.book)), ...entries]);
    await saveSettings(this.settings); await this.manage(); this.notice(`已读取 ${entries.length} 条完整正文，请选择主词条和附加约束。`);
  }
  async removeReadBook(name) {
    assert(!this.busy && !this.mainBusy && !this.committing, '请等待当前操作完成后移除世界书');
    const next = {...this.settings, catalog: removeCatalogBook(this.settings.catalog, name)};
    await saveSettings(next);
    this.settings = next;
    await this.manage();
    this.notice('已移除插件中读取的世界书；酒馆原书、已接入金手指及档案保留，需要时可重新读取。');
  }
  async prepareResources() {
    let captured; try { captured = this.store.capture(); } catch { return; }
    return this.store.transact(next => {
      const library=this.associationLibrary();
      for (const p of Object.values(next.powers)) { upgradeBuiltinPower(p); upgradeResources(p,this.settings.catalog); }
      autoAssociateAdapters(Object.values(next.powers),library);
      const hashes = chatHashes(getContext().chat);
      if (!historyChanged(next, hashes)) next.historyAnchor = hashes.slice(0, next.historyAnchor.length);
    }, { captured });
  }
  async openBaseline() {
    assert(!this.busy && !this.mainBusy && !this.committing, '请等待当前请求结束');
    const id = this.powerId, captured = this.store.capture();
    await this.store.transact(next => { assert(next.powers[id], '请先接入词条'); upgradeResources(next.powers[id], this.settings.catalog); }, { captured });
    const p = this.store.read().powers[id]; this.baselineCapture = this.store.capture(); this.baselinePowerId = id;
    this.ui.showBaseline(p, extractPanelBalances(p, getContext().chat), this.store.read().roleLink);
  }
  async openBalances() {
    const captured = this.store.capture();
    await this.store.transact(next => { for (const p of Object.values(next.powers)) upgradeResources(p, this.settings.catalog); }, { captured });
    const powers = Object.values(this.store.read().powers); this.balancesCapture = this.store.capture();
    this.ui.showBalances(powers, Object.fromEntries(powers.map(p => [p.id, extractPanelBalances(p, getContext().chat)])), this.store.read().roleLink);
  }
  async fetchModels({ values, form }) {
    assert(values.mode === 'custom', '获取列表用于独立 API 连接；酒馆连接沿用主界面模型');
    this.modelListController?.abort(); const controller = new AbortController(); this.modelListController = controller;
    const baseUrl = String(values.baseUrl || '').trim(), apiKey = connectionKey(values,this.apiKey);
    this.ui.setModelLoading(true, '正在读取接口提供的模型列表…');
    try {
      const ids = await this.model.listModels({ baseUrl, apiKey }, { signal: controller.signal });
      if (controller.signal.aborted || !form.isConnected || this.modelListController !== controller) return;
      const now = Object.fromEntries(new FormData(form));
      const currentKey = connectionKey(now,this.apiKey);
      assert(String(now.baseUrl || '').trim() === baseUrl && currentKey === apiKey && now.mode === 'custom', '连接信息已变化，请重新获取模型列表');
      const selected = chooseListedModel(ids, now.model || ''); this.ui.setModels(ids, selected);
      this.ui.setModelLoading(false, `已获取 ${ids.length} 个模型。${selected ? `当前选择：${selected}` : '请选择可用于聊天的模型。'}`);
    } catch (error) {
      if (form.isConnected && this.modelListController === controller) this.ui.setModelLoading(false, error.message);
    } finally { if (this.modelListController === controller) this.modelListController = null; }
  }
  record(state, label, changes, type = 'manual', powerId = null) { state.transactions.push({ id: uid('record'), label, changes, type, powerId, evidence: [], costs: [], effects: [], at: Date.now(), atMessage: getContext().chat.length }); }
  async generate() {
    await this.prepareResources();
    await this.pullRoleBalances();
    const snapshot = this.roleSnapshot(this.ensureStable({ model: true })), power = snapshot.state.powers[this.powerId];
    assert(power?.active && powerSpace(power)==='wuku', '请选择可执行的武库词条；独立统计模块请使用拟定与正文整理'); assert(this.ui.goal.trim(), '请写下这次想执行的目标');
    const narrative = narrativeMessages(snapshot.ctx.chat, Math.max(0, snapshot.ctx.chat.length - Number(this.settings.contextMessages || 8)));
    const { data, contextHash } = await this.query(operationPrompt({ power, state: snapshot.state, goal: this.ui.goal.trim(), narrative, names: this.names(snapshot.ctx), roleContract: snapshot.roleContract }), snapshot);
    assert(Array.isArray(data.operations) && data.operations.length <= 4, '方案数量或格式无效');
    const valid = [], errors = [];
    this.busy = true; this.refresh();
    try {
      for (const raw of data.operations) { try { const op = normalizeOperation(raw, power, snapshot.state, contextHash); op.intent = this.ui.goal.trim(); if (snapshot.roleView) op.rolePlan = await this.makeRolePlan(op, raw, snapshot); valid.push(op); } catch (error) { errors.push(error.message); } }
      this.store.assertCapture({ chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision });
      if (snapshot.roleView) this.role.assertCapture(snapshot.roleView.capture, snapshot.state.roleLink);
    } finally { this.busy = false; this.refresh(); }
    this.plans = valid; this.selected = valid[0] || null; this.refresh();
    this.notice([String(data.message || ''), errors.length ? `${errors.length} 项未通过核对：${errors.join('；')}` : '', !valid.length ? '本次没有产生可执行操作，账目未改变。' : `${valid.length} 项方案待确认，尚未扣付。`].filter(Boolean).join(' '), !valid.length && errors.length > 0);
  }
  async execute({ story = 'later' } = {}) {
    assert(!this.busy, '查询期间不能执行'); assert(this.bridgeAvailable(), '当前酒馆未提供主叙事同步接口，不能提交执行');
    await this.pullRoleBalances();
    const snapshot = this.ensureStable(), operation = this.selected; assert(operation, '请先选择一个操作');
    if (snapshot.state.roleLink) { assert(operation.rolePlan, '请先生成并核对角色写回预览'); assert(operation.rolePlan.linkVersion === hash(stable(snapshot.state.roleLink)), '角色接入已改变，请重新生成'); this.role.assertCapture(operation.rolePlan.capture, snapshot.state.roleLink); }
    this.committing = true; this.ui.notice = null; this.refresh();
    try {
      const prechecked = snapshot.state.roleLink ? await this.role.preflight(operation.rolePlan, snapshot.state.roleLink) : null;
      assert(!this.mainBusy, '主叙事已开始生成，请结束后重新核对；本次没有扣付');
      const result = await this.store.transact(next => {
        if (next.roleLink) this.role.assertCapture(operation.rolePlan.capture, next.roleLink);
        const beforePower = clone(next.powers[operation.powerId]);
        const applied = applyOperation(next, operation, hash(stable(snapshot.hashes)), snapshot.hashes);
        if (!applied.duplicate) queueAction(next, operation, beforePower, { intent: operation.intent || operation.label, note: this.ui.storyNote || '' });
        if (next.roleLink && !applied.duplicate) { next.roleWrites ||= []; next.roleWrites.push({ ...clone(operation.rolePlan), id: operation.id, status: 'pending', history: [...snapshot.hashes], at: Date.now() }); applied.transaction.roleWrite = 'pending'; }
        return applied;
      }, { captured: { chatKey: snapshot.chatKey, stateId: snapshot.state.id, revision: snapshot.state.revision } });
      this.plans = []; this.selected = null; this.notice(`${operation.label}已完成。${result.result.transaction.changes.join('；')}。${result.save?.note || ''}`);
      if (snapshot.state.roleLink) await this.finishRoleWrite(operation.id, prechecked);
    } finally { this.committing = false; this.refresh(); }
    if (story === 'now' && !this.store.read().roleWrites?.some(w => w.status === 'pending')) await this.unfoldStory(operation.id);
    else if (!this.store.read().roleWrites?.some(w => w.status === 'pending')) this.notice(`${this.ui.notice?.message || ''} 已保存行动，下一轮正常正文会承接本次选择。`);
  }
  prepareAssetGoal(id){
    const s=this.ensureStable(),power=s.state.powers[this.powerId];
    assert(power?.active&&!isMmlc(power)&&!isTaishi(power),'请先选择已启用的武库金手指');
    const asset=power.assets[id];assert(asset&&!asset.removed&&amount(asset.quantity)>0n,'该能力或物资已不可用');
    this.ui.goal=`基于已持有的「${asset.name}」，拟定符合当前金手指规则的使用或改进方案。${asset.permanent?'保留永久成果，不将它作为消耗品。':'投入以当前确认的库存与规则为准。'}先列出投入、实际效果与限制，确认后再执行。`;
    this.ui.tab='operations';this.plans=[];this.selected=null;this.ui.closeDialog();this.refresh();
    this.ui.root?.querySelector('[data-goal]')?.focus();this.notice('已带入当前能力或物资，尚未调用模型或扣付。');
  }
  async sync(auto = false) {
    if (auto && (this.busy || this.mainBusy || this.committing)) return {skipped:true,reason:'busy',message:'当前任务尚未结束，本次自动核对跳过，未调用AI'};
    await this.prepareResources();
    await this.pullRoleBalances();
    const snapshot = this.roleSnapshot(this.ensureStable({ model: true })); const powers = Object.values(snapshot.state.powers).filter(p => p.active && powerSpace(p)==='wuku');
    if (!powers.length && auto) return {skipped:true,reason:'no_active_power',message:'没有启用的武库词条，本次未调用AI'};
    assert(powers.length, '请先接入词条'); assert(this.bridgeAvailable(), '主叙事同步接口不可用');
    const narrative = unsettledNarrative(snapshot.ctx.chat, snapshot.state, narrativeMessages(snapshot.ctx.chat, snapshot.state.syncCursor, snapshot.state.syncTail));
    if (!narrative.some(m => !m.is_user)) { const result={skipped:true,reason:'no_new_narrative',message:'没有尚未核对的新增正文，本次未调用AI'};if (!auto) this.notice(result.message); return result; }
    const boundResources = Object.keys(snapshot.state.roleLink?.bindings || {});
    const { data, captured, contextHash } = await this.query(reconcilePrompt({ powers, state: snapshot.state, narrative, names: this.names(snapshot.ctx), boundResources }), snapshot);
    assert(Array.isArray(data.events) && data.events.length <= 40, '核算返回的事件数量或格式无效');
    // Player intentions are not evidence of completed events.
    const evidenceText = narrative.filter(m => !m.is_user).map(m => m.content).join('\n');
    const events = data.events.map(raw => { const p = snapshot.state.powers[key(raw.powerId)]; assert(p?.active && powerSpace(p)==='wuku', '核算指向未接入词条或仅统计模块'); const op = normalizeOperation(raw, p, snapshot.state, contextHash, { event: true, evidenceText }); assert(![...op.costs.filter(c => c.kind === 'resource'), ...op.effects.filter(e => e.type === 'resource_credit')].some(e => boundResources.includes(bindingKey(p.id, e.id))), '核算尝试再次增减已绑定 MVU 的余额，已阻止重复结算'); return op; });
    const seen = new Set(); for (const event of events) { const signature = stable([event.powerId, [...event.evidence].sort()]); assert(!seen.has(signature), '同一词条的同一剧情证据被重复结算，请重新核算'); seen.add(signature); }
    this.pendingSync = { events, captured, contextHash, logId:this.logTask, hashes: snapshot.hashes, cursor: snapshot.ctx.chat.length, message: String(data.message || ''), roleCapture: snapshot.roleView?.capture };
    if (auto) return await this.applySync();
    this.ui.showSync(events, snapshot.state, data.message);return {pending:true,changed:events.length};
  }
  async applySync() {
    const pending = this.pendingSync; assert(pending, '核算预览已经失效'); this.ensureStable();
    assert(hash(stable(chatHashes(getContext().chat))) === pending.contextHash, '剧情已变化，请重新核算');
    if (pending.roleCapture) this.role.assertCapture(pending.roleCapture, this.store.read().roleLink);
    const result = await this.store.transact(next => {
      for (const event of pending.events) applyOperation(next, event, pending.contextHash, pending.hashes, { allowEvent: true });
      next.syncCursor = pending.cursor; next.historyAnchor = [...pending.hashes];
      delete next.syncTail;
    }, { captured: pending.captured, facts: pending.events.length > 0 });
    this.runtimeLog?.step(pending.logId,'保存结果',{events:pending.events.length,verified:result.save?.verified===true});
    this.runtimeLog?.finish(pending.logId,pending.events.length?'已保存':'未更新');
    this.aiActivity?.confirmed(pending.logId,pending.events.length?'已确认并保存账本':'本批无新增变化，已确认核对进度');
    this.pendingSync = null; this.ui.closeDialog(); this.refresh(); this.notice(`新增剧情核算完成：${pending.events.length} 项事件。${result.save?.note || ''}`);return {saved:true,changed:pending.events.length};
  }
  scheduleSync() {
    if (this.destroyed) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => { if (!this.settings.autoSync || this.settings.mode === 'off') return; this.sync(true).catch(error => this.notice(`自动核算未提交：${error.message}`, true)); }, 350);
  }
  async action(name, data) {
    if (this.destroyed) return;
    if (['generate', 'sync', 'execute', 'execute-later', 'apply-sync', 'save-baseline', 'save-balances', 'register', 'toggle-power', 'delete-power', 'confirm-delete-power', 'confirm-rebase', 'confirm-restore', 'retry-save'].includes(name)) assert(!this.committing, '正在提交账目，请稍候');
    if (['save-baseline', 'save-balances', 'register', 'toggle-power', 'delete-power', 'confirm-delete-power', 'confirm-rebase'].includes(name)) assert(!(this.store.read().roleWrites || []).some(w => w.status === 'pending'), '请先处理待完成的角色写回，再修改武库事实');
    const snapshot = () => this.contextSnapshot(), power = () => this.store.read().powers[this.powerId];
    switch (name) {
      case 'asset-remove':
      case 'asset-restore': {
        const s=this.ensureStable();assert(!this.busy,'请等待当前任务完成');const p=s.state.powers[this.powerId];assert(p?.active,'请先选择当前词条');
        await this.store.transact(next=>{const label=setAssetRemoved(next.powers[p.id],data.id,name==='asset-remove');this.record(next,`${name==='asset-remove'?'移除':'恢复'}背包登记：${label}`,['只调整插件背包登记，数量与历史回执保留；不退款、不执行使用动作、不修改角色变量。'],'setup',p.id);},{captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision}});
        this.selected=null;this.plans=[];this.refresh();return this.notice(name==='asset-remove'?'已移除背包登记，可在“已用完或已移除”中恢复。':'已恢复背包登记，原数量不变。');
      }
      case 'runtime-log-open': this.ui.showRuntimeLog(this.runtimeLog);return;
      case 'runtime-log-detail': this.runtimeLog.detail=Boolean(data.enabled);return;
      case 'runtime-log-clear': this.runtimeLog.clear();this.ui.showRuntimeLog(this.runtimeLog);return;
      case 'failed-review-export': {const snapshot=this.contextSnapshot(),raw=this.pendingArchiveReview?.issues?.length?encodeCheckpoint(this.pendingArchiveReview,snapshot.state.aiWorldbooks):this.store.storageImpl?.getItem('wanjie-wuku:review-checkpoint:'+snapshot.chatKey+':failed');assert(raw,'本聊天暂无失败候选备份');const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='武库失败候选-仅供本人核对-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
      case 'runtime-log-export': {const blob=new Blob([JSON.stringify(this.runtimeLog.export(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='万界武库运行日志-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
      case 'ai-ref-open': return this.openAIWorldbooks();
      case 'ai-ref-mode': return this.referenceMode(data.mode);
      case 'ai-ref-book': return this.referenceBook(data.book);
      case 'ai-ref-preview': return this.previewAIWorldbooks();
      case 'ai-ref-save': return this.saveAIWorldbooks();
      case 'ai-ref-clear': return this.clearAIWorldbooks();
      case 'ai-ref-dismiss': return this.dismissAIWorldbooks();
      case 'creation-open': return this.openCreation({section:data.section});
      case 'outbox-open': {
        const s=this.ensureStable();assert(!this.busy&&!this.mainBusy,'请等待当前任务完成');this.outboxCapture={chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision};this.ui.showOutbox(s.state,s.ctx.chat,this.bridgeAvailable());return;
      }
      case 'outbox-dismiss': this.outboxCapture=null;return;
      case 'outbox-return': this.outboxCapture=null;this.ui.closeDialog();this.ui.setOpen(false);return;
      case 'outbox-cancel': {
        assert(this.outboxCapture,'请重新打开待发列表');const s=this.ensureStable();this.store.assertCapture(this.outboxCapture);
        const row=outboxSummary(s.state,s.ctx.chat).rows.find(o=>o.id===data.id&&o.kind===data.kind);assert(row?.cancellable,'该项当前不能撤回');
        if(data.kind==='creation')await this.cancelCreation(data.id);else await this.cancelTerminal(data.id);
        return this.action('outbox-open',{});
      }
      case 'creation-refine':
      case 'creation-draft': return this.draftCreation({...data,action:name});
      case 'creation-adopt': return this.adoptCreation();
      case 'creation-cancel': return this.cancelCreation(data.id);
      case 'creation-dismiss': return this.dismissCreation();
      case 'terminal-dismiss': return this.dismissTerminal();
      case 'terminal-open': return this.openTerminal(data.kind||null,data.id||null);
      case 'terminal-draft': return this.draftTerminal(data);
      case 'terminal-confirm': return this.confirmTerminal(data);
      case 'terminal-cancel': return this.cancelTerminal(data.id);
      case 'adapter-share': return this.shareAdapter();
      case 'adapter-library-use': return this.openLibraryAdapter(data.id);
      case 'adapter-open': return this.openAdapter();
      case 'adapter-import': return this.importAdapter(data.file);
      case 'adapter-confirm': return this.confirmAdapter();
      case 'refresh': return this.refresh();
      case 'modules-open': return this.ui.showModules(this.store.read());
      case 'modules-save': return this.saveModules(data.values || {});
      case 'mmlc-rulebook': return this.ui.showMmlcRulebook();
      case 'mmlc-initial': return this.openMmlcInitial();
      case 'mmlc-initial-save': return this.applyMmlcInitial(data.values);
      case 'mmlc-continue': return this.continueMmlc(data.id);
      case 'mmlc-rule-chapter': return this.ui.openMmlcRuleChapter(data.id);
      case 'space-wuku': this.ui.space = 'wuku'; this.ui.tab = 'management'; this.powerId = Object.values(this.store.read().powers).find(p => powerSpace(p)==='wuku')?.id; this.plans = []; this.selected = null; return this.refresh();
      case 'space-mmlc': return this.action('add-mmlc', {});
      case 'space-taishi': return this.openTaishi();
      case 'taishi-structure-open': this.taishiBuildDraft=null;return this.openTaishiStructure('references');
      case 'taishi-structure-save': return this.saveTaishiStructure(data.values);
      case 'taishi-structure-dismiss': this.taishiStructureDraft=null;return;
      case 'taishi-civilization-add': return this.openTaishiCivilization();
      case 'taishi-civilization-save': return this.saveTaishiCivilization(data.values);
      case 'taishi-civilization-dismiss': this.taishiCivilizationDraft=null;return;
      case 'taishi-section': return this.selectTaishiSection(data.section);
      case 'taishi-workflow-retry': return this.retryTaishiWorkflow(data.stage);
      case 'taishi-workflow-cancel': return this.cancel();
      case 'taishi-workflow-discard': this.clearReviewCheckpoint(); this.pendingArchiveReview=null; this.cancel(); this.ui.closeDialog(); this.refresh(); return this.resumePlayerReview();
      case 'taishi-setup': return this.initializeTaishi();
      case 'taishi-build-run': return this.runTaishiBuild();
      case 'taishi-build-select': return this.selectTaishiBuildReferences();
      case 'taishi-build-skip': return this.skipTaishiBuild();
      case 'taishi-build-restart': return this.restartTaishiBuild();
      case 'taishi-build-dismiss': return this.dismissTaishiBuild();
      case 'taishi-create-world': return this.openTaishiDraft('world');
      case 'taishi-import-companions': return this.openAIWorldbooks({taishiPowerId:this.powerId,companionImport:true});
      case 'taishi-add-companion': return this.openTaishiDraft('companion');
      case 'taishi-draft-submit': return this.submitTaishiDraft(data.values || {});
      case 'taishi-draft-dismiss': return this.dismissTaishiDraft();
      case 'taishi-control-dismiss': this.taishiControlDraft=null;this.taishiRelationDraft=null;return this.resumePlayerReview();
      case 'taishi-world-action': return this.openTaishiWorldAction(data.id);
      case 'taishi-world-action-draft': return this.writeTaishiWorldAction(data.values||{});
      case 'taishi-descent': return this.openTaishiControl('descent');
      case 'taishi-clock': return this.openTaishiControl('clock');
      case 'taishi-descent-draft': return this.writeTaishiDescent(data.values||{});
      case 'taishi-clock-preview': return this.previewTaishiClock(data.values||{});
      case 'taishi-setting': return this.openTaishiSetting(data.id);
      case 'taishi-setting-draft': return this.writeTaishiSetting();
      case 'taishi-setting-preview': return this.previewTaishiSetting(data.values||{});
      case 'taishi-clock-save': return this.saveTaishiClock();
      case 'taishi-schedule-world': return this.selectScheduleWorld(data.id);
      case 'taishi-schedule-test': return this.testTaishiSchedule(data.values);
      case 'taishi-schedule-save': return this.saveTaishiSchedule(data.values);
      case 'taishi-development': return this.openTaishiDevelopment();
      case 'taishi-autonomy-save': return this.saveTaishiAutonomy(data.values);
      case 'taishi-story-evolve': return this.evolveTaishiStory(data.id);
      case 'taishi-evolve': return this.evolveTaishi(data.values);
      case 'taishi-development-dismiss': return this.dismissTaishiDevelopment();
      case 'taishi-people-dismiss': this.taishiPeopleDraft=null; return this.resumePlayerReview();
      case 'taishi-relation': return this.openTaishiRelation();
      case 'taishi-relation-save': return this.saveTaishiRelation(data.values);
      case 'taishi-relation-dismiss': this.taishiRelationDraft=null;return this.resumePlayerReview();
      case 'taishi-people': return this.openTaishiPeople();
      case 'taishi-people-save': return this.saveTaishiPeople(data.values);
      case 'taishi-advanced': return this.openTaishiAdvanced();
      case 'taishi-workflow-save': return this.saveTaishiWorkflow(data.values);
      case 'save-task-routes': {
        assert(!this.busy&&!this.mainBusy&&!this.committing,'请等待当前任务结束');
        const routes=Object.fromEntries(Object.entries(data.values||{}).filter(([k])=>k.startsWith('route:')).map(([k,v])=>[k.slice(6),v]));
        const fallbacks=Object.fromEntries(Object.keys(routes).map(task=>[task,[data.values?.['fallback1:'+task],data.values?.['fallback2:'+task]].filter(Boolean)]));
        saveTaskRoutes(routes,getContext(),fallbacks);this.settings=getSettings();this.ui.closeDialog();this.refresh();return this.notice('任务主连接与备用顺序已保存；未配置备用的任务不会自动切换。');
      }
      case 'select-power': this.ui.space = powerSpace(this.store.read().powers[data.id]); this.powerId = data.id; this.plans = []; this.selected = null; return this.refresh();
      case 'select-operation': this.selected = this.ui.view.operations.find(op => op.id === data.id); return this.refresh();
      case 'manage': return this.manage();
      case 'add-mmlc': {
        assert(!this.busy && !this.mainBusy && !this.committing, '请等待当前操作完成');
        const s = this.ensureStable(), registered = createPower(MMLC_ENTRY);
        await this.store.transact(next => {
          if (!next.powers[registered.id]) {
            registered.archiveStart = Math.max(0, s.ctx.chat.length - 24);
            registered.autoArchiveReview = false;
            autoAssociateAdapter(registered,this.associationLibrary());
            next.powers[registered.id] = registered;
            if (!Object.keys(s.state.powers).length) { next.syncCursor = s.ctx.chat.length; next.managementStart = s.ctx.chat.length; next.historyAnchor = s.hashes; }
            this.record(next, '接入漫漫长路成果统计', ['从近期正文整理，确认后保存'], 'setup', registered.id);
          }
        }, { captured: { chatKey: s.chatKey, stateId: s.state.id, revision: s.state.revision } });
        this.powerId = registered.id; this.ui.space = 'mmlc'; this.ui.mmlcSection = null; this.ui.tab = 'management'; this.ui.closeDialog(); this.refresh();
        return this.notice('漫漫长路统计已接入。点击AI整理当前情况即可；未导入世界书或自动调用API。');
      }
      case 'role-read': return this.readRole();
      case 'role-save': return this.saveRole(data);
      case 'role-extra-book': assert(this.roleDraft && data.values.roleBook, '请先读取角色并选择补充世界书'); this.roleDraft = await this.role.extraBook(this.roleDraft, data.values.roleBook); return this.manage();
      case 'role-refresh': await this.pullRoleBalances(); return this.notice('已读取当前角色变量和绑定余额；有变化的旧方案会失效。');
      case 'prepare-role': return this.prepareSelectedRole();
      case 'retry-role-write': assert(!this.busy && !this.mainBusy && !this.committing, '请等待当前请求结束'); this.committing = true; this.refresh(); try { return await this.finishRoleWrite(data.id); } finally { this.committing = false; this.refresh(); }
      case 'append-role-receipt': {
        assert(!this.busy && !this.mainBusy && !this.committing, '请等待当前请求结束'); this.committing = true; this.refresh();
        try { const result = await this.appendRoleReceipt(data.id); if (result.ok) { const write = this.store.read().roleWrites.find(w => w.id === data.id); try { await this.role.redraw(write.capture, result.target); } catch {} this.notice('已整理并核对状态栏简报；没有再次执行角色更新或扣费。'); } else this.notice(`角色变量已写回，状态栏简报未完成：${result.error}`, true); }
        finally { this.committing = false; this.refresh(); } return;
      }
      case 'role-detach': {
        assert(!this.busy && !this.mainBusy && !this.committing, '请等待当前请求结束');
        await this.store.transact(next => { next.roleLink = null; for (const a of next.narrativeActions || []) if (next.roleWrites?.some(w => w.id === a.id && w.status === 'pending')) a.status = 'stopped'; for (const w of next.roleWrites || []) if (w.status === 'pending') { w.status = 'abandoned'; const receipt = next.transactions.find(t => t.id === w.id); if (receipt) receipt.roleWrite = 'abandoned'; } this.record(next, '解除角色状态接入', ['保留现有武库账目与角色变量；待写回记录停止执行'], 'setup'); });
        this.roleDraft = null; this.roleError = ''; this.ui.closeDialog(); this.refresh(); return this.notice('角色接入已解除，待写回记录停止执行。已记账的投入未自动返还，已写回的角色状态保留。');
      }
      case 'read-book': assert(data.values.book, '请选择世界书'); return this.catalog(importBook(await loadBook(data.values.book), data.values.book));
      case 'remove-read-book': return this.removeReadBook(data.book);
      case 'import-book': assert(data.file.size <= 16 * 1024 * 1024, '世界书文件超过16MB'); return this.catalog(importBook(JSON.parse(await data.file.text()), data.file.name.replace(/\.json$/i, '')));
      case 'register': {
        const s = snapshot(); const selectedEntry = this.settings.catalog.find(e => e.id === data.values.primary); assert(selectedEntry, '主词条不存在');
        const entry = { ...selectedEntry, id:builtinPowerId(selectedEntry,s.state.powers) };
        const companions = new FormData(data.form).getAll('companion').filter(id => id !== selectedEntry.id).map(id => this.settings.catalog.find(e => e.id === id)).filter(Boolean);
        assertProfileRegistration(entry, companions, s.state.powers);
        const registered = createPower(entry, companions);
        await this.store.transact(next => {
          const old = next.powers[registered.id]; if (old) upgradeBuiltinPower(old);
          if (old) { if (old.adapterBinding) registered.adapterBinding = old.adapterBinding; registered.resources = { ...registered.resources, ...old.resources }; registered.assets = old.assets; registered.fields = old.fields; registered.archives = old.archives || {}; registered.autoArchiveReview = old.autoArchiveReview || false; registered.autoArchiveSave = old.autoArchiveSave || false; if(old.taishiWorkflow!==undefined)registered.taishiWorkflow=old.taishiWorkflow; if(old.taishiPeople)registered.taishiPeople=clone(old.taishiPeople); if(old.taishiBuild)registered.taishiBuild=clone(old.taishiBuild); if(old.taishiTime)registered.taishiTime=clone(old.taishiTime);if(old.taishiSchedule)registered.taishiSchedule=clone(old.taishiSchedule);if(old.taishiSchedules)registered.taishiSchedules=clone(old.taishiSchedules); if(old.taishiAutonomy!==undefined)registered.taishiAutonomy=old.taishiAutonomy; if (old.archiveReadRange) registered.archiveReadRange = old.archiveReadRange; if (old.archiveAuto) registered.archiveAuto = old.archiveAuto; if (old.autoArchiveStart !== undefined) registered.autoArchiveStart = old.autoArchiveStart; if (old.ruleVersion === registered.ruleVersion) registered.playerGuide = old.playerGuide; registered.archiveReviewed = old.archiveReviewed || []; registered.archiveStart = old.archiveStart ?? next.managementStart; registered.managementRecords = old.managementRecords || {}; registered.cycles = old.cycles || {}; registered.simulations = old.simulations || {}; if (old.ruleVersion === registered.ruleVersion) registered.fixedQuotes = old.fixedQuotes; }
          autoAssociateAdapter(registered,this.associationLibrary());
          next.powers[registered.id] = registered;
          if (!Object.keys(s.state.powers).length) { next.syncCursor = s.ctx.chat.length; next.managementStart = s.ctx.chat.length; next.historyAnchor = s.hashes; }
          this.record(next, old ? `更新接入：${entry.name}` : `接入：${entry.name}`, [`完整正文已登记，规则版本 ${registered.ruleVersion}`, '余额待明确；旧剧情不会自动补发奖励'], 'setup', registered.id);
        }, { captured: { chatKey: s.chatKey, stateId: s.state.id, revision: s.state.revision } });
        this.powerId = registered.id; this.ui.space=powerSpace(registered);this.ui.tab='management';this.ui.closeDialog(); this.refresh();
        if (Object.keys(registered.resources).length) { this.notice('已接入并识别资源，核对当前余额后即可开始。'); return this.openBaseline(); }
        return this.notice('词条已接入，无固定数值资源；能力直接在正文使用，可在管理页记录重要变化。');
      }
      case 'archive-edit-open': return this.ui.openArchiveEditor();
      case 'baseline': return this.openBaseline();
      case 'balances': return this.openBalances();
      case 'extract-balances': {
        assert(this.baselineCapture, '请重新打开余额确认'); this.store.assertCapture(this.baselineCapture);
        const findings = extractPanelBalances(power(), getContext().chat); this.ui.applyBalanceFindings(power(), findings, data.form); return this.notice(`找到 ${Object.keys(findings).length} 项聊天数值，已填入空白项；你输入的值保持原样。`);
      }
      case 'zero-balances': this.ui.fillZeroBalances(data.form); return this.notice('空白的未确认资源已填为 0；点击确认后才保存。');
      case 'save-balances': {
        assert(!this.busy && !this.mainBusy && this.balancesCapture, '请等待请求结束或重新打开全部余额');
        await this.store.transact(next => {
          for (const p of Object.values(next.powers)) {
            const changes = [];
            for (const r of Object.values(p.resources)) {
              if (next.roleLink?.bindings[bindingKey(p.id, r.id)]) continue;
              const value = String(data.values[`balance:${p.id}:${r.id}`] ?? '').trim(); if (!value) continue;
              const balance = normAmount(value); assert(resourceBalanceAllowed(p,r,balance), `${p.name}的${r.name}低于允许的最低余额`);
              if (balance !== r.balance) { changes.push(`${r.name}：${r.balance ?? '未确认'} → ${balance}`); r.balance = balance; }
            }
            if (changes.length) this.record(next, `${p.name} · 玩家确认当前余额`, changes, 'manual', p.id);
          }
        }, { captured: this.balancesCapture });
        this.ui.closeDialog(); this.refresh(); return this.notice(this.store.lastSave?.note || '余额已核对，当前账本没有变化');
      }
      case 'adopt-balance-candidate': {const field=data.form?.elements.namedItem(data.input);assert(field&&!field.readOnly,'此余额不可直接修改');field.value=normAmount(data.value);return this.notice('已填入候选，确认并保存后才生效；不会再次扣款');}
      case 'save-baseline': {
        assert(!this.busy && !this.mainBusy, '请等待正在进行的生成结束'); const pId = this.baselinePowerId, v = data.values;
        assert(this.baselineCapture && pId === this.powerId, '起始事实表单已失效，请重新打开'); this.store.assertCapture(this.baselineCapture);
        await this.store.transact(next => {
          const p = next.powers[pId]; assert(p, '词条已不存在'); const changes = [];
          for (const r of Object.values(p.resources)) {
            if (next.roleLink?.bindings[bindingKey(p.id, r.id)]) continue;
            const balance = String(v[`balance:${r.id}`] ?? '').trim(), floor = normAmount(v[`floor:${r.id}`] ?? '0');
            assert(!balance || resourceBalanceAllowed(p,r,balance,floor), `${r.name}余额低于设定的最低余额`);
            r.balance = balance ? normAmount(balance) : null; r.floor = floor; changes.push(`${r.name}校准为 ${r.balance ?? '未知'}；最低余额 ${r.floor}`);
          }
          if (v.resourceName?.trim()) { const name = v.resourceName.trim(); const id = `res_${hash(name)}`; assert(!p.resources[id], '该资源已存在'); const balance = v.resourceBalance?.trim() ? normAmount(v.resourceBalance) : null; assert(balance === null || amount(balance) >= 0n, '新增资源余额不能为负'); p.resources[id] = { id, name, balance, floor: '0', labels: [`${name}余额`, name] }; changes.push(`登记资源 ${name}：${balance ?? '未知'}`); }
          if (v.assetName?.trim()) { const quantity = normAmount(v.assetQuantity); assert(amount(quantity) > 0n && v.assetDescription?.trim(), '已有资产需要正数数量与完整规格'); const id = uid('asset'); p.assets[id] = { id, name: v.assetName.trim(), kind: v.assetKind?.trim() || '已有事实', quantity, description: v.assetDescription.trim(), permanent: Boolean(v.assetPermanent) }; changes.push(`补录 ${p.assets[id].name} × ${quantity}：${p.assets[id].description}`); }
          this.record(next, '玩家确认当前余额／已有事实', [...changes, `依据：${v.reason?.trim() || '玩家核对聊天候选或直接确认当前实际余额'}`], 'manual', pId);
        }, { captured: this.baselineCapture }); this.ui.closeDialog(); this.refresh(); return this.notice(this.store.lastSave.note);
      }
      case 'delete-power': {
        assert(!this.busy && !this.mainBusy, '请等待正在进行的生成结束');
        const state = this.store.read(), p = state.powers[this.powerId]; assert(p, '请先选择要删除的词条');
        this.deletePowerDraft = { powerId: p.id, captured: this.store.capture() };
        return this.ui.showDeletePower(p);
      }
      case 'confirm-delete-power': {
        assert(!this.busy && !this.mainBusy, '请等待正在进行的生成结束');
        const draft = this.deletePowerDraft; assert(draft && draft.powerId === this.powerId, '删除确认已失效，请重新选择词条');
        this.store.assertCapture(draft.captured);
        await this.store.transact(next => {
          const p = next.powers[draft.powerId]; assert(p, '词条已不存在');
          delete next.powers[p.id];
          for(const o of next.creations||[])if(o.powerId===p.id&&o.status==='queued')o.status='cancelled';
          next.favoriteActions = (next.favoriteActions || []).filter(a => a.powerId !== p.id);
          for (const a of next.narrativeActions || []) if (a.powerId === p.id) a.status = 'stopped';
          if (next.roleLink) for (const k of Object.keys(next.roleLink.bindings)) if (k.startsWith(p.id + ':')) delete next.roleLink.bindings[k];
          if (next.archiveMemory) {
            for (const k of Object.keys(next.archiveMemory.selections)) if (k.startsWith(p.id + '/')) delete next.archiveMemory.selections[k];
            delete next.archiveMemory.last;
          }
          this.record(next, `删除接入：${p.name}`, ['移除当前聊天的词条、余额、成果档案、常用行动与记忆选择；停止正文承接。', '历史回执保留；世界书、正文和角色变量不变。'], 'setup', p.id);
        }, { captured: draft.captured });
        clearTimeout(this.playerReviewTimer); this.playerReviewTimer = null; this.playerAutoQueued = null; this.deletePowerDraft = null; this.creationDraft=null;this.creationRequest=null;this.creationAttempt=null; this.lastPlayerAuto = null; this.pendingArchiveReview = null; this.memoryAttempt = null; this.narrativeAttempt = null; this.pendingManagement = null; this.managementDraft = null; this.adapterDraft = null; this.archiveDraft = null; this.memoryDraft = null; this.manualStoryDraft = null; this.workflowDraft = null; this.pendingSync = null; this.continuation = null; this.sceneCandidates = null; this.powerId = null; this.plans = []; this.selected = null;
        this.ui.closeDialog(); this.refresh(); return this.notice('已删除当前聊天中的词条接入，历史回执保留。');
      }
      case 'toggle-power': await this.store.transact(next => { const p = next.powers[this.powerId]; assert(p, '词条不存在'); p.active = !p.active; this.record(next, `${p.active ? '恢复' : '暂停'}接入：${p.name}`, ['已记账的永久成果保留'], 'setup', p.id); }); this.plans = []; this.refresh(); return;
      case 'settings': this.modelListController?.abort(); return this.ui.showSettings(this.settings, { profiles:getConnectionProfiles(), keyPresent: Boolean(this.apiKey), currentModel: getContext()?.getChatCompletionModel?.() || getContext()?.chatCompletionSettings?.model || '' });
      case 'fetch-models': return this.fetchModels(data);
      case 'cancel-model-list': this.modelListController?.abort(); return;
      case 'theme': return this.ui.showThemes();
      case 'set-theme': {
        const next={...this.settings,theme:themeId(data.theme)};await saveSettings(next);
        this.settings=next;this.ui.applyTheme();this.ui.closeDialog();this.refresh();return;
      }
      case 'apply-api-profile': {
        assert(!this.busy && !this.mainBusy && !this.committing,'请等待当前任务结束再切换连接');
        this.cancel();this.modelListController?.abort();applyConnectionProfile(data.id);
        this.settings=getSettings();this.apiKey=getApiKey();this.pendingSync=null;this.plans=[];
        this.refresh();return this.action('settings',{});
      }
      case 'delete-api-profile': {
        const id=data.values?.connectionProfile;assert(id,'请先选择一个已保存方案');
        deleteConnectionProfile(id);this.settings=getSettings();this.apiKey=getApiKey();
        await this.action('settings',{});return this.notice('已删除方案；当前连接保持可用。');
      }
      case 'save-api-profile':
      case 'save-settings': {
        assert(!this.busy && !this.mainBusy && !this.committing,'请等待当前任务结束再保存连接');
        const v=data.values, next={...connectionValues(v,this.settings),autoSync:Boolean(v.autoSync)};
        if(next.mode==='custom')endpoints(next.baseUrl);
        const key=connectionKey(v,this.apiKey);
        this.cancel();this.modelListController?.abort();
        if(name==='save-api-profile') {
          saveConnectionProfile({id:v.connectionProfile || '',name:v.profileName,settings:next,apiKey:key});
        } else { next.activeConnectionProfile='';await saveSettings(next,getContext(),key); }
        this.settings=getSettings();this.apiKey=getApiKey();this.pendingSync=null;this.plans=[];
        this.ui.closeDialog();this.refresh();return this.notice(name==='save-api-profile'?'API方案已保存并启用，所有聊天共用。':'当前连接已保存，所有聊天共用。');
      }
      case 'generate': return this.generate();
      case 'asset-goal': return this.prepareAssetGoal(data.id);
      case 'execute': return this.execute({ story: 'now' });
      case 'execute-later': return this.execute({ story: 'later' });
      case 'unfold-story': return this.unfoldStory(data.id);
      case 'review-story': return this.reviewStory(data.id);
      case 'confirm-story': return this.openManualStory(data.id);
      case 'save-manual-story': return this.saveManualStory(data);
      case 'archive-tools': return this.openArchiveTools();
      case 'archive-tool-dismiss': return this.dismissArchiveTool();
      case 'archive-correct-draft': return this.draftArchiveCorrection(data);
      case 'archive-correct-apply': return this.applyArchiveCorrection();
      case 'archive-undo': return this.openArchiveUndo();
      case 'archive-undo-confirm': return this.confirmArchiveUndo();
      case 'archive-recap': return this.generateArchiveRecap();
      case 'archive-batch': return this.openArchiveBatch();
      case 'archive-batch-create': return this.createArchiveBatch(data);
      case 'archive-batch-run': return this.runArchiveBatch();
      case 'archive-batch-continuous': return this.runArchiveBatch(true);
      case 'archive-batch-clear': return this.clearArchiveBatch();
      case 'archive-range': return this.openArchiveRange();
      case 'save-archive-range': return this.saveArchiveRange(data);
      case 'terminal-review':
      case 'review-archives': return this.reviewArchives({ rescan: true });
      case 'player-initial': return this.reviewArchives({ initial: true });
      case 'player-supplement': return this.reviewArchives({ ...data, supplement: true });
      case 'player-pending': return this.openPlayerReview();
      case 'player-auto-save': return this.togglePlayerAutoSave();
      case 'player-auto': return this.togglePlayerAuto();
      case 'repair-archive-ai': return this.repairArchiveWithAI();
      case 'retry-archive-references': return this.retryArchiveReferences();
      case 'repair-archive-candidate': return this.repairArchiveCandidate(data);
      case 'repair-archive-conflict': return this.repairArchiveConflict(data);
      case 'apply-archive-review': return this.applyArchiveReview(data);
      case 'terminal-memory': return this.openMemory(null,data.id);
      case 'memory-report': return this.openMemoryReport();
      case 'open-memory': return this.openMemory(data.id);
      case 'preview-memory': return this.editMemory(data);
      case 'save-memory': return this.editMemory(data, true);
      case 'open-archive': return this.openArchive(data.id);
      case 'save-archive': return this.saveArchive(data);
      case 'move-archive': return this.moveArchive(data);
      case 'view-rule': { const p = this.store.read().powers[this.powerId]; assert(p, '请先选择金手指'); return this.ui.showRule(p); }
      case 'retry-story': return this.setStoryStatus(data.id, 'waiting');
      case 'stop-story': return this.setStoryStatus(data.id, 'stopped');
      case 'cancel-scene': if (this.sceneQuery) this.cancel(); return;
      case 'scene-open': return this.openSceneSuggestions();
      case 'scene-regenerate-others': return this.sceneActions({...data,regenerateOnly:true});
      case 'scene-actions': return this.sceneActions(data);
      case 'select-scene': return this.useSceneSuggestion(data.index);
      case 'save-favorite': return this.saveFavorite();
      case 'use-favorite': { const a = this.store.read().favoriteActions?.find(a => a.id === data.id); assert(a && this.store.read().powers[a.powerId]?.active, '常用行动对应词条尚未启用'); this.powerId = a.powerId; this.ui.goal = a.goal; this.plans = []; this.selected = null; this.refresh(); return this.notice('已填入常用意图，请按当前剧情生成新的方案。'); }
      case 'delete-favorite': await this.store.transact(next => { next.favoriteActions = (next.favoriteActions || []).filter(a => a.id !== data.id); }, { facts: false }); return this.refresh();
      case 'ai-task-cancel': {
        const current=this.aiActivity?.current;
        if(!current||current.status!=='running'||String(current.id)!==String(data.taskId))return;
        assert(!this.committing,'结果正在提交，请等待完成；已保存内容不能通过取消撤销');
        this.cancel();this.refresh();return this.notice('已取消当前插件任务，未提交的返回不会保存；沿用酒馆连接时远端可能仍在结束。');
      }
      case 'cancel': this.cancel(); return this.notice('查询已取消，本次没有改变账目。');
      case 'open-workflow': return this.openWorkflow(data);
      case 'save-workflow': return this.saveWorkflow(data);
      case 'review-management': return this.reviewManagement();
      case 'apply-management': return this.applyManagementReview(data);
      case 'template-management': return this.openManagementTemplate(data.template);
      case 'manual-management': return this.openManagementRecord(data.id);
      case 'save-management': return this.saveManagementRecord(data);
      case 'sync': return this.sync();
      case 'apply-sync': return this.applySync();
      case 'export-all':
      case 'export': {
        const s = snapshot(),scope=this.ui.space||'wuku',payload=name==='export-all'?{format:'wjwk-backup',version:VERSION,exportedAt:new Date().toISOString(),chatKey:s.chatKey,state:s.state}:exportModule(s.state,scope); const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `${name==='export-all'?'完整聊天':MODULE_NAMES[scope]}-档案-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
      }
      case 'backup': return this.ui.showBackup();
      case 'import-backup': assert(data.file.size <= 32 * 1024 * 1024, '备份文件超过32MB'); { const raw = JSON.parse(await data.file.text()); assert(['wjwk-backup','wjwk-module-backup'].includes(raw.format), '这不是武库导出的备份'); this.restoreModule=raw.format==='wjwk-module-backup'?validateModuleBackup(raw).module:null; this.restoreCandidate = validateState(clone(raw.state)); {const captured=snapshot();this.restoreCapture={chatKey:captured.chatKey,stateId:captured.state.id,revision:captured.state.revision};} for (const p of Object.values(this.restoreCandidate.powers)) { upgradeBuiltinPower(p); upgradeResources(p, this.settings.catalog); } return this.ui.showRestorePreview(this.restoreCandidate,this.restoreModule); }
      case 'confirm-restore': assert(!this.busy && !this.mainBusy && !this.committing && this.restoreCandidate, '当前不能恢复档案'); if(this.restoreModule){const raw={format:'wjwk-module-backup',module:this.restoreModule,state:this.restoreCandidate};await this.store.transact(next=>{const merged=mergeModuleBackup(next,raw,{currentHashes:chatHashes(getContext().chat)});Object.assign(next,merged);},{captured:this.restoreCapture});}else await this.store.restore(this.restoreCandidate, chatHashes(getContext().chat)); this.restoreModule=null; this.restoreCapture=null; this.restoreCandidate = null; this.pendingManagement = null; this.managementDraft = null; this.workflowDraft = null; this.plans = []; this.ui.closeDialog(); this.refresh(); return this.notice(`档案已恢复。${this.store.lastSave.note}`);
      case 'retry-save': this.committing=true; this.refresh(); try { await this.store.retrySave(); return this.notice(this.store.lastSave?.note || '档案没有变化'); } finally { this.committing=false; this.refresh(); }
      case 'save-position': this.settings.position = { x: data.x, y: data.y }; return saveSettings(this.settings);
      default: throw new Error('未知操作');
    }
  }
}

Object.assign(WukuApp.prototype, mmlcMethods, taishiStructureMethods, taishiCivilizationMethods, reviewCheckpointMethods, taishiScheduleMethods, taishiControlMethods, archiveBranchMethods, spaceMethods, aiWorldbookMethods, narrativeMethods, managementMethods, workflowMethods, archiveMethods, archiveToolMethods, archiveReviewMethods, archiveMemoryMethods, playerHomeMethods, terminalMethods, creationMethods, adapterMethods, adapterLibraryMethods);

installAIActivity(WukuApp.prototype);

// Entrances are mounted before account resolution or runtime initialization.
let initialization = null;
export function initializeWuku() {
  const rootFlag = `${MODULE_ID}_instance`;
  if (globalThis[rootFlag] && !globalThis[rootFlag].destroyed) return Promise.resolve(globalThis[rootFlag]);
  if (initialization) return initialization;
  initialization = (async () => {
    for (let attempt=0; attempt<120 && (!document.body || !getContext()); attempt++) await new Promise(resolve=>setTimeout(resolve,500));
    assert(document.body && getContext(), '酒馆宿主尚未就绪');
    await resolveAccount();
    const app = new WukuApp(); await app.start(); globalThis[rootFlag] = app; return app;
  })().finally(()=>{initialization=null;});
  return initialization;
}
if (typeof document !== 'undefined') mountEntry(initializeWuku);
