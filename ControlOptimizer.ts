/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ControlAlgorithm,
  ControllerDecisionResponse,
  OptimizationReport,
  OptimizationLog,
  OptimizationBudget,
  OptimizationTrialSummary,
  TaskScenario,
  TrialRequest,
  TrialResult,
} from './types';
import { MujocoSim } from './MujocoSim';
import { logger } from './LogManager';
import { buildPerformanceProfileFromScenario } from './domain/decision/TaskAnalyzer';
import {
  applyOptimizationHints,
  scoreTrial,
  selectBestTrialResult,
} from './domain/optimization/OptimizationManager';
import { buildControllerBlueprint } from './domain/decision/ControllerDesigner';
import { instantiateController } from './domain/controllers/instantiateController';
import { validateBlueprint } from './domain/controllers/validateBlueprint';
import { generateDiagnostics } from './domain/evaluation/generateDiagnostics';
import { getControllerTemplate } from './domain/controllers/controllerTemplates';
import { buildPickPlacePlan } from './domain/execution/buildPickPlacePlan';

interface SimulationBatchRunner {
  runBatch(requests: TrialRequest[]): Promise<TrialResult[]>;
}

const DEFAULT_OPTIMIZATION_BUDGET: OptimizationBudget = {
  maxTrials: 96,
  batchSize: 4,
  maxWallClockMs: 10 * 60 * 1000,
};

/**
 * ControlOptimizer
 * Uses a backend decision service to design controllers and a numeric loop to optimize parameters.
 */
export class ControlOptimizer {
  private readonly fetchImpl: typeof fetch;
  private readonly simulationBatchRunner?: SimulationBatchRunner;

  constructor(
    fetchImpl: typeof fetch = fetch,
    simulationBatchRunner?: SimulationBatchRunner
  ) {
    this.fetchImpl = fetchImpl;
    this.simulationBatchRunner = simulationBatchRunner;
  }

  private chooseTemplateId(scenario: TaskScenario): "joint_pd" | "stagewise_pd" | "joint_impedance" | "hybrid_tracking" {
    if (scenario.requirements.accuracy >= 0.75 || scenario.requirements.stability >= 0.75) return "stagewise_pd";
    if (scenario.requirements.efficiency >= 0.7) return "joint_impedance";
    if (scenario.requirements.speed >= 0.75) return "hybrid_tracking";
    return "joint_pd";
  }

