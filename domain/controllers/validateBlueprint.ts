import { ControllerBlueprint, FailureType } from '../../types';
import { getControllerTemplate } from './controllerTemplates';

export interface BlueprintValidationResult {
  valid: boolean;
  failureType?: FailureType;
  reasons: string[];
}

export function validateBlueprint(
  blueprint: ControllerBlueprint
): BlueprintValidationResult {
  const template = getControllerTemplate(blueprint.templateId);

  if (!template) {
    return {
      valid: false,
      failureType: 'BlueprintValidationFailure',
      reasons: [`Unknown template: ${blueprint.templateId}`],
    };
  }

  const reasons: string[] = [];
  const bounds = blueprint.parameterBounds;

  for (const [name, value] of Object.entries(blueprint.initialParameters)) {
    const range = bounds[name] ?? template.parameterBounds[name];

    if (!range) {
      reasons.push(`Missing bounds for parameter: ${name}`);
      continue;
    }

    if (value < range.min || value > range.max) {
      reasons.push(
        `Parameter ${name} is out of bounds: ${value} not in [${range.min}, ${range.max}]`
      );
    }
  }

  if (reasons.length > 0) {
    return {
      valid: false,
      failureType: 'BlueprintValidationFailure',
      reasons,
    };
  }

  return {
    valid: true,
    reasons: [],
  };
}
