// corre en tiktok.com. recibe 'navigate' desde el service worker y cambia de video.
// 'next' = siguiente video, 'prev' = anterior.

const MIN_GAP_MS = 500;
let lastNav = 0;

function mostVisibleVideo() {
  let best = null;
  let bestArea = 0;
  for (const v of document.querySelectorAll('video')) {
    const r = v.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    if (w * h > bestArea) {
      bestArea = w * h;
      best = v;
    }
  }
  return best;
}

function scrollParent(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.scrollHeight > p.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return document.scrollingElement;
}

// el contenedor de un video del feed mide (casi) lo mismo que el viewport del scroller
function itemHeight(video, scroller) {
  const ref = scroller.clientHeight || innerHeight;
  for (let e = video; e && e !== scroller; e = e.parentElement) {
    const h = e.getBoundingClientRect().height;
    if (h >= ref * 0.7) return h;
  }
  return ref;
}

function pressKey(key) {
  const code = key === 'ArrowDown' ? 40 : 38;
  document.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true }));
}

function navigate(dir) {
  const now = Date.now();
  if (now - lastNav < MIN_GAP_MS) return;
  lastNav = now;
  const step = dir === 'next' ? 1 : -1;
  showToast(step);

  const video = mostVisibleVideo();
  if (!video) return pressKey(step > 0 ? 'ArrowDown' : 'ArrowUp');
  const scroller = scrollParent(video);
  scroller.scrollBy({ top: step * itemHeight(video, scroller), behavior: 'smooth' });
}

let toast;
let toastTimer;
function showToast(step) {
  if (!toast) {
    toast = document.createElement('div');
    toast.setAttribute('aria-hidden', 'true');
    Object.assign(toast.style, {
      position: 'fixed', right: '24px', top: '50%', zIndex: 2147483647, width: '46px', height: '46px',
      marginTop: '-23px', borderRadius: '50%', background: '#f5f0e8', color: '#1a1208',
      border: '1px solid #1a1208', boxShadow: '0 2px 10px rgba(26,18,8,.25)',
      display: 'grid', placeItems: 'center', pointerEvents: 'none', opacity: '0',
      transition: 'opacity .15s ease, transform .25s ease',
    });
    document.documentElement.appendChild(toast);
  }
  toast.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${step > 0 ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg>`;
  toast.style.transform = `translateY(${step > 0 ? '-8px' : '8px'})`;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(0)';
  }, 450);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'navigate' && (msg.dir === 'next' || msg.dir === 'prev')) navigate(msg.dir);
});
