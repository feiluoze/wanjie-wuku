import test from 'node:test';import assert from 'node:assert/strict';
import {builtinEntries} from '../src/builtin-worldbook.js';import {createPower,emptyState,clone,stable,validateState} from '../src/core.js';
import {ARCHIVE_TABLE_DEFINITIONS} from '../src/archive-table-definitions.js';import {archiveTables,archiveTablePolicy,tableTarget} from '../src/archive-tables.js';import {creationConfig} from '../src/creation-config.js';
import {archiveSources,normalizeArchiveBatch,applyArchiveChanges,archivePrompt} from '../src/archive-review.js';import {createArchiveStaging} from '../src/archive-staging.js';import {reviewHistory} from '../src/archive-history.js';
import {archiveLibraryPage} from '../src/archive-library.js';import {memoryPlan} from '../src/archive-memory.js';import {WorkbenchUI} from '../src/ui.js';
const entries=builtinEntries(),entry=name=>entries.find(e=>e.name===name),power=name=>createPower(entry(name));
const raw=(recordId,name,details,extra={})=>({type:'record',recordId,name,status:'active',fields:{description:'已核对的重要长期事实'},details,sourceIndex:-1,...extra});
const batch=(p,changes)=>normalizeArchiveBatch({changes},p,[],[],'玩家明确核对了这些实际事实');
function save(p,rows){const b=batch(p,rows);assert.deepEqual(b.issues,[],JSON.stringify(b.issues));return applyArchiveChanges(p,b.changes,[],new Map(b.changes.map((c,i)=>[i,c.id])),[]);}
const rows=(p,id)=>Object.values(p.archives||{}).filter(r=>r.specific?.recordId===id);
const byName=(p,name)=>Object.values(p.archives).find(r=>r.name===name);

test('second batch has seven exact source identities, 9 independent tables, 15 compatible categories and four added schemas; all evidence is verbatim',()=>{
 const definitions=ARCHIVE_TABLE_DEFINITIONS.slice(9,16);assert.equal(definitions.length,7);assert.equal(definitions.flatMap(d=>d.tables).length,9);assert.equal(definitions.flatMap(d=>d.records||[]).length,4);
 for(const d of definitions){const p=power(d.name),spec=archiveTables(p),policy=archiveTablePolicy(p),config=creationConfig(p);assert(spec);assert(d.sourceQuotes.length>=2);for(const quote of d.sourceQuotes)assert(entry(d.name).content.includes(quote),d.name+': '+quote);
  assert.deepEqual(policy.boundaries,d.boundaries);assert.deepEqual(policy.sourceQuotes,d.sourceQuotes);assert(d.boundaries.length>=2);
  for(const t of spec.tables){assert(config.records.some(r=>r.id===t.id));for(const id of t.identityFields||[])assert(t.fields.some(f=>f.id===id));for(const id of t.exclusiveWith||[])assert([...spec.tables,...spec.retiredTables].some(x=>x.id===id));}
  const prompt=JSON.parse(archivePrompt(p,[],[],'实际事实').user);assert.equal(prompt.longTermTables.tables.length,d.tables.length);assert.deepEqual(prompt.longTermTables.boundaries,d.boundaries);
  const initial=stable(p);assert.equal(archiveLibraryPage(p).categories.length,d.tables.length);assert.equal(stable(p),initial);
  const ui=Object.create(WorkbenchUI.prototype);assert(ui.archiveTablesPanel(p,[]).includes('长期档案'));assert.equal(stable(p),initial);
 }
});

