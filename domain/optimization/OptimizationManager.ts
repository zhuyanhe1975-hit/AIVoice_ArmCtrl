import { EvaluationReport, TrialResult } from '../../types';

export interface OptimizationHint {
  action: 'reduce_gain' | 'increase_gain' | 'increase_damping' | 'reduce_damping';
  parameter: string;
  magnitude: number;
}

export function scoreTrial(trial: Pick<EvaluationReport, 'success' | 'metrics'>): number {
  const totalTime = Number(trial.metrics.totalTime ?? 10);
  const energy = Number(trial.metrics.energyConsumption ?? 100);
  const finalPoseError = Number(trial.metrics.finalPoseError ?? 1);
  const collisionCount = Number(trial.metrics.collisionCount ?? 0);
  const successBonus = trial.success ? 100 : -100;

  return (
    successBonus -
    totalTime * 10 -
    energy * 0.5 -
    finalPoseError * 200 -
    collisionCount * 50
  );
}

export function applyOptimizationHints(
  parameters: Record<string, number>,
  hints: OptimizationHint[]
): Record<string, number> {
  const next = { ...parameters };

  for (const hint of hints) {
    const currentValue = next[hint.parameter];
    if (typeof currentValue !== 'number') continue;

    const delta = Math.abs(currentValue) * hint.magnitude;
    if (hint.action === 'reduce_gain' || hint.action === 'reduce_damping') {
      next[hint.parameter] = currentValue - delta;
    } else {
      next[hint.parameter] = currentValue + delta;
    }
  }

  return next;
}

export function selectBestTrialResult(results: TrialResult[]): TrialResult | undefined {
  return results.reduce<TrialResult | undefined>((best, current) => {
    if (!best || current.score > best.score) {
      return current;
    }

    return best;
  }, undefined);
}
