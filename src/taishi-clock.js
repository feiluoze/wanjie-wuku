import {assert,hash,stable,clone} from './primitives.js';
const SCALE=1000000n;
export function clockNumber(v){const s=String(v);assert(/^(?:0|[1-9]\d{0,79})(?:\.\d{1,6})?$/.test(s),'时间和倍率须为非负十进制数字，最多6位小数');return BigInt(s.split('.')[0])*SCALE+BigInt((s.split('.')[1]||'').padEnd(6,'0'));}
const decimal=n=>{const f=(n%SCALE).toString().padStart(6,'0').replace(/0+$/,'');return (n/SCALE).toString()+(f?'.'+f:'');};
const gcd=(a,b)=>{while(b){const next=a%b;a=b;b=next;}return a;};
const fraction=(n,d)=>{const g=gcd(n,d);return {numerator:(n/g).toString(),denominator:(d/g).toString()};};
function yearsOf(receipt,yearDays){let n=clockNumber(receipt.internal),d=1n;if(receipt.unit!=='years'){assert(yearDays,'请先补充本世界一年天数，再归档较早的小时或天记录');n*=SCALE;d=clockNumber(yearDays)*(receipt.unit==='hours'?24n:1n);}return {n,d};}
export function timeProduct(elapsed,rate){const n=clockNumber(elapsed)*clockNumber(rate);assert(n%SCALE===0n,'换算精度超过6位小数，请换单位或手动核对');return decimal(n/SCALE);}
export function readWorldClock(world){const raw=world?.specific?.fields?.time_state;if(!raw)return null;const s=JSON.parse(raw);validateWorldClock(s);return clone(s);}
export function validateWorldClock(s){
 assert(s&&s.version===1&&typeof s.main==='boolean'&&typeof s.firstSetting==='boolean'&&Array.isArray(s.receipts)&&s.receipts.length<=16,'世界时间记录格式无效');
 clockNumber(s.baselineYears);clockNumber(s.resetYears);assert(clockNumber(s.resetYears)<=clockNumber(s.baselineYears),'上次改设内历不能晚于时间基准');
 if(s.yearDays)assert(clockNumber(s.yearDays)>0n,'世界一年天数无效');
 if(s.baseExact)assert(/^\d{1,500}$/.test(s.baseExact.numerator)&&/^[1-9]\d{0,499}$/.test(s.baseExact.denominator),'时间归档基准无效');
 const seen=new Set();for(const r of s.receipts){assert(r&&typeof r.event==='string'&&r.event.trim()&&r.event.length<=120&&!seen.has(r.event)&&['world','region'].includes(r.scope)&&['hours','days','years'].includes(r.unit),'历时事件格式无效或重复');seen.add(r.event);assert(typeof r.regionId==='string'&&(r.scope!=='region'||r.regionId),'局部历时须选择区域');assert(clockNumber(r.external)>0n&&clockNumber(r.rate)>0n,'历时与倍率须大于零');assert(r.internal===timeProduct(r.external,r.rate),'历时换算不一致');assert(r.id===hash(stable({event:r.event,scope:r.scope,regionId:r.regionId,unit:r.unit,external:r.external,rate:r.rate})),'历时事件指纹无效');}
 assert(!s.settings||Array.isArray(s.settings)&&s.settings.length<=16,'设定事件记录无效');const settings=new Set();for(const r of s.settings||[]){assert(r&&typeof r.event==='string'&&r.event.trim()&&r.event.length<=120&&!settings.has(r.event)&&['initial','reset'].includes(r.kind)&&/^\d{1,500}$/.test(r.numerator)&&/^[1-9]\d{0,499}$/.test(r.denominator),'设定事件格式无效');settings.add(r.event);}
 assert(JSON.stringify(s).length<=4000,'历时记录已满，请另存档案后整理时间基准');return s;
}
export function appendWorldTime(previous,input){
 const s=previous?clone(previous):{version:1,main:input.main===true,firstSetting:input.firstSetting===true,baselineYears:input.baselineYears||'0',resetYears:input.resetYears||'0',yearDays:input.yearDays||'',receipts:[]};if(!s.yearDays&&input.yearDays)s.yearDays=String(input.yearDays);validateWorldClock(s);
 const r={event:String(input.event||'').trim(),scope:input.scope,regionId:input.scope==='region'?String(input.regionId||''):'',unit:input.unit,external:decimal(clockNumber(input.external)),rate:decimal(clockNumber(input.rate))};r.internal=timeProduct(r.external,r.rate);r.id=hash(stable(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='internal'))));
 const old=s.receipts.find(v=>v.event===r.event);if(old){assert(old.id===r.id,'同一历时事件已有不同记录，请先修正原档案');return {state:s,duplicate:true};}
 if(s.receipts.length>=8){const first=s.receipts.shift();if(first.scope==='world'){const base=s.baseExact||{numerator:clockNumber(s.baselineYears).toString(),denominator:'1'},elapsed=yearsOf(first,s.yearDays),n=BigInt(base.numerator),d=BigInt(base.denominator);s.baseExact=fraction(n*elapsed.d+elapsed.n*d,d*elapsed.d);}}
 s.receipts.push(r);validateWorldClock(s);return {state:s,duplicate:false};
}
export function clockSummary(s){
 validateWorldClock(s);let n=s.baseExact?BigInt(s.baseExact.numerator):clockNumber(s.baselineYears),d=s.baseExact?BigInt(s.baseExact.denominator):1n,unknown=false;
 for(const r of s.receipts.filter(r=>r.scope==='world')){if(r.unit!=='years'&&!s.yearDays){unknown=true;continue;}const {n:a,d:b}=yearsOf(r,s.yearDays),v=fraction(n*b+a*d,d*b);n=BigInt(v.numerator);d=BigInt(v.denominator);}
 const last=s.settings?.at(-1),resetN=last?BigInt(last.numerator):clockNumber(s.resetYears),resetD=last?BigInt(last.denominator):1n;
 const total=decimal(n/d),sinceNumerator=n*resetD-resetN*d,sinceD=d*resetD;assert(sinceNumerator>=0n,'设定时间晚于当前内历，请核对记录');
 const eligible=s.main&&!s.firstSetting&&sinceNumerator>=1000n*SCALE*sinceD;
 return {totalYears:total,sinceResetYears:decimal(sinceNumerator/sinceD),exact:fraction(n,d),unknown,eligible,qualification:s.main&&s.firstSetting?'首次设定资格保留':!s.main?'子界或区域不单独产生主世界改设资格':eligible?(unknown?'已满千年；登记改设前需核对未换算历时':'已可千年改设；未使用资格保留'):unknown?'含未换算历时，千年资格待核对':'未满主世界千年'};
}
export function completeWorldSetting(previous,event){
 const s=clone(previous);validateWorldClock(s);const v=clockSummary(s);assert(typeof event==='string'&&event.trim()&&event.length<=120,'请填写已完成设定的事件名称');assert(!(s.settings||[]).some(r=>r.event===event),'此设定事件已登记');assert(!v.unknown,'存在未换算历时，请先核对本世界历法');assert(s.main&&(s.firstSetting||v.eligible),'首次设定已使用且主世界未满千年，不能登记改设');
 s.settings||=[];if(s.settings.length>=8)s.settings.shift();s.settings.push({event:event.trim(),kind:s.firstSetting?'initial':'reset',...v.exact});s.firstSetting=false;validateWorldClock(s);return {state:s,setting:true,duplicate:false};
}
