export const BUILD_OBJECT_LIMIT=24;
export const objectMarkers=text=>[...String(text).matchAll(/^(?:#{1,6}\s+)?【(?:世界|地域|人物|组织|势力|政权|文明|族群)】[^\r\n]+/gm)].map(m=>m.index);
export const objectCost=text=>Math.max(1,objectMarkers(text).length);
export const packetObjectCost=books=>books.reduce((n,b)=>n+b.entries.reduce((sum,e)=>sum+objectCost(e.content),0),0);
