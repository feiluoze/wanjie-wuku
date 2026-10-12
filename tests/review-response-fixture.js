// Successful mock models explicitly acknowledge the input floors. Tests of
// missing/invalid acknowledgements must return their own unmodified responses.
export function completeReview(prompt,data={changes:[]}){
 const sources=prompt?JSON.parse(prompt.user).sources||[]:[{index:0}];
 return JSON.stringify({...data,floorReviews:sources.map(s=>({sourceIndex:s.index,status:'reviewed',changeCount:['changes','terminalResults','creationResults'].flatMap(k=>data[k]||[]).filter(r=>(r.sourceIndex??(sources.length===1?s.index:undefined))===s.index).length}))});
}
