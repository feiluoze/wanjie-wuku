import {normalizeCustomParameters} from './model-parameters.js';
// Account preferences contain no game state. Schemes are kept out of chat exports.
export const THEMES = Object.freeze({ follow:'跟随酒馆', light:'浅色', dark:'深色', night:'夜读', parchment:'羊皮纸', green:'护眼绿' });
export const themeId = value => Object.hasOwn(THEMES, value) ? value : 'follow';
export const GENERATION_DEFAULTS = Object.freeze({temperature:0.85,maxTokens:60000,timeoutSeconds:300,thinkingMode:'auto',customParameters:''});
export const REQUEST_TIMEOUT_LIMIT = 600;
// Old 120-second defaults are upgraded once. Saving afterwards preserves any
// explicit timeout, including 120, for the account and each saved profile.
export function upgradeTimeoutDefaults(saved = {}) {
  if(saved.timeoutDefaultsVersion === 1)return saved;
  const upgrade = row => ({...row,...(Number(row.timeoutSeconds)===120?{timeoutSeconds:GENERATION_DEFAULTS.timeoutSeconds}:{})});
  return {...upgrade(saved),timeoutDefaultsVersion:1,...(Array.isArray(saved.connectionProfiles)?{connectionProfiles:saved.connectionProfiles.map(upgrade)}:{})};
}
export const OUTPUT_TOKEN_LIMIT = 60000;
// Building a worldbook is a long, explicit request. Saved connection values
// continue to govern ordinary tasks; cancelling remains available throughout.
export function requestTimeoutSeconds(settings = {}, task = '') {
  const n = Number(settings.timeoutSeconds);
  const ordinary = Number.isFinite(n) ? Math.max(10, Math.min(REQUEST_TIMEOUT_LIMIT, n)) : GENERATION_DEFAULTS.timeoutSeconds;
  return task === 'setup' ? Math.max(600, ordinary) : ordinary;
}
export const CONNECTION_FIELDS = ['mode','baseUrl','model','temperature','maxTokens','timeoutSeconds','contextMessages','thinkingMode','customParameters'];
export function connectionValues(values, base = {}) {
  const next = { ...base, mode:values.mode, baseUrl:String(values.baseUrl || '').trim(), model:String(values.model || '').trim() };
  if (!['off','st','custom'].includes(next.mode)) throw Error('连接方式无效');
  if (next.mode === 'custom') {
    let url; try { url = new URL(next.baseUrl); } catch { throw Error('API地址无效'); }
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw Error('API地址无效');
    if (!next.model) throw Error('独立模型名不能为空');
  }
  for (const [key,min,max] of [['temperature',0,2],['maxTokens',256,OUTPUT_TOKEN_LIMIT],['timeoutSeconds',10,REQUEST_TIMEOUT_LIMIT],['contextMessages',1,100]]) {
    const n=Number(values[key] ?? base[key]);
    if (!Number.isFinite(n) || n<min || n>max || (key!=='temperature' && !Number.isInteger(n))) throw Error('连接参数超出范围');
    next[key]=n;
  }
  next.thinkingMode=values.thinkingMode ?? base.thinkingMode ?? 'auto';
  if(!['auto','off','on'].includes(next.thinkingMode))throw Error('思考模式无效');
  next.customParameters=normalizeCustomParameters(values.customParameters ?? base.customParameters ?? '');
  return next;
}
export function connectionKey(values, current) {
  return values.clearKey ? '' : String(values.apiKey || '').trim() || (values.profileKeyPolicy==='new' ? '' : current);
}
