import {archiveCurrent} from './archives.js';
// A world outline is a projection, not a newly acquired civilization or another
// archive. Keep its parent ID so correction and reroll use the original source.
export function taishiCivilizationOutlines(power,chat) {
  return Object.values(power.archives||{}).filter(r=>r.specific?.recordId==='world'&&r.status!=='ended'&&archiveCurrent(r,chat))
    .map(r=>({id:r.id,name:r.name,rows:['era','factions','resources'].filter(id=>r.specific.fields[id]).map(id=>({id,label:r.specific.labels[id]||id,value:r.specific.fields[id]}))})).filter(r=>r.rows.length);
}
