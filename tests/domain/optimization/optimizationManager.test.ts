import { describe, expect, it } from 'vitest';
import { scoreTrial, selectBestTrialResult } from '../../../domain/optimization/OptimizationManager';

describe('OptimizationManager', () => {
  it('scores a successful faster trial above a failed one', () => {
    const good = scoreTrial({
      success: true,
      metrics: {
        totalTime: 4,
        energyConsumption: 10,
        finalPoseError: 0.01,
        collisionCount: 0
      }
    });
    const bad = scoreTrial({
      success: false,
      metrics: {
        totalTime: 12,
        energyConsumption: 30,
        finalPoseError: 0.2,
        collisionCount: 2
      }
    });

    expect(good).toBeGreaterThan(bad);
  });

  it('selects the highest-scoring trial result from a batch', () => {
    const best = selectBestTrialResult([
      { trialId: 'a', score: 10 },
      { trialId: 'b', score: 20 }
    ] as any);

    expect(best?.trialId).toBe('b');
  });
});
