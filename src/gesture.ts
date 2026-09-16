/**
 * Geste aus Hand-Landmarks klassifizieren (heuristisch, on-device).
 *
 * Landmark-Indizes (MediaPipe Hands):
 *  0 Handgelenk (wrist)
 *  Daumen: 1-4 (Tip=4, MCP=2)
 *  Zeigefinger: 5-8  (Tip=8,  PIP=6)
 *  Mittelfinger: 9-12 (Tip=12, PIP=10)
 *  Ringfinger: 13-16  (Tip=16, PIP=14)
 *  Kleiner Finger: 17-20 (Tip=20, PIP=18)
 */

export type Landmark = { x: number; y: number; z: number };

/** Geste: 0 Stein, 1 Papier, 2 Schere, null = unklar */
export type Gesture = 0 | 1 | 2 | null;

export const GESTURE_NAMES: Record<string, string> = {
  '0': 'Stein',
  '1': 'Papier',
  '2': 'Schere',
  null: 'unklar',
};

/** Schwellwert Finger: dist(tip, wrist) > dist(pip, wrist) * THRESH_FINGER → gestreckt */
export const THRESH_FINGER = 1.15;
/** Schwellwert Daumen: dist(4, 17) > dist(3, 17) * THRESH_THUMB → abgespreizt */
export const THRESH_THUMB = 1.1;

const TIPS = [8, 12, 16, 20];
const PIPS = [6, 10, 14, 18];

export function dist2(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Anzahl gestreckter Finger (ohne Daumen) */
export function extendedFingers(lm: Landmark[]): number {
  let count = 0;
  for (let i = 0; i < 4; i++) {
    if (dist2(lm[TIPS[i]], lm[0]) > dist2(lm[PIPS[i]], lm[0]) * THRESH_FINGER * THRESH_FINGER) {
      count++;
    }
  }
  return count;
}

/** Daumen abgespreizt (seitlich von der Hand weg)? */
export function thumbExtended(lm: Landmark[]): boolean {
  return dist2(lm[4], lm[17]) > dist2(lm[3], lm[17]) * THRESH_THUMB * THRESH_THUMB;
}

/**
 * Mapping:
 *   0 gestreckte Finger            → Stein (Faust)
 *   genau Zeige- + Mittelfinger (2) → Schere
 *   >= 4 gestreckte Finger         → Papier
 *   alles andere                   → unklar (z. B. nur Ringfinger, Daumen-Bonus allein)
 */
export function classify(lm: Landmark[]): Gesture {
  if (!lm || lm.length !== 21) return null;
  const fingers = extendedFingers(lm);

  if (fingers === 0) return 0; // Faust → Stein (Daumenlage egal, auch angelegt)
  if (fingers === 2) {
    // Schere: exakt Zeige- (8) + Mittelfinger (12) gestreckt
    const indexUp = dist2(lm[8], lm[0]) > dist2(lm[6], lm[0]) * THRESH_FINGER * THRESH_FINGER;
    const middleUp = dist2(lm[12], lm[0]) > dist2(lm[10], lm[0]) * THRESH_FINGER * THRESH_FINGER;
    if (indexUp && middleUp) return 2;
    return null;
  }
  if (fingers >= 4) return 1; // Papier (Daumen optional)
  return null; // 1 oder 3 Finger, mehrdeutig
}

/* ------------------------------------------------------------------ */
/* Stabilisierung: Ringpuffer über Frames                              */
/* ------------------------------------------------------------------ */

export const WINDOW = 12;
export const THRESH = 8;
/** Zeitfenster für fps-unabhängige Stabilität (30 vs 60 fps Parität) */
export const TIME_WINDOW_MS = 250;
/** Mindestanzahl Samples im Zeitfenster */
export const TIME_THRESH = 6;

type Sample = { g: Gesture; t: number };

export class GestureHistory {
  private buffer: Sample[] = [];

  push(g: Gesture, now: number = performance.now()): void {
    this.buffer.push({ g, t: now });
    if (this.buffer.length > WINDOW) this.buffer.shift();
  }

  /** Letzte Geste, wenn sie stabil genug ist (Frame- ODER Zeitfenster-Kriterium) */
  stable(now: number = performance.now()): Gesture {
    const buf = this.buffer;
    if (buf.length === 0) return null;
    const candidate = buf[buf.length - 1].g;
    if (candidate === null) return null;

    // Kriterium 1: Frame-Fenster (WINDOW Samples, THRESH Treffer)
    let frameCount = 0;
    for (const s of buf) if (s.g === candidate) frameCount++;
    if (frameCount >= THRESH) return candidate;

    // Kriterium 2: Zeitfenster (bei niedriger FPS zählen weniger Samples pro Zeitspanne)
    let timeCount = 0;
    for (const s of buf) if (s.g === candidate && now - s.t <= TIME_WINDOW_MS) timeCount++;
    if (timeCount >= TIME_THRESH) return candidate;

    return null;
  }

  /** Nicht brutal leeren: nur älteste Samples bis zu einer Marke entfernen */
  soften(): void {
    // halben Puffer fallen lassen, damit nach Rundenende nicht sofort „stabil“
    const drop = Math.floor(this.buffer.length / 2);
    this.buffer = this.buffer.slice(drop);
  }

  reset(): void {
    this.buffer = [];
  }
}