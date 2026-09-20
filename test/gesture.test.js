import test from 'node:test';
import assert from 'node:assert/strict';
import { HoldDetector, classify, isTwoFingerPose, twoFingerDirection, PRESETS } from '../extension/gesture.js';

// mano sintetica: muneca en (cx, cy), tamaño s (muneca -> nudillo del medio). angle: 0 = dedos hacia
// arriba, 180 = hacia abajo, 90 = hacia la derecha. pose: 'two' | 'open' | lista de dedos estirados.
function hand(cx = 300, cy = 300, s = 100, pose = 'two', angle = 0) {
  const ext = pose === 'two' ? ['index', 'middle'] : pose === 'open' ? ['index', 'middle', 'ring', 'pinky'] : pose;
  const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  const at = (dx, up) => ({ x: dx * s, y: -up * s });
  lm[0] = at(0, 0);
  lm[5] = at(-0.3, 0.95); lm[6] = at(-0.3, 1.5);
  lm[9] = at(0, 1.0); lm[10] = at(0, 1.45);
  lm[13] = at(0.3, 0.95); lm[14] = at(0.3, 1.4);
  lm[17] = at(0.55, 0.85); lm[18] = at(0.55, 1.2);
  lm[8] = ext.includes('index') ? at(-0.3, 2.1) : at(-0.3, 1.0);
  lm[12] = ext.includes('middle') ? at(0, 2.2) : at(0, 1.05);
  lm[16] = ext.includes('ring') ? at(0.3, 2.0) : at(0.3, 1.0);
  lm[20] = ext.includes('pinky') ? at(0.55, 1.7) : at(0.55, 0.9);
  const a = (angle * Math.PI) / 180;
  return lm.map((p) => ({ x: cx + p.x * Math.cos(a) - p.y * Math.sin(a), y: cy + p.x * Math.sin(a) + p.y * Math.cos(a) }));
}

// alimenta el detector a 30 fps con [etiqueta, duracion_ms]; devuelve los disparos con su instante.
function run(d, steps, t0 = 0) {
  const events = [];
  let t = t0;
  for (const [label, ms] of steps) {
    for (const end = t + ms; t < end; t += 1000 / 30) {
      const ev = d.update(label, t);
      if (ev) events.push([ev, Math.round(t)]);
    }
  }
  return events;
}

const T = 'thumb_up', D = 'thumb_down';

test('dos dedos: pose y direccion', () => {
  assert.equal(isTwoFingerPose(hand(300, 300, 100, 'two')), true);
  assert.equal(isTwoFingerPose(hand(300, 300, 100, 'open')), false);
  assert.equal(twoFingerDirection(hand(300, 300, 100, 'two', 0)), 'up');
  assert.equal(twoFingerDirection(hand(300, 300, 100, 'two', 180)), 'down');
  assert.equal(twoFingerDirection(hand(300, 300, 100, 'two', 90)), null);
  assert.equal(twoFingerDirection(hand(300, 300, 100, 'two', -90)), null);
});

test('classify: dos dedos arriba/abajo, tolera inclinacion moderada', () => {
  assert.equal(classify(hand(300, 300, 100, 'two', 0), null), 'two_up');
  assert.equal(classify(hand(300, 300, 100, 'two', 180), null), 'two_down');
  assert.equal(classify(hand(300, 300, 100, 'two', 30), null), 'two_up');
  assert.equal(classify(hand(300, 300, 100, 'two', -40), null), 'two_up');
  assert.equal(classify(hand(300, 300, 100, 'two', 150), null), 'two_down');
  assert.equal(classify(hand(300, 300, 100, 'two', 60), null), null);   // muy de lado
});

test('classify: otras poses sin clasificador no dan etiqueta', () => {
  for (const pose of [[], ['index'], ['middle'], ['index', 'middle', 'ring'], ['index', 'middle', 'pinky'], 'open']) {
    assert.equal(classify(hand(300, 300, 100, pose), null), null, JSON.stringify(pose));
  }
});

test('classify: usa el clasificador de mediapipe con puntaje suficiente', () => {
  const open = hand(300, 300, 100, 'open');
  assert.equal(classify(open, { categoryName: 'Thumb_Up', score: 0.9 }), 'thumb_up');
  assert.equal(classify(open, { categoryName: 'Thumb_Down', score: 0.7 }), 'thumb_down');
  assert.equal(classify(open, { categoryName: 'Open_Palm', score: 0.95 }), 'palm');
  assert.equal(classify(open, { categoryName: 'Closed_Fist', score: 0.8 }), 'fist');
  assert.equal(classify(open, { categoryName: 'Pointing_Up', score: 0.8 }), 'point_up');
  assert.equal(classify(open, { categoryName: 'Thumb_Up', score: 0.5 }), null);       // puntaje bajo
  assert.equal(classify(open, { categoryName: 'None', score: 0.99 }), null);
  assert.equal(classify(open, { categoryName: 'ILoveYou', score: 0.99 }), null);      // no soportado
  assert.equal(classify(null, { categoryName: 'Thumb_Up', score: 0.9 }), 'thumb_up'); // sin landmarks tambien
  assert.equal(classify(null, null), null);
});

