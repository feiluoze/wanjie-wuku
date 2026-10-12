// Task guidance is advisory: never chooses a paid model or retries silently.
export const TAISHI_MODEL_GUIDE=Object.freeze([
  {task:'分类、筛选、事实提取',tier:'Flash 类',reason:'任务边界清晰、更新频繁；先用快速模型，复杂归属冲突再人工升级。'},
  {task:'日常人物与眷属局部更新',tier:'Flash 类起步',reason:'少量人物、短期行动和近期记忆；多人物互动或隐秘认知冲突可改用 Pro 类。'},
  {task:'首次世界构建、复杂人物建档',tier:'Pro 类优先',reason:'需要统合长设定、势力关系与人物动机；简单的一句话草案也可先用 Flash 类。'},
  {task:'世界推演、长跨度与多方协调',tier:'Pro 类优先',reason:'需要处理因果、时空、目标和相互依赖；小范围变化仍可使用 Flash 类。'},
  {task:'变化摘要、格式整理',tier:'Flash 类',reason:'只汇总已校验结果；若同时判断重大矛盾，则建议 Pro 类。'},
  {task:'复杂冲突复核',tier:'Pro 类按需',reason:'用于重建或难以确定的矛盾，无需每轮调用；字段、权限、重复写入始终由程序校验。'}
]);
export const TAISHI_MODEL_SOURCE='https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-5-flash';
export const TAISHI_MODEL_NOTE='Flash / Pro 是能力与速度取舍的参考，不按名称保证效果。先用同一模型也可以；以实际连贯性、结构输出成功率、耗时和费用决定。模型升级或切换须玩家选择，失败不自动换用更贵模型。';
