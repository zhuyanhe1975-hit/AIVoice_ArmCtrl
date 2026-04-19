import type { TrialRequest, TrialResult } from '../../types';
import { scoreTrial } from './OptimizationManager';

export interface HeadlessTrialRuntime {
  reset: () => void | Promise<void>;
  execute: (request: TrialRequest) => Promise<{
    success: boolean;
    metrics: Record<string, number | boolean>;
    failureType?: TrialResult['failureType'];
    failureSummary?: string;
  }>;
}

export async function runHeadlessTrial(
  runtime: HeadlessTrialRuntime,
  request: TrialRequest
): Promise<TrialResult> {
  const start = Date.now();

  await runtime.reset();
  const outcome = await runtime.execute(request);
  const score = scoreTrial({
    success: outcome.success,
    metrics: outcome.metrics,
  });

  return {
    trialId: request.trialId,
    success: outcome.success,
    metrics: outcome.metrics,
    score,
    failureType: outcome.failureType,
    failureSummary: outcome.failureSummary,
    durationMs: Date.now() - start,
  };
}
