import { describe, expect, it } from 'vitest';
import {
  createTrialRunMessage,
  createWorkerInitMessage,
  createWorkerReadyMessage,
} from '../../../domain/optimization/workerProtocol';

describe('workerProtocol', () => {
  it('creates a typed trial.run message', () => {
    const message = createTrialRunMessage({
      trialId: 'trial-1',
      scenario: { taskId: 's1' } as any,
      controllerBlueprint: { templateId: 'joint_pd' } as any,
      parameters: { blend: 0.3 },
      executionPlan: { stages: [] },
      monitoringConfig: { sampleRate: 1 }
    });

    expect(message.type).toBe('trial.run');
    expect(message.payload.trialId).toBe('trial-1');
  });

  it('creates a worker.ready message', () => {
    expect(createWorkerReadyMessage().type).toBe('worker.ready');
  });

  it('creates a worker.init message', () => {
    expect(createWorkerInitMessage().type).toBe('worker.init');
  });
});
