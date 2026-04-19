import { describe, expect, it } from 'vitest';
import { normalizePerformanceProfile } from '../../../domain/decision/TaskAnalyzer';

describe('TaskAnalyzer', () => {
  it('normalizes weights to 1', () => {
    const profile = normalizePerformanceProfile({
      speedWeight: 4,
      accuracyWeight: 3,
      energyWeight: 1,
      stabilityWeight: 1,
      safetyWeight: 1,
      targetThresholds: {},
      analysisRationale: 'fast but safe'
    });

    const sum =
      profile.speedWeight +
      profile.accuracyWeight +
      profile.energyWeight +
      profile.stabilityWeight +
      profile.safetyWeight;

    expect(sum).toBeCloseTo(1, 5);
  });
});
