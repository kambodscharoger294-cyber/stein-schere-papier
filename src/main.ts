/**
 * Einstiegspunkt: Kamera, MediaPipe HandLandmarker, rAF-Loop, Overlay, Verdrahtung.
 * Läuft vollständig lokal – keine Daten verlassen den Browser.
 */

import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { Landmark } from './gesture';
import { AdaptiveAI, MOVE_NAMES, type Move } from './ai';
import { GestureHistory, classify } from './gesture';
import { Game, type RoundResult } from './game';
import {
  hideBanner,
  hideLoading,
  renderHint,
  renderState,
  renderStats,
  showError,
  setLoading,
  showBanner,
  ui,
} from './ui';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_RETRIES = 3;

/* ------------------------------------------------------------------ */
/* Fallback-HAND_CONNECTIONS (falls statisches Feld fehlt)             */
/* ------------------------------------------------------------------ */
const FALLBACK_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function connections(): Array<[number, number]> {
  const c = (HandLandmarker as unknown as { HAND_CONNECTIONS?: Array<{ start: number; end: number }> })
    .HAND_CONNECTIONS;
  if (Array.isArray(c) && c.length > 0) {
    return c.map((c) => [c.start, c.end] as [number, number]);
  }
  return FALLBACK_CONNECTIONS;
}

/* ------------------------------------------------------------------ */
/* Globaler Zustand                                                    */
/* ------------------------------------------------------------------ */
const ai = new AdaptiveAI();
const game = new Game();
const history = new GestureHistory();

let handLandmarker: HandLandmarker | null = null;
let lastVideoTime = -1;
let lastHandSeen = 0;

// FPS-Messung (gleitendes Fenster)
let frameTimes: number[] = [];

// Keyboard-Fallback: erzwungener Spielerzug für die laufende Runde
let keyboardMove: Move | null = null;

const NO_HAND_TIMEOUT_MS = 1500;

/* ------------------------------------------------------------------ */
/* Game-Hooks                                                          */
/* ------------------------------------------------------------------ */
game.notify = () => renderState(game.state);

game.getMove = (): Move | null => {
  if (keyboardMove !== null) {
    const m = keyboardMove;
    keyboardMove = null; // einmal pro Runde
    return m;
  }
  return history.stable();
};

game.cpuChoose = () => ai.cpuChoose(prevPlayerMove);

game.onResult = (r: RoundResult) => {
  if (r.player !== null && r.cpu !== null) {
    ai.learn(r.player, prevPlayerMove);
    renderStats(ai.throwStats);
    renderHint(ai.difficulty, ai.lastPrediction);
    prevPlayerMove = r.player;
  } else {
    // Verworfene Runde: History leicht abschwächen statt brutal leeren
    history.soften();
  }
};

let prevPlayerMove: Move | null = null;

/* ------------------------------------------------------------------ */
/* Inputs: Button + Tastatur                                           */
/* ------------------------------------------------------------------ */
ui.startBtn.addEventListener('click', () => game.start());

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();
  if (key === ' ') {
    e.preventDefault();
    game.start();
    return;
  }
  const map: Record<string, Move> = { s: 0, p: 1, c: 2 }; // S=Stein, P=Papier, C=Schere
  if (key in map) {
    keyboardMove = map[key];
    if (game.state.phase === 'wait') game.start();
    else if (game.state.phase === 'count') showBanner(`Taste erkannt: ${MOVE_NAMES[keyboardMove]}`);
  }
});

ui.difficulty.addEventListener('change', () => {
  ai.difficulty = ui.difficulty.value === 'zufall' ? 'zufall' : 'adaptiv';
  renderHint(ai.difficulty, ai.difficulty === 'adaptiv' ? ai.lastPrediction : null);
});

