/**
 * Spiel-Zustandsmaschine: Best of Five – erste 3 Rundensiege gewinnen den Satz.
 *
 * Phasen:
 *   wait      → wartet auf Rundenstart (Button/Taste/automatisch)
 *   count     → Countdown 3..1 (à 700 ms, Zeitbasis performance.now())
 *   done      → Runde ausgewertet, Banner sichtbar
 *   matchover → Satz entschieden, nach 3.5 s Reset der Rundenzähler
 */

import { judge, MOVE_NAMES, type Move } from './ai';

export const WIN = 3;
export const COUNT_STEP_MS = 700;
export const DONE_DELAY_MS = 1600;
export const MATCHOVER_DELAY_MS = 3500;

export type Phase = 'wait' | 'count' | 'done' | 'matchover';

export type GameState = {
  phase: Phase;
  countdown: number; // 3..0, 0 = Sampling-Zeitpunkt
  playerScore: number;
  cpuScore: number;
  playerSets: number;
  cpuSets: number;
  /** Zuletzt geworfene Gesten (für Hand-Icons in der UI) */
  playerMove: Move | null;
  cpuMove: Move | null;
  banner: string; // '' = kein Banner
};

export type RoundResult = {
  player: Move | null; // null = verworfen (keine Hand / unklar)
  cpu: Move | null;
  outcome: 'player' | 'cpu' | 'tie' | 'discard';
};

export class Game {
  state: GameState = {
    phase: 'wait',
    countdown: 0,
    playerScore: 0,
    cpuScore: 0,
    playerSets: 0,
    cpuSets: 0,
    playerMove: null,
    cpuMove: null,
    banner: '',
  };

  private countStart = 0;
  private phaseUntil = 0;

  /** Timer-Callback-Hook (wird in main.ts auf performance.now() getickt) */
  tick(now: number): void {
    if (this.state.phase === 'count') {
      const elapsed = now - this.countStart;
      const step = Math.min(3, Math.floor(elapsed / COUNT_STEP_MS));
      const countdown = 3 - step;
      if (countdown !== this.state.countdown) {
        this.state.countdown = countdown;
        this.notify();
      }
      if (countdown <= 0) {
        this.onSample();
      }
    } else if (
      (this.state.phase === 'done' || this.state.phase === 'matchover') &&
      now >= this.phaseUntil
    ) {
      if (this.state.phase === 'matchover') {
        this.state.playerScore = 0;
        this.state.cpuScore = 0;
      }
      this.setPhase('wait');
    }
  }

  /** Runde starten (nur aus wait) */
  start(): void {
    if (this.state.phase !== 'wait') return;
    this.state.banner = '';
    this.state.playerMove = null;
    this.state.cpuMove = null;
    this.state.countdown = 3;
    this.countStart = performance.now();
    this.setPhase('count');
  }

  private setPhase(phase: Phase): void {
    this.state.phase = phase;
    this.notify();
  }

  /** Wird beim Erreichen von „0“ aufgerufen – Geste wird exakt jetzt gesampelt */
  private onSample(): void {
    const sample = this.getMove();
    this.finishRound(sample);
  }

  /** Sample-Hook: liefert Move | null (keine Hand/un klar) */
  getMove: () => Move | null = () => null;
  /** Timer-/State-Callback-Hook (wird in main.ts gesetzt) */
  notify: () => void = () => {};
  /** Hook nach Auswertung (für ai.learn etc.) */
  onResult: (r: RoundResult) => void = () => {};

  finishRound(player: Move | null): void {
    if (this.state.phase !== 'count') return;

    if (player === null) {
      // Keine/stabile Hand bei „0“ → Runde verwerfen, zurück nach wait
      this.state.banner = 'Keine klare Geste erkannt – Runde verworfen.';
      this.onResult({ player: null, cpu: null, outcome: 'discard' });
      this.phaseUntil = performance.now() + DONE_DELAY_MS;
      this.setPhase('done');
      return;
    }

    const cpu = this.cpuChoose();
    const outcome = judge(player, cpu) === 1 ? 'player' : judge(player, cpu) === 0 ? 'cpu' : 'tie';
    this.state.playerMove = player;
    this.state.cpuMove = cpu;

    if (outcome === 'player') this.state.playerScore++;
    if (outcome === 'cpu') this.state.cpuScore++;

    const pName = MOVE_NAMES[player];
    const cName = MOVE_NAMES[cpu];
    this.state.banner =
      outcome === 'tie'
        ? `Unentschieden – beide: ${pName}`
        : outcome === 'player'
          ? `${pName} schlägt ${cName} – Punkt für dich! (${this.state.playerScore}:${this.state.cpuScore})`
          : `${cName} schlägt ${pName} – Punkt für die KI. (${this.state.playerScore}:${this.state.cpuScore})`;

    this.onResult({ player, cpu, outcome });

    if (this.state.playerScore >= WIN || this.state.cpuScore >= WIN) {
      if (outcome === 'player') this.state.playerSets++;
      else this.state.cpuSets++;
      this.state.banner += outcome === 'player' ? ' 🏆 Satz gewonnen!' : ' 😵 Satz verloren.';
      this.phaseUntil = performance.now() + MATCHOVER_DELAY_MS;
      this.setPhase('matchover');
    } else {
      this.phaseUntil = performance.now() + DONE_DELAY_MS;
      this.setPhase('done');
    }
  }

  cpuChoose: () => Move = () => Math.floor(Math.random() * 3) as Move;

  /** Nach Satzende Zähler zurücksetzen (Sets + KI-Lernzustand bleiben) */
  resetRoundScores(): void {
    this.state.playerScore = 0;
    this.state.cpuScore = 0;
  }
}