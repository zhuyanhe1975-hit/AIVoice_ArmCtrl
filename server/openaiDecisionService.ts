import { buildControllerBlueprint } from '../domain/decision/ControllerDesigner.ts';
import { buildPerformanceProfileFromScenario } from '../domain/decision/TaskAnalyzer.ts';
import { requestStructuredJson } from './llmJsonClient.ts';
import type {
  ControllerDecisionRequest,
  ControllerDecisionResponse,
  ControllerTemplateId,
  ParameterBounds,
  TaskScenario,
} from '../types.ts';

export interface RawControllerDecision {
  templateId: string;
  optimizableParameters: string[];
  initialParameters: Record<string, number>;
  parameterBounds: ParameterBounds;
  selectionRationale: string;
}

function isParameterBounds(value: unknown): value is ParameterBounds {
  if (!value || typeof value !== 'object') return false;

  return Object.values(value).every((range) => {
    if (!range || typeof range !== 'object') return false;
    const typedRange = range as { min?: unknown; max?: unknown };
    return typeof typedRange.min === 'number' && typeof typedRange.max === 'number';
  });
}

export function normalizeControllerDecision(
  payload: RawControllerDecision
): ControllerDecisionResponse {
  if (!payload.templateId || typeof payload.templateId !== 'string') {
    throw new Error('templateId is required');
  }

  if (!Array.isArray(payload.optimizableParameters)) {
    throw new Error('optimizableParameters must be an array');
  }

  if (!payload.initialParameters || typeof payload.initialParameters !== 'object') {
    throw new Error('initialParameters must be an object');
  }

  if (!isParameterBounds(payload.parameterBounds)) {
    throw new Error('parameterBounds must contain numeric min/max pairs');
  }

  if (!payload.selectionRationale || typeof payload.selectionRationale !== 'string') {
    throw new Error('selectionRationale is required');
  }

  return {
    templateId: payload.templateId as ControllerTemplateId,
    optimizableParameters: payload.optimizableParameters.filter(
      (name): name is string => typeof name === 'string' && name.length > 0
    ),
    initialParameters: Object.fromEntries(
      Object.entries(payload.initialParameters).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    ),
    parameterBounds: payload.parameterBounds,
    selectionRationale: payload.selectionRationale,
  };
}

function buildFallbackDecision(request: ControllerDecisionRequest): ControllerDecisionResponse {
  const scenario: TaskScenario = {
    description: request.description,
    requirements: request.requirements ?? {
      speed: 0.5,
      accuracy: 0.5,
      stability: 0.5,
      efficiency: 0.5,
    },
  };
  const profile = buildPerformanceProfileFromScenario(scenario);
  const templateId: ControllerTemplateId =
    scenario.requirements.accuracy >= 0.75 || scenario.requirements.stability >= 0.75
      ? 'stagewise_pd'
      : scenario.requirements.efficiency >= 0.7
        ? 'joint_impedance'
        : scenario.requirements.speed >= 0.75
          ? 'hybrid_tracking'
          : 'joint_pd';
  const blueprint = buildControllerBlueprint(templateId, profile);

  return {
    templateId: blueprint.templateId,
    optimizableParameters: Object.keys(blueprint.initialParameters),
    initialParameters: blueprint.initialParameters,
    parameterBounds: blueprint.parameterBounds,
    selectionRationale: blueprint.selectionRationale,
  };
}

export async function createControllerDecision(
  request: ControllerDecisionRequest,
  fetchImpl: typeof fetch = fetch
): Promise<ControllerDecisionResponse> {
  try {
    const payload = await requestStructuredJson(
      [
        {
          role: 'system',
          content:
            'Choose one allowed controller template for a Franka Panda pick-and-place task and return only JSON fields for templateId, optimizableParameters, initialParameters, parameterBounds, selectionRationale.',
        },
        {
          role: 'user',
          content: JSON.stringify(request),
        },
      ],
      fetchImpl
    );

    return normalizeControllerDecision(payload as RawControllerDecision);
  } catch {
    return buildFallbackDecision(request);
  }
}
