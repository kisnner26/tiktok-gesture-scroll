import { FilesetResolver, GestureRecognizer } from './vendor/mediapipe/vision_bundle.mjs';
import { HoldDetector, PRESETS, classify } from './gesture.js';

// el wasm de mediapipe escribe sus avisos informativos (formato glog, niveles I y W) con
// console.warn, y chrome los lista como errores de la extension. se descartan solo esos:
// los errores reales (nivel E, excepciones) siguen visibles.
const GLOG = /^[IW]\d{4} \d\d:\d\d:\d\d\.\d+\s+\d+ [\w./-]+:\d+\]/;
for (const level of ['log', 'info', 'warn']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    if (typeof args[0] === 'string' && GLOG.test(args[0])) return;
    original(...args);
  };
}

const video = document.getElementById('cam');
const detector = new HoldDetector();
let previewUntil = 0; // el popup avisa con un latido mientras esta abierto

// un documento offscreen solo tiene chrome.runtime (sin storage ni tabs): se habla con el service worker.
const setEngine = (state, error) => chrome.runtime.sendMessage({ type: 'engine', state, error: error || null }).catch(() => {});

function applySettings(s) {
  const preset = PRESETS[s.preset] || PRESETS.thumbs;
  detector.setConfig({ next: preset.next, prev: preset.prev, holdMs: s.holdMs });
}
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'settings') applySettings(msg);
  else if (msg?.type === 'preview') previewUntil = performance.now() + 2500;
});

async function createRecognizer() {
  const fileset = await FilesetResolver.forVisionTasks(chrome.runtime.getURL('vendor/mediapipe/wasm'));
  const base = { modelAssetPath: chrome.runtime.getURL('vendor/models/gesture_recognizer.task') };
  const opts = { runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.6, minTrackingConfidence: 0.5 };
  try {
    return await GestureRecognizer.createFromOptions(fileset, { ...opts, baseOptions: { ...base, delegate: 'GPU' } });
  } catch {
    return GestureRecognizer.createFromOptions(fileset, { ...opts, baseOptions: { ...base, delegate: 'CPU' } });
  }
}

async function main() {
  setEngine('loading');
  applySettings(await chrome.runtime.sendMessage({ type: 'getSettings' }));
  const recognizer = await createRecognizer();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, frameRate: 30, facingMode: 'user' },
  });
  video.srcObject = stream;
  await video.play();
  setEngine('running');

  // un documento offscreen no renderiza: requestVideoFrameCallback y requestAnimationFrame
  // no se disparan nunca. solo los temporizadores funcionan, asi que se hace polling.
  let lastVideoTime = -1;
  let lastPreview = 0;
  let frames = 0;
  let fpsSince = performance.now();
  let fps = 0;
  const tick = () => {
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    const now = performance.now();
    const res = recognizer.recognizeForVideo(video, now);
    const norm = res.landmarks?.[0] || null;
    const px = norm && norm.map((p) => ({ x: p.x * video.videoWidth, y: p.y * video.videoHeight }));
    const canned = res.gestures?.[0]?.[0] || null;

    const label = classify(px, canned);
    const dir = detector.update(label, now);
    if (dir) {
      // lo reciben el service worker (navega) y el popup si esta abierto (feedback)
      chrome.runtime.sendMessage({ type: 'gesture', dir }).catch(() => {});
    }

    frames++;
    if (now - fpsSince >= 1000) {
      fps = Math.round((frames * 1000) / (now - fpsSince));
      frames = 0;
      fpsSince = now;
    }
    if (now < previewUntil && now - lastPreview > 50) {
      lastPreview = now;
      const hand = norm && norm.map((p) => [p.x, p.y]);
      const seen = canned ? `${canned.categoryName} ${Math.round(canned.score * 100)}` : null;
      chrome.runtime.sendMessage({ type: 'frame', hand, label, progress: detector.progress(now), fps, seen }).catch(() => {});
    }
  };
  setInterval(() => {
    try {
      tick();
    } catch (e) {
      console.error('frame', e); // un fotograma malo no debe matar el bucle
    }
  }, 20);
}

main().catch((e) => {
  console.error(e);
  const name = e?.name;
  setEngine('error', name === 'NotAllowedError' || name === 'NotFoundError' ? name : String(e?.message || e));
});
