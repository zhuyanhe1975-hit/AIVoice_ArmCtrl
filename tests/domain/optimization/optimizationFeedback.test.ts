import { describe, expect, it } from 'vitest';
import { applyOptimizationHints } from '../../../domain/optimization/OptimizationManager';

describe('optimization feedback', () => {
  it('reduces blend when overshoot reduction is requested', () => {
    const next = applyOptimizationHints(
      { blend: 0.4, damping: 0.05 },
      [{ action: 'reduce_gain', parameter: 'blend', magnitude: 0.2 }]
    );

    expect(next.blend).toBeLessThan(0.4);
  });
});
