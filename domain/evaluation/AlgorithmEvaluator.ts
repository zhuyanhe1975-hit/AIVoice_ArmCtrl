import { ControlOptimizer } from '../../ControlOptimizer';
import {
  ActionVisualizationStage,
  AlgorithmEvaluationReport,
  ControlAlgorithm,
  EvaluationMetricStats,
  EvaluationSummaryMetrics,
  OptimizationReport,
  TaskScenarioV2,
} from '../../types';
import { buildPickPlacePlan } from '../execution/buildPickPlacePlan';

interface EvaluationSim {
  createAutonomyScenario(): TaskScenarioV2;
}

function summarizeMetric(values: number[]): EvaluationMetricStats {
  const safeValues = values.length > 0 ? values : [0];
  const total = safeValues.reduce((sum, value) => sum + value, 0);

  return {
    mean: total / safeValues.length,
    min: Math.min(...safeValues),
    max: Math.max(...safeValues),
  };
}

function buildMetricSummary(
  runs: ControlAlgorithm['performanceMetrics'][]
): EvaluationSummaryMetrics {
  return {
    settlingTime: summarizeMetric(runs.map((run) => Number(run.settlingTime ?? 0))),
    steadyStateError: summarizeMetric(runs.map((run) => Number(run.steadyStateError ?? 0))),
    energyConsumption: summarizeMetric(runs.map((run) => Number(run.energyConsumption ?? 0))),
    overshoot: summarizeMetric(runs.map((run) => Number(run.overshoot ?? 0))),
  };
}

function computeImprovement(
  baseline: number,
  optimized: number
): number {
  if (baseline === 0) {
    return 0;
  }

  return ((baseline - optimized) / baseline) * 100;
}

function buildActionTimeline(scenario: TaskScenarioV2): ActionVisualizationStage[] {
  return buildPickPlacePlan(scenario).stages.map((stage) => ({
    name: stage.name,
    duration: stage.duration ?? 1,
    objectives: [
      stage.targetPose ? '跟踪目标位姿' : '保持当前位姿',
      typeof stage.gripperCommand === 'number' && stage.gripperCommand > 0
        ? '夹爪保持张开'
        : '夹爪保持闭合',
    ],
  }));
}

export class AlgorithmEvaluator {
  async evaluateComparison(
    optimizer: ControlOptimizer,
    sim: EvaluationSim,
    baselineAlgorithm: ControlAlgorithm,
    optimizedAlgorithm: ControlAlgorithm,
    optimizationReport: OptimizationReport,
    sampleCount = 3
  ): Promise<AlgorithmEvaluationReport> {
    const scenario = sim.createAutonomyScenario();
    const safeSampleCount = Math.max(1, sampleCount);
    const baselineRuns: ControlAlgorithm['performanceMetrics'][] = [];
    const optimizedRuns: ControlAlgorithm['performanceMetrics'][] = [];

    for (let index = 0; index < safeSampleCount; index += 1) {
      baselineRuns.push(
        await optimizer.evaluate(sim as never, baselineAlgorithm, optimizationReport.baselineParameters)
      );
      optimizedRuns.push(
        await optimizer.evaluate(sim as never, optimizedAlgorithm, optimizationReport.optimizedParameters)
      );
    }

    const baselineMetrics = buildMetricSummary(baselineRuns);
    const optimizedMetrics = buildMetricSummary(optimizedRuns);

    return {
      algorithmId: optimizedAlgorithm.id,
      algorithmName: optimizedAlgorithm.name,
      sampleCount: safeSampleCount,
      baselineMetrics,
      optimizedMetrics,
      improvements: {
        settlingTime: computeImprovement(
          baselineMetrics.settlingTime.mean,
          optimizedMetrics.settlingTime.mean
        ),
        steadyStateError: computeImprovement(
          baselineMetrics.steadyStateError.mean,
          optimizedMetrics.steadyStateError.mean
        ),
        energyConsumption: computeImprovement(
          baselineMetrics.energyConsumption.mean,
          optimizedMetrics.energyConsumption.mean
        ),
        overshoot: computeImprovement(
          baselineMetrics.overshoot.mean,
          optimizedMetrics.overshoot.mean
        ),
      },
      baselineParameters: { ...optimizationReport.baselineParameters },
      optimizedParameters: { ...optimizationReport.optimizedParameters },
      actionTimeline: buildActionTimeline(scenario),
      generatedAt: Date.now(),
    };
  }
}
