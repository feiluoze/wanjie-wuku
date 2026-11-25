import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinEntries, BUILTIN_BOOK_NAME, importedCatalogBooks, removeCatalogBook, withBuiltinCatalog } from '../src/builtin-worldbook.js';
import { createPower, stable, importBook, buildInjection } from '../src/core.js';
import {catalogGroups} from '../src/catalog-groups.js';
import {assertProfileRegistration} from '../src/management-profiles.js';
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
  assert.equal(f.app.settings.catalog.length,builtinEntries().length);
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
  const ui=Object.assign(Object.create(WorkbenchUI.prototype),{dialog(_title,body){html=body;},rolePanel(){return '';},manageVisibility(){},updateRoleSelection(){},modal:{querySelector(){return null;}}});
  ui.showManage(withBuiltinCatalog([custom]));
  assert(html.includes('已读取的世界书 · 1 本'));
  assert(html.includes('个人规则 &lt;测试&gt;'));
  assert(html.includes('data-action="remove-read-book"'));
  assert(!html.includes(`data-book="${BUILTIN_BOOK_NAME}"`));
});

test('catalog shows primary and supplemental rules in disjoint groups',()=>{
  const imported=importBook({entries:[
    {comment:'星图 · 新版',content:'独立机制。'},
    {comment:'星图·路径详解',content:'星图补充条款。'},
    {comment:'变更顺序',content:'全局补充。',auxiliary:true},
  ]},'私人世界书');
  const official=builtinEntries();
  const grouped=catalogGroups([...imported,...official]);
  const main=grouped.main.flatMap(root=>root.groups.flatMap(group=>group.entries));
  const supplements=grouped.supplements.flatMap(group=>group.entries);
  assert.equal(main.length+supplements.length,imported.length+official.length);
  assert(main.includes(imported[0]));
  assert(supplements.includes(imported[1])&&supplements.includes(imported[2]));
  assert(official.every(entry=>entry.auxiliary?supplements.includes(entry):main.includes(entry)));
  assert.throws(()=>assertProfileRegistration(imported[0],[main.find(entry=>entry.id!==imported[0].id)],{}),/附加库只能选/);
  assert.throws(()=>assertProfileRegistration(imported[1],[],{}),/辅助规则/);
  assert.doesNotThrow(()=>assertProfileRegistration(imported[0],imported.slice(1),{}));
});

test('editing and resetting the chat injection keeps primary source and supplements intact',async()=>{
  const f=fixture();
  const support={entryId:'support',name:'自编附加规则',content:'附加条款保留。'};
  const edited='本聊天正文修订，适用 {{user}}。';
  await f.store.transact(state=>{
    const power=state.powers[f.power.id];
    Object.assign(power,createPower({id:power.id,entryId:power.source.entryId,book:power.source.book,name:power.name,content:power.primaryRules},[support]));
  });
  f.app.ui.showRule=()=>{};
  await f.app.action('view-rule',{});
  const before=f.store.read().powers[f.power.id];
  await f.app.action('save-injection-rule',{id:f.power.id,values:{injectionRule:edited}});
  const state=f.store.read(),power=state.powers[f.power.id],packet=buildInjection(state,{user:'玩家'});
  assert.equal(power.rules,before.rules);
  assert.equal(power.ruleVersion,before.ruleVersion);
  assert(packet.includes('本聊天正文修订，适用 玩家。\n\n'+support.content));
  assert(!packet.includes(before.primaryRules));
  await f.app.action('reset-injection-rule',{id:f.power.id});
  assert(buildInjection(f.store.read()).includes(before.rules));
});
