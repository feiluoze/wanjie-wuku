import {taskConnectionLabel} from './task-routing.js';
// Transient UI state only. Never persisted to chat or sent to a model.
export class AIActivity {
  constructor(emit, { now = () => performance.now(), secret = () => '' } = {}) {
    this.emit = emit; this.now = now; this.secret = secret; this.current = null; this.sequence = 0;
  }
  publish(task) { this.last={ ...task, elapsed: Math.max(0, (task.endedAt ?? this.now()) - task.startedAt) };this.emit(this.last); }
  confirmed(ticket,message){if(this.last?.status==='pending'&&ticket?.id===this.last.logId?.id){this.last={...this.last,status:'success',phase:message};this.emit(this.last);}}
  cancel() {
    const task = this.current; if (!task) return;
    task.status = 'cancelled'; task.phase = '本次任务已取消'; task.endedAt = this.now();
    this.current = null; this.publish(task);
  }
  phase(message) { if (this.current) { this.current.phase = message; this.publish(this.current); } }
  connection(connection) {
    if (!this.current) return;
    const task=this.current;task.connections ||= {};
    task.connections[connection.task]=this.safe(taskConnectionLabel(connection));this.publish(task);
  }
  warning(message) { if(this.current)this.current.warning=this.safe(message); }
  problem(message) { if (this.current) this.current.problem = this.safe(message); }
  safe(value) {
    let message = String(value || '请查看面板中的详细提示');
    const secrets=this.secret();for(const secret of Array.isArray(secrets)?secrets:[secrets])if(secret)message=message.split(secret).join('[已隐藏]');
    return message.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [已隐藏]').replace(/sk-[\w-]+/g, '[已隐藏]').slice(0, 240);
  }
  async run(label, work, outcome = () => '处理完成，请查看结果') {
    // Existing controllers reject concurrent requests. Nested model calls belong to this task.
    if (this.current) return work();
    const task = { id: ++this.sequence, label, phase: '准备中', status: 'running', startedAt: this.now() };
    this.current = task; this.publish(task);
    try {
      const result = await work();
      task.status = task.problem ? 'error' : task.warning ? 'partial' : result?.skipped ? 'skipped' : result?.pending ? 'pending' : 'success';
      task.phase = task.problem || task.warning || outcome(result);
      return result;
    } catch (error) {
      task.status = error?.name==='ContextChangedError'?'invalidated':error?.name === 'AbortError' || /取消|窗口已关闭/.test(error?.message) ? 'cancelled' : 'error';
      const stage={preflight:'发送前检查未通过',transport:'接口请求失败',response:'返回内容未通过校验',save:'保存未完成',context:'剧情已变化，本轮已作废'}[error?.requestStage];
      task.phase = task.status === 'cancelled' ? '本次任务已取消' : this.safe((stage?stage+'：':'')+error?.message);
      throw error;
    } finally {
      if (this.current === task) { task.endedAt = this.now(); this.current = null; this.publish(task); }
    }
  }
}

export function installAIActivity(prototype) {
  const jobs = {
    repairArchiveWithAI: 'AI 修复待确认项', draftArchiveCorrection: '拟定档案纠错', generateArchiveRecap: '回顾阶段成长', reviewArchives: '整理成果', reviewManagement: '核对管理记录', sceneActions: '生成场景建议',
    draftCreation: '拟定新内容', draftTerminal: '拟定终端安排', generate: '生成方案', sync: '核对正文状态',
    reviewStory: '核对正文承接', prepareSelectedRole: '准备变量写回',
  };
  for (const [name, title] of Object.entries(jobs)) {
    const original = prototype[name];
    if (typeof original !== 'function') continue;
    prototype[name] = function (...args) {
      this.aiActivity ||= new AIActivity(state => this.ui?.setAIActivity?.(state), { secret: () => [this.apiKey,...(this.requestSecrets||[])] });
      const power = this.store?.read?.()?.powers?.[args[0]?.powerId || this.powerId];
      const label = `${name === 'reviewArchives' && args[0]?.automatic ? '自动更新' : title}${power?.name ? ` · ${power.name}` : ''}`;
      if(this.aiActivity.current)return original.apply(this,args);
      return this.aiActivity.run(label, async () => {
        const ticket=this.runtimeLog?.begin(label,{powerId:power?.id,automatic:Boolean(args[0]?.automatic)}),previous=this.logTask;this.logTask=ticket;if(this.aiActivity.current)this.aiActivity.current.logId=ticket;
        try{const result=await original.apply(this,args);const pending=name==='sync'?this.pendingSync:name==='reviewManagement'?this.pendingManagement:name==='reviewArchives'||name==='repairArchiveWithAI'?this.pendingArchiveReview:null;
          if(result?.skipped)this.runtimeLog?.step(ticket,'跳过任务',{reason:result.reason||'no_work',message:result.message||'本次无需处理，未调用AI'});
          const status=result?.skipped?'未执行':pending?'待确认':result?.saved?(result.changed===0?'未更新':'已保存'):'成功';
          this.runtimeLog?.finish(ticket,status);return name==='sync'&&pending&&!result?.skipped?{...result,pending:true}:result;}
        catch(error){this.runtimeLog?.finish(ticket,error?.name==='AbortError'?'已取消':error?.name==='ContextChangedError'?'已作废':'失败',error?.message||String(error));throw error;}
        finally{if(this.logTask===ticket)this.logTask=previous;}
      }, result => {
        if(result?.skipped)return result.message||'本次无需处理，未调用AI';
        if(name==='sync')return result?.pending?'核对完成，等待确认；尚未写入账本':result?.saved?(result.changed===0?'本批无新增变化，已确认核对进度':'已确认并保存账本'):'核对完成，请查看结果';
        if (name === 'reviewArchives') return this.pendingArchiveReview ? this.pendingArchiveReview.data?.rawFailures?.length?'原回复格式失败，已保留，等待修复':'整理完成，等待确认' : args[0]?.autoSave ? '本批处理完成，请查看成果' : '本次检查完成';
        if (['draftCreation', 'draftTerminal', 'generate', 'reviewManagement', 'sync', 'sceneActions'].includes(name)) return '整理完成，请查看结果';
        return '本次处理完成';
      });
    };
  }
}
