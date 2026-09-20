// empaqueta extension/ en dist/tiktok-gesture-scroll-<version>.zip (incluye vendor/).
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(root, 'extension');
if (!existsSync(join(ext, 'vendor', 'models', 'gesture_recognizer.task'))) {
  console.error('falta extension/vendor. corre `npm run setup` primero.');
  process.exit(1);
}
const { version } = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
mkdirSync(join(root, 'dist'), { recursive: true });
const zip = join(root, 'dist', `tiktok-gesture-scroll-${version}.zip`);
rmSync(zip, { force: true });

let r = spawnSync('zip', ['-r', '-q', '-X', zip, '.', '-x', '*.DS_Store'], { cwd: ext });
if (r.error) r = spawnSync('tar', ['-a', '-c', '-f', zip, '-C', ext, '.'], { stdio: 'inherit' });
if (r.status !== 0) { console.error('no se pudo crear el zip (se necesita `zip` o `tar` con soporte zip)'); process.exit(1); }
console.log('creado', zip);
