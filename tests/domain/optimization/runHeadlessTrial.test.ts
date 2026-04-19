import { describe, expect, it, vi } from 'vitest';
import { runHeadlessTrial } from '../../../domain/optimization/runHeadlessTrial';

describe('runHeadlessTrial', () => {
  it('resets state, executes one trial, and returns a score', async () => {
    const runtime = {
      reset: vi.fn(),
      execute: vi.fn().mockResolvedValue({
        success: true,
        metrics: { totalTime: 4, energyConsumption: 10, finalPoseError: 0.02, collisionCount: 0 }
      })
    };

    const result = await runHeadlessTrial(runtime as any, {
      trialId: 'trial-1',
      scenario: {} as any,
      controllerBlueprint: {} as any,
      parameters: { blend: 0.3 },
      executionPlan: { stages: [] },
      monitoringConfig: { sampleRate: 1 }
    });

    expect(runtime.reset).toHaveBeenCalled();
    expect(result.trialId).toBe('trial-1');
    expect(result.score).toBeTypeOf('number');
  });
});
