import test from 'node:test';
import strict from 'node:assert/strict';
import { ChatStore, installInjection, scope } from '../src/host.js';
import { MODULE_ID, ASYNC_MARKER, STATE_MARKER, hash, clone, emptyState } from '../src/core.js';

function fixture({ deny = false, badSave = false } = {}) {
  const memory = new Map(), handlers = new Map(); let saved;
  const localStorage = { getItem: k => memory.get(k), setItem: (k, v) => { if (deny) throw new Error('quota'); memory.set(k, v); } };
  const ctx = { userHandle: 'test-user', chatId: 'chat-one', characterId: 0, characters: [{ avatar: 'a.png', name: '角色' }], name1: '玩家', name2: '角色', chatMetadata: {}, chat: [{ mes: '开场' }], accountStorage: { getItem: () => null, setItem: () => { throw new Error('AccountStorage is not a checkpoint'); } }, getRequestHeaders: () => ({ 'Content-Type': 'application/json' }), saveChat: async () => { if (badSave) return; saved = clone(ctx.chatMetadata); }, eventTypes: { CHAT_COMPLETION_PROMPT_READY: 'chat-ready', GENERATE_AFTER_COMBINE_PROMPTS: 'plain-ready' }, eventSource: { on: (event, handler) => handlers.set(event, handler), removeListener: event => handlers.delete(event) } };
  const store = new ChatStore({ context: () => ctx, storageImpl: localStorage, lockManager: null, fetchImpl: async () => ({ ok: true, json: async () => [{ chat_metadata: saved || {} }] }) });
  return { ctx, store, memory, handlers };
}
test('server save is verified against read-back data rather than save return value', async () => { const { store } = fixture(); const result = await store.transact(s => { s.syncCursor = 1; }); strict.equal(result.save.verified, true); strict.equal(store.read().revision, 1); });
test('a stale first read is checked once more without replaying save or mutation', async()=>{
 const {store,ctx}=fixture();let reads=0,saves=0,mutations=0;const original=ctx.saveChat;
 ctx.saveChat=async()=>{saves++;await original();};
 store.fetchImpl=async()=>({ok:true,json:async()=>[{chat_metadata:++reads===1?{}:clone(ctx.chatMetadata)}]});
 const r=await store.transact(s=>{mutations++;s.syncCursor=1;});
 strict.equal(r.save.verified,true);strict.equal(reads,2);strict.equal(saves,1);strict.equal(mutations,1);
});
test('unverified save diagnostics identify missing state without recording private contents',async()=>{
 const {store}=fixture({badSave:true});const reports=[];store.onPersistence=r=>reports.push(r);
 await store.transact(s=>{s.syncCursor=1;});strict.deepEqual(reports[0].verification,{attempts:2,reason:'missing'});
 strict.equal('state' in reports[0],false);
});
test('swallowed host save failure still preserves one durable local transaction and reports unverified', async () => { const { store, ctx, memory } = fixture({ badSave: true }); const result = await store.transact(s => { s.syncCursor = 1; }); strict.equal(result.save.verified, false); strict.match(result.save.note, /本机备份/); ctx.chatMetadata = {}; strict.equal(store.read().syncCursor, 1); strict.equal(memory.size, 1); });
test('local persistence failure falls back to verified host storage', async () => {
  const { store, memory } = fixture({ deny: true }); const reports = []; store.onPersistence = report => reports.push(report);
  const result = await store.transact(s => { s.syncCursor = 1; });
  strict.equal(result.save.verified, true); strict.equal(result.save.local, false); strict.equal(store.read().syncCursor, 1); strict.equal(memory.size, 0);
  strict.match(result.save.note, /已保存到酒馆/); strict.equal(reports.length, 1); strict.equal(reports[0].verified, true);
});
test('both save paths failing retain an exportable candidate and retry it without replaying mutation', async () => {
  const { store, ctx } = fixture({ deny: true, badSave: true });
  await strict.rejects(store.transact(s => { s.syncCursor++; }), /刷新前请先处理/);
  strict.equal(store.read().syncCursor, 1);
  await strict.rejects(store.transact(s => { s.syncCursor++; }), /上一笔档案/);
  store.storageImpl = { getItem: () => null, setItem: () => {} };
  const result = await store.retrySave(); strict.equal(result.local, true); strict.equal(store.pendingSaves.size, 0);
  strict.equal(store.read().syncCursor, 1); strict.equal(store.read().writeVersion, 1);
  strict.equal(ctx.chatMetadata.extensions[MODULE_ID].syncCursor, 1);
});
test('security restrictions and unavailable storage are diagnosed distinctly', async () => {
  for (const [storageImpl, reason] of [[null, '存储不可用'], [{ setItem() { throw Object.assign(new Error('private text'), { name: 'SecurityError' }); } }, '存储访问被限制'], [{ setItem() { throw Object.assign(new Error(), { name: 'QuotaExceededError' }); } }, '容量不足']]) {
    const { store } = fixture(); store.storageImpl = storageImpl;
    const reports = []; store.onPersistence = r => reports.push(r);
    await store.transact(s => { s.syncCursor = 1; }); strict.equal(reports[0].storageError, reason);
    strict.ok(!JSON.stringify(reports).includes('private text'));
  }
});
test('missing both storage and host save fails before installing candidate', async () => {
  const { store, ctx } = fixture({ deny: true }); ctx.saveChat = undefined; const before = store.read();
  await strict.rejects(store.transact(s => { s.syncCursor = 1; }), /没有酒馆保存接口/); strict.deepEqual(store.read(), before);
});
test('host error after a successful write is still confirmed by readback', async () => {
  const { store, ctx } = fixture({ deny: true }); const save = ctx.saveChat;
  ctx.saveChat = async () => { await save(); throw new Error('post-save failure'); };
  const result = await store.transact(s => { s.syncCursor = 1; }); strict.equal(result.save.verified, true);
});
test('diagnostics failure cannot prevent fallback save', async () => {
  const { store } = fixture({ deny: true }); store.onPersistence = () => { throw new Error('log failure'); };
  strict.equal((await store.transact(s => { s.syncCursor = 1; })).save.verified, true);
});
test('restricted localStorage getter does not crash ChatStore construction', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('restricted'); } });
  try { strict.equal(new ChatStore().storageImpl, null); }
  finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; }
});
test('pending candidate stays isolated when another chat is opened', async () => {
  const { store, ctx } = fixture({ deny: true, badSave: true });
  await strict.rejects(store.transact(s => { s.syncCursor = 9; }));
  ctx.chatId = 'other'; ctx.chatMetadata = {}; strict.equal(store.read().syncCursor, 0);
  ctx.chatId = 'chat-one'; ctx.chatMetadata = {}; strict.equal(store.read().syncCursor, 9);
});

