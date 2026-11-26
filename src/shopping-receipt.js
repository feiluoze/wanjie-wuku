import {assert,extractPanelBalances,normAmount,resourceBalanceAllowed,uid,archiveReadText,ARCHIVE_READ_FORMAT,hash} from './core.js';
import {archiveContextCurrent,isArchiveDialogue} from './archives.js';
import {withoutThoughts} from './archive-reader.js';
import {builtinResources,resourceMatches} from './builtin-resources.js';

export function shoppingReceipt(state,power,chat,floors){
  const definition=builtinResources(power)?.resources.find(row=>row.name==='兑换点');
  if(!definition||power.name!=='万界网购')return null;
  const matches=Object.values(power.resources).filter(resource=>resourceMatches(resource,definition));
  if(matches.length!==1)return null;
  const resource=matches[0];
  if(state.roleLink?.bindings?.[power.id+':'+resource.id])return null;
  const index=chat.findLastIndex(isArchiveDialogue);
  if(index<0||!floors.includes(index)||state.transactions.some(t=>t.powerId===power.id&&t.shoppingReceipt?.index===index))return null;
  const message=chat[index],raw=message.mes??message.content??'';
  const clean=withoutThoughts(raw).replace(/```[\s\S]*?```/g,'');
  const settle=[...clean.matchAll(/<WJWK-settle\b[^>]*>([\s\S]*?)<\/WJWK-settle\s*>/gi)];
  const statuses=[...clean.matchAll(/<WJWK-status\b[^>]*>([\s\S]*?)<\/WJWK-status\s*>/gi)];
  if(settle.length!==1||statuses.length!==1)return null;
  const rows=[...settle[0][1].matchAll(/^\s*【万界网购】\s*(?:当前|剩余)?兑换点余额\s*[：:]\s*([\d,]{1,120})\s*(?:点)?\s*(?:->|→|=>)\s*([\d,]{1,120})(?=\s|[（(点]|$)/gm)];
  const status=extractPanelBalances(power,[{mes:statuses[0][0]}])[resource.id]?.balance;
  if(rows.length!==1||status===undefined)return null;
  let before,after;
  try{before=normAmount(rows[0][1].replaceAll(',',''));after=normAmount(rows[0][2].replaceAll(',',''));}catch{return null;}
  if(status!==after||!resourceBalanceAllowed(power,resource,after))return null;
  if(resource.balance!==null&&resource.balance!==before&&resource.balance!==after)return null;
  const body=archiveReadText(raw);
  return {index,swipeId:message.swipe_id??0,textHash:hash(body),length:body.length,format:ARCHIVE_READ_FORMAT,powerId:power.id,resourceId:resource.id,before,after};
}

export function applyShoppingReceipt(state,receipt){
  if(!receipt)return;
  const resource=state.powers[receipt.powerId].resources[receipt.resourceId],before=resource.balance;
  assert(before===null||before===receipt.before||before===receipt.after,'本批其他结算改变了兑换点，和正文回执对不上，请核对后保存');
  resource.balance=receipt.after;
  state.transactions.push({id:uid('record'),label:'万界网购 · 正文余额核对',type:'story',powerId:receipt.powerId,
    changes:[`兑换点：${before??'未确认'} → ${receipt.after}`],evidence:[],costs:[],effects:[],shoppingReceipt:receipt,at:Date.now(),atMessage:receipt.index+1});
}

export function removeReceiptedShoppingDeltas(operation,state,chat,narrative,receipt){
  const receipts=state.transactions.filter(t=>t.powerId===operation.powerId&&t.shoppingReceipt).map(t=>t.shoppingReceipt);
  if(receipt?.powerId===operation.powerId)receipts.push(receipt);
  const covered=receipts.filter(r=>narrative.some(source=>!source.is_user&&source.index===r.index));
  if(!covered.length)return operation;
  const resourceIds=new Set(covered.map(r=>r.resourceId));
  const cost=c=>c.kind==='resource'&&resourceIds.has(c.id),effect=e=>e.type==='resource_credit'&&resourceIds.has(e.id);
  if(!operation.costs.some(cost)&&!operation.effects.some(effect))return operation;
  const floors=narrative.filter(source=>!source.is_user&&operation.evidence.some(quote=>source.content.includes(quote)));
  const paid=covered.filter(r=>floors.some(source=>source.index===r.index));
  if(!paid.length&&floors.length)return operation;
  assert(floors.length===1,'兑换点已按另笔正文回执核对，请分开核对涉及多个楼层的收益');
  assert(paid.every(anchor=>archiveContextCurrent({source:{type:'story',anchor}},chat)&&
    archiveReadText(chat[anchor.index].mes??chat[anchor.index].content??'').length===anchor.length),'此楼层的兑换点已按另一版回复入账，请手动核对余额');
  const ids=new Set(paid.map(r=>r.resourceId));
  const costs=operation.costs.filter(c=>c.kind!=='resource'||!ids.has(c.id));
  const effects=operation.effects.filter(e=>e.type!=='resource_credit'||!ids.has(e.id));
  return costs.length||effects.length?{...operation,costs,effects}:null;
}
