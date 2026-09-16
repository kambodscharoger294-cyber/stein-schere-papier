import { describe, expect, it } from 'vitest';
import { AdaptiveAI, beats, counterOf, judge } from '../src/ai';

describe('Regelwerk', () => {
  it('beats: Stein>Papier? nein – Papier>Stein, Schere>Papier, Stein>Schere', () => {
    expect(beats(1, 0)).toBe(true); // Papier > Stein
    expect(beats(2, 1)).toBe(true); // Schere > Papier
    expect(beats(0, 2)).toBe(true); // Stein > Schere
    expect(beats(0, 1)).toBe(false);
    expect(beats(1, 2)).toBe(false);
    expect(beats(2, 0)).toBe(false);
  });

  it('judge inkl. Unentschieden', () => {
    expect(judge(0, 0)).toBe(-1);
    expect(judge(1, 0)).toBe(1);
    expect(judge(0, 1)).toBe(0);
  });

  it('counterOf', () => {
    expect(counterOf(0)).toBe(1); // gegen Stein → Papier
    expect(counterOf(1)).toBe(2); // gegen Papier → Schere
    expect(counterOf(2)).toBe(0); // gegen Schere → Stein
  });
});

describe('AdaptiveAI – Lernkurve', () => {
  it('10× Stein → KI spielt Papier (Counter der Vorhersage)', () => {
    const ai = new AdaptiveAI();
    let prev: 0 | 1 | 2 | null = null;
    let paper = 0;
    for (let i = 0; i < 20; i++) {
      const cpu = ai.cpuChoose(prev);
      ai.learn(0, prev); // Spieler wirft immer Stein
      if (cpu === 1) paper++;
      prev = 0;
    }
    expect(ai.lastPrediction).toBe(0); // Vorhersage: Stein
    expect(paper).toBeGreaterThan(10); // mehrheitlich Papier als Counter
  });

  it('Markov übernimmt bei >= 2 Übergängen: Stein→Papier-Muster wird erkannt', () => {
    const ai = new AdaptiveAI();
    let prev: 0 | 1 | 2 | null = null;
    // Spieler wechselt nach Stein immer zu Papier (5×)
    for (let i = 0; i < 5; i++) {
      ai.predictNext(prev);
      ai.cpuChoose(prev);
      ai.learn(1, prev);
      prev = 1;
      ai.predictNext(prev);
      ai.cpuChoose(prev);
      ai.learn(0, prev); // dann Stein
      prev = 0;
    }
    // Nach Stein sollte Papier vorhergesagt werden
    expect(ai.predictNext(0)).toBe(1);
  });

  it('Verfall 0.9: alte Würfe zählen weniger, throwStats dekayt nicht', () => {
    const ai = new AdaptiveAI();
    ai.learn(0, null);
    const afterOne = (ai as unknown as { freq: number[] }).freq[0];
    expect(afterOne).toBeCloseTo(PRIOR_STEIN * 0.9 + 1, 5);
    for (let i = 0; i < 9; i++) ai.learn(0, 0);
    // Papier-Anteil nur aus dem Prior, stark verfallen:
    const freq = (ai as unknown as { freq: number[] }).freq;
    expect(freq[1]).toBeLessThan(1);
    expect(ai.throwStats[0]).toBe(10);
    expect(ai.throwStats[1]).toBe(0);
  });

  it('difficulty zufall → keine Vorhersage-Spur, alle Züge möglich', () => {
    const ai = new AdaptiveAI();
    ai.difficulty = 'zufall';
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(ai.cpuChoose(null));
    expect(ai.lastPrediction).toBeNull();
    expect(seen.size).toBe(3);
  });

  it('reset setzt Lernzustand zurück', () => {
    const ai = new AdaptiveAI();
    ai.learn(0, null);
    ai.reset();
    expect(ai.lastPrediction).toBeNull();
    expect(ai.throwStats).toEqual([0, 0, 0]);
    expect((ai as unknown as { freq: number[] }).freq).toEqual([3, 2, 2]);
  });
});

const PRIOR_STEIN = 3;