test('life library keeps inactive-in-use forms and per-target fusion distinct; only common growth uses one row',()=>{
 const p=power('生命球'),wallet=stable(p.resources);save(p,[raw('forms','赤龙',{state:'当前化身',structure:'已形成龙息与赤鳞',growth:'该形态已经觉醒炎心'}),raw('forms','灵体',{state:'已入库，当前未使用',structure:'真实灵体感知'})]);
 const dragon=byName(p,'赤龙'),spirit=byName(p,'灵体');save(p,[raw('forms',dragon.name,{state:'已入库，切换后仍可使用'},{archiveId:dragon.id}),raw('forms',spirit.name,{state:'当前化身'},{archiveId:spirit.id})]);
 assert.equal(rows(p,'forms').length,2);assert(rows(p,'forms').every(r=>r.status==='active'));assert.equal(p.archives[dragon.id].specific.fields.growth,'该形态已经觉醒炎心');assert.equal(p.archives[spirit.id].specific.fields.growth,undefined);
 save(p,[raw('features','炎心→人身',{source:'赤龙炎心',target:'人身',effect:'已完成稳定承载'}),raw('features','炎心→灵体',{source:'赤龙炎心',target:'灵体',effect:'已完成另一种承载'})]);assert.equal(rows(p,'features').length,2);assert(p.archives[dragon.id].specific.fields.structure.includes('龙息'));
 save(p,[raw('core','自身共同成长',{identity:'同一意识与记忆',growth:'真正取得的共同理解'})]);const core=rows(p,'core')[0];save(p,[raw('core','另一种摘要标题',{rank:'正文已确认共同位格提升'})]);assert.equal(rows(p,'core').length,1);assert.equal(rows(p,'core')[0].id,core.id);assert.equal(stable(p.resources),wallet);
});

test('imprint count is not spent by a release; ending temporary reproduction preserves blueprint and retained progress',()=>{
 const p=power('拓印'),wallet=stable(p.resources);save(p,[raw('patterns','完美周天',{count:'十印',baseline:'亲自完整接触的原版周天',nature:'永久状态蓝图'}),raw('states','完美周天·城门冲突调用',{state:'正在生效',pattern:'完美周天，调用十印',retained:'已经实际练成一周天'})]);
 const pattern=rows(p,'patterns')[0],state=rows(p,'states')[0];save(p,[raw('states',state.name,{state:'正文明确本次窗口结束',retained:'已练成的进度继续保留'},{archiveId:state.id,status:'ended',operation:'transition'}),raw('actions','城门冲突关键防护',{pattern:'完美周天，十印',event:'实际攻击',result:'本次已完成防护'})]);
 assert.equal(p.archives[pattern.id].specific.fields.count,'十印');assert.equal(p.archives[pattern.id].status,'active');assert(p.archives[state.id].specific.fields.retained.includes('保留'));assert.equal(stable(p.resources),wallet);
 const s=emptyState();s.powers[p.id]=p;const action=rows(p,'actions')[0],memory=memoryPlan(s,[],action.name,{auto:true,budget:12000,selections:{}});assert(!memory.included.some(r=>r.id===p.id+'/'+action.id));
});

test('spirit shadow becomes a formal member in its original identity; peer duplicates and new-batch duplicate identities reject',()=>{
 const p=power('万灵图鉴');save(p,[raw('shadows','星萤',{known:'真实接触的夜间感知',relation:'仍在观察'})]);const shadow=rows(p,'shadows')[0];
 let b=batch(p,[raw('members','星萤',{relation:'已认可加入',state:'成员已成立'},{operation:'insert'})]);assert.equal(b.changes.length,0);assert.match(b.issues[0].reason,/原 recordId/);
 save(p,[raw('shadows',shadow.name,{relation:'已明确认可并正式加入正册',result:'正式关系已经成立'},{archiveId:shadow.id,operation:'update'})]);assert.equal(Object.keys(p.archives).length,1);assert.equal(rows(p,'shadows')[0].id,shadow.id);assert.equal(rows(p,'members').length,0);
 const q=power('万灵图鉴');b=batch(q,[raw('shadows','烬灵',{known:'已接触'}),raw('members','烬灵',{relation:'正式关系'}, {operation:'insert'})]);assert.equal(b.changes.length,1);assert.match(b.issues[0].reason,/同时出现在影页/);
 save(p,[raw('missions','北岭寻药远行',{members:'星萤与既有队友',goal:'已授权前往北岭寻药',progress:'已经出发',results:'尚未取得药材'},{status:'working'})]);const mission=rows(p,'missions')[0];save(p,[raw('missions',mission.name,{progress:'已经回到领域',results:'正文确认已带回药材，原成员仍在'},{archiveId:mission.id,status:'ended'})]);assert.equal(rows(p,'missions').length,1);assert.equal(rows(p,'shadows').length,1);
});

