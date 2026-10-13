import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinEntries, BUILTIN_BOOK_NAME, importedCatalogBooks, removeCatalogBook, withBuiltinCatalog } from '../src/builtin-worldbook.js';
import { createPower, stable } from '../src/core.js';
import { getSettings } from '../src/host.js';
import { WorkbenchUI } from '../src/ui.js';
import { fixture } from './mvu-fixture.js';

const custom = { ...builtinEntries()[0], id:'local-custom', book:'个人规则 <测试>', content:'玩家定制的独立机制。' };

test('remove a read book, preserve saved powers, persist and allow re-reading',async()=>{
  const f=fixture();f.ctx.saveSettingsDebounced=()=>{};
  f.app.settings.catalog=withBuiltinCatalog([custom]);
  const power=createPower(custom);f.state.powers[power.id]=power;
  const before=stable(f.store.read());
  await f.app.action('remove-read-book',{book:custom.book});
  assert(!f.app.settings.catalog.some(e=>e.id===custom.id));
  assert.equal(f.app.settings.catalog.length,123);
  assert.equal(stable(f.store.read()),before);
  assert.equal(stable(getSettings(f.ctx).catalog),stable(f.app.settings.catalog));
  await f.app.catalog([custom]);
  assert.equal(importedCatalogBooks(f.app.settings.catalog)[0].name,custom.book);
  assert.equal(stable(f.store.read()),before);
});

test('protect builtin library and keep catalog unchanged when settings cannot save',async()=>{
  const f=fixture();f.app.settings.catalog=withBuiltinCatalog([custom]);
  const before=stable(f.app.settings.catalog);
  assert.throws(()=>removeCatalogBook(f.app.settings.catalog,BUILTIN_BOOK_NAME),/内置库/);
  assert.throws(()=>removeCatalogBook(f.app.settings.catalog,'不存在'),/已读取/);
  await assert.rejects(f.app.removeReadBook(custom.book),/设置无法保存/);
  assert.equal(stable(f.app.settings.catalog),before);
});

test('read-book manager escapes names and offers removal for imported sources only',()=>{
  let html='';
  WorkbenchUI.prototype.showManage.call({dialog(_title,body){html=body;},rolePanel(){return '';},previewRule(){},updateRoleSelection(){},entryOption(){return '';},modal:{querySelector(){return null;}}},withBuiltinCatalog([custom]));
  assert(html.includes('已读取的世界书（1 本）'));
  assert(html.includes('个人规则 &lt;测试&gt;'));
  assert(html.includes('data-action="remove-read-book"'));
  assert(!html.includes(`data-book="${BUILTIN_BOOK_NAME}"`));
});
