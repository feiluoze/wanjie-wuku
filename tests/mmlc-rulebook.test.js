import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MMLC_RULEBOOK,mmlcRuleSelection,MMLC_REFERENCE_BUDGET,MMLC_GAMEPLAY} from '../src/mmlc-rulebook.js';
import {MMLC_CONFIG} from '../src/mmlc-config.js';
import {MMLC_ENTRY} from '../src/mmlc.js';
import {createPower} from '../src/core.js';
import {creationRules} from '../src/creation-config.js';
import {creationPrompt,normalizeCreation} from '../src/creation.js';
import {WorkbenchUI} from '../src/ui.js';
test('complete 21-chapter runtime book equals the checked-in source with no missing UID invented',()=>{
 const snapshot=JSON.parse(readFileSync(new URL('../data/mmlc-worldbook.json',import.meta.url),'utf8'));assert.deepEqual(MMLC_RULEBOOK,snapshot);assert.equal(snapshot.entries.length,21);assert.equal(snapshot.entries.reduce((n,e)=>n+e.content.length,0),45696);assert(!snapshot.entries.some(e=>e.uid===16));for(const e of snapshot.entries)assert(MMLC_GAMEPLAY.includes(e.content));
});
test('author original checksum and every chapter match the supplied file', {skip:!process.env.WJWK_MMLC_BOOK},()=>{
 const raw=readFileSync(process.env.WJWK_MMLC_BOOK),author=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));assert.equal(createHash('sha256').update(raw).digest('hex'),MMLC_RULEBOOK.sourceSha256);assert.deepEqual(MMLC_RULEBOOK.entries,Object.values(author.entries).map(e=>({uid:e.uid,title:e.comment,enabled:!e.disable,content:e.content})));
});
test('all eight operations select complete relevant chapters within a declared budget',()=>{
 for(const op of MMLC_CONFIG.operations){const result=mmlcRuleSelection(op.id);assert(result.text.length<=MMLC_REFERENCE_BUDGET);assert(result.selected.some(e=>e.uid===0));assert(result.selected.some(e=>e.uid===1));for(const r of result.selected)assert(result.text.includes(MMLC_RULEBOOK.entries.find(e=>e.uid===r.uid).content));assert.notEqual(result.text,MMLC_GAMEPLAY);}
 const cases=[['arts','设计同源法术族',17],['body','参悟大罗金性',7],['items','研究混沌珠真意',21],['fleet','舰群成阵',12],['land','独立区域调时实验',11],['projects','跨界魔法互证',19],['','修真工业文明工程',20]];for(const [op,goal,id]of cases)assert(mmlcRuleSelection(op,goal).selected.some(e=>e.uid===id),goal);
});
test('creation request traces selected chapters, verifies only provided rule quotes and never grants initial assets',()=>{
 const p=createPower(MMLC_ENTRY),before=JSON.stringify(p),goal='研究混沌珠真意',spec=creationPrompt(p,[],goal,'items'),body=JSON.parse(spec.prompt.user);assert(body.rulebookReference.selected.some(e=>e.uid===21));assert(body.rules.includes('<灵宝真意与本源研究>'));assert(body.rules.length<MMLC_GAMEPLAY.length);assert.match(spec.prompt.system,/未由剧情或玩家确认时不能宣称玩家已拥有/);
 const quote=MMLC_RULEBOOK.entries.find(e=>e.uid===21).content.slice(0,30);normalizeCreation({title:'研究古器',content:'按已有样本研究空间维持规律',conditions:'仅使用已取得样本',ruleQuote:quote},p,{goal,operationId:'items',sources:{}});assert.equal(JSON.stringify(p),before);assert.equal(creationRules({...p,id:'other',rules:'普通规则'}),'普通规则');
});
test('full local rulebook is readable and escaped without executing attached tags or invoking a model',()=>{
 const ui=Object.create(WorkbenchUI.prototype);let html;ui.dialog=(title,body)=>html=body;ui.showMmlcRulebook();assert.equal((html.match(/data-mmlc-chapter=/g)||[]).length,21);assert(html.includes('灵宝真意与本源研究'));assert(html.includes('&lt;MMLC-settle&gt;'));assert(!html.includes('<MMLC-settle>'));assert(html.includes('不调用AI'));
});
