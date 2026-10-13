import {assert} from './primitives.js';
import {isTaishi} from './taishi.js';
// Narrative import is not permission to register every world or NPC encountered.
export function assertTaishiOwnership(power,raw,before,quote,content='') {
 if(!isTaishi(power)||before)return;
 assert(quote&&content.includes(quote),'太始天新对象缺少连续原文归属证据；不能用AI转述建立关联');
 const fields=raw.details||{},world=power.archives?.[fields.world_id];
 const linked=world?.specific?.recordId==='world'&&String(quote).includes(world.name)&&String(quote).includes(raw.name);
 const alias=String(power.name).split(/[（(]/)[0].trim();
 const explicit=String(quote).split(/[。！？\n]/).some(sentence=>alias&&sentence.includes(alias)&&sentence.includes(raw.name)&&/(?:已|正式|成功).{0,8}(?:纳入|创建|迁入|加入|受封|缔约|归属)/.test(sentence)&&!/(?:尚未|未曾|没有|计划|准备|拟将)/.test(sentence));
 assert(linked||explicit,'太始天归属未确认：新对象须有已登记世界ID及同段关联证据，或明确纳入太始天的事实；外界出场不自动建档，请通过建立世界/添加人物确认范围');
}
