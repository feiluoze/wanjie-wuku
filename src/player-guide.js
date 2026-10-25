// Rule explanations are independent from automatic archive review.
import { assert, text } from './primitives.js';
// Match only whitespace differences, then store the actual source substring so
// persisted guides continue to satisfy the literal-evidence state contract.
function sourceQuote(value,rules){
 const quote=text(value,1200),needle=quote.replace(/\s/g,'');
 assert(needle.length>=6,'能力说明缺少逐字规则依据');
 if(rules.includes(quote))return quote;
 const positions=[];let compact='';
 for(let i=0;i<rules.length;i++)if(!/\s/.test(rules[i])){compact+=rules[i];positions.push(i);}
 const at=compact.indexOf(needle);
 assert(at>=0,'能力说明缺少逐字规则依据');
 return text(rules.slice(positions[at],positions[at+needle.length-1]+1),1200);
}
export function normalizePlayerGuide(raw, power, {issues}={}) {
  assert(raw && Object.keys(raw).every(k => ['summary', 'abilities'].includes(k)), '玩法说明格式无效');
  const summary = text(raw.summary, 400).trim();
  assert(summary && Array.isArray(raw.abilities) && raw.abilities.length > 0 && raw.abilities.length <= 12, '玩法说明需包含1至12个能力方向');
  const abilities = raw.abilities.flatMap((a,index) => {
    try {
      assert(a && Object.keys(a).every(k => ['name', 'description', 'ruleQuote'].includes(k)), '能力说明包含多余操作');
      const name = text(a.name, 80).trim(), description = text(a.description, 400).trim(), ruleQuote = sourceQuote(a.ruleQuote,power.rules);
      assert(name && description, '能力说明缺少名称或说明');
      return [{ name, description, ruleQuote }];
    } catch(error) {
      if(!issues)throw error;
      issues.push({kind:'玩法说明',name:`${power.name} · 第${index+1}项能力说明`,reason:error.message});
      return [];
    }
  });
  assert(abilities.length,'玩法说明没有通过校验的能力方向');
  return { ruleVersion: power.ruleVersion, summary, abilities };
}
export function currentPlayerGuide(power) {
  try { if (power.playerGuide?.ruleVersion === power.ruleVersion) return normalizePlayerGuide({ summary: power.playerGuide.summary, abilities: power.playerGuide.abilities }, power); } catch {}
  return null;
}
