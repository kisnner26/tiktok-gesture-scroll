// gestos estaticos: se mantiene una pose ~0.4 s y dispara una sola vez.
// logica pura, sin dom ni extension apis, para poder probarla con `node --test`.
//
// classify(): landmarks (px) + categoria del clasificador de mediapipe -> etiqueta de gesto.
// HoldDetector: etiqueta por fotograma -> 'next' | 'prev' | null.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const WRIST = 0;
const INDEX = { pip: 6, tip: 8 };
const MIDDLE = { pip: 10, tip: 12 };
const RING = { pip: 14, tip: 16 };
const PINKY = { pip: 18, tip: 20 };

export const LABEL_NAMES = {
  thumb_up: 'Pulgar arriba',
  thumb_down: 'Pulgar abajo',
  two_up: 'Dos dedos arriba',
  two_down: 'Dos dedos abajo',
  point_up: 'Dedo arriba',
  fist: 'Puño',
  palm: 'Palma abierta',
};

export const PRESETS = {
  thumbs: { next: 'thumb_up', prev: 'thumb_down', text: ['Pulgar arriba', 'Pulgar abajo'] },
  two: { next: 'two_up', prev: 'two_down', text: ['Dos dedos hacia arriba', 'Dos dedos hacia abajo'] },
};

// categorias del clasificador de mediapipe que se aceptan, con su nombre interno
const CANNED = {
  Thumb_Up: 'thumb_up',
  Thumb_Down: 'thumb_down',
  Pointing_Up: 'point_up',
  Closed_Fist: 'fist',
  Open_Palm: 'palm',
};

const MIN_SCORE = 0.6;
const MAX_TILT = 1.2; // |dx| <= |dy| * MAX_TILT: unos 50 grados de la vertical

// indice y medio estirados, anular y menique doblados. el pulgar no cuenta.
export function isTwoFingerPose(lm) {
  const w = lm[WRIST];
  const reach = (f) => dist(lm[f.tip], w) / dist(lm[f.pip], w);
  return reach(INDEX) > 1.12 && reach(MIDDLE) > 1.12 && reach(RING) < 1.0 && reach(PINKY) < 1.0;
}

// hacia donde apuntan los dos dedos: 'up' | 'down' | null (de lado)
export function twoFingerDirection(lm) {
  const w = lm[WRIST];
  const dx = (lm[INDEX.tip].x + lm[MIDDLE.tip].x) / 2 - w.x;
  const dy = (lm[INDEX.tip].y + lm[MIDDLE.tip].y) / 2 - w.y;
  if (Math.abs(dx) > Math.abs(dy) * MAX_TILT) return null;
  return dy < 0 ? 'up' : 'down';
}

// lm: 21 puntos en px o null. canned: {categoryName, score} del clasificador o null.
// dos dedos usa reglas propias (validadas con webcam real) y va primero; el resto, el clasificador.
export function classify(lm, canned) {
  if (lm && isTwoFingerPose(lm)) {
    const d = twoFingerDirection(lm);
    if (d) return `two_${d}`;
  }
  if (canned && canned.score >= MIN_SCORE) return CANNED[canned.categoryName] ?? null;
  return null;
}

export const DEFAULTS = { next: 'thumb_up', prev: 'thumb_down', holdMs: 400 };

const GAP_MS = 200; // un fotograma perdido no rompe la pose
const REARM_MS = 350; // sin ver el gesto este tiempo, se puede volver a disparar
const COOLDOWN_MS = 600;

export class HoldDetector {
  constructor(cfg = {}) {
    this.cfg = { ...DEFAULTS };
    this.setConfig(cfg);
    this.reset();
  }

  setConfig(cfg) {
    this.cfg = { ...this.cfg, ...cfg };
  }

  reset() {
    this.cand = null; // etiqueta que se esta manteniendo
    this.candSince = 0;
    this.lastSeen = -Infinity;
    this.armed = true;
    this.lastFire = -Infinity;
  }

  // label: etiqueta del fotograma o null. t: ms. devuelve 'next' | 'prev' | null.
  update(label, t) {
    const { next, prev, holdMs } = this.cfg;
    const valid = label === next || label === prev ? label : null;

    if (valid) {
      if (valid !== this.cand) {
        // pasar directo de un gesto a otro cuenta como gesto nuevo
        if (this.cand) this.armed = true;
        this.cand = valid;
        this.candSince = t;
      }
      this.lastSeen = t;
      if (this.armed && t - this.candSince >= holdMs && t - this.lastFire >= COOLDOWN_MS) {
        this.armed = false;
        this.lastFire = t;
        return valid === next ? 'next' : 'prev';
      }
      return null;
    }

    const away = t - this.lastSeen;
    if (!this.armed && away >= REARM_MS) this.armed = true;
    if (away > GAP_MS) this.cand = null; // hueco corto: se tolera, la pose sigue contando
    return null;
  }

  // 0..1: cuanto falta para confirmar el gesto que se esta manteniendo
  progress(t) {
    if (!this.cand || !this.armed) return 0;
    return Math.min(1, (t - this.candSince) / this.cfg.holdMs);
  }
}
