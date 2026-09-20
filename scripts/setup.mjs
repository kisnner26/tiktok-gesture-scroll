// prepara extension/vendor: runtime wasm de mediapipe (desde node_modules) y el modelo de manos
// (gesture_recognizer.task, descarga oficial de google, verificada por sha256). requiere `npm install` antes.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const vendor = join(root, 'extension', 'vendor');
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const MODEL_SHA256 = '97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482';

if (!existsSync(pkg)) {
  console.error('falta @mediapipe/tasks-vision. corre `npm install` primero.');
  process.exit(1);
}

mkdirSync(join(vendor, 'mediapipe', 'wasm'), { recursive: true });
mkdirSync(join(vendor, 'models'), { recursive: true });
copyFileSync(join(pkg, 'vision_bundle.mjs'), join(vendor, 'mediapipe', 'vision_bundle.mjs'));
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  copyFileSync(join(pkg, 'wasm', f), join(vendor, 'mediapipe', 'wasm', f));
}
console.log('runtime de mediapipe copiado');

rmSync(join(vendor, 'models', 'hand_landmarker.task'), { force: true }); // modelo de versiones anteriores
const modelPath = join(vendor, 'models', 'gesture_recognizer.task');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
if (existsSync(modelPath) && sha(readFileSync(modelPath)) === MODEL_SHA256) {
  console.log('modelo ya presente y verificado');
} else {
  console.log('descargando modelo (~8.4 MB)...');
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`descarga fallida: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== MODEL_SHA256) throw new Error('el sha256 del modelo no coincide; no se guarda');
  writeFileSync(modelPath, buf);
  console.log('modelo descargado y verificado');
}
console.log('listo. carga la carpeta extension/ en chrome://extensions (modo desarrollador).');