test('classify: dos dedos tiene prioridad sobre el clasificador', () => {
  assert.equal(classify(hand(300, 300, 100, 'two', 0), { categoryName: 'Closed_Fist', score: 0.99 }), 'two_up');
});

test('presets apuntan a etiquetas que classify puede producir', () => {
  assert.deepEqual([PRESETS.thumbs.next, PRESETS.thumbs.prev], ['thumb_up', 'thumb_down']);
  assert.deepEqual([PRESETS.two.next, PRESETS.two.prev], ['two_up', 'two_down']);
});

test('mantener el gesto 400 ms dispara "next"; antes, no', () => {
  const d = new HoldDetector();
  assert.deepEqual(run(d, [[T, 380]]), []);
  const d2 = new HoldDetector();
  const ev = run(d2, [[T, 600]]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0][0], 'next');
  assert.ok(ev[0][1] >= 400 && ev[0][1] < 450, `disparo en ${ev[0][1]} ms`);
});

test('el otro gesto dispara "prev"', () => {
  assert.deepEqual(run(new HoldDetector(), [[D, 600]]).map((e) => e[0]), ['prev']);
});

test('gestos que no estan mapeados no hacen nada', () => {
  assert.deepEqual(run(new HoldDetector(), [['fist', 3000], ['palm', 3000], ['point_up', 3000]]), []);
});

test('mantenerlo mucho tiempo dispara una sola vez', () => {
  assert.equal(run(new HoldDetector(), [[T, 6000]]).length, 1);
});

test('soltar el gesto lo rearma, y vuelve a disparar', () => {
  const ev = run(new HoldDetector(), [[T, 600], [null, 500], [T, 600]]);
  assert.deepEqual(ev.map((e) => e[0]), ['next', 'next']);
});

test('soltar muy poco tiempo no rearma', () => {
  const ev = run(new HoldDetector(), [[T, 600], [null, 250], [T, 1500]]);
  assert.equal(ev.length, 1);
});

test('hueco corto (<= 200 ms) no reinicia el conteo', () => {
  const ev = run(new HoldDetector(), [[T, 200], [null, 150], [T, 300]]);
  assert.equal(ev.length, 1);
  assert.ok(ev[0][1] < 480, `disparo en ${ev[0][1]} ms`);   // cuenta desde el inicio, no desde el hueco
});

test('parpadeo del clasificador (huecos de 100 ms) no impide confirmar', () => {
  const steps = [];
  for (let i = 0; i < 8; i++) steps.push([T, 100], [null, 100]);
  assert.equal(run(new HoldDetector(), steps).length, 1);
});

test('hueco largo (> 200 ms) reinicia el conteo', () => {
  const ev = run(new HoldDetector(), [[T, 300], [null, 260], [T, 300]]);
  assert.equal(ev.length, 0);
});

test('pasar directo de un gesto al otro dispara el segundo', () => {
  const ev = run(new HoldDetector(), [[T, 600], [D, 700]]);
  assert.deepEqual(ev.map((e) => e[0]), ['next', 'prev']);
});

test('cooldown: gestos alternados muy rapido no disparan cada uno', () => {
  const d = new HoldDetector({ holdMs: 100 });
  const ev = run(d, [[T, 150], [D, 150], [T, 150], [D, 150]]);
  assert.ok(ev.length < 4, `disparos: ${ev.length}`);
});

test('tiempo de espera configurable', () => {
  const d = new HoldDetector({ holdMs: 200 });
  const ev = run(d, [[T, 400]]);
  assert.equal(ev.length, 1);
  assert.ok(ev[0][1] >= 200 && ev[0][1] < 260, `disparo en ${ev[0][1]} ms`);
});

test('setConfig cambia los gestos mapeados', () => {
  const d = new HoldDetector();
  d.setConfig({ next: 'two_up', prev: 'two_down' });
  assert.deepEqual(run(d, [[T, 600]]), []);                  // el pulgar ya no esta mapeado
  assert.deepEqual(run(d, [['two_up', 600]], 1000).map((e) => e[0]), ['next']);
});

test('progress: sube hasta 1 y baja a 0 tras disparar', () => {
  const d = new HoldDetector();
  assert.equal(d.progress(0), 0);
  d.update(T, 0);
  assert.ok(Math.abs(d.progress(200) - 0.5) < 1e-9);
  run(d, [[T, 500]], 33);
  assert.equal(d.progress(600), 0);                          // ya disparo, desarmado
});