test('template keeps unlocked ranks and conquest collection independent of its singleton loadout and conflict',()=>{
 const p=power('模板');save(p,[raw('personal','精锐位格',{rank:'精锐',name:'烬火',traits:'已稳定形成耐热特性'}),raw('personal','首领位格',{rank:'首领',name:'燎原'}),raw('conquests','霜甲守卫模板',{origin:'玩家决定性击败并实际提炼',specification:'目标已经展现的首领规格',state:'永久收藏'}),raw('loadout','当前首领配置',{personal:'首领',phase:'第二阶段',equipped:'霜甲守卫模板',total:'仅保留正文已确认的总倍率'})]);
 const load=rows(p,'loadout')[0],conquest=rows(p,'conquests')[0];save(p,[raw('loadout','切回精锐后的配置',{personal:'精锐',phase:'第一阶段',equipped:'已卸下征服模板'})]);assert.equal(rows(p,'loadout').length,1);assert.equal(rows(p,'loadout')[0].id,load.id);assert.equal(rows(p,'personal').length,2);assert.equal(p.archives[conquest.id].status,'active');
 save(p,[raw('conflicts','北门连续冲突',{identity:'北门行动因果仍连续',recovered:'第二阶段已用一次恢复',state:'暂时脱离敌人视线但冲突未结束'},{status:'working'})]);const conflict=rows(p,'conflicts')[0];save(p,[raw('conflicts',conflict.name,{state:'再次交手，同一冲突继续'},{archiveId:conflict.id,status:'working'})]);assert.equal(rows(p,'conflicts').length,1);assert.equal(p.archives[conflict.id].specific.fields.recovered,'第二阶段已用一次恢复');assert.equal(rows(p,'loadout')[0].specific.fields.personal,'精锐');
});

test('idle shadow remains one individual after defeat and recovery; asset transfer never duplicates goods or wallet',()=>{
 const p=power('挂机'),wallet=stable(p.resources);save(p,[raw('shadow','首次征伐之影',{state:'在尽有战界实际出征',configuration:'携带唯一赤铜剑'}),raw('assets','唯一赤铜剑',{state:'影子在用',current:'赤铜剑一柄',origin:'真实战区战利'})]);const shadow=rows(p,'shadow')[0],asset=rows(p,'assets')[0];
 save(p,[raw('shadow','败后重新形成的影子',{state:'已经重新形成并沿原路线继续',configuration:'赤铜剑已经调回本体'}),raw('assets',asset.name,{state:'本体持有，影子已不再装备',flow:'同一实物已经调回，不是再次获得'},{archiveId:asset.id})]);assert.equal(rows(p,'shadow').length,1);assert.equal(rows(p,'shadow')[0].id,shadow.id);assert.equal(rows(p,'assets').length,1);assert.equal(stable(p.resources),wallet);
 const policy=archiveTablePolicy(p);assert(policy.boundaries.some(s=>s.includes('独立“模板”')));assert.equal(creationConfig(p).records.find(r=>r.id==='assets').fields.some(f=>f.id==='multiplier'),false);
});

test('idle singleton normalization still requires a named source tied to the actual power',()=>{
 const p=power('挂机'),s=emptyState();s.powers[p.id]=p;
 for(const [content,name]of [['普通村民正在学习剑术。','村民'],['挂机已经报告粮仓情况。','原文没有的影子称呼'],['挂机已经报告粮仓情况。','']]){
  const chat=[{is_user:false,mes:content}],sources=archiveSources(chat,s,p,{rescan:true});const b=normalizeArchiveBatch({changes:[raw('shadow',name,{state:'已经部署'},{sourceIndex:0,quote:content})]},p,sources,chat,'',s);assert.equal(b.changes.length,0);assert(b.issues.length);
 }
 assert.equal(Object.keys(p.archives||{}).length,0);
});

