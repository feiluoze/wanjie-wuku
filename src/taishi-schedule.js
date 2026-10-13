// Deterministic narrative clock. No wall clock, host API, timer or model calls.
import {assert,hash,stable,clone} from './primitives.js';
export const SCHEDULE_UNITS={minute:'分钟',hour:'小时',day:'天',week:'周',month:'月',year:'年'};
const leap=y=>y%4===0&&(y%100!==0||y%400===0);
const monthDays=(y,m)=>[31,leap(y)?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
function civilMinutes(y,m,d,h=0,minute=0){let days=365*(y-1)+Math.floor((y-1)/4)-Math.floor((y-1)/100)+Math.floor((y-1)/400);for(let i=1;i<m;i++)days+=monthDays(y,i);return (days+d-1)*1440+h*60+minute;}
export function parseNarrativeTime(raw,calendar='gregorian'){
 assert(typeof raw==='string'&&raw.length<=500,'时间值须为500字以内的日期文本');const text=raw.normalize('NFKC').trim().split('@')[0].trim();
 let match;if(calendar==='day_counter'){
  match=/^第\s*(\d{1,9})\s*天(?:\s*[-T ]?\s*(\d{1,2}):(\d{2}))?$/.exec(text);assert(match,'剧情日序须为“第3天 14:30”或“第3天”');const [,day,h,mi]=match;assert(Number(day)>=1&&Number(h||0)<24&&Number(mi||0)<60,'剧情日序或时分无效');return {kind:'day',era:'剧情日序',minutes:(Number(day)-1)*1440+Number(h||0)*60+Number(mi||0),precision:h===undefined?'day':'minute'};
 }
 match=/^(.*?)(\d{1,6})年[-\s]*(\d{1,2})月[-\s]*(\d{1,2})日(?:[-\s]*(?:星期[一二三四五六日天]|周[一二三四五六日天]))?(?:[-T\s]*(\d{1,2}):(\d{2}))?$/.exec(text)||/^(.*?)(\d{4,6})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?$/.exec(text);
 assert(match,'未识别明确年月日，可使用“纪元618年-07月-12日-14:40”');const [,prefix,ys,ms,ds,hs,mins]=match,y=Number(ys),m=Number(ms),d=Number(ds),h=Number(hs||0),mi=Number(mins||0);assert(y>=1&&m>=1&&m<=12&&d>=1&&d<=monthDays(y,m)&&h<24&&mi<60,'日期或时分无效');
 return {kind:'ymd',era:prefix.trim().replace(/[-\s]+$/,'')||'无纪元名',minutes:civilMinutes(y,m,d,h,mi),precision:hs===undefined?'day':'minute',parts:[y,m,d,h,mi]};
}
export function normalizeSchedule(raw){
 const tags=Array.isArray(raw.tags)?raw.tags:String(raw.tags||'tp').split(/[,，\n]/).map(v=>v.trim()).filter(Boolean),config={enabled:raw.enabled===true||raw.scheduleEnabled==='on',source:raw.source||'tag',tags:[...new Set(tags)],path:String(raw.path||'').trim(),calendar:raw.calendar||'gregorian',worldId:String(raw.worldId||''),interval:Number(raw.interval??12),unit:raw.unit||'hour',timeKind:raw.timeKind||'internal',rate:Number(raw.rate??1),onParseFail:raw.onParseFail||'notify'};
 assert(['tag','mvu'].includes(config.source)&&['gregorian','day_counter'].includes(config.calendar)&&Object.hasOwn(SCHEDULE_UNITS,config.unit),'时间来源或间隔单位无效');
 assert(config.tags.length>=1&&config.tags.length<=8&&config.tags.every(t=>/^[\p{L}_][\p{L}\d_.:-]{0,39}$/u.test(t)&&!['script','style','think','thinking','analysis','UpdateVariable'].includes(t)),'标签填写名称即可，最多8项，不填写尖括号或正则');
 assert(config.source!=='mvu'||/^\/(?:[^/]+\/?)+$/.test(config.path)&&config.path.length<=300&&!/~(?![01])/.test(config.path)&&config.path.split('/').every(v=>!['__proto__','prototype','constructor'].includes(v)),'变量路径须为stat_data下的JSON Pointer，例如 /世界/时间');
 assert(Number.isFinite(config.interval)&&config.interval>0&&config.interval<=1e6&&(['month','year'].includes(config.unit)?Number.isInteger(config.interval)&&config.calendar==='gregorian':true),'更新间隔无效；月/年仅支持标准年月日的整数间隔');
 assert(['internal','external'].includes(config.timeKind)&&Number.isFinite(config.rate)&&config.rate>0&&config.rate<=1e9&&/^(?:\d+)(?:\.\d{1,6})?$/.test(String(config.rate)),'时间倍率须为正数，最多6位小数');assert(['skip','notify'].includes(config.onParseFail),'解析失败只支持跳过或跳过并提示');assert(config.worldId.length<=200&&(!config.enabled||config.worldId),'请先选择演化世界');if(config.timeKind==='internal')config.rate=1;return config;
}
export function scheduleSignature(config){const {enabled,...rest}=normalizeSchedule(config);return hash(stable(rest));}
export function readTaggedTime(content,tags){
 const clean=String(content).replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi,'');const values=[];
 for(const tag of tags){const escaped=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');for(const m of clean.matchAll(new RegExp('<'+escaped+'(?=[\\s>])[^>]*>([\\s\\S]*?)<\\/'+escaped+'\\s*>','gu')))values.push(m[1].trim());}
 assert(values.length&&values.length<=8,'当前角色回复没有可用时间标签，已跳过');const distinct=[...new Set(values)];assert(distinct.length===1,'同一回复存在多个不同时间值，请先统一时间标签');return distinct[0];
}
export function readTimePointer(stat,path){let value=stat;for(const encoded of path.slice(1).split('/')){const key=encoded.replace(/~1/g,'/').replace(/~0/g,'~');assert(!['__proto__','prototype','constructor'].includes(key)&&value&&typeof value==='object'&&Object.hasOwn(value,key),'时间变量路径不存在');value=value[key];}assert(typeof value==='string','时间变量须为明确的日期文本');return value;}
export function intervalMinutes(config,from){
 const scale={minute:1,hour:60,day:1440,week:10080};if(scale[config.unit])return config.interval*scale[config.unit];assert(from.kind==='ymd','月/年间隔需要完整年月日');const [y,m,d,h,mi]=from.parts,total=y*12+m-1+config.interval*(config.unit==='year'?12:1),ny=Math.floor(total/12),nm=total%12+1;return civilMinutes(ny,nm,Math.min(d,monthDays(ny,nm)),h,mi)-from.minutes;
}
export function scheduleDue(schedule,observation){
 const config=normalizeSchedule(schedule.config);assert(config.enabled&&schedule.baseline,'请先设置时间来源并建立起点');const from=schedule.baseline,to=observation;assert(from.stamp.kind===to.stamp.kind&&from.stamp.era===to.stamp.era,'纪元或历法发生变化，请重新设置时间起点');assert(!['minute','hour'].includes(config.unit)||[from,to].every(o=>o.stamp.precision==='minute'),'小时/分钟更新需要日期中包含时分');const delta=to.stamp.minutes-from.stamp.minutes;assert(delta>=0,'剧情时间倒退，请核对分支或重新设置起点');if(delta<intervalMinutes(config,from.stamp))return null;
 const elapsed=delta*(config.timeKind==='external'?config.rate:1)/60;assert(elapsed>0&&elapsed<=1e9,'本段内部历时超出支持范围，请分段确认');return {id:hash(stable({config:scheduleSignature(config),from,to})),configHash:scheduleSignature(config),worldId:config.worldId,from:clone(from),to:clone(to),elapsed,unit:'hours'};
}
export function validateSchedule(value){
 if(value===undefined)return;assert(value&&Object.keys(value).every(k=>['config','baseline','history','paused'].includes(k)),'剧情时间设置无效');normalizeSchedule(value.config);assert(value.paused===undefined||typeof value.paused==='boolean','时间调度暂停标识无效');assert(Array.isArray(value.history)&&value.history.length<=128,'演化时间历史无效');
 for(const o of [value.baseline,...value.history.flatMap(r=>[r.from,r.to])].filter(Boolean)){assert(o&&typeof o.raw==='string'&&o.raw.length<=500&&stable(parseNarrativeTime(o.raw,value.config.calendar))===stable(o.stamp),'剧情时间基准无效');const a=o.anchor;assert(a&&Number.isSafeInteger(a.index)&&a.index>=0&&Number.isSafeInteger(a.swipeId)&&a.swipeId>=0&&Number.isSafeInteger(a.length)&&a.length>=0&&/^[a-f0-9]{16}$/.test(a.textHash),'剧情时间来源无效');}
 for(const r of value.history)assert(r&&/^[a-f0-9]{16}$/.test(r.id)&&r.from&&r.to&&r.to.stamp.minutes>r.from.stamp.minutes,'演化时间记录无效');
}
