import { describe, expect, it } from 'vitest';
import type { AutonomyLog, ControllerBlueprint, PerformanceProfile } from '../../types';

describe('autonomy types', () => {
  it('supports structured controller and logging shapes', () => {
    const profile: PerformanceProfile = {
      speedWeight: 0.3,
      accuracyWeight: 0.3,
      energyWeight: 0.1,
      stabilityWeight: 0.2,
      safetyWeight: 0.1,
      targetThresholds: {},
      analysisRationale: 'favor stable grasp'
    };

    const blueprint: ControllerBlueprint = {
      templateId: 'joint_pd',
      controllerMode: 'stagewise',
      stageConfigs: [],
      initialParameters: { blend: 0.3, damping: 0.08 },
      parameterBounds: {
        blend: { min: 0.05, max: 1 },
        damping: { min: 0, max: 0.5 }
      },
      selectionRationale: 'stable default'
    };

    const log: AutonomyLog = {
      id: 'log1',
      timestamp: Date.now(),
      level: 'info',
      source: 'OptimizationManager',
      eventType: 'trial.started',
      sessionId: 'session1',
      message: 'Trial started'
    };

    expect(profile.analysisRationale).toContain('stable');
    expect(blueprint.templateId).toBe('joint_pd');
    expect(log.eventType).toBe('trial.started');
  });
});
