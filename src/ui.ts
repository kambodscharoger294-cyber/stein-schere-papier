/**
 * UI-Bindings: Score, Sätze, Banner, Stats-Bars, Prediction, Difficulty, Fehlerzustände.
 */

import { MOVE_NAMES, type Difficulty, type Move } from './ai';
import type { GameState } from './game';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Element #${id} nicht gefunden`);
  return e as T;
}

export const ui = {
  video: el<HTMLVideoElement>('video'),
  overlay: el<HTMLCanvasElement>('overlay'),
  banner: el<HTMLDivElement>('banner'),
  fpsWarn: el<HTMLDivElement>('fpsWarn'),
  playerScore: el<HTMLSpanElement>('playerScore'),
  cpuScore: el<HTMLSpanElement>('cpuScore'),
  playerMoveIcon: el<HTMLSpanElement>('playerMoveIcon'),
  cpuMoveIcon: el<HTMLSpanElement>('cpuMoveIcon'),
  sets: el<HTMLSpanElement>('sets'),
  startBtn: el<HTMLButtonElement>('startBtn'),
  difficulty: el<HTMLSelectElement>('difficulty'),
  prediction: el<HTMLParagraphElement>('prediction'),
  loading: el<HTMLDivElement>('loading'),
  errorOverlay: el<HTMLDivElement>('errorOverlay'),
  errorTitle: el<HTMLHeadingElement>('errorTitle'),
  errorText: el<HTMLParagraphElement>('errorText'),
  stats: [
    { bar: el<HTMLDivElement>('barStein'), count: el<HTMLSpanElement>('countStein') },
    { bar: el<HTMLDivElement>('barPapier'), count: el<HTMLSpanElement>('countPapier') },
    { bar: el<HTMLDivElement>('barSchere'), count: el<HTMLSpanElement>('countSchere') },
  ],
};

/** Emoji pro Zug: 0 Stein, 1 Papier, 2 Schere */
export const MOVE_ICONS = ['✊', '✋', '✌️'] as const;

export function renderState(s: GameState): void {
  ui.playerScore.textContent = String(s.playerScore);
  ui.cpuScore.textContent = String(s.cpuScore);

  // Hand-Icons: geworfene Geste (Du) vs. KI-Zug
  const pending = s.phase === 'count' || (s.phase === 'wait' && s.playerMove === null);
  ui.playerMoveIcon.textContent = s.playerMove === null ? '·' : MOVE_ICONS[s.playerMove];
  ui.cpuMoveIcon.textContent = s.cpuMove === null ? '·' : MOVE_ICONS[s.cpuMove];
  ui.playerMoveIcon.classList.toggle('pending', pending);
  ui.cpuMoveIcon.classList.toggle('pending', pending);

  ui.sets.textContent = `Sätze — Du ${s.playerSets} : ${s.cpuSets} KI`;
  ui.startBtn.disabled = s.phase !== 'wait';

  if (s.phase === 'count') {
    showBanner(s.countdown > 0 ? String(s.countdown) : '✊ Stein, Schere, Papier!');
    ui.banner.classList.add('count');
  } else if (s.banner) {
    showBanner(s.banner);
    ui.banner.classList.remove('count');
  } else {
    hideBanner();
  }
}

export function showBanner(text: string): void {
  ui.banner.textContent = text;
  ui.banner.classList.remove('hidden');
}

export function hideBanner(): void {
  ui.banner.classList.add('hidden');
}

export function renderStats(stats: readonly [number, number, number]): void {
  const total = stats[0] + stats[1] + stats[2];
  for (let i = 0; i < 3; i++) {
    const n = stats[i];
    const pct = total === 0 ? 0 : Math.round((n / total) * 100);
    ui.stats[i].bar.style.width = `${pct}%`;
    ui.stats[i].count.textContent = `${n} · ${pct}%`;
  }
}

export function renderPrediction(difficulty: Difficulty, prediction: Move | null): void {
  if (difficulty !== 'adaptiv') {
    ui.prediction.textContent = 'Zufallsmodus – keine Vorhersage';
    return;
  }
  ui.prediction.textContent =
    prediction === null
      ? 'Letzte Vorhersage: –'
      : `Letzte Vorhersage: ${MOVE_ICONS[prediction]} ${MOVE_NAMES[prediction]}`;
}

export function showError(title: string, text: string): void {
  ui.errorTitle.textContent = title;
  ui.errorText.textContent = text;
  ui.errorOverlay.classList.remove('hidden');
  ui.loading.classList.add('hidden');
}

export function hideLoading(): void {
  ui.loading.classList.add('hidden');
}

export function setLoading(text: string): void {
  ui.loading.textContent = text;
  ui.loading.classList.remove('hidden');
}