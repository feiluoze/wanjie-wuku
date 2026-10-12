"""Build six reviewed, fact-only schemas against the bundled rules."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
read = lambda name: json.loads((root / name).read_text(encoding='utf-8'))
configs, targets, book = read('data/creation-adapters.json'), read('data/creation-targets.json'), read('data/builtin-worldbook.json')
specs = [
 ('harvest','多倍收获系统',[
  ('harvest','收获与结算','每次真实新收获一个对象；原始收获与最终收益属于同次结算，不将系统增幅再次作为新收获。', [('origin','原始收获与来源'),('final','正文确认的最终收益'),('delivered','已交付部分'),('pending','尚未交付部分'),('settlement','结算依据与状态')]),
  ('retained','待兑现权益','只登记已成立未交付权益；关联原收获，补交更新同一权益，不重复发放。',[('origin','关联收获'),('remaining','未交付剩余'),('condition','交付条件'),('delivered','后续实际交付')])]),
 ('cost_reduction','代价减免',[
  ('cost','行动与实际代价','一项行动一次结算；原标准、减免后实际承担和成败分开，不能把节省额当新收入或自动退款。',[('action','实际行动'),('standard','正文确认的原标准'),('paid','实际承担的代价'),('result','实际结果与成败'),('remaining','残留损耗与恢复事项')]),
  ('intent','待执行行动','希望采取的行动仍为planned，尝试为working；低成本不保证成功，也不把外界等待时间视为已缩短。',[('action','行动目标'),('condition','必要条件'),('cost','待确认自身成本')])]),
 ('all_rewards','我全都要',[
  ('reward_group','奖励结算组','同一次已赢得奖励一个组，选项与配套分别列明；同组只确认一次，不纳入其他独立未完成任务。',[('origin','已成立奖励来源'),('options','本次可选奖励'),('expanded','已有功能与直接配套'),('delivered','实际交付'),('pending','待交付权益')]),
  ('compatibility','重要兼容','实际成立的兼容关系，关联原奖励组；不当成第二份奖励。',[('origin','关联奖励组'),('rewards','兼容收益'),('effect','实际共存方式')]),
  ('retained','待交付权益','已成立但未交付，不冒充现有库存；后续领取只更新剩余及交付状态。',[('origin','关联奖励组'),('remaining','待交付内容'),('condition','承载与交付条件'),('delivered','实际补交')])]),
 ('exponential','指数增长',[
  ('axis','双轴成长','肉体与灵魂各保存当前完整状态；原基准、永久成长与临时强化分开，不从近似倍率反推点数。',[('axis','肉体或灵魂主轴'),('baseline','初始基准'),('points','当前永久点数与进度'),('overflow','本区间溢出已发记录与储备'),('temporary','临时强化')]),
  ('settlement','成长与事件结算','同一成长、节点或事件一个对象；重复扫描复用原ID，不再次计算回馈。',[('origin','实际成长或事件'),('growth','新增永久成长'),('reward','实际势差与节点奖励'),('state','已结算状态与依据')]),
  ('delta','势差账户快照','保存正文明确余额和累计状态，不将本快照再次作为收入；负余额可为已用预支，不擅自清零。',[('balance','正文确认的Δ余额'),('spent','累计实际消费'),('advance','当前预支总上限与已用额度'),('remainder','累计应得已发与尾差'),('milestones','已成立里程碑与越阶计数')]),
  ('exchange','兑换与保留事项','每笔实际兑换分别记录，支付与交付及后续成长分开；目标或委托不提前扣款。',[('origin','兑换或委托对象'),('paid','实际支付'),('received','实际交付'),('pending','暂存与待完成内容'),('authorization','预支或持续委托授权')])]),
 ('mass_energy','质能转换',[
  ('source','源量与当前承载','同份源量一个对象，更新当前承载；实体和已取回同份源量不得同时当作两份可用库存。',[('origin','真实来源'),('amount','当前可用份额'),('carrier','当前能量或实体承载'),('released','已释放待回收份额'),('recovered','实际已回收份额')]),
  ('creation','重要造物','每项造物分别记录，关联投入和当前归属；实际重新转换后更新原造物，不保留重复可用份额。',[('source','对应源量及实际投入'),('features','实际功能与数量'),('owner','当前归属'),('condition','当前承载状态与缺口')]),
  ('arrangement','持续安排','仅记录已授权安排与实际运行，不根据电脑时间自动推进；累计外界作用与当前源量分开。',[('intent','既定意图与保护对象'),('condition','运行条件'),('period','实际运行时段'),('effect','累计外界作用'),('pending','未完成与待回收内容')])]),
 ('story_points','故事点',[
  ('account','点数账户快照','只保存正文确认的余额与周期位置；不因激活规则、刷新或电脑日期自动入账。',[('balance','已确认故事点余额'),('activation','实际激活入账记录'),('cycle','权柄自身已结算周期位置')]),
  ('income','周期入账','每个实际完成的自身周期或明确连续周期段一个对象；同周期不重复入账，外界历史重现不是新周期。',[('period','已完成自身周期或连续区间'),('amount','实际入账总额'),('state','入账依据与已结算状态')]),
  ('revision','已成立修正','每次已决定、已支付且实际成立的修正一个对象；同目标再次付点的新修订另记，旧消费保留。',[('target','修正目标'),('before','旧事实'),('after','已成立新事实及因果'),('tier','本次档位'),('paid','实际消耗'),('previous','关联前次修订')]),
  ('intent','待决定版本','设想与未执行修正保留planned，尚未成功尝试保留working；不足点不扣款，不提前改变现实。',[('target','目标'),('desired','希望的新版本'),('condition','待决定与未满足条件')])])
]
for slug, name, rows in specs:
    adapter_id = 'wuku.' + slug
    entry = next(e for e in book['entries'].values() if e.get('comment') == name)
    quote = next(line.strip() for line in entry['content'].splitlines() if len(line.strip()) > 20 and not line.startswith('<'))[:150]
    records = [{'id':rid,'label':label,'description':description,'fields':[{'id':fid,'label':label,'type':'text','description':'只保留正文或玩家已确认的'+label+'；未知留空，不推算、不执行。'} for fid,label in fields]} for rid,label,description,fields in rows]
    config = {'format':'wjwk-adapter','schemaVersion':1,'id':adapter_id,'version':'1.0.0','name':name+'专用适配','description':'原始事实、实际结算及待兑现权益分开保存；档案整理不操作资源账本。','target':{'primaryHashes':['0000000000000000']},'operations':[{'id':'plan','kind':'plan','label':'拟定下一步方向','instruction':'根据实际状态拟定可选方向，仅为计划；不执行能力、不推算结算、不自动发奖或扣款。','ruleQuote':quote,'output':'plan','recordIds':[r['id'] for r in records]}],'records':records,'dashboard':{'title':name+' · 事实与结算','summary':'查看实际成果、结算依据与保留事项；档案文字不等于资源账本变动。','sections':[{'id':r['id'],'label':r['label'],'description':r['description'],'recordIds':[r['id']]} for r in records]}}
    configs = [c for c in configs if c['id'] != adapter_id] + [config]
    targets[adapter_id] = name
for name,value in [('data/creation-adapters.json',configs),('data/creation-targets.json',targets)]:
    (root/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Six fact-only adapters prepared; run build-creation-presets.mjs for schema and evidence checks.')
