// Produce a readable local preview using original sample data only.
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createPower,emptyState} from '../src/core.js';
import {builtinEntries} from '../src/builtin-worldbook.js';
import {MMLC_ENTRY} from '../src/mmlc.js';
import {archivePrompt} from '../src/archive-review.js';
import {archiveSummaryPreset} from '../src/archive-preset.js';

const out=resolve(process.argv[2]||'dist/archive-preset-preview.md');
const wuku=createPower({id:'preview-only',entryId:'sample',book:'原创测试资料',name:'测试档案能力',content:'只保存正文已经确认的成果。'});
const taishi=createPower(builtinEntries().find(e=>e.name.startsWith('太始天（完整版')));
taishi.taishiAutonomy=true;taishi.archives={world:{id:'world',name:'测试海域',type:'environment',specific:{recordId:'world',fields:{}}}};
const mmlc=createPower(MMLC_ENTRY),state=emptyState();for(const p of [wuku,taishi,mmlc])state.powers[p.id]=p;
const cases=[['武库正文整理',wuku,'',{}],['漫漫长路正文整理',mmlc,'',{}],['太始天正文整理',taishi,'',{}],['玩家补充',wuku,'已有工具已修复',{}],['世界书底稿',taishi,'玩家请求从所选资料建立底稿',{setupReferences:true}],['人物建档草案',taishi,'建立普通人物草案',{taishiDraft:{kind:'companion',joining:'npc'}}],['世界自主发展',taishi,'确认测试海域内部推进一年',{taishiEvolution:{worldId:'world',elapsed:1,unit:'years'}}]];
let markdown='# 1.3.7 整理预设可读预览\n\n由实际源码生成，使用原创占位资料；不含玩家聊天、连接或密钥。这是内置任务提示预览，不是酒馆聊天预设导入文件，也不是安装包。\n\n分组借鉴用户提供的工作流助手v0.0.57 / 世界后台引擎v6.5通用版。保持武库实际候选JSON格式；不移植外部MVU patch、身份覆盖、占卜或强制长篇思考输出。\n';
const summary=[];
for(const [label,p,note,options] of cases){
 const prompt=archivePrompt(p,[],[],note,{state,...options}),data=JSON.parse(prompt.user);summary.push({label,mode:data.taskMode,systemCharacters:prompt.system.length,groups:data.preset.groups.length});
 markdown+=`\n## ${label}\n\n任务模式：${data.taskMode}。提示组：${data.preset.groups.join(' → ')}。\n\n### 实际系统提示\n\n\`\`\`text\n${prompt.system}\n\`\`\`\n\n### 实际输出契约\n\n\`\`\`json\n${JSON.stringify(data.responseContract,null,2)}\n\`\`\`\n`;
}
markdown+='\n## 高级摘要专职\n\n```text\n'+archiveSummaryPreset([],[]).system+'\n```\n';
await mkdir(dirname(out),{recursive:true});await writeFile(out,markdown,'utf8');console.log(JSON.stringify({out,cases:summary},null,2));
