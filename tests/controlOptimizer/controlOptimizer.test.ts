import { describe, expect, it, vi } from 'vitest';
import { ControlOptimizer } from '../../ControlOptimizer';
import type { ControlAlgorithm, TaskScenario } from '../../types';

const scenario: TaskScenario = {
  description: 'pick and place',
  requirements: {
    speed: 0.5,
    accuracy: 0.8,
    stability: 0.7,
    efficiency: 0.4,
  },
};

describe('ControlOptimizer design flow', () => {
  it('requests a controller blueprint from the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        templateId: 'joint_pd',
        optimizableParameters: ['blend', 'damping'],
        initialParameters: { blend: 0.2, damping: 0.1 },
        parameterBounds: {
          blend: { min: 0.05, max: 1 },
          damping: { min: 0, max: 0.5 },
        },
        selectionRationale: 'safe default',
      }),
    });

    const optimizer = new ControlOptimizer(fetchMock as unknown as typeof fetch);

    await optimizer.designAlgorithm(scenario);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/decision/controller-blueprint',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('optimizes without any backend decision call', async () => {
    const fetchMock = vi.fn();
    const optimizer = new ControlOptimizer(fetchMock as unknown as typeof fetch);
    const algorithm: ControlAlgorithm = {
      id: 'algo-1',
      name: 'joint_pd',
      description: 'safe default',
      code: 'return;',
      parameters: { blend: 0.2, damping: 0.1 },
      performanceMetrics: {},
    };
    const sim = {
      createAutonomyScenario: () => scenario,
      executeAlgorithmPlan: vi
        .fn()
        .mockResolvedValue({ settlingTime: 1, energyConsumption: 1, steadyStateError: 0.01 }),
    };

    await optimizer.optimize(
      sim as never,
      algorithm,
      () => undefined
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits optimization candidates through the worker pool', async () => {
    const pool = {
      runBatch: vi.fn().mockResolvedValue([
        {
          trialId: 'trial-1',
          score: 10,
          success: true,
          metrics: {
            totalTime: 3,
            energyConsumption: 8,
            finalPoseError: 0.01,
            collisionCount: 0,
          },
          durationMs: 1,
        },
      ]),
    };
    const optimizer = new ControlOptimizer(fetch as typeof fetch, pool as any);

    await optimizer.optimize(
      {
        createAutonomyScenario: () => ({
          taskId: 'task-1',
          description: 'Autonomous pick-and-place trial',
          objectName: 'cube',
          sourcePose: { position: { x: 0, y: 0, z: 0 } },
          targetPose: { position: { x: 0, y: 0, z: 0 } },
          constraints: {},
          preferences: {},
        }),
      } as any,
      {
        id: 'algo-1',
        name: 'joint_pd',
        description: 'test',
        code: 'return;',
        parameters: { blend: 0.3, damping: 0.1 },
        controllerBlueprint: {
          templateId: 'joint_pd',
          controllerMode: 'single',
          stageConfigs: [],
          initialParameters: { blend: 0.3, damping: 0.1 },
          parameterBounds: {
            blend: { min: 0.05, max: 1 },
            damping: { min: 0, max: 0.5 },
          },
          selectionRationale: 'safe default',
        },
        performanceMetrics: {},
      },
      () => undefined
    );

    expect(pool.runBatch).toHaveBeenCalled();
  });

  it('respects the maxTrials budget when using the worker pool', async () => {
    const pool = {
      runBatch: vi.fn().mockResolvedValue([
        {
          trialId: 'trial-1',
          score: 10,
          success: true,
          metrics: {
            totalTime: 3,
            energyConsumption: 8,
            finalPoseError: 0.01,
            collisionCount: 0,
          },
          durationMs: 1,
        },
        {
          trialId: 'trial-2',
          score: 9,
          success: true,
          metrics: {
            totalTime: 4,
            energyConsumption: 9,
            finalPoseError: 0.02,
            collisionCount: 0,
          },
          durationMs: 1,
        },
      ]),
    };
    const optimizer = new ControlOptimizer(fetch as typeof fetch, pool as any);

    await optimizer.optimize(
      {
        createAutonomyScenario: () => ({
          taskId: 'task-1',
          description: 'Autonomous pick-and-place trial',
          objectName: 'cube',
          sourcePose: { position: { x: 0, y: 0, z: 0 } },
          targetPose: { position: { x: 0, y: 0, z: 0 } },
          constraints: {},
          preferences: {},
        }),
      } as any,
      {
        id: 'algo-1',
        name: 'joint_pd',
        description: 'test',
        code: 'return;',
        parameters: { blend: 0.3, damping: 0.1 },
        controllerBlueprint: {
          templateId: 'joint_pd',
          controllerMode: 'single',
          stageConfigs: [],
          initialParameters: { blend: 0.3, damping: 0.1 },
          parameterBounds: {
            blend: { min: 0.05, max: 1 },
            damping: { min: 0, max: 0.5 },
          },
          optimizableParameters: ['blend', 'damping'],
          selectionRationale: 'safe default',
        },
        performanceMetrics: {},
      },
      () => undefined,
      {
        maxTrials: 4,
        batchSize: 2,
        maxWallClockMs: 60_000,
      }
    );

    expect(pool.runBatch).toHaveBeenCalledTimes(2);
  });
});
