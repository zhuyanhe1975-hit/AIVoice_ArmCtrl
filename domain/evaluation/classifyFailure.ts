import { FailureType } from '../../types';

export interface TrialFailureSignals {
  timeout?: boolean;
  collisionCount?: number;
  graspSuccess?: boolean;
  ikFailed?: boolean;
  safetyLimitHit?: boolean;
  executionError?: boolean;
}

export function classifyFailure(signals: TrialFailureSignals): {
  type: FailureType;
  summary: string;
} {
  if (signals.safetyLimitHit) {
    return { type: 'SafetyFailure', summary: 'Safety limits were exceeded during execution.' };
  }

  if (signals.ikFailed) {
    return { type: 'IKFailure', summary: 'The requested pose could not be reached by IK.' };
  }

  if (signals.executionError) {
    return { type: 'ExecutionFailure', summary: 'The controller failed during execution.' };
  }

  if ((signals.collisionCount ?? 0) > 0) {
    return { type: 'SafetyFailure', summary: 'Collision activity was detected during the trial.' };
  }

  if (signals.timeout || signals.graspSuccess === false) {
    return { type: 'TaskFailure', summary: 'The task did not complete successfully.' };
  }

  return { type: 'PlanningFailure', summary: 'The trial failed before execution planning completed.' };
}
