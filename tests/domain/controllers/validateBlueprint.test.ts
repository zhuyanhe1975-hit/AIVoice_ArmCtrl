import { describe, expect, it } from 'vitest';
import { validateBlueprint } from '../../../domain/controllers/validateBlueprint';

describe('validateBlueprint', () => {
  it('rejects out-of-bound parameters', () => {
    const result = validateBlueprint({
      templateId: 'joint_pd',
      controllerMode: 'stagewise',
      stageConfigs: [],
      initialParameters: { blend: 9999, damping: 1 },
      parameterBounds: { blend: { min: 0.05, max: 1 }, damping: { min: 0, max: 0.5 } },
      selectionRationale: 'bad params'
    });

    expect(result.valid).toBe(false);
    expect(result.failureType).toBe('BlueprintValidationFailure');
  });
});
