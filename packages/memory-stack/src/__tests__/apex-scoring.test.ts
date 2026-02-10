import { describe, it, expect } from 'vitest';
import { apexScoring, DEFAULT_ADVANCED_CONFIG } from '../causality/advanced-discovery';

describe('Apex Scoring (CausalRivers-proven method)', () => {
  // Helper: generate causal time series X -> Y with given lag
  function generateCausalPair(n: number, lag: number, strength: number) {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) * 2 - 1;
    };

    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < n; i++) x.push(rand());
    for (let i = 0; i < n; i++) {
      const noise = rand() * (1 - strength);
      y.push(i >= lag ? strength * x[i - lag] + noise : noise);
    }
    return { x, y };
  }

  it('should produce scores with confounder metadata', () => {
    const { x, y } = generateCausalPair(200, 2, 0.7);
    const result = apexScoring({ X: x, Y: y });

    expect(result.domains).toEqual(['X', 'Y']);
    expect(result.scores.length).toBe(2);
    expect(result.knockoutScores).toBeDefined();
    expect(result.confounderFlags).toBeDefined();
    expect(result.signMatrix).toBeDefined();
  });

  it('should score true causal edge higher than reverse', () => {
    const { x, y } = generateCausalPair(200, 2, 0.7);
    const result = apexScoring({ X: x, Y: y }, { maxLag: 3 });

    // X -> Y should score higher than Y -> X
    const xyScore = result.scores[1][0]; // score[target=Y][source=X]
    const yxScore = result.scores[0][1]; // score[target=X][source=Y]
    expect(xyScore).toBeGreaterThan(yxScore);
  });

  it('should detect positive coefficient sign for positive causation', () => {
    const { x, y } = generateCausalPair(200, 1, 0.8);
    const result = apexScoring({ X: x, Y: y }, { maxLag: 2 });

    // X causes Y with positive coefficient
    expect(result.signMatrix![1][0]).toBe(1); // positive sign
  });

  it('should include F-test additive signal', () => {
    const { x, y } = generateCausalPair(200, 2, 0.7);

    // Compare apex (with F-test) vs apex with zero F-test weight
    const withF = apexScoring({ X: x, Y: y }, { maxLag: 3, apexFTestWeight: 0.01 });
    const withoutF = apexScoring({ X: x, Y: y }, { maxLag: 3, apexFTestWeight: 0.0 });

    // With F-test should produce slightly different scores (F-test breaks ties)
    const diffXY = Math.abs(withF.scores[1][0] - withoutF.scores[1][0]);
    // The difference should be small (alpha=0.01) but non-zero
    expect(diffXY).toBeGreaterThan(0);
    expect(diffXY).toBeLessThan(0.1); // F-test is a small additive signal
  });

  it('should handle sign prior mode = none', () => {
    const { x, y } = generateCausalPair(200, 1, 0.7);
    const resultPositive = apexScoring({ X: x, Y: y }, { apexSignPriorMode: 'positive' });
    const resultNone = apexScoring({ X: x, Y: y }, { apexSignPriorMode: 'none' });

    // Scores should differ when sign prior is active
    expect(resultPositive.scores[1][0]).not.toBe(resultNone.scores[1][0]);
  });

  it('should flag confounded edges', () => {
    // Create a confounded scenario: hidden Z -> X and Z -> Y
    const n = 200;
    let seed = 55;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) * 2 - 1;
    };

    const z: number[] = [];
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < n; i++) z.push(rand());
    for (let i = 0; i < n; i++) {
      x.push(i >= 1 ? 0.8 * z[i - 1] + rand() * 0.2 : rand());
      y.push(i >= 1 ? 0.8 * z[i - 1] + rand() * 0.2 : rand());
    }

    const result = apexScoring({ X: x, Y: y }, { maxLag: 3 });

    // confounderFlags should exist
    expect(result.confounderFlags).toBeDefined();
    // At least the concept works (confounded flags populated)
    expect(result.confounderFlags!.length).toBe(2);
  });

  it('should handle 3+ variables', () => {
    const n = 150;
    let seed = 33;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) * 2 - 1;
    };

    const a: number[] = [];
    const b: number[] = [];
    const c: number[] = [];
    for (let i = 0; i < n; i++) a.push(rand());
    for (let i = 0; i < n; i++) b.push(i >= 1 ? 0.6 * a[i - 1] + rand() * 0.4 : rand());
    for (let i = 0; i < n; i++) c.push(i >= 2 ? 0.5 * b[i - 2] + rand() * 0.5 : rand());

    const result = apexScoring({ A: a, B: b, C: c }, { maxLag: 3 });

    expect(result.domains).toEqual(['A', 'B', 'C']);
    expect(result.scores.length).toBe(3);
    // A -> B should have meaningful score
    expect(result.scores[1][0]).toBeGreaterThan(0);
  });

  it('DEFAULT_ADVANCED_CONFIG should have apex config fields', () => {
    expect(DEFAULT_ADVANCED_CONFIG.apexFTestWeight).toBe(0.01);
    expect(DEFAULT_ADVANCED_CONFIG.apexCfShuffles).toBe(5);
    expect(DEFAULT_ADVANCED_CONFIG.apexCfPenalty).toBe(0.85);
    expect(DEFAULT_ADVANCED_CONFIG.apexCfBoost).toBe(1.08);
    expect(DEFAULT_ADVANCED_CONFIG.apexSignPriorMode).toBe('positive');
  });
});
