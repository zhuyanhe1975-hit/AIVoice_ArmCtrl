import { ControllerBlueprint } from '../../types';
import { getControllerTemplate } from './controllerTemplates';

export interface InstantiatedController {
  templateId: ControllerBlueprint['templateId'];
  controllerMode: ControllerBlueprint['controllerMode'];
  parameters: Record<string, number>;
  stageConfigs: ControllerBlueprint['stageConfigs'];
  code: string;
}

function buildTemplateCode(templateId: ControllerBlueprint['templateId']): string {
  switch (templateId) {
    case 'joint_pd':
    case 'stagewise_pd':
      return `
        if (!params.targetQpos || !data.qpos || !data.qvel) return;
        const blend = Math.max(0.05, Math.min(1, params.blend ?? 0.35));
        const damping = Math.max(0, Math.min(0.5, params.damping ?? 0.08));
        for (let i = 0; i < 7; i++) {
          const error = params.targetQpos[i] - data.qpos[i];
          const desired = data.qpos[i] + error * blend - data.qvel[i] * damping;
          data.ctrl[i] = desired;
        }
      `;
    case 'joint_impedance':
      return `
        if (!params.targetQpos || !data.qpos || !data.qvel) return;
        const stiffness = Math.max(0.05, Math.min(1, params.stiffness ?? 0.25));
        const damping = Math.max(0, Math.min(0.5, params.damping ?? 0.12));
        for (let i = 0; i < 7; i++) {
          const error = params.targetQpos[i] - data.qpos[i];
          data.ctrl[i] = data.qpos[i] + error * stiffness - data.qvel[i] * damping;
        }
      `;
    case 'hybrid_tracking':
      return `
        if (!params.targetQpos || !data.qpos || !data.qvel) return;
        const blend = Math.max(0.05, Math.min(1, params.blend ?? 0.4));
        const damping = Math.max(0, Math.min(0.5, params.damping ?? 0.05));
        const ff = Math.max(0, Math.min(0.2, params.feedforward ?? 0.03));
        for (let i = 0; i < 7; i++) {
          const error = params.targetQpos[i] - data.qpos[i];
          const desired = data.qpos[i] + error * blend - data.qvel[i] * damping + ff * Math.sign(error);
          data.ctrl[i] = desired;
        }
      `;
  }
}

export function instantiateController(
  blueprint: ControllerBlueprint
): InstantiatedController {
  const template = getControllerTemplate(blueprint.templateId);

  if (!template) {
    throw new Error(`Unknown controller template: ${blueprint.templateId}`);
  }

  return {
    templateId: blueprint.templateId,
    controllerMode: blueprint.controllerMode,
    parameters: {
      ...template.defaultParameters,
      ...blueprint.initialParameters,
    },
    stageConfigs: blueprint.stageConfigs,
    code: buildTemplateCode(blueprint.templateId),
  };
}
