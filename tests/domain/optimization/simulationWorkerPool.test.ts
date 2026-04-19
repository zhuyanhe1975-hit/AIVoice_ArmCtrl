import { describe, expect, it, vi } from 'vitest';
import { SimulationWorkerPool } from '../../../domain/optimization/SimulationWorkerPool';
import type { TrialRequest } from '../../../types';

function createRequest(trialId: string): TrialRequest {
  return {
    trialId,
    scenario: {} as any,
    controllerBlueprint: {} as any,
    parameters: { blend: 0.3 },
    executionPlan: { stages: [] },
    monitoringConfig: { sampleRate: 1 },
  };
}

describe('SimulationWorkerPool', () => {
  it('dispatches queued trials across idle workers', async () => {
    const workers: Array<{
      postMessage: ReturnType<typeof vi.fn>;
      terminate: ReturnType<typeof vi.fn>;
      onmessage: ((event: MessageEvent) => void) | null;
    }> = [];
    const workerFactory = vi.fn(() => {
      const worker = {
        postMessage: vi.fn((message: { type: string; payload: TrialRequest }) => {
          if (message.type === 'worker.init') {
            queueMicrotask(() => {
              worker.onmessage?.({
                data: {
                  type: 'worker.ready',
                },
              } as MessageEvent);
            });
            return;
          }
          if (message.type === 'trial.run') {
            queueMicrotask(() => {
              worker.onmessage?.({
                data: {
                  type: 'trial.result',
                  payload: {
                    trialId: message.payload.trialId,
                    success: true,
                    metrics: {},
                    score: 1,
                    durationMs: 1,
                  },
                },
              } as MessageEvent);
            });
          }
        }),
        terminate: vi.fn(),
        onmessage: null,
      };
      workers.push(worker);
      return worker as unknown as Worker;
    });

    const pool = new SimulationWorkerPool({ size: 2, workerFactory });
    const results = await pool.runBatch([createRequest('trial-1'), createRequest('trial-2')]);

    expect(workerFactory).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(workers[0]?.postMessage).toHaveBeenCalled();
    expect(workers[1]?.postMessage).toHaveBeenCalled();
  });
});
