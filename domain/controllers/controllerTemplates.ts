import type { ControllerBlueprint, ControllerTemplateId, ParameterBounds } from '../../types.ts';

export interface ControllerTemplateDefinition {
  id: ControllerTemplateId;
  name: string;
  description: string;
  controllerMode: ControllerBlueprint['controllerMode'];
  parameterBounds: ParameterBounds;
  defaultParameters: Record<string, number>;
}

const controllerTemplates: ControllerTemplateDefinition[] = [
  {
    id: 'joint_pd',
    name: 'Joint PD',
    description: 'Single gain set for joint-space tracking.',
    controllerMode: 'single',
    parameterBounds: {
      blend: { min: 0.05, max: 1 },
      damping: { min: 0, max: 0.5 },
    },
    defaultParameters: {
      blend: 0.35,
      damping: 0.08,
    },
  },
  {
    id: 'stagewise_pd',
    name: 'Stage-wise PD',
    description: 'Separate gains for different pick-and-place stages.',
    controllerMode: 'stagewise',
    parameterBounds: {
      blend: { min: 0.05, max: 1 },
      damping: { min: 0, max: 0.5 },
    },
    defaultParameters: {
      blend: 0.3,
      damping: 0.1,
    },
  },
  {
    id: 'joint_impedance',
    name: 'Joint Impedance',
    description: 'Joint-space impedance-like control with damping.',
    controllerMode: 'single',
    parameterBounds: {
      stiffness: { min: 0.05, max: 1 },
      damping: { min: 0, max: 0.5 },
    },
    defaultParameters: {
      stiffness: 0.25,
      damping: 0.12,
    },
  },
  {
    id: 'hybrid_tracking',
    name: 'Hybrid Tracking',
    description: 'Trajectory tracking with stage-specific behavior.',
    controllerMode: 'stagewise',
    parameterBounds: {
      blend: { min: 0.05, max: 1 },
      damping: { min: 0, max: 0.5 },
      feedforward: { min: 0, max: 0.2 },
    },
    defaultParameters: {
      blend: 0.4,
      damping: 0.05,
      feedforward: 0.03,
    },
  },
];

export function listControllerTemplates(): ControllerTemplateDefinition[] {
  return controllerTemplates.map((template) => ({
    ...template,
    parameterBounds: { ...template.parameterBounds },
    defaultParameters: { ...template.defaultParameters },
  }));
}

export function getControllerTemplate(
  templateId: ControllerTemplateId
): ControllerTemplateDefinition | undefined {
  return controllerTemplates.find((template) => template.id === templateId);
}
