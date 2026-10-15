// Provider result boundary: soft grouping is not a reason to discard valid facts.
export const REVIEW_SEGMENT_SIZE=64;
export const MAX_RETURNED_CHANGES=4096;
export function inspectArchiveList(data){
 const raw=data?.changes,shape=raw===null?'null':Array.isArray(raw)?'array':typeof raw;
 let changes=raw,adapted=false;
 if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
  if(Object.keys(raw).length===1&&Array.isArray(raw.items)){changes=raw.items;adapted=true;}
  else if(typeof raw.type==='string'&&typeof raw.name==='string'&&raw.fields&&typeof raw.fields==='object'){changes=[raw];adapted=true;}
 }
 const count=Array.isArray(changes)?changes.length:null;
 const diagnostic={stage:'result_list',shape,count,softLimit:REVIEW_SEGMENT_SIZE,hardLimit:MAX_RETURNED_CHANGES,segments:count===null?0:Math.ceil(count/REVIEW_SEGMENT_SIZE),adapted};
 const code=!Array.isArray(changes)?'changes_not_array':count>MAX_RETURNED_CHANGES?'changes_over_safety_limit':null;
 if(code)return {diagnostic,issue:{kind:'候选列表',name:'返回列表',reason:code==='changes_not_array'?'changes格式不是候选数组；原始结果已保留，可导出后本地核对，不会推进读取进度':`收到${count}项候选，超过本地安全处理上限${MAX_RETURNED_CHANGES}；原始结果保留，未截断或推进进度`,diagnostic:{...diagnostic,code}}};
 return {diagnostic,data:{...data,changes}};
}
