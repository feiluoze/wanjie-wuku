// Native wand menu contract: ST 1.18.0 public/scripts/templates/wandMenu.html.
// No account, chat, settings, or model access is needed to expose an entrance.
const ENTRY_KEY = 'wanjie_wuku_general_entry';
export function mountEntry(load) {
  if (typeof document === 'undefined') return;
  if (globalThis[ENTRY_KEY]) return globalThis[ENTRY_KEY];
  const controller = new AbortController();
  const shell = document.createElement('div');
  shell.className = 'wjwk'; shell.id = 'wjwk-startup';
  shell.innerHTML = '<button type="button" class="wjwk-fab" aria-label="打开万界武库">武库</button><section class="wjwk-startup-card" role="dialog" aria-label="万界武库启动状态" hidden><h2>万界武库</h2><p role="status">正在启动…</p><button type="button" data-retry>重试启动</button><button type="button" data-reload>刷新酒馆</button><button type="button" data-close>关闭</button></section>';
  const menu = document.createElement('div');
  menu.id = 'wjwk-wand-entry'; menu.className = 'extension_container';
  menu.innerHTML = '<button type="button" class="list-group-item flex-container flexGap5" aria-label="打开万界武库"><i class="fa-solid fa-cube" aria-hidden="true"></i><span>万界武库</span></button>';
  let pending = null, app = null, error = '', destroyed = false, observer;
  const mount = () => {
    if (!document.body || destroyed) return;
    if (!shell.isConnected) document.body.append(shell);
    const target = document.getElementById('extensionsMenu');
    if (target && menu.parentElement !== target) target.append(menu);
  };
  const card = shell.querySelector('section'), status = shell.querySelector('[role="status"]');
  const open = () => {
    const current = globalThis.wanjie_wuku_general_instance;
    if (current && !current.destroyed) { current.ui.setOpen(true); return; }
    card.hidden = false;
    status.textContent = error ? '启动未完成：' + error + '。可重试启动；若仍失败，请刷新酒馆重新加载文件。无需删除聊天或重填 API。' : '正在等待酒馆就绪并加载操作台…';
  };
  const start = () => {
    if (pending || destroyed) return pending;
    error = ''; status.textContent = '正在等待酒馆就绪并加载操作台…';
    shell.querySelector('[data-retry]').disabled = true;
    pending = Promise.resolve().then(load).then(value => {
      if (destroyed) { value?.destroy?.(); return; }
      app = value; shell.querySelector('.wjwk-fab').hidden = true;
      if (!card.hidden) { card.hidden = true; app.ui.setOpen(true); }
      return app;
    }).catch(() => {
      // Host errors can contain private payloads. Only expose fixed diagnostic text.
      error = '宿主接口或扩展文件加载失败';
      shell.querySelector('.wjwk-fab').hidden = false; open();
    }).finally(() => { pending = null; shell.querySelector('[data-retry]').disabled = false; });
    return pending;
  };
  menu.addEventListener('click', open, { signal: controller.signal });
  shell.querySelector('.wjwk-fab').addEventListener('click', open, { signal: controller.signal });
  shell.querySelector('[data-retry]').addEventListener('click', start, { signal: controller.signal });
  shell.querySelector('[data-reload]').addEventListener('click', () => globalThis.location.reload(), { signal: controller.signal });
  shell.querySelector('[data-close]').addEventListener('click', () => { card.hidden = true; }, { signal: controller.signal });
  const destroy = () => { destroyed = true; controller.abort(); observer?.disconnect(); shell.remove(); menu.remove(); delete globalThis[ENTRY_KEY]; };
  const entry = { start, open, destroy };
  globalThis[ENTRY_KEY] = entry;
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true, signal: controller.signal });
  observer = new MutationObserver(() => { if (!shell.isConnected || !menu.isConnected) mount(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // Register this before starting the async runtime, including on the welcome screen.
  start();
  return entry;
}