const consultation=(name,version,extra={})=>raw('consultations',name,{figure:'孙悟空',version,traits:'正在深化的真实特质',resonance:'正文确认当前未兑现一次',...extra},{operation:'insert'});
test('consultation object and version form an exact identity; same display name cannot overwrite another version',()=>{
 const p=power('咨询法'),wallet=stable(p.resources);save(p,[consultation('孙悟空·原典','西游记原典'),consultation('孙悟空·影视','某具体影视版本')]);const original=byName(p,'孙悟空·原典'),film=byName(p,'孙悟空·影视');assert.equal(rows(p,'consultations').length,2);
 let b=batch(p,[raw('consultations','齐天大圣·原典摘要',{figure:'孙悟空',version:'西游记原典',resonance:'正文确认剩余二次'},{operation:'update'})]);assert.deepEqual(b.issues,[]);assert.equal(b.changes[0].id,original.id);applyArchiveChanges(p,b.changes,[],new Map([[0,original.id]]),[]);
 b=batch(p,[raw('consultations',original.name,{version:'某具体影视版本'},{archiveId:original.id,operation:'update'})]);assert.equal(b.changes.length,0);assert.match(b.issues[0].reason,/身份列/);
 b=batch(p,[consultation('同一原典的另一标题','西游记原典')]);assert.equal(b.changes.length,0);assert.match(b.issues[0].reason,/已有对象/);
 b=batch(p,[raw('consultations','未指定版本的对象',{figure:'孙悟空'},{operation:'insert'})]);assert.equal(b.changes.length,0);assert.match(b.issues[0].reason,/具体版本/);
 assert.equal(p.archives[film.id].specific.fields.resonance,'正文确认当前未兑现一次');assert.equal(stable(p.resources),wallet);
});

test('same-batch consultation aliases cannot create two copies of the same version; known versions remain read-only to AI',()=>{
 const p=power('咨询法');let b=batch(p,[consultation('原典悟空','西游记原典'),consultation('原典齐天大圣','西游记原典')]);assert.equal(b.changes.length,1);assert.match(b.issues[0].reason,/相同对象与版本/);
 save(p,[consultation('原典悟空','西游记原典')]);const r=rows(p,'consultations')[0];b=batch(p,[raw('consultations','别名',{对象名称:'孙悟空',来源与具体版本:'西游记原典',未兑现共鸣积累:'确有一次新的独立共鸣，现为二次'},{operation:'update'})]);assert.deepEqual(b.issues,[]);assert.equal(b.changes[0].id,r.id);
 b=batch(p,[raw('consultations','别名',{figure:'另一对象'},{archiveId:r.id,operation:'update'})]);assert.equal(b.changes.length,0);
});

test('consultation progress is per-object text, normal independent practice updates it without automatically granting a reward',()=>{
 const p=power('咨询法'),wallet=stable(p.resources);save(p,[consultation('悟空·原典','西游记原典',{resonance:'一次'}),raw('consultations','后羿·具体神话版本',{figure:'后羿',version:'已明确的射日神话版本',resonance:'二次'},{operation:'insert'})]);const monkey=byName(p,'悟空·原典'),archer=byName(p,'后羿·具体神话版本');
 save(p,[raw('consultations',monkey.name,{resonance:'两次；本次独立练习有效，尚未兑现'},{archiveId:monkey.id,operation:'update'})]);assert.equal(p.archives[archer.id].specific.fields.resonance,'二次');assert.equal(rows(p,'inheritances').length,0);
 save(p,[raw('inheritances','已承接的筋斗遁法',{source:'悟空·西游记原典',effect:'已经完整取得且可实际使用'}),raw('consultations',monkey.name,{resonance:'三次已经实际兑现，剩余零次',progress:'主要特质仍在继续深化'},{archiveId:monkey.id})]);assert.equal(rows(p,'inheritances').length,1);assert.equal(stable(p.resources),wallet);
});

