import { OptimizationHint } from '../optimization/OptimizationManager';

export interface DiagnosticInput {
  metrics: Record<string, number>;
  logs: Array<{
    eventType: string;
    message: string;
  }>;
}

export interface DiagnosticResult {
  summary: string;
  recommendations: OptimizationHint[];
}

export function generateDiagnostics(input: DiagnosticInput): DiagnosticResult {
  const recommendations: OptimizationHint[] = [];
  const overshootEvents = input.logs.filter((log) => log.message.toLowerCase().includes('overshoot'));

  if ((input.metrics.overshootCount ?? 0) > 1 || overshootEvents.length > 0) {
    recommendations.push({
      action: 'reduce_gain',
      parameter: 'blend',
      magnitude: 0.2,
    });
    recommendations.push({
      action: 'increase_damping',
      parameter: 'damping',
      magnitude: 0.15,
    });
  }

  if ((input.metrics.collisionCount ?? 0) > 0) {
    recommendations.push({
      action: 'reduce_gain',
      parameter: 'blend',
      magnitude: 0.1,
    });
  }

  const summary =
    overshootEvents.length > 0 || (input.metrics.overshootCount ?? 0) > 1
      ? 'Detected repeated overshoot during execution.'
      : 'No major diagnostic pattern detected.';

  return {
    summary,
    recommendations,
  };
}