  private async requestControllerDecision(
    scenario: TaskScenario
  ): Promise<ControllerDecisionResponse | null> {
    const response = await this.fetchImpl('/api/decision/controller-blueprint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: scenario.description,
        requirements: scenario.requirements,
      }),
    });

    if (!response.ok) {
      throw new Error(`Decision request failed with status ${response.status}`);
    }

    return (await response.json()) as ControllerDecisionResponse;
  }

  private buildBlueprintFromDecision(
    scenario: TaskScenario,
    decision: ControllerDecisionResponse | null
  ) {
    const performanceProfile = buildPerformanceProfileFromScenario(scenario);
    const fallbackTemplateId = this.chooseTemplateId(scenario);
    const blueprint = buildControllerBlueprint(
      decision?.templateId ?? fallbackTemplateId,
      performanceProfile
    );
    const template = getControllerTemplate(blueprint.templateId);

    return {
      performanceProfile,
      blueprint: {
        ...blueprint,
        optimizableParameters:
          decision?.optimizableParameters ??
          Object.keys(template?.defaultParameters ?? blueprint.initialParameters),
        initialParameters: {
          ...blueprint.initialParameters,
          ...decision?.initialParameters,
        },
        parameterBounds: {
          ...blueprint.parameterBounds,
          ...decision?.parameterBounds,
        },
        selectionRationale: decision?.selectionRationale ?? blueprint.selectionRationale,
      },
    };
  }

  private clampParameters(
    parameters: Record<string, number>,
    bounds: ControlAlgorithm['controllerBlueprint'] extends infer T
      ? T extends { parameterBounds: infer B }
        ? B
        : never
      : never
  ): Record<string, number> {
    const next = { ...parameters };

    for (const [name, value] of Object.entries(next)) {
      const range = bounds?.[name];
      if (!range || typeof value !== 'number') continue;
      next[name] = Math.min(range.max, Math.max(range.min, value));
    }

    return next;
  }

  private resolveOptimizationBudget(
    budget?: Partial<OptimizationBudget>
  ): OptimizationBudget {
    const maxTrials = Math.max(
      1,
      Math.min(1000, Math.floor(budget?.maxTrials ?? DEFAULT_OPTIMIZATION_BUDGET.maxTrials))
    );
    const batchSize = Math.max(
      1,
      Math.min(maxTrials, Math.floor(budget?.batchSize ?? DEFAULT_OPTIMIZATION_BUDGET.batchSize))
    );
    const maxWallClockMs = Math.max(
      1_000,
      Math.floor(budget?.maxWallClockMs ?? DEFAULT_OPTIMIZATION_BUDGET.maxWallClockMs)
    );

    return {
      maxTrials,
      batchSize,
      maxWallClockMs,
    };
  }

  private buildParameterBatch(
    baseParameters: Record<string, number>,
    algorithm: ControlAlgorithm,
    batchSize: number
  ): Record<string, number>[] {
    const bounds = algorithm.controllerBlueprint?.parameterBounds ?? {};
    const optimizableParameters =
      algorithm.controllerBlueprint?.optimizableParameters?.filter(
        (parameter) => parameter in baseParameters
      ) ?? Object.keys(baseParameters);

    const batch: Record<string, number>[] = [{ ...baseParameters }];

    while (batch.length < batchSize) {
      const variantIndex = batch.length - 1;
      const parameterName =
        optimizableParameters[variantIndex % Math.max(optimizableParameters.length, 1)];

      if (!parameterName) {
        batch.push({ ...baseParameters });
        continue;
      }

      const direction = Math.floor(variantIndex / Math.max(optimizableParameters.length, 1)) % 2 === 0 ? 1 : -1;
      const range = bounds[parameterName];
      const baseValue = baseParameters[parameterName] ?? 0;
      const fallbackStep = Math.max(Math.abs(baseValue) * 0.15, 0.025);
      const delta = range ? (range.max - range.min) * 0.12 : fallbackStep;
      const candidate = {
        ...baseParameters,
        [parameterName]: baseValue + direction * delta,
      };

      batch.push(this.clampParameters(candidate, bounds));
    }

    return batch;
  }

  /**
   * Designs a control algorithm based on the task scenario.
   */
  async designAlgorithm(scenario: TaskScenario): Promise<ControlAlgorithm> {
    const performanceProfile = buildPerformanceProfileFromScenario(scenario);
    logger.event('info', {
      source: 'ControlOptimizer',
      eventType: 'analysis.completed',
      message: 'Derived performance profile for control design',
      data: performanceProfile,
    });
    let decision: ControllerDecisionResponse | null = null;

    try {
      logger.info('ControlOptimizer', 'Requesting backend controller decision', scenario);
      decision = await this.requestControllerDecision(scenario);
    } catch (error) {
      logger.warn('ControlOptimizer', 'Backend decision failed, using safe fallback', error);
    }

    const { blueprint } = this.buildBlueprintFromDecision(scenario, decision);
    const validation = validateBlueprint(blueprint);
    if (!validation.valid) {
      logger.event('error', {
        source: 'ControlOptimizer',
        eventType: 'controller.validation_failed',
        message: 'Controller blueprint failed validation',
        data: validation,
      });
      throw new Error(validation.reasons.join('; '));
    }
    const instantiated = instantiateController(blueprint);
    logger.event('success', {
      source: 'ControlOptimizer',
      eventType: 'controller.selected',
      message: `Selected controller template ${blueprint.templateId}`,
      data: {
        performanceProfile,
        blueprint,
      },
    });

    return {
      id: Math.random().toString(36).substring(7),
      name: blueprint.templateId,
      description: blueprint.selectionRationale,
      code: instantiated.code,
      parameters: instantiated.parameters,
      controllerBlueprint: blueprint,
      performanceProfile,
      diagnostics: [],
      performanceMetrics: {}
    };
  }

  /**
   * Runs a simulation with the given algorithm and parameters to evaluate performance.
   * Performs a multi-stage pick and place task.
   */
  async evaluate(sim: MujocoSim, algorithm: ControlAlgorithm, parameters: Record<string, number>): Promise<ControlAlgorithm['performanceMetrics']> {
    logger.info('ControlOptimizer', `Evaluating algorithm: ${algorithm.name}`, { parameters });
    const scenario = sim.createAutonomyScenario();
    const sessionId = `${algorithm.id}_eval_${Date.now()}`;
    const metrics = await sim.executeAlgorithmPlan(algorithm, {
      scenario,
      sessionId,
      parameters,
    });
    logger.info('ControlOptimizer', `Evaluation complete for ${algorithm.name}`, metrics);
    return metrics || {};
  }

  private buildTrialRequests(
    algorithm: ControlAlgorithm,
    trialBaseId: string,
    parameterBatch: Record<string, number>[],
    sim: Pick<MujocoSim, 'createAutonomyScenario'>
  ): TrialRequest[] {
    const scenario = sim.createAutonomyScenario();
    const executionPlan = buildPickPlacePlan(scenario);

    return parameterBatch.map((parameters, index) => ({
      trialId: `${trialBaseId}_${index + 1}`,
      scenario,
      controllerBlueprint: algorithm.controllerBlueprint ?? {
        templateId: 'joint_pd',
        controllerMode: 'single',
        stageConfigs: [],
        initialParameters: parameters,
        parameterBounds: {},
        selectionRationale: algorithm.description,
      },
      parameters,
      executionPlan,
      monitoringConfig: {
        sampleRate: 1,
      },
    }));
  }

  private mapTrialMetricsToPerformanceMetrics(result: TrialResult): ControlAlgorithm['performanceMetrics'] {
    return {
      settlingTime: Number(result.metrics.totalTime ?? 0),
      energyConsumption: Number(result.metrics.energyConsumption ?? 0),
      steadyStateError: Number(result.metrics.finalPoseError ?? 0),
      overshoot: Number(result.metrics.overshootCount ?? 0),
    };
  }

  /**
   * Optimizes controller parameters using bounded numeric updates.
   */
  async optimize(
    sim: MujocoSim, 
    algorithm: ControlAlgorithm, 
    onStep: (log: OptimizationLog) => void,
    budget?: Partial<OptimizationBudget>
  ): Promise<ControlAlgorithm> {
    const { algorithm: optimizedAlgorithm } = await this.optimizeDetailed(
      sim,
      algorithm,
      onStep,
      budget
    );

    return optimizedAlgorithm;
  }

  async optimizeDetailed(
    sim: MujocoSim,
    algorithm: ControlAlgorithm,
    onStep: (log: OptimizationLog) => void,
    budget?: Partial<OptimizationBudget>
  ): Promise<{ algorithm: ControlAlgorithm; report: OptimizationReport }> {
    let currentParams = { ...algorithm.parameters };
    let bestMetrics: ControlAlgorithm['performanceMetrics'] | null = null;
    let bestScore = -Infinity;
    let bestParams = { ...currentParams };
    const resolvedBudget = this.resolveOptimizationBudget(budget);

    const history: OptimizationLog[] = [];
    const trialSummaries: OptimizationTrialSummary[] = [];
    const convergenceHistory: OptimizationReport['convergenceHistory'] = [];
    const optimizationSessionId = `${algorithm.id}_opt_${Date.now()}`;
    const startedAt = Date.now();
    let completedTrials = 0;
    let iteration = 0;
    let bestTrial: OptimizationTrialSummary | null = null;
    let finishedReason: OptimizationReport['finishedReason'] = 'budget_exhausted';

    while (
      completedTrials < resolvedBudget.maxTrials &&
      Date.now() - startedAt < resolvedBudget.maxWallClockMs
    ) {
      iteration += 1;
      const remainingTrials = resolvedBudget.maxTrials - completedTrials;
      const effectiveBatchSize = Math.min(resolvedBudget.batchSize, remainingTrials);
      const parameterBatch = this.buildParameterBatch(currentParams, algorithm, effectiveBatchSize);
      let metrics: ControlAlgorithm['performanceMetrics'];
      let score: number;
      let selectedParameters = currentParams;
      let selectedTrialSummary: OptimizationTrialSummary | null = null;

      if (this.simulationBatchRunner) {
        try {
          const results = await this.simulationBatchRunner.runBatch(
            this.buildTrialRequests(algorithm, `${algorithm.id}_${iteration}`, parameterBatch, sim)
          );
          completedTrials += results.length;
          const batchSummaries = results.map((result, index) =>
            this.createOptimizationTrialSummary(
              result,
              parameterBatch[index] ?? currentParams,
              iteration
            )
          );
          trialSummaries.push(...batchSummaries);
          const bestResult = selectBestTrialResult(results);

          if (bestResult) {
            metrics = this.mapTrialMetricsToPerformanceMetrics(bestResult);
            score = bestResult.score;
            const selectedIndex = results.findIndex(
              (result) => result.trialId === bestResult.trialId
            );
            selectedParameters = parameterBatch[Math.max(selectedIndex, 0)] ?? currentParams;
            selectedTrialSummary =
              batchSummaries[Math.max(selectedIndex, 0)] ??
              this.createOptimizationTrialSummary(bestResult, selectedParameters, iteration);
          } else {
            metrics = await this.evaluate(sim, algorithm, currentParams);
            score = scoreTrial({
              success: (metrics.steadyStateError || 1) < 0.2,
              metrics: {
                totalTime: metrics.settlingTime || 10,
                energyConsumption: metrics.energyConsumption || 100,
                finalPoseError: metrics.steadyStateError || 1,
                collisionCount: 0,
              },
            });
            completedTrials += 1;
            selectedTrialSummary = {
              trialId: `${algorithm.id}_${iteration}_fallback`,
              iteration,
              parameters: { ...currentParams },
              score,
              metrics,
              status: (metrics.steadyStateError || 1) < 0.2 ? 'success' : 'failed',
            };
            trialSummaries.push(selectedTrialSummary);
          }
        } catch (error) {
          logger.warn('OptimizationManager', 'Worker-pool batch evaluation failed, falling back to serial evaluation', error);
          const serialResults = [];

          for (const candidateParameters of parameterBatch) {
            const candidateMetrics = await this.evaluate(sim, algorithm, candidateParameters);
            serialResults.push({
              parameters: candidateParameters,
              metrics: candidateMetrics,
              score: scoreTrial({
                success: (candidateMetrics.steadyStateError || 1) < 0.2,
                metrics: {
                  totalTime: candidateMetrics.settlingTime || 10,
                  energyConsumption: candidateMetrics.energyConsumption || 100,
                  finalPoseError: candidateMetrics.steadyStateError || 1,
                  collisionCount: 0,
                },
              }),
            });
          }

          completedTrials += serialResults.length;
          const bestSerialResult =
            serialResults.sort((left, right) => right.score - left.score)[0];
          trialSummaries.push(
            ...serialResults.map(
              (result, index): OptimizationTrialSummary => ({
                trialId: `${algorithm.id}_${iteration}_serial_${index + 1}`,
                iteration,
                parameters: { ...result.parameters },
                score: result.score,
                metrics: result.metrics,
                status:
                  (result.metrics.steadyStateError || 1) < 0.2 ? 'success' : 'failed',
              })
            )
          );

          metrics = bestSerialResult?.metrics ?? {};
          score = bestSerialResult?.score ?? Number.NEGATIVE_INFINITY;
          selectedParameters = bestSerialResult?.parameters ?? currentParams;
          selectedTrialSummary =
            trialSummaries[trialSummaries.length - serialResults.length] ?? null;
        }
      } else {
        const serialResults = [];

        for (const candidateParameters of parameterBatch) {
          const candidateMetrics = await this.evaluate(sim, algorithm, candidateParameters);
          serialResults.push({
            parameters: candidateParameters,
            metrics: candidateMetrics,
            score: scoreTrial({
              success: (candidateMetrics.steadyStateError || 1) < 0.2,
              metrics: {
                totalTime: candidateMetrics.settlingTime || 10,
                energyConsumption: candidateMetrics.energyConsumption || 100,
                finalPoseError: candidateMetrics.steadyStateError || 1,
                collisionCount: 0,
              },
            }),
          });
        }

        completedTrials += serialResults.length;
        const bestSerialResult =
          serialResults.sort((left, right) => right.score - left.score)[0];
        const serialSummaries = serialResults.map((result, index) => ({
          trialId: `${algorithm.id}_${iteration}_serial_${index + 1}`,
          iteration,
          parameters: { ...result.parameters },
          score: result.score,
          metrics: result.metrics,
          status:
            (result.metrics.steadyStateError || 1) < 0.2 ? 'success' : 'failed',
        } satisfies OptimizationTrialSummary));
        trialSummaries.push(...serialSummaries);

        metrics = bestSerialResult?.metrics ?? {};
        score = bestSerialResult?.score ?? Number.NEGATIVE_INFINITY;
        selectedParameters = bestSerialResult?.parameters ?? currentParams;
        selectedTrialSummary =
          serialSummaries.find((summary) =>
            Object.entries(summary.parameters).every(
              ([key, value]) => selectedParameters[key] === value
            )
          ) ?? serialSummaries[0] ?? null;
      }

      const log: OptimizationLog = {
        iteration,
        parameters: selectedParameters,
        score,
        metrics
      };
      history.push(log);
      onStep(log);

      if (score > bestScore) {
        bestScore = score;
        bestMetrics = metrics;
        bestParams = { ...selectedParameters };
        bestTrial = selectedTrialSummary
          ? { ...selectedTrialSummary, parameters: { ...selectedTrialSummary.parameters } }
          : bestTrial;
      }
      convergenceHistory.push({
        trial: completedTrials,
        bestScore,
        latestScore: score,
      });

      const diagnostics = generateDiagnostics({
        metrics: {
          overshootCount: metrics.overshoot ?? 0,
          settleDelay: metrics.settlingTime ?? 0,
          collisionCount: 0,
        },
        logs: logger.getLogs().slice(0, 10).map((log) => ({
          eventType: log.eventType,
          message: log.message,
        })),
      });

      logger.event('info', {
        source: 'OptimizationManager',
        eventType: 'diagnostics.generated',
        sessionId: optimizationSessionId,
        trialId: `${algorithm.id}_${iteration}`,
        message: diagnostics.summary,
        data: diagnostics,
      });

      currentParams = this.clampParameters(
        applyOptimizationHints(selectedParameters, diagnostics.recommendations),
        algorithm.controllerBlueprint?.parameterBounds
      );
    }

    if (Date.now() - startedAt >= resolvedBudget.maxWallClockMs) {
      finishedReason = 'wall_clock_exhausted';
    } else if (completedTrials < resolvedBudget.maxTrials) {
      finishedReason = 'stopped';
    }

    const optimizedAlgorithm: ControlAlgorithm = {
      ...algorithm,
      parameters: bestParams,
      diagnostics: logger.getLogs()
        .filter((log) => log.eventType === 'diagnostics.generated')
        .slice(0, 5)
        .map((log) => log.message),
      performanceMetrics: bestMetrics ?? {}
    };

    const report: OptimizationReport = {
      algorithmId: algorithm.id,
      algorithmName: algorithm.name,
      baselineParameters: { ...algorithm.parameters },
      optimizedParameters: { ...bestParams },
      bestScore,
      totalTrials: resolvedBudget.maxTrials,
      completedTrials,
      totalDurationMs: Date.now() - startedAt,
      convergenceHistory,
      bestTrial,
      trialSummaries,
      budget: resolvedBudget,
      finishedReason,
    };

    return {
      algorithm: optimizedAlgorithm,
      report,
    };
  }

  private createOptimizationTrialSummary(
    result: TrialResult,
    parameters: Record<string, number>,
    iteration: number
  ): OptimizationTrialSummary {
    return {
      trialId: result.trialId,
      iteration,
      parameters: { ...parameters },
      score: result.score,
      metrics: this.mapTrialMetricsToPerformanceMetrics(result),
      status: result.success ? 'success' : 'failed',
      failureReason: result.failureSummary,
    };
  }
}
