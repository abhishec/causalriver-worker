import { describe, it, expect } from 'vitest';
import { counterfactualKnockout } from '../causality/counterfactual-knockout';

describe('Counterfactual Knockout', () => {
  it('should return higher score for true causal pairs', () => {
    // Generate X -> Y with lag 2
    const n = 200;
    const x: number[] = [];
    const y: number[] = [];

    // Seeded random
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) * 2 - 1;
    };

    for (let i = 0; i < n; i++) {
      x.push(rand());
    }
    for (let i = 0; i < n; i++) {
      const noise = rand() * 0.3;
      y.push(i >= 2 ? 0.8 * x[i - 2] + noise : noise);
    }

    const result = counterfactualKnockout(
      { X: x, Y: y },
      { maxLag: 3, nShuffles: 3 }
    );

    expect(result.domains).toEqual(['X', 'Y']);
    // X -> Y: shuffling X should hurt Y's prediction
    expect(result.scores[1][0]).toBeGreaterThan(0);
    // Y -> X: shuffling Y shouldn't hurt X's prediction much
    expect(result.scores[1][0]).toBeGreaterThan(result.scores[0][1]);
  });

  it('should return low score for confounded pairs', () => {
    // Hidden Z -> X and Z -> Y (X and Y are confounded)
    const n = 200;
    const z: number[] = [];
    const x: number[] = [];
    const y: number[] = [];

    let seed = 99;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) * 2 - 1;
    };

    for (let i = 0; i < n; i++) z.push(rand());
    for (let i = 0; i < n; i++) {
      x.push(i >= 1 ? 0.7 * z[i - 1] + rand() * 0.3 : rand());
      y.push(i >= 1 ? 0.7 * z[i - 1] + rand() * 0.3 : rand());
    }

    // Only give X and Y (Z is hidden confounder)
    const result = counterfactualKnockout(
      { X: x, Y: y },
      { maxLag: 3, nShuffles: 3 }
    );

    // X -> Y should have LOW knockout score (Z is driving Y, not X)
    // This is the key advantage: confounded edges get low knockout impact
    expect(result.scores[1][0]).toBeLessThan(0.5);
  });

  it('should return near-zero for independent series', () => {
    const n = 200;
    let seed = 77;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) * 2 - 1;
    };

    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < n; i++) {
      a.push(rand());
      b.push(rand());
    }

    const result = counterfactualKnockout(
      { A: a, B: b },
      { maxLag: 2, nShuffles: 3 }
    );

    // Independent series: knockout should have near-zero effect
    expect(result.scores[0][1]).toBeLessThan(0.1);
    expect(result.scores[1][0]).toBeLessThan(0.1);
  });

  it('should handle small datasets gracefully', () => {
    const result = counterfactualKnockout(
      { X: [1, 2, 3], Y: [4, 5, 6] },
      { maxLag: 1, nShuffles: 2 }
    );
    expect(result.domains).toEqual(['X', 'Y']);
    expect(result.scores.length).toBe(2);
  });

  it('should handle single variable', () => {
    const result = counterfactualKnockout(
      { X: [1, 2, 3, 4, 5] },
      { maxLag: 1, nShuffles: 1 }
    );
    expect(result.domains).toEqual(['X']);
    expect(result.scores).toEqual([[0]]);
  });
});