/* ------------------------------------------------------------------ */
/* Kamera                                                              */
/* ------------------------------------------------------------------ */
async function startCamera(): Promise<void> {
  if (!window.isSecureContext) {
    showError(
      'Unsicherer Kontext',
      'getUserMedia benötigt HTTPS oder localhost. Bitte über https:// oder http://localhost öffnen.',
    );
    throw new Error('insecure context');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showError('Kamera nicht verfügbar', 'Dieser Browser unterstützt keine Kamera (getUserMedia).');
    throw new Error('no getUserMedia');
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    ui.video.srcObject = stream;
    await new Promise<void>((resolve) => {
      if (ui.video.readyState >= 2) resolve();
      else ui.video.onloadeddata = () => resolve();
    });
    await ui.video.play();
  } catch (err) {
    const e = err as DOMException;
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      showError(
        'Kamerazugriff verweigert',
        'Bitte Kameraerlaubnis in den Browser-Einstellungen erteilen und Seite neu laden. ' +
          'Alternativ kannst du per Tastatur spielen (S/C/P + Leertaste).',
      );
    } else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
      showError('Keine Kamera gefunden', 'Es ist kein Kameragerät angeschlossen oder freigegeben.');
    } else {
      showError('Kamerafehler', `Unbekannter Fehler: ${e.message ?? e.name}`);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* MediaPipe laden (mit Retry + CPU-Fallback)                          */
/* ------------------------------------------------------------------ */
async function loadHandLandmarker(): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  for (let attempt = 1; attempt <= MODEL_RETRIES; attempt++) {
    setLoading(`Modell wird geladen … (Versuch ${attempt}/${MODEL_RETRIES})`);
    try {
      return await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
      });
    } catch (err) {
      if (attempt === MODEL_RETRIES) {
        // Letzter Versuch mit CPU-Delegate
        try {
          return await HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 1,
          });
        } catch (err2) {
          showError(
            'Modell konnte nicht geladen werden',
            'Hand-Landmark-Modell nicht erreichbar. Internetverbindung prüfen und neu laden ' +
              '(Modell kommt beim ersten Laden von einem CDN, danach läuft alles lokal).',
          );
          throw err2;
        }
      }
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      void err;
    }
  }
  throw new Error('unreachable');
}

/* ------------------------------------------------------------------ */
/* Overlay zeichnen                                                    */
/* ------------------------------------------------------------------ */
function drawOverlay(lms: Landmark[]): void {
  const canvas = ui.overlay;
  const w = ui.video.videoWidth || canvas.width;
  const h = ui.video.videoHeight || canvas.height;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  ctx.lineWidth = Math.max(2, w / 320);
  ctx.strokeStyle = 'rgba(108, 140, 255, 0.9)';
  for (const [a, b] of connections()) {
    const pa = lms[a];
    const pb = lms[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(108, 255, 143, 0.95)';
  const r = Math.max(3, w / 160);
  for (const p of lms) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ */
/* Haupt-Loop                                                          */
/* ------------------------------------------------------------------ */
let lastFrameTs = 0;

function loop(now: number): void {
  requestAnimationFrame(loop);
  if (!handLandmarker) return;

  // FPS-Messung
  if (lastFrameTs > 0) {
    frameTimes.push(now - lastFrameTs);
    if (frameTimes.length > 30) frameTimes.shift();
  }
  lastFrameTs = now;

  const video = ui.video;
  if (video.readyState < 2 || video.videoWidth === 0) return;

  // FPS-Warnung < 15 fps
  if (frameTimes.length >= 10) {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    ui.fpsWarn.classList.toggle('hidden', avg <= 1000 / 15);
  }

  // Nur bei neuem Frame detektieren
  if (video.currentTime === lastVideoTime) {
    game.tick(now);
    return;
  }
  lastVideoTime = video.currentTime;

  let result: HandLandmarkerResult;  try {
    result = handLandmarker.detectForVideo(video, now);
  } catch {    game.tick(now);
    return;
  }
  const lm = result.landmarks[0] as Landmark[] | undefined;
  if (lm) {
    lastHandSeen = now;
    history.push(classify(lm), now);
    drawOverlay(lm);
  } else {
    drawOverlay([]);
  }

  // Countdown abbrechen, wenn während des Zählens > 1.5 s keine Hand sichtbar
  if (game.state.phase === 'count' && now - lastHandSeen > NO_HAND_TIMEOUT_MS) {
    game.state.banner = 'Keine Hand erkannt – Runde verworfen.';
    game.state.phase = 'done';
    game.state.countdown = 0;
    renderState(game.state);
    setTimeout(() => {
      game.state.banner = '';
      game.state.phase = 'wait';
      renderState(game.state);
    }, 1600);
  }

  game.tick(now);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
async function main(): Promise<void> {
  renderState(game.state);
  try {
    await startCamera();
    handLandmarker = await loadHandLandmarker();
    hideLoading();
    showBanner('Zeige deine Hand in die Kamera! 🖐');
    setTimeout(() => hideBanner(), 2500);
    requestAnimationFrame(loop);
  } catch (err) {
    // showError wurde ggf. bereits aufgerufen; sonst generischer Fehler
    if (document.getElementById('errorOverlay')?.classList.contains('hidden')) {
      showError('Start fehlgeschlagen', String(err));
    }
    console.error(err);
  }
}

void main();