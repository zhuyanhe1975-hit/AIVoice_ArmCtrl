import type { PerformanceProfile, TaskScenario, TaskScenarioV2 } from '../../types.ts';

const PROFILE_FIELDS: Array<keyof Pick<
  PerformanceProfile,
  'speedWeight' | 'accuracyWeight' | 'energyWeight' | 'stabilityWeight' | 'safetyWeight'
>> = ['speedWeight', 'accuracyWeight', 'energyWeight', 'stabilityWeight', 'safetyWeight'];

export function normalizePerformanceProfile(
  profile: PerformanceProfile
): PerformanceProfile {
  const total = PROFILE_FIELDS.reduce((sum, field) => sum + Math.max(profile[field], 0), 0);

  if (total <= 0) {
    const uniformWeight = 1 / PROFILE_FIELDS.length;
    return {
      ...profile,
      speedWeight: uniformWeight,
      accuracyWeight: uniformWeight,
      energyWeight: uniformWeight,
      stabilityWeight: uniformWeight,
      safetyWeight: uniformWeight,
    };
  }

  return PROFILE_FIELDS.reduce(
    (next, field) => {
      next[field] = Math.max(profile[field], 0) / total;
      return next;
    },
    { ...profile }
  );
}

export function buildPerformanceProfileFromScenario(
  scenario: TaskScenario | TaskScenarioV2
): PerformanceProfile {
  if ('requirements' in scenario) {
    return normalizePerformanceProfile({
      speedWeight: scenario.requirements.speed,
      accuracyWeight: scenario.requirements.accuracy,
      energyWeight: scenario.requirements.efficiency,
      stabilityWeight: scenario.requirements.stability,
      safetyWeight: 0.2,
      targetThresholds: {},
      analysisRationale: `Derived from scenario requirements for: ${scenario.description}`,
    });
  }

  return normalizePerformanceProfile({
    speedWeight: Number(scenario.preferences.speedWeight ?? 0.25),
    accuracyWeight: Number(scenario.preferences.accuracyWeight ?? 0.25),
    energyWeight: Number(scenario.preferences.energyWeight ?? 0.15),
    stabilityWeight: Number(scenario.preferences.stabilityWeight ?? 0.2),
    safetyWeight: Number(scenario.preferences.safetyWeight ?? 0.15),
    targetThresholds: {},
    analysisRationale: `Derived from structured task scenario: ${scenario.description}`,
  });
}
