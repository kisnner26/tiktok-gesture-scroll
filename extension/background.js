// mantiene la camara encendida solo mientras haya una pestaña de tiktok abierta
// y la extension este activada. el trabajo pesado vive en offscreen.js.

const TIKTOK = 'https://www.tiktok.com/*';

let chain = Promise.resolve();
const sync = () => (chain = chain.then(doSync, doSync));

async function hasOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return ctx.length > 0;
}

async function doSync() {
  const { enabled = false } = await chrome.storage.local.get('enabled');
  const tabs = await chrome.tabs.query({ url: TIKTOK });
  const want = enabled && tabs.length > 0;
  const has = await hasOffscreen();
  if (want && !has) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Leer la webcam para detectar gestos de mano mientras hay una pestaña de TikTok abierta.',
    });
  } else if (!want && has) {
    await chrome.offscreen.closeDocument();
    await chrome.storage.session.remove('engine');
  }
}

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
chrome.tabs.onCreated.addListener(sync);
chrome.tabs.onRemoved.addListener(sync);
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (change.url) sync();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) sync();
});

// los documentos offscreen solo tienen chrome.runtime: todo lo que toque storage o tabs pasa por aqui.
const settings = () => chrome.storage.local.get({ preset: 'thumbs', holdMs: 400 });

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && (changes.preset || changes.holdMs)) {
    chrome.runtime.sendMessage({ type: 'settings', ...(await settings()) }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.url !== chrome.runtime.getURL('offscreen.html')) return;
  switch (msg?.type) {
    case 'getSettings':
      settings().then(sendResponse);
      return true;
    case 'engine':
      chrome.storage.session.set({ engine: { state: msg.state, error: msg.error ?? null } });
      break;
    case 'gesture':
      // pestaña de tiktok activa de la ventana en primer plano
      chrome.tabs.query({ url: TIKTOK, active: true, lastFocusedWindow: true }).then(([tab]) => {
        if (tab?.id != null) chrome.tabs.sendMessage(tab.id, { type: 'navigate', dir: msg.dir }).catch(() => {});
      });
      break;
  }
});
