import {withBuiltinStatusbar} from './builtin-statusbar.js';
import { isTaishi, taishiConfig } from './taishi.js';
import { isMmlc } from './mmlc.js';
import { MMLC_CONFIG } from './mmlc-config.js';
import {mmlcRuleSelection} from './mmlc-rulebook.js';
// Resolve declared adapters without loading a generation controller.
import { CREATION_PRESETS } from './creation-presets.js';
import { adapterBindingCurrent, primaryHash } from './adapters.js';
function baseCreationConfig(power){
 if(isMmlc(power))return MMLC_CONFIG;
 if(power.adapterBinding){const c=adapterBindingCurrent(power)?power.adapterBinding.config:null;return c&&isTaishi(power)&&c.id==='wuku.primordial_world'?taishiConfig(c):c;}
 if(isTaishi(power))return taishiConfig();
 return CREATION_PRESETS.find(c=>c.target.primaryHashes.includes(primaryHash(power))&&c.operations.every(o=>(power.primaryRules??power.rules).includes(o.ruleQuote)))||null;
}

export const creationRules = (power,operationId='',goal='') => isMmlc(power) ? power.rules+"\n\n以下是漫漫长路玩法参考，仅用于拟定，不作为已拥有成果：\n"+mmlcRuleSelection(operationId,goal).text : power.rules;

export function creationConfig(power){return withBuiltinStatusbar(baseCreationConfig(power),power);}
