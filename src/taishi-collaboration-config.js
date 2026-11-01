// Pure persisted preferences. Core validation must not load model or archive code.
import {assert} from './primitives.js';
export function collaborationSettings(value={}){
 assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['mode','scope','summary','maxAttempts'].includes(k)),'多模型分工设置无效');
 const config={mode:value.mode??'split',scope:value.scope??'auto',summary:value.summary??false,maxAttempts:value.maxAttempts??3};
 assert(['single','split','deep'].includes(config.mode)&&['auto','both','world','people'].includes(config.scope)&&typeof config.summary==='boolean'&&Number.isInteger(config.maxAttempts)&&config.maxAttempts>=1&&config.maxAttempts<=3,'多模型模式、范围或重试上限无效');
 return config;
}
