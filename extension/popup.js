import { LABEL_NAMES, PRESETS } from './gesture.js';

const $ = (id) => document.getElementById(id);
const els = {
  enabled: $('enabled'), preset: $('preset'), hold: $('hold'), holdOut: $('holdOut'),
  preview: $('preview'), placeholder: $('placeholder'), status: $('status'),
  gNext: $('gNext'), gPrev: $('gPrev'), nNext: $('nNext'), nPrev: $('nPrev'),
  cam: $('cam'), overlay: $('overlay'), badge: $('badge'), fps: $('fps'), bar: $('holdBar'), seen: $('seen'),
};

const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

const GLYPH = { thumb_up: 'thumb-up', thumb_down: 'thumb-down', two_up: 'two-up', two_down: 'two-down' };

let state = { enabled: false, tiktokOpen: false, engine: null, camera: 'prompt' };
let previewOn = false;
let heartbeat = 0;
let stream = null;
let fireTimer = 0;

async function refresh() {
  const [{ enabled = false, preset = 'thumbs', holdMs = 400 }, { engine = null }, tabs] = await Promise.all([
    chrome.storage.local.get(['enabled', 'preset', 'holdMs']),
    chrome.storage.session.get('engine'),
    chrome.tabs.query({ url: 'https://www.tiktok.com/*' }),
  ]);
  try {
    state.camera = (await navigator.permissions.query({ name: 'camera' })).state;
  } catch { /* permissions api no disponible: se decide al pedirla */ }
  state = { ...state, enabled, tiktokOpen: tabs.length > 0, engine };
  els.enabled.checked = enabled;
  els.preset.value = PRESETS[preset] ? preset : 'thumbs';
  els.hold.value = holdMs;
  els.holdOut.textContent = (holdMs / 1000).toFixed(1) + ' s';
  const shown = PRESETS[els.preset.value];
  els.gNext.setAttribute('href', '#' + GLYPH[shown.next]);
  els.gPrev.setAttribute('href', '#' + GLYPH[shown.prev]);
  els.nNext.textContent = shown.text[0].toLowerCase();
  els.nPrev.textContent = shown.text[1].toLowerCase();
  render();
}

function statusText() {
  if (!state.enabled) return 'Desactivada. Actívala con el interruptor de arriba.';
  if (state.camera === 'denied') return 'La cámara está bloqueada para esta extensión. Habilítala en la configuración de sitios del navegador.';
  if (!state.tiktokOpen) return 'Abre tiktok.com y la cámara se enciende sola. Se apaga al cerrar la pestaña.';
  const e = state.engine;
  if (!e || e.state === 'loading') return 'Cargando el modelo de manos…';
  if (e.state === 'error') return e.error === 'NotAllowedError' ? 'Falta el permiso de cámara.' : e.error === 'NotFoundError' ? 'No se encontró ninguna cámara.' : 'Error: ' + e.error;
  return '';
}

function render() {
  const running = state.enabled && state.tiktokOpen && state.engine?.state === 'running';
  els.preview.hidden = !running;
  els.placeholder.hidden = running;
  els.seen.textContent = '';
  els.status.textContent = statusText();
  if (running) startPreview(); else stopPreview();
}

const ping = () => chrome.runtime.sendMessage({ type: 'preview' }).catch(() => {});

async function startPreview() {
  if (previewOn) return;
  previewOn = true;
  ping();
  heartbeat = setInterval(ping, 1000);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    els.cam.srcObject = stream;
  } catch { /* sin video de fondo, se dibuja solo el esqueleto */ }
}

function stopPreview() {
  previewOn = false;
  clearInterval(heartbeat);
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  els.cam.srcObject = null;
}

function setBadge(text, cls) {
  els.badge.textContent = text;
  els.badge.className = 'badge ' + (cls || '');
}

function onMessage(m) {
  if (m.type === 'gesture') {
    setBadge(m.dir === 'next' ? 'siguiente' : 'anterior', 'fire');
    els.bar.style.width = '100%';
    clearTimeout(fireTimer);
    fireTimer = setTimeout(() => setBadge('sin mano'), 700);
    return;
  }
  draw(m.hand, m.progress > 0);
  els.bar.style.width = Math.round((m.progress || 0) * 100) + '%';
  els.fps.textContent = m.fps ? m.fps + ' fps' : '';
  els.seen.textContent = m.hand ? 'modelo: ' + (m.seen ? m.seen.replace(' ', ' ') + ' %' : 'sin clasificar') : '';
  if (els.badge.classList.contains('fire')) return;
  if (!m.hand) setBadge('sin mano');
  else if (m.progress > 0) setBadge(LABEL_NAMES[m.label] || m.label, 'pose');
  else if (m.label) setBadge(LABEL_NAMES[m.label] || m.label, 'hand');
  else setBadge('mano detectada', 'hand');
}

function draw(hand, active) {
  const c = els.overlay;
  const w = (c.width = c.clientWidth * devicePixelRatio);
  const h = (c.height = c.clientHeight * devicePixelRatio);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (!hand) return;
  // el video se recorta con object-fit: cover; se ajusta el mapeo para que coincida
  const vw = els.cam.videoWidth || 640, vh = els.cam.videoHeight || 480;
  const s = Math.max(w / vw, h / vh);
  const ox = (w - vw * s) / 2, oy = (h - vh * s) / 2;
  const P = (p) => [ox + p[0] * vw * s, oy + p[1] * vh * s];
  ctx.lineCap = 'round';
  const dpr = devicePixelRatio;
  // un halo de papel bajo la tinta mantiene legible el dibujo sobre cualquier fondo
  const stroke = (width, color) => {
    ctx.lineWidth = width * dpr; ctx.strokeStyle = color;
    for (const [a, b] of BONES) { ctx.beginPath(); ctx.moveTo(...P(hand[a])); ctx.lineTo(...P(hand[b])); ctx.stroke(); }
  };
  const ink = active ? '#2a3a2a' : '#1a1208';
  stroke(5, 'rgba(245,240,232,.9)');
  stroke(2, ink);
  for (const p of hand) {
    const [x, y] = P(p);
    ctx.fillStyle = '#f5f0e8'; ctx.beginPath(); ctx.arc(x, y, 4.2 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x, y, 2.6 * dpr, 0, Math.PI * 2); ctx.fill();
  }
}

els.enabled.addEventListener('change', async () => {
  const on = els.enabled.checked;
  if (on && state.camera !== 'granted') {
    els.enabled.checked = false;
    if (state.camera === 'denied') return refresh();
    await chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
    return window.close();
  }
  await chrome.storage.local.set({ enabled: on });
});
els.preset.addEventListener('change', () => chrome.storage.local.set({ preset: els.preset.value }));
els.hold.addEventListener('input', () => {
  els.holdOut.textContent = (els.hold.value / 1000).toFixed(1) + ' s';
  chrome.storage.local.set({ holdMs: Number(els.hold.value) });
});

chrome.runtime.onMessage.addListener((m) => (m?.type === 'frame' || m?.type === 'gesture') && onMessage(m));
chrome.storage.onChanged.addListener(refresh);
chrome.tabs.onUpdated.addListener(refresh);
chrome.tabs.onRemoved.addListener(refresh);
addEventListener('unload', stopPreview);
refresh();
