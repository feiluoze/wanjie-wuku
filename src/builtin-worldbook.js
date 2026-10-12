import { BUILTIN_WORLDBOOK as book } from './builtin-worldbook-data.js';
import { assert, clone, hash, stable } from './primitives.js';
export const BUILTIN_BOOK_NAME = book.entries[0].book;
export function importedCatalogBooks(catalog = []) {
  const counts = new Map();
  for (const entry of catalog) if (entry.book && entry.book !== BUILTIN_BOOK_NAME) counts.set(entry.book, (counts.get(entry.book) || 0) + 1);
  return [...counts].map(([name, count]) => ({name, count}));
}
export function removeCatalogBook(catalog, name) {
  assert(name && name !== BUILTIN_BOOK_NAME && importedCatalogBooks(catalog).some(b => b.name === name), '请选择已读取的世界书；内置库无需移除');
  return withBuiltinCatalog(catalog.filter(entry => entry.book !== name));
}
const byName = new Map(book.entries.map(e=>[e.name,e]));
const byHash = new Map(book.entries.map(e=>[hash(e.content),e]));
const previous = new Map(book.legacy.map(e=>[e.contentHash,e]));
const oldBindings = new Set(book.legacyAdapterDigests);
const targetFor = body => byHash.get(hash(body)) || byName.get(previous.get(hash(body))?.target);
export const builtinWorldbookInfo = () => ({version:book.version,sourceSha256:book.sourceSha256,authorEntries:book.authorEntries,entries:book.entries.length,...(book.overrides?{overrides:clone(book.overrides)}:{})});
export const builtinEntries = () => clone(book.entries);
// Reading the renamed author file must not create a second copy of the same power.
export function builtinPowerId(entry, powers = {}) {
  const target=targetFor(entry.content || '');
  if(!target)return entry.id;
  return Object.values(powers).find(p=>targetFor(p.primaryRules ?? p.rules ?? '')?.entryId===target.entryId)?.id || entry.id;
}

// Collapse recognized official rules across imported books, preferring a source
// without a download-copy suffix. Never deduplicate custom rules by name alone.
export function withBuiltinCatalog(catalog = []) {
  const result = [], seen = new Set(), available = new Set(), preferred = new Map();
  const copySuffix = /\s*[（(]\d+[）)]\s*$/;
  for (const entry of catalog) {
    const target = targetFor(entry.content || '');
    if (!target) continue;
    const current = preferred.get(target.entryId);
    if (!current || (copySuffix.test(current.book || '') && !copySuffix.test(entry.book || ''))) preferred.set(target.entryId, entry);
  }
  for (const entry of catalog) {
    const target = targetFor(entry.content || '');
    if (!target) { result.push(clone(entry)); continue; }
    if (seen.has(target.entryId)) continue;
    seen.add(target.entryId); available.add(target.name);
    const selected = preferred.get(target.entryId);
    result.push({...clone(selected),book:(selected.book || '').replace(copySuffix,''),name:target.name,entryId:target.entryId,content:target.content,auxiliary:target.auxiliary});
  }
  result.push(...builtinEntries().filter(e=>!available.has(e.name)));
  return result;
}

// Update rules only. IDs, balances, archives, history and memory selections survive.
// Hashes here identify unmodified shipped rules, never expire narrative records.
export function upgradeBuiltinPower(power) {
  const body = power.primaryRules ?? power.rules ?? '', target = targetFor(body);
  if (!target || !power.rules.startsWith(body)) return false;
  let suffix = power.rules.slice(body.length), nextSuffix = '', offset = 0;
  const companions = clone(power.companions || []);
  for (const companion of companions) {
    if (!suffix.startsWith('\n\n',offset)) break;
    const start=offset+2;
    const candidate=book.legacy.find(e=>e.name===companion.name && hash(suffix.slice(start,start+e.length))===e.contentHash);
    if (!candidate) break;
    const replacement=byName.get(candidate.target);
    if (!replacement) break;
    nextSuffix+='\n\n'+replacement.content;offset=start+candidate.length;
    companion.name=replacement.name;companion.id=replacement.entryId;
  }
  const rules=target.content+nextSuffix+suffix.slice(offset);
  const changed=rules!==power.rules || power.name!==target.name;
  if (!changed) return false;
  power.name=target.name;power.primaryRules=target.content;power.rules=rules;power.ruleVersion=hash(rules);power.companions=companions;
  power.source={...power.source,entryId:target.entryId};
  // Only a byte-identical shipped binding can be replaced automatically.
  // Player-authored bindings remain available for explicit review.
  if(power.adapterBinding && oldBindings.has(hash(stable(power.adapterBinding.config))))delete power.adapterBinding;
  if(target.name==='人生模拟')for(const resource of Object.values(power.resources || {}))if(resource.name==='今日模拟次数'){
    resource.name='模拟次数';resource.labels=[...new Set([...(resource.labels || []),'可用模拟次数','模拟次数','模拟次数余额'])];
  }
  return true;
}