test('daily intelligence keeps important leads rather than turning each issue into ten permanent objects or tracking slots',()=>{
 const p=power('每日情报'),wallet=stable(p.resources);save(p,[raw('leads','北门危险线索',{finding:'已经交付的危机信息',window:'仍有可应对窗口',tracking:'已明确锁定',outcome:'尚无实际行动结果'}),raw('focus','当前探索方向',{direction:'真实已设定探索方向'})]);const lead=rows(p,'leads')[0],focus=rows(p,'focus')[0];
 save(p,[raw('focus','次日的方向标题',{direction:'已经改为避祸方向'})]);assert.equal(rows(p,'focus').length,1);assert.equal(rows(p,'focus')[0].id,focus.id);assert.equal(rows(p,'leads').length,1);assert.equal(p.archives[lead.id].specific.fields.outcome,'尚无实际行动结果');assert.equal(stable(p.resources),wallet);
 const policy=archiveTablePolicy(p);assert(policy.boundaries.some(s=>s.includes('每期十条简讯全部常驻')));assert(policy.boundaries.some(s=>s.includes('按电脑日期')));
});

test('cross-floor consultation working view keeps identity fields and earlier progress while later patches omit them',async()=>{
 const p=power('咨询法'),s=emptyState();s.powers[p.id]=p;const initial=stable(p),wallet=stable(p.resources),chat=[{is_user:false,mes:'咨询法已建立孙悟空的西游记原典咨询，获得筋斗遁法，未兑现共鸣为零。'},{is_user:false,mes:'独立使用筋斗遁法完成渡河，咨询法已确认原典孙悟空获得一次有效共鸣。'}],sources=archiveSources(chat,s,p,{rescan:true});
 const stage=createArchiveStaging(p,{normalize:normalizeArchiveBatch,apply:applyArchiveChanges,chat,state:s});
 const result=await reviewHistory(sources,async source=>{
  const prompt=JSON.parse(stage.prompt(archivePrompt(stage.power,[source],chat)).user);if(source.index){assert.equal(prompt.current[0].details.version,'西游记原典');assert.equal(prompt.current[0].archiveId,undefined);assert(prompt.current[0].pendingInBatch);}
  const details=source.index?{resonance:'正文确认一次未兑现共鸣'}:{figure:'孙悟空',version:'西游记原典',resonance:'正文确认零次未兑现共鸣'};
  return {data:{changes:[raw('consultations','孙悟空·原典',details,{operation:source.index?'update':'insert',sourceIndex:source.index,quote:source.content})],floorReviews:[{sourceIndex:source.index,status:'reviewed',changeCount:1}]}};
 },{stage:(data,source)=>stage.accept(data,source)});
 assert.equal(stable(p),initial);assert.equal(result.data.changes[1].operation,undefined);const b=normalizeArchiveBatch(result.data,p,sources,chat,'',s,{chronological:true});assert.deepEqual(b.issues,[]);applyArchiveChanges(p,b.changes,sources,new Map(b.changes.map((c,i)=>[i,c.id])),chat);
 assert.equal(rows(p,'consultations').length,1);const r=rows(p,'consultations')[0];assert.equal(r.specific.fields.version,'西游记原典');assert.equal(r.specific.fields.resonance,'正文确认一次未兑现共鸣');assert.equal(r.history.length,1);assert.equal(stable(p.resources),wallet);validateState(clone(s));
});

test('uncertain consultation floor does not leak a new object into the next working view',()=>{
 const p=power('咨询法'),s=emptyState();s.powers[p.id]=p;const chat=[{is_user:false,mes:'咨询法的这个版本尚未明确。'}],sources=archiveSources(chat,s,p,{rescan:true}),stage=createArchiveStaging(p,{normalize:normalizeArchiveBatch,apply:applyArchiveChanges,chat,state:s});
 stage.accept({changes:[raw('consultations','身份未明对象',{figure:'某形象'},{operation:'insert',sourceIndex:0,quote:sources[0].content})],floorReviews:[{sourceIndex:0,status:'uncertain',changeCount:1}]},sources[0]);assert.equal(Object.keys(stage.power.archives||{}).length,0);assert.equal(Object.keys(p.archives||{}).length,0);
});
