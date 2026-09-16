/**
 * Adaptive KI: Frequenz + Markov-Modell (1. Ordnung) über Spielerwürfe.
 *
 * Move-Encoding (durchgängig im Projekt):
 *   0 = Stein, 1 = Papier, 2 = Schere
 *   a schlägt b  ⟺  (a - b + 3) % 3 === 1
 */

export type Move = 0 | 1 | 2;

export const MOVE_NAMES = ['Stein', 'Papier', 'Schere'] as const;

/** Prior: Stein 3 : Papier 2 : Schere 2 (Einsteiger werfen überwiegend Stein) */
export const PRIOR: [number, number, number] = [3, 2, 2];

/** Verfall pro Runde */
export const DECAY = 0.9;
/** Exploitation-Anteil (Rest = Zufall) */
export const EXPLOIT = 0.7;

/** a schlägt b? */
export function beats(a: Move, b: Move): boolean {
  return (a - b + 3) % 3 === 1;
}

/** -1 = Unentschieden, 1 = a gewinnt, 0 = b gewinnt */
export function judge(a: Move, b: Move): -1 | 0 | 1 {
  if (a === b) return -1;
  return beats(a, b) ? 1 : 0;
}

/** Gegen-Geste zu m */
export function counterOf(m: Move): Move {
  return ((m + 1) % 3) as Move;
}

function argmax(xs: readonly number[]): Move {
  let best = 0;
  for (let i = 1; i < 3; i++) if (xs[i] > xs[best]) best = i;
  return best as Move;
}

export type Difficulty = 'adaptiv' | 'zufall';

export class AdaptiveAI {
  /** Frequenz der Spielerwürfe (mit Prior & Verfall) */
  private freq: [number, number, number] = [...PRIOR];
  /** markov[prev][next] – Übergangshäufigkeiten */
  private markov: [number[], number[], number[]] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  /** Session-Statistik der Spielerwürfe (ohne Verfall, nur für die UI) */
  throwStats: [number, number, number] = [0, 0, 0];
  /** Letzte Vorhersage des Spielerzugs (für den Hint) */
  lastPrediction: Move | null = null;
  difficulty: Difficulty = 'adaptiv';

  /** Nach jedem Spielerzug lernen: Verfall 0.9, dann Zähler erhöhen */
  learn(player: Move, prev: Move | null): void {
    for (let i = 0; i < 3; i++) {
      this.freq[i] *= DECAY;
      for (let j = 0; j < 3; j++) this.markov[i][j] *= DECAY;
    }
    this.freq[player] += 1;
    if (prev !== null) this.markov[prev][player] += 1;
    this.throwStats[player] += 1;
  }

  /** Vorhersage: Markov wenn genügend Daten (>=2), sonst Frequenz (inkl. Prior) */
  predictNext(prev: Move | null): Move {
    if (prev !== null) {
      const row = this.markov[prev];
      const total = row[0] + row[1] + row[2];
      if (total >= 2) {
        this.lastPrediction = argmax(row);
        return this.lastPrediction;
      }
    }
    this.lastPrediction = argmax(this.freq);
    return this.lastPrediction;
  }

  /** 70 % Counter der Vorhersage, 30 % Zufall (nur bei adaptiv) */
  cpuChoose(prev: Move | null): Move {
    if (this.difficulty === 'zufall') return Math.floor(Math.random() * 3) as Move;
    if (Math.random() < EXPLOIT) return counterOf(this.predictNext(prev));
    return Math.floor(Math.random() * 3) as Move;
  }

  /** Lernzustand vollständig zurücksetzen (Statistik inklusive) */
  reset(): void {
    this.freq = [...PRIOR];
    this.markov = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    this.throwStats = [0, 0, 0];
    this.lastPrediction = null;
  }
}