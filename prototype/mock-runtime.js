/* Isolated demo adapter. The packaged extension never imports this file. */
(() => {
  function createRuntime() {
    const realNow = Date.now.bind(Date);
    const key = 'ytl-prototype-usage-v1';
    const listeners = new Set(); let offset = 0, saved;
    try { saved = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { saved = null; }
    let data = { usage: YTLCore.normalize(saved, realNow()) };
    const emit = state => { for (const listener of listeners) listener({ usage: { newValue: structuredClone(state) } }, 'local'); };
    const storage = {
      get: async () => structuredClone(data),
      set: async value => { data = structuredClone(value); sessionStorage.setItem(key, JSON.stringify(data.usage)); emit(data.usage); },
    };
    const now = () => realNow() + offset;
    const store = new YTLCore.Store(storage, now);
    return {
      now, monotonic: () => performance.now() + offset,
      advance: seconds => { offset += seconds * 1000; },
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      async send(message) {
        if (message.type === 'open-settings') { document.querySelector('#settings-tab')?.click(); return { ok: true }; }
        try { return { state: await store.request(message) }; } catch (error) { return { error: error.message }; }
      },
      async reset() {
        await Promise.resolve();
        await store.request({ type: 'status' });
        offset = 0;
        await storage.set({ usage: YTLCore.normalize(null, now()) });
        return data.usage;
      },
    };
  }
  const runtime = window.parent !== window && window.parent.YTLPrototype ? window.parent.YTLPrototype : createRuntime();
  window.YTLPrototype = runtime;
  // Demo-only clock override keeps the production settings view on the simulated date.
  Date.now = runtime.now;
  const subscriptions = new Map();
  window.chrome = {
    runtime: { sendMessage: message => runtime.send(message) },
    storage: { onChanged: {
      addListener(fn) { subscriptions.set(fn, runtime.subscribe(fn)); },
      removeListener(fn) { subscriptions.get(fn)?.(); subscriptions.delete(fn); },
    } },
  };
  window.addEventListener('pagehide', () => { for (const unsubscribe of subscriptions.values()) unsubscribe(); }, { once: true });
})();
