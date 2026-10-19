// One source per request prevents later floors from replacing the historical
// input. This is bounded sequential work, never an automatic retry loop.
export async function reviewHistory(sources, request, {check=()=>{}, progress=()=>{}, stage=data=>data}={}) {
 const data={changes:[],terminalResults:[],creationResults:[],floorReviews:[],historyIssues:[],rawFailures:[]};let result;
 for(let i=0;i<sources.length;i++){
  check();const source=sources[i];progress(i+1,sources.length,source.index+1);
  let current;
  try{
   current=await request(source);check();result=current;
   if(current.data.floorReviews!==undefined&&!Array.isArray(current.data.floorReviews))throw Error('逐层报告无效');
   for(const key of ['changes','terminalResults','creationResults']){
    if(current.data[key]!==undefined&&!Array.isArray(current.data[key]))throw Error('返回列表无效');
    if((current.data[key]||[]).some(row=>row.sourceIndex!==undefined&&row.sourceIndex!==source.index))throw Error('候选引用了未提供的楼层');
   }
   current={...current,data:await stage(current.data,source)};check();
   for(const key of ['changes','terminalResults','creationResults'])data[key].push(...(current.data[key]||[]).map(row=>({...row,sourceIndex:source.index})));
   // Reports are not invented from successful HTTP requests.
   data.floorReviews.push(...(current.data.floorReviews||[]).filter(row=>row?.sourceIndex===source.index));
   if(current.data.guide&&!data.guide)data.guide=current.data.guide;
  }catch(error){
   check();if(error?.name==='AbortError')throw error;
   if(error.archiveResponseFailure){data.rawFailures.push({...error.archiveResponseFailure,sourceIndexes:[source.index]});result||={captured:error.archiveResponseFailure.captured,contextHash:error.archiveResponseFailure.contextHash,referenceFingerprint:error.archiveResponseFailure.referenceFingerprint};}
   data.historyIssues.push({...(error.archiveResponseFailure?{rawResponseFailure:true}:{}),kind:'分层请求',name:'第 '+(source.index+1)+' 层',sourceIndex:source.index,reason:'本层请求或返回结构失败，保留待重查；没有自动重试'});
   data.floorReviews.push({sourceIndex:source.index,status:'uncertain',changeCount:0});
   if(!current){if(!result)throw error;for(const remaining of sources.slice(i+1)){data.historyIssues.push({kind:'分层请求',name:'第 '+(remaining.index+1)+' 层',sourceIndex:remaining.index,reason:'前层请求失败，剩余请求未执行，保留待重查'});data.floorReviews.push({sourceIndex:remaining.index,status:'uncertain',changeCount:0});}break;}
  }
 }
 return {...result,data};
}
