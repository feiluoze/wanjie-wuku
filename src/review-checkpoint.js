// Browser-local, chat-scoped candidate cache. Never included in module exports.
import {clone,hash,stable} from './primitives.js';
import {VERSION} from './core.js';
import {MAX_RETURNED_CHANGES} from './archive-result-list.js';
import {readReferencePacket} from './ai-worldbooks.js';
import {planTaishiBuild} from './taishi-build.js';
import {REFERENCE_BUILD_LIMIT} from './ai-worldbooks-data.js';
const LIMIT=4000000;
const fields=['data','captured','contextHash','referenceFingerprint','referencePacket','logId','changes','issues','blockedFloors','floorReviews','terminalResults','creationResults','guide','message','readOnly','layered','playerNote','setupReferences','powerId','automaticStart','sources','workflowOptions','taishiScheduleEvent','manualBatch','batchContinuous','taishiTimeEvent','taishiBuild','taishiEvolution','taishiDraft','skipSetupPeople'];
const key=chatKey=>'wanjie-wuku:review-checkpoint:'+chatKey;
export function encodeCheckpoint(pending,referenceConfig){
 const candidate=Object.fromEntries(fields.filter(k=>pending[k]!==undefined).map(k=>[k,clone(pending[k])]));
 const payload={version:VERSION,referenceConfig:hash(stable(referenceConfig||null)),candidate};
 const serialized=JSON.stringify({payload,digest:hash(stable(payload))});
 if(serialized.length>LIMIT)throw Error('候选超过本机恢复缓存上限；当前页面仍可核对保存');return serialized;
}
export function decodeCheckpoint(raw,snapshot){
 if(!raw||raw.length>LIMIT)return null;
 try{
  const {payload,digest}=JSON.parse(raw),p=payload.candidate,c=p.captured;
  if(payload.version!==VERSION||digest!==hash(stable(payload))||payload.referenceConfig!==hash(stable(snapshot.state.aiWorldbooks||null)))return null;
  if(c.chatKey!==snapshot.chatKey||c.stateId!==snapshot.state.id||c.revision!==snapshot.state.revision||p.contextHash!==hash(stable(snapshot.hashes))||!snapshot.state.powers[p.powerId]?.active)return null;
  if(!Array.isArray(p.changes)||p.changes.length>MAX_RETURNED_CHANGES||!Array.isArray(p.sources)||!Array.isArray(p.issues)||!Array.isArray(p.terminalResults)||!Array.isArray(p.creationResults))return null;
  return {...p,restored:true,checkpointSaved:true};
 }catch{return null;}
}
export const reviewCheckpointMethods={
 saveReviewCheckpoint(pending=this.pendingArchiveReview){
  if(!pending)return false;
  try{const s=this.contextSnapshot();if(s.chatKey!==pending.captured.chatKey||s.state.id!==pending.captured.stateId||s.state.revision!==pending.captured.revision)return false;
   if(!this.store.storageImpl?.setItem)throw Error('本机缓存不可用');
   const encoded=encodeCheckpoint(pending,s.state.aiWorldbooks);
   this.store.storageImpl.setItem(key(s.chatKey),encoded);
   if(pending.issues?.length)this.store.storageImpl.setItem(key(s.chatKey)+':failed',encoded);
   pending.checkpointSaved=true;return true;
  }catch(e){pending.checkpointSaved=false;this.checkpointError=e.message||'本机候选缓存保存失败';return false;}
 },
 clearReviewCheckpoint(captured=this.pendingArchiveReview?.captured){try{if(captured){const storage=this.store.storageImpl;if(storage?.removeItem)storage.removeItem(key(captured.chatKey));else storage?.setItem?.(key(captured.chatKey),'');}}catch{/* No archive facts are changed. */}},
 restoreReviewCheckpoint(snapshot){
  if(!snapshot?.state||this.pendingArchiveReview||this.busy||this.archiveReviewJob||this.committing)return;
  try{const raw=this.store.storageImpl?.getItem?.(key(snapshot.chatKey));if(!raw)return;const pending=decodeCheckpoint(raw,snapshot);if(pending)this.pendingArchiveReview=pending;else this.store.storageImpl?.setItem?.(key(snapshot.chatKey),'');}catch{/* Corrupt or unavailable cache never blocks the archive. */}
 },
 async readReviewReferences(pending){
  const s=this.ensureStable(),power=s.state.powers[pending.powerId];
  const personReference=pending.taishiDraft?.kind==='companion'&&pending.referencePacket;
  const config=personReference?{mode:'manual',books:personReference.payload.books.map(b=>({name:b.name,entryIds:[...new Set(b.entries.map(e=>String(e.id)))]}))}:pending.taishiBuild?power.taishiBuildReferences:s.state.aiWorldbooks;
  if(!config)return {payload:{books:[]},fingerprint:''};
  const reference=await readReferencePacket(config,{ctx:s.ctx,...(pending.taishiBuild||personReference?{limit:REFERENCE_BUILD_LIMIT}:{})});
  if(!pending.taishiBuild)return reference;
  let plan=planTaishiBuild(reference,power.ruleVersion,power.taishiWorldStructure);
  if(plan.fingerprint!==pending.taishiBuild.fingerprint)plan=planTaishiBuild(reference,power.ruleVersion,power.taishiWorldStructure,{legacy:true});
  if(plan.fingerprint!==pending.taishiBuild.fingerprint||plan.total!==pending.taishiBuild.total)throw Error('构建世界书或建档结构已变化，请重新核对');
  const chunk=plan.chunks[pending.taishiBuild.next];if(!chunk)throw Error('原构建批次不存在，请重新核对');
  return chunk;
 },
 async assertReviewReferences(pending){
  if(!pending.restored&&!pending.setupReferences&&!(pending.taishiDraft?.kind==='companion'&&pending.referencePacket))return;
  const s=this.ensureStable();this.store.assertCapture(pending.captured);
  if(hash(stable(s.hashes))!==pending.contextHash)throw Error('剧情已变化，请放弃旧候选后重新核对');
  const reference=await this.readReviewReferences(pending);
  if(reference.fingerprint!==(pending.referenceFingerprint||''))throw Error('参考世界书已变化，请放弃旧候选后重新核对');
  this.store.assertCapture(pending.captured);
  if(hash(stable(this.contextSnapshot().hashes))!==pending.contextHash)throw Error('检查参考资料期间剧情已变化，请重新核对');
 }
};
