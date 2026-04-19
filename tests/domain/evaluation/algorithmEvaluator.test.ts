import { describe, expect, it, vi } from 'vitest';
import { AlgorithmEvaluator } from '../../../domain/evaluation/AlgorithmEvaluator';
import { ControlOptimizer } from '../../../ControlOptimizer';
import type { ControlAlgorithm, OptimizationReport } from '../../../types';

describe('AlgorithmEvaluator', () => {
  it('builds a quantitative comparison report for baseline and optimized algorithms', async () => {
    const evaluator = new AlgorithmEvaluator();
    const optimizer = {
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({
          settlingTime: 4,
          steadyStateError: 0.2,
          energyConsumption: 10,
          overshoot: 0.3,
        })
        .mockResolvedValueOnce({
          settlingTime: 2,
          steadyStateError: 0.05,
          energyConsumption: 6,
          overshoot: 0.1,
        }),
    } as unknown as ControlOptimizer;
    const sim = {
      createAutonomyScenario: () => ({
        taskId: 'task-1',
        description: 'Autonomous pick-and-place trial',
        objectName: 'cube',
        sourcePose: { position: { x: 0, y: 0, z: 0 } },
        targetPose: { position: { x: 0.4, y: 0.2, z: 0 } },
        constraints: {},
        preferences: {},
      }),
    };
    const baselineAlgorithm: ControlAlgorithm = {
      id: 'algo-1',
      name: 'joint_pd',
      description: 'baseline',
      code: 'return;',
      parameters: { blend: 0.3, damping: 0.1 },
      performanceMetrics: {},
    };
    const optimizedAlgorithm: ControlAlgorithm = {
      ...baselineAlgorithm,
      parameters: { blend: 0.2, damping: 0.15 },
    };
    const optimizationReport: OptimizationReport = {
      algorithmId: 'algo-1',
      algorithmName: 'joint_pd',
      baselineParameters: { blend: 0.3, damping: 0.1 },
      optimizedParameters: { blend: 0.2, damping: 0.15 },
      bestScore: 42,
      totalTrials: 4,
      completedTrials: 4,
      totalDurationMs: 1000,
      convergenceHistory: [],
      bestTrial: null,
      trialSummaries: [],
      budget: {
        maxTrials: 4,
        batchSize: 2,
        maxWallClockMs: 60_000,
      },
      finishedReason: 'budget_exhausted',
    };

    const report = await evaluator.evaluateComparison(
      optimizer,
      sim,
      baselineAlgorithm,
      optimizedAlgorithm,
      optimizationReport,
      1
    );

    expect(report.baselineMetrics.settlingTime.mean).toBe(4);
    expect(report.optimizedMetrics.settlingTime.mean).toBe(2);
    expect(report.improvements.settlingTime).toBeGreaterThan(0);
    expect(report.actionTimeline.length).toBeGreaterThan(0);
  });
});
