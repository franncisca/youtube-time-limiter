importScripts('../shared/core.js');
const store = new YTLCore.Store(chrome.storage.local);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'open-settings') {
    Promise.resolve().then(() => chrome.runtime.openOptionsPage()).then(() => respond({ ok: true }), error => respond({ error: error.message }));
    return true;
  }
  store.request(message).then(state => respond({ state }), error => respond({ error: error.message }));
  return true;
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
