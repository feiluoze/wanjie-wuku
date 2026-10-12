"""Add the reviewed six entry schemas. Existing adapters remain byte-for-byte data equivalent."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
read = lambda name: json.loads((root / name).read_text(encoding='utf-8'))
configs, targets, book = read('data/creation-adapters.json'), read('data/creation-targets.json'), read('data/builtin-worldbook.json')
# Each row is a distinct object category, not a single rolling summary.
specs = [
 ('precedent', '早有先例', '先例库', [
  ('precedent','独立先例','一条真实发生的历史事实一个对象，标题用事件与结果区分；多条先例不得合成最近先例总表。', [('event','历史事件'),('origin','历史来源与世界'),('result','已成立结果'),('correspondence','适用对应关系'),('limits','适用边界')]),
  ('invocation','援引记录','每次实际援引单独记录，用发生场景或时点区分；引用原先例名称，不因再次使用重复建立先例。', [('precedent','援引的先例'),('scene','本次场景'),('action','本次行动'),('outcome','实际结果'),('limits','对应条件与限制')]),
  ('new_history','新成立事实','本轮真正完成、可成为未来先例的新事实；同一事实已登记为先例时复用原档案，不重复建两份。', [('event','实际完成的事件'),('result','已成立结果'),('origin','发生世界与时点'),('reusable','正文明确的可援引范围')])]),
 ('biocomputer','生物计算机','信息与运算库', [
  ('knowledge','知识与经验','每份独立知识或经验分别保存，未验证推演不能当作已掌握知识。',[('subject','知识或经验对象'),('source','取得来源'),('mastery','实际掌握程度'),('limits','已知边界')]),
  ('connection','网络接入','一条已建立信息域连接一个对象。',[('network','网络与信息域'),('access','已获权限'),('condition','接入状态'),('limits','访问限制')]),
  ('computation','运算与推演','每个独立运算任务分别保存，目标与实际结果分开。',[('goal','任务目标'),('basis','输入与依据'),('progress','当前进展'),('result','已取得结果'),('uncertainty','未证事项')]),
  ('model','模型与统合成果','实际建立的模型或生命统合成果，不能把预演可能性当成现实所得。',[('subject','模型或统合对象'),('scope','覆盖范围'),('result','实际成果'),('limits','限制与未验证内容')])]),
 ('sage','大贤者','解析与并列任务', [
  ('verified','已验证知识','一项经过正文验证的原理或操作一个对象，推测另归推演。',[('principle','已验证原理'),('evidence','验证经历'),('application','可复用操作'),('limits','已知边界')]),
  ('analysis','解析与推演','一项解析一个对象，已知、结论与未知分别保存。',[('subject','解析对象'),('basis','观察与依据'),('conclusion','推演结论'),('unknown','尚待验证')]),
  ('parallel','并列任务','每个并列任务单独保存，不能把任务清单合成一项。',[('goal','任务目标'),('progress','当前进展'),('result','实际结果'),('limits','阻碍与条件')]),
  ('delegation','授权托管','只记录实际授权的持续安排，不自动执行。',[('scope','授权范围'),('rules','托管条件'),('condition','执行状况'),('limits','禁止与停止条件')])]),
 ('human_game','人间游戏','玩家成长档案', [
  ('skill','技能','每项技能一个对象，只记实际掌握与实际升级。',[('level','实际等级'),('effect','技能效果'),('growth','成长事实'),('limits','条件与限制')]),
  ('profession','职业','每个职业分别保存。',[('level','职业等级'),('features','已获职业特性'),('progress','转职或成长进展'),('limits','条件与限制')]),
  ('quest','任务','每项任务分别保存，计划或进行中不得提前完成。',[('goal','任务目标'),('progress','完成事实与进度'),('condition','完成条件'),('reward','约定奖励（未到账）')]),
  ('achievement','成就','每个实际达成的成就分别保存。',[('condition','达成事实'),('effect','已成立效果'),('reward','已确认奖励')]),
  ('reward','已确认奖励','只记录正文已明确交付的奖励；与任务约定奖励区分，同一交付复用ID，插件不重复发奖。',[('origin','来源任务或成就'),('received','实际交付内容'),('state','当前归属与状态')])]),
 ('path_contract','道途','道途与践行', [
  ('path','道途契约','每条实际缔约道路分别保存，计划缔约不能记为成立。',[('concept','道路概念'),('overlord','对应超主'),('contract','已成立契约'),('features','已获特性'),('limits','条件与限制')]),
  ('practice','践行事实','每次重要践行分别保存，并关联对应道途；同一事件不重复建档。',[('path','对应道途'),('action','实际践行'),('result','实际结果')]),
  ('milestone','成长节点','明确达到的道路或生命成长节点，下一目标不是已达成。',[('path','对应道途'),('level','已达层次'),('change','实际变化'),('next','未完成目标')])]),
 ('rewrite','描述改写','改写与持续状态', [
  ('rewrite','已成立改写','每个目标的独立改写分别保存，真实生效才能记为已建立；后续改变同一持续状态复用ID。',[('target','改写目标'),('before','原描述'),('after','已成立的新描述'),('scope','生效范围'),('support','实际历史与因果变化')]),
  ('persistent','持续状态','改写形成且需要跨回合保留的状态，引用对应改写，不重复当作第二份奖励。',[('rewrite','关联改写'),('state','当前状态'),('scope','持续范围'),('limits','条件与边界')]),
  ('intent','待执行意图','仅计划的改写，保留planned或working，不能提前写成现实。',[('target','目标'),('desired','希望成立的描述'),('condition','尚待执行或确认事项')])])
]
for slug,name,title,rows in specs:
    adapter_id = 'wuku.' + slug
    if any(c['id'] == adapter_id for c in configs):
        continue
    entry = next(e for e in book['entries'].values() if e.get('comment') == name)
    quote = next(line.strip() for line in entry['content'].splitlines() if len(line.strip()) > 20 and not line.startswith('<'))[:150]
    records = [{'id':rid,'label':label,'description':description,'fields':[{'id':fid,'label':flabel,'type':'text','description':'只保留正文或玩家已确认的'+flabel+'；未知留空，不猜测。'} for fid,flabel in fields]} for rid,label,description,fields in rows]
    configs.append({'format':'wjwk-adapter','schemaVersion':1,'id':adapter_id,'version':'1.0.0','name':name+'专用适配','description':'独立对象分类保存，已有事实与计划分开；不执行能力、不自动结算。','target':{'primaryHashes':['0000000000000000']},'operations':[{'id':'plan','kind':'plan','label':'拟定下一步方向','instruction':'结合已有事实拟定可选行动；仅为计划，不宣称已经取得成果，不自动执行或结算。','ruleQuote':quote,'output':'plan','recordIds':[r['id'] for r in records]}],'records':records,'dashboard':{'title':title,'summary':'分类查看已保存对象；完整档案库支持搜索、筛选与分页。旧通用档案保留，可核对后再整理。','sections':[{'id':r['id'],'label':r['label'],'description':r['description'],'recordIds':[r['id']]} for r in records]}})
    targets[adapter_id] = name
for name,value in [('data/creation-adapters.json',configs),('data/creation-targets.json',targets)]:
    (root/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Six entry adapters added. Run build-creation-presets.mjs to verify literal evidence and schema.')
