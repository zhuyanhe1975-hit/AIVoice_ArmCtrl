import type { ControllerBlueprint, ControllerTemplateId, PerformanceProfile } from '../../types.ts';
import { getControllerTemplate, listControllerTemplates } from '../controllers/controllerTemplates.ts';

export function ensureRegisteredTemplate(templateId: string): ControllerTemplateId {
  const template = listControllerTemplates().find((candidate) => candidate.id === templateId);

  if (!template) {
    throw new Error(`Unsupported controller template: ${templateId}`);
  }

  return template.id;
}

export function buildControllerBlueprint(
  templateId: string,
  profile: PerformanceProfile
): ControllerBlueprint {
  const safeTemplateId = ensureRegisteredTemplate(templateId);
  const template = getControllerTemplate(safeTemplateId);

  if (!template) {
    throw new Error(`Unsupported controller template: ${templateId}`);
  }

  return {
    templateId: template.id,
    controllerMode: template.controllerMode,
    stageConfigs: [],
    initialParameters: { ...template.defaultParameters },
    parameterBounds: { ...template.parameterBounds },
    selectionRationale: `Selected ${template.name} for profile emphasizing accuracy=${profile.accuracyWeight.toFixed(
      2
    )}, stability=${profile.stabilityWeight.toFixed(2)}, safety=${profile.safetyWeight.toFixed(2)}.`,
  };
}
