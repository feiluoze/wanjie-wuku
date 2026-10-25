import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePlayerGuide,currentPlayerGuide} from '../src/player-guide.js';
import {fixture} from './mvu-fixture.js';
import {validateState,clone} from '../src/core.js';

const rules='灵魂火焰提升感知；\r\n　——消除精神疲劳；\n\t——保持自主意识。';
const ability={name:'灵魂淬炼',description:'依照原文提升感知。',ruleQuote:rules.replace(/\s/g,'')};
const guide={summary:'依照已有规则说明能力。',abilities:[ability]};
const power={name:'测试能力',rules,ruleVersion:'abcdef1234567890'};

test('guide whitespace differences restore a literal source excerpt and preserve input',()=>{
 const before=JSON.stringify(guide),out=normalizePlayerGuide(guide,power);
 assert.equal(out.abilities[0].ruleQuote,rules);assert(power.rules.includes(out.abilities[0].ruleQuote));
 assert.equal(JSON.stringify(guide),before);
 assert.equal(currentPlayerGuide({...power,playerGuide:out}).abilities[0].ruleQuote,rules);
});

test('whitespace tolerance never changes wording, punctuation or numbers',()=>{
 for(const quote of [ability.ruleQuote.replace('感知','力量'),ability.ruleQuote.replace('；','，'),ability.ruleQuote+'增加100点']){
  assert.throws(()=>normalizePlayerGuide({...guide,abilities:[{...ability,ruleQuote:quote}]},power),/规则依据/);
 }
 assert.throws(()=>normalizePlayerGuide({...guide,abilities:[{...ability,ruleQuote:'火 焰'}]},power),/规则依据/);
});

test('partial guide validation isolates one invalid ability with a visible issue',()=>{
 const issues=[],raw={...guide,abilities:[ability,{...ability,ruleQuote:'不在规则中的虚构效果'}, {...ability,name:'其他方向'}]};
 assert.throws(()=>normalizePlayerGuide(raw,power));
 const result=normalizePlayerGuide(raw,power,{issues});
 assert.equal(result.abilities.length,2);assert.equal(issues.length,1);assert.equal(issues[0].kind,'玩法说明');assert.match(issues[0].name,/第2项/);
 assert.throws(()=>normalizePlayerGuide({...guide,abilities:[{...ability,ruleQuote:'无依据的效果'}]},power,{issues:[]}),/没有通过/);
 assert.throws(()=>normalizePlayerGuide({...guide,abilities:Array(13).fill(ability)},power,{issues:[]}),/1至12/);
});

test('mixed guide candidates preview valid abilities and save only after confirmation',async()=>{
 const f=fixture(),quote=f.power.rules.slice(0,30),valid={...ability,ruleQuote:quote};
 f.app.settings.mode='st';f.app.ui.showArchiveReview=()=>{};
 f.app.model.request=async()=>JSON.stringify({changes:[],guide:{...guide,abilities:[valid,{...valid,ruleQuote:'原规则没有这种能力'}]}});
 await f.app.reviewArchives({supplement:true,values:{playerNote:'玩家确认本轮暂无新增成果'}});
 const pending=f.app.pendingArchiveReview;
 assert.equal(pending.guide.abilities.length,1);assert.equal(pending.issues.filter(i=>i.kind==='玩法说明').length,1);
 assert.equal(Boolean(pending.readOnly),false);assert.equal(f.store.read().powers[f.power.id].playerGuide,undefined);
 await f.app.commitArchiveReview(pending,new Map());
 const saved=f.store.read();assert.equal(saved.powers[f.power.id].playerGuide.abilities.length,1);validateState(clone(saved));
 assert.equal(Object.keys(saved.powers[f.power.id].archives).length,0);assert.equal(f.replacementCount,0);
 clearTimeout(f.app.roleTimer);
});

test('normalized multiline evidence survives the persisted state validator',()=>{
 const f=fixture(),rawQuote=f.power.rules.slice(0,90),compact=rawQuote.replace(/\s/g,'');
 f.power.playerGuide=normalizePlayerGuide({...guide,abilities:[{...ability,ruleQuote:compact}]},f.power);
 assert(f.power.rules.includes(f.power.playerGuide.abilities[0].ruleQuote));
 validateState(clone(f.state));
});
