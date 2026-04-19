import { describe, expect, it } from 'vitest';
import { generateDiagnostics } from '../../../domain/evaluation/generateDiagnostics';

describe('generateDiagnostics', () => {
  it('suggests reducing aggressiveness after repeated overshoot', () => {
    const result = generateDiagnostics({
      metrics: { overshootCount: 3, settleDelay: 0.5, collisionCount: 0 },
      logs: [
        { eventType: 'trial.failure_detected', message: 'overshoot near object' },
        { eventType: 'trial.failure_detected', message: 'overshoot near object' }
      ]
    });

    expect(result.summary).toContain('overshoot');
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].parameter).toBe('blend');
  });
});