test('failed candidate mutation does not partly modify metadata or backup', async () => { const { store, memory } = fixture(); const before = store.read(); await strict.rejects(store.transact(s => { s.syncCursor = 1; throw new Error('invalid-effect'); })); strict.deepEqual(store.read(), before); strict.equal(memory.size, 0); });
test('serialized updates reread the ledger and preserve both edits', async () => { const { store } = fixture(); await Promise.all([store.transact(s => { s.syncCursor++; }), store.transact(s => { s.syncCursor++; })]); strict.equal(store.read().syncCursor, 2); strict.equal(store.read().revision, 2); });
test('switching chat while an async candidate is waiting cannot write into the new chat', async () => { const { store, ctx, memory } = fixture(); let resume; const pending = store.transact(async s => { s.syncCursor = 1; await new Promise(resolve => { resume = resolve; }); }); await new Promise(resolve => setTimeout(resolve, 0)); ctx.chatId = 'chat-two'; ctx.chatMetadata = {}; resume(); await strict.rejects(pending, /聊天已切换/); strict.equal(memory.size, 0); strict.equal(store.read().syncCursor, 0); });
test('captured old revision cannot overwrite new facts', async () => { const { store } = fixture(); const captured = store.capture(); await store.transact(s => { s.syncCursor++; }); await strict.rejects(store.transact(s => { s.syncCursor = 99; }, { captured }), /档案已经变化/); strict.equal(store.read().syncCursor, 1); });
test('per-chat backups remain isolated', async () => { const { store, ctx } = fixture(); const old = scope(ctx).key; await store.transact(s => { s.syncCursor = 9; }); ctx.chatId = 'two'; ctx.chatMetadata = {}; strict.equal(store.read().syncCursor, 0); ctx.chatId = 'chat-one'; ctx.chatMetadata = {}; strict.equal(scope(ctx).key, old); strict.equal(store.read().syncCursor, 9); });
test('two accounts with identical character and chat filenames have distinct local checkpoints', async () => { const { store, ctx } = fixture(); await store.transact(s => { s.syncCursor = 7; }); ctx.userHandle = 'other-user'; ctx.chatMetadata = {}; strict.equal(store.read().syncCursor, 0); ctx.userHandle = 'test-user'; ctx.chatMetadata = {}; strict.equal(store.read().syncCursor, 7); });
test('main prompt receives authoritative state, own raw query remains untouched', () => {
  const { ctx, store, handlers } = fixture(); const state = emptyState(); state.powers.p = { id: 'p', name: '演示', active: true, rules: '完整演示正文', ruleVersion: hash('完整演示正文'), resources: {}, assets: {}, fields: { result: { label: '已完成', value: '永久所得已成立' } }, fixedQuotes: [], quotes: [], pricing: 'stateful' };
  ctx.chatMetadata.extensions = { [MODULE_ID]: state };
  const bridge = installInjection({ context: () => ctx, store }); strict.equal(bridge.chat, true); strict.equal(bridge.plain, true);
  const raw = { chat: [{ role: 'system', content: ASYNC_MARKER }] }; handlers.get('chat-ready')(raw); strict.equal(raw.chat.length, 1);
  const main = { chat: [{ role: 'user', content: '继续' }] }; handlers.get('chat-ready')(main); handlers.get('chat-ready')(main); strict.equal(main.chat.length, 2); strict.match(main.chat[1].content, /永久所得已成立/);
  const plain = { prompt: '当前故事' }; handlers.get('plain-ready')(plain); strict.match(plain.prompt, /永久所得已成立/); const asyncPlain = { prompt: ASYNC_MARKER }; handlers.get('plain-ready')(asyncPlain); strict.equal(asyncPlain.prompt, ASYNC_MARKER);
  bridge.cleanup(); strict.equal(handlers.size, 0); strict.equal(STATE_MARKER, 'WJWK_COMMITTED_STATE_V1');
});
