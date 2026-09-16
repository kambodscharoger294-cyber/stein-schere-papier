import { describe, expect, it } from 'vitest';
import { classify, extendedFingers, GestureHistory, thumbExtended, type Landmark } from '../src/gesture';

type P = [number, number];

/** Synthetische Hand aus 21 {x,y}-Paaren in Reihenfolge der MediaPipe-Indizes. */
function makeHand(points: P[]): Landmark[] {
  return points.map(([x, y]) => ({ x, y, z: 0 }));
}

const wrist: P = [0.5, 0.9];

function lerp(a: P, b: P, t: number): P {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Gelenkkette MCP, PIP, DIP, TIP – eingeklappt = Spitze nahe am MCP. */
function finger(mcp: P, tip: P, curled: boolean): P[] {
  if (curled) return [mcp, lerp(mcp, tip, 0.3), lerp(mcp, tip, 0.2), lerp(mcp, tip, 0.1)];
  return [mcp, lerp(mcp, tip, 0.4), lerp(mcp, tip, 0.7), tip];
}

/** Daumenkette CMC, MCP, IP, TIP (Indizes 1-4). */
function thumbChain(cmc: P, mcp: P, tip: P, curled: boolean): P[] {
  if (curled) return [cmc, mcp, lerp(mcp, tip, 0.5), lerp(mcp, tip, 0.25)];
  return [cmc, mcp, lerp(mcp, tip, 0.6), tip];
}

// Finger-Ankerpunkte (MCP) und TIPs bei gestrecktem Finger
const indexMCP: P = [0.42, 0.65];
const indexTip: P = [0.40, 0.30];
const middleMCP: P = [0.50, 0.64];
const middleTip: P = [0.50, 0.27];
const ringMCP: P = [0.58, 0.65];
const ringTip: P = [0.60, 0.32];
const pinkyMCP: P = [0.66, 0.69];
const pinkyTip: P = [0.70, 0.42];
// Daumen: 1 (CMC) 2 (MCP) 3 4 (TIP) 17 (Pinky-MCP als Referenz)
const thumbCMC: P = [0.55, 0.82];
const thumbMCP: P = [0.62, 0.80];

function hand(opts: {
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  thumbOut?: boolean;
}): Landmark[] {
  const pts: P[] = [wrist];
  pts.push(...thumbChain(thumbCMC, thumbMCP, opts.thumbOut ? [0.78, 0.7] : [0.56, 0.76], !opts.thumbOut));
  pts.push(...finger(indexMCP, indexTip, !opts.index));
  pts.push(...finger(middleMCP, middleTip, !opts.middle));
  pts.push(...finger(ringMCP, ringTip, !opts.ring));
  pts.push(...finger(pinkyMCP, pinkyTip, !opts.pinky));
  return makeHand(pts);
}

describe('gesture.classify – synthetische Landmarks', () => {
  it('Faust (Stein): alle Finger eingeklappt', () => {
    const g = classify(hand({ index: false, middle: false, ring: false, pinky: false }));
    expect(g).toBe(0);
  });

  it('Faust mit angelegtem Daumen ist weiterhin Stein', () => {
    const g = classify(hand({ index: false, middle: false, ring: false, pinky: false, thumbOut: false }));
    expect(g).toBe(0);
  });

  it('Schere: Zeige- + Mittelfinger gestreckt, Rest eingeklappt', () => {
    const g = classify(hand({ index: true, middle: true, ring: false, pinky: false }));
    expect(g).toBe(2);
  });

  it('Papier: alle fünf Finger gestreckt (Daumen variabel)', () => {
    expect(classify(hand({ index: true, middle: true, ring: true, pinky: true, thumbOut: true }))).toBe(1);
    expect(classify(hand({ index: true, middle: true, ring: true, pinky: true, thumbOut: false }))).toBe(1);
  });

  it('Edge Case: nur Ringfinger gestreckt → unklar', () => {
    const g = classify(hand({ index: false, middle: false, ring: true, pinky: false }));
    expect(g).toBeNull();
  });

  it('Edge Case: nur 3 Finger gestreckt → unklar', () => {
    const g = classify(hand({ index: true, middle: true, ring: true, pinky: false }));
    expect(g).toBeNull();
  });

  it('Seitansicht (gestauchte x-Ausdehnung, Ebenen getrennt): Heuristik bleibt gültig', () => {
    // Papier in Seitansicht: y-Distanzen identisch, x fast konstant
    const side = hand({ index: true, middle: true, ring: true, pinky: true });
    for (const p of side) p.x = 0.5; // alle Punkte auf einer x-Linie
    expect(classify(side)).toBe(1);
  });

  it('Gekippte Hand (Rotation um 90°): Klassifikation bleibt stabil', () => {
    const h = hand({ index: true, middle: true, ring: false, pinky: false });
    // Rotation (x,y) → (y, 1-x)
    const rotated = h.map((p) => ({ x: p.y, y: 1 - p.x, z: 0 }));
    expect(classify(rotated)).toBe(2);
  });

  it('leere/defekte Eingabe → unklar', () => {
    expect(classify([])).toBeNull();
    expect(classify(makeHand([wrist, thumbCMC]))).toBeNull();
  });
});

describe('GestureHistory – Stabilisierung', () => {
  it('8 von 12 Frames gleich → stabil', () => {
    const h = new GestureHistory();
    for (let i = 0; i < 4; i++) h.push(1, i * 16);
    for (let i = 0; i < 8; i++) h.push(0, 64 + i * 16);
    expect(h.stable(200)).toBe(0);
  });

  it('< 8 Frames im Puffer → instabil', () => {
    const h = new GestureHistory();
    for (let i = 0; i < 4; i++) h.push(1, i * 16);
    expect(h.stable(80)).toBeNull();
  });

  it('Zeitfenster-Kriterium: 6 Samples in 250 ms genügt auch bei >12 Frames Puffer', () => {
    const h = new GestureHistory();
    // 12 Frames Stein (alt), dann 6 schnelle Schere innerhalb 250 ms
    for (let i = 0; i < 12; i++) h.push(0, i * 16);
    for (let i = 0; i < 6; i++) h.push(1, 1000 + i * 40); // 1000..1200 ms
    expect(h.stable(1250)).toBe(1);
  });

  it('null-Gesten blockieren Stabilität nicht, wenn Kandidat klar ist', () => {
    const h = new GestureHistory();
    h.push(null, 0);
    h.push(0, 16);
    h.push(null, 32);
    h.push(0, 48);
    h.push(0, 64);
    h.push(0, 80);
    h.push(0, 96);
    h.push(0, 112);
    h.push(0, 128);
    expect(h.stable(130)).toBe(0);
  });
});

describe('Daumen-Heuristik', () => {
  /** Minimalhand: nur Indizes 3 (IP), 4 (TIP), 17 (Pinky-MCP) relevant. */
  function thumbHand(tip: P, ip: P): Landmark[] {
    const pts: P[] = new Array(21).fill([0.5, 0.5]);
    pts[3] = ip;
    pts[4] = tip;
    pts[17] = [0.66, 0.69];
    return makeHand(pts);
  }

  it('Daumen abgespreizt: TIP weiter von Pinky-MCP als IP × 1.1', () => {
    // seitlich abgespreizt: TIP deutlich jenseits von IP
    const h = thumbHand([0.78, 0.7], [0.7, 0.75]);
    expect(thumbExtended(h)).toBe(true);
  });

  it('Daumen angelegt: TIP näher an Pinky-MCP als Schwelle erlaubt', () => {
    const h = thumbHand([0.61, 0.75], [0.6, 0.75]);
    expect(thumbExtended(h)).toBe(false);
  });

  it('extendedFingers zählt nur echte gestreckte Finger', () => {
    expect(extendedFingers(hand({ index: true, middle: true, ring: false, pinky: false }))).toBe(2);
  });
});