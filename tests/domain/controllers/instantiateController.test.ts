import { describe, expect, it } from 'vitest';
import { instantiateController } from '../../../domain/controllers/instantiateController';

describe('instantiateController', () => {
  it('builds position-target control code for joint_pd templates', () => {
    const controller = instantiateController({
      templateId: 'joint_pd',
      controllerMode: 'single',
      stageConfigs: [],
      initialParameters: { blend: 0.4, damping: 0.05 },
      parameterBounds: {
        blend: { min: 0.05, max: 1 },
        damping: { min: 0, max: 0.5 },
      },
      selectionRationale: 'test',
    });

    expect(controller.code).toContain('data.ctrl[i] =');
    expect(controller.code).toContain('params.targetQpos[i]');
    expect(controller.code).not.toContain('kp * error');
  });
});
