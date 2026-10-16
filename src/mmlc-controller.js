import {assert,hash,stable} from './core.js';
import {isMmlc,mmlcModule} from './mmlc.js';
import {MMLC_RULEBOOK} from './mmlc-rulebook.js';
import {MMLC_CONFIG} from './mmlc-config.js';
import {archiveCurrent,archiveSource,saveArchive,saveArchiveUpdate} from './archives.js';

// Fixed author-declared starting facts; only a player's explicit confirmation adopts them.
export function mmlcInitialRecords(){
 const content=id=>MMLC_RULEBOOK.entries.find(e=>e.uid===id)?.content||'';
 const six=[...content(3).matchAll(/【(汲能归元|定向爆发|八卦护身|万象观测|御器刻印|初步调律)】([^\n]+)/g)];
 assert(six.length===6,'内置初授规则不完整，请先更新插件');
 return [
  {name:'本体修行',module:'body',type:'skill',details:{realm:'完美筑基',body:'识海与真元循环稳定成形，原有记忆、人格、意志与能力保留。',progress:'初始道域半径一公里，可依意愿缩小。'}},
  {name:'万象参真经',module:'arts',type:'skill',details:{principle:'解析辨明规律，计算推演结构，功法将所得化入真元、神魂与肉身。',mastery:'八枚核心符文齐备，功法自主运转；顺推与逆推均可展开。',effect:'所悟知识归于本人，可独立运用、改良与传授。'}},
  ...six.map(([,name,effect])=>({name,module:'arts',type:'skill',details:{mastery:'初授即可用',effect:effect.trim(),...(name==='御器刻印'?{limits:'初始同时精密操纵总质量十吨的普通物体。'}:{})}})),
  {name:'随身福地',module:'land',type:'facility',details:{environment:'与本源绑定的随身修真道场，独属于本人，可随身进出。',facilities:'道韵智脑、八卦符文固化设备、道韵反应堆、乾坤萃灵器、万象天引仪；试验炉、加工区与储存区已备妥。',condition:'初授时即已运行，能源持续自生，内部时间可调；启动物料已备妥，具体库存未指定。'}}
 ];
}

export const mmlcMethods={
 openMmlcInitial(){
  const s=this.ensureStable(),p=s.state.powers[this.powerId];assert(isMmlc(p)&&p.active&&!this.busy,'请先进入启用的漫漫长路');
  assert(!Object.keys(p.archives||{}).length,'已有成果时请整理正文，初授建档只用于空档案');
  this.mmlcInitialDraft={powerId:p.id,captured:{chatKey:s.chatKey,stateId:s.state.id,revision:s.state.revision},contextHash:hash(stable(s.hashes))};
  this.ui.showMmlcInitial(mmlcInitialRecords());
 },
 async applyMmlcInitial(values={}){
  const d=this.mmlcInitialDraft;assert(d&&d.powerId===this.powerId&&!this.busy,'请重新打开初授建档');
  assert(values.confirm==='on','请确认当前采用凡人初授道基的开局');
  const s=this.ensureStable();this.store.assertCapture(d.captured);assert(hash(stable(s.hashes))===d.contextHash,'正文已变化，请重新核对初授开局');
  this.committing=true;this.refresh();
  try{
   await this.store.transact(next=>{
    const p=next.powers[d.powerId];assert(isMmlc(p)&&p.active&&!Object.keys(p.archives||{}).length,'已有档案或模块已变化，不覆盖当前成果');
    const saved=mmlcInitialRecords().map(r=>{
     const def=MMLC_CONFIG.records.find(x=>x.id===r.module);
     return saveArchive(p,{name:r.name,type:r.type,module:r.module,status:'active',fields:r.type==='skill'?{level:r.details.realm||r.details.mastery||'初授已掌握',effect:r.details.effect||r.details.progress||r.details.body}:{purpose:r.details.facilities,condition:r.details.condition},specific:{adapterId:MMLC_CONFIG.id,version:MMLC_CONFIG.version,recordId:r.module,label:def.label,labels:Object.fromEntries(def.fields.map(f=>[f.id,f.label])),fields:r.details}},archiveSource(s.ctx.chat,'玩家确认采用内置漫漫长路世界书的凡人初授道基开局；基础事实按规则建立，未调用AI。'));
    });
    saveArchiveUpdate(p,{},saved,[],{chat:s.ctx.chat});
    this.record(next,'确认漫漫长路初授开局',[`建立 ${saved.length} 项基础档案；未推算库存或推进时间`],'setup',p.id);
   },{captured:d.captured});
   this.mmlcInitialDraft=null;this.ui.closeDialog();this.notice('初授基础档案已建立；未调用AI，后续按实际剧情更新。');
  }finally{this.committing=false;this.refresh();}
 },
 continueMmlc(id){
  const s=this.ensureStable(),p=s.state.powers[this.powerId],r=p?.archives?.[id];
  assert(isMmlc(p)&&p.active&&r&&r.status!=='ended'&&archiveCurrent(r,s.ctx.chat),'请选择当前有效的漫漫长路成果');
  const module=mmlcModule(r),aim={arts:'继续参悟并拓展已验证方法的用途',projects:'继续研究，优先交付已经可用的部分并解决具体缺口',body:'继续修行，保留既有功法与性命所得',items:'改良已有器物，保留原有用途与个体',spirits:'完善当前能力与职责，保留同一位器灵的记忆与经历'}[module]||'继续改良与发展，保留已有成果';
  return this.openCreation({section:module,focusId:id,goal:`基于「${r.name}」${aim}。我这次希望：`});
 }
};
