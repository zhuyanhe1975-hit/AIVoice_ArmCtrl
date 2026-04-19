import type { ControllerDecisionRequest } from '../types.ts';

export interface RequestValidationResult {
  valid: boolean;
  reasons: string[];
}

export function validateControllerDecisionRequest(
  payload: unknown
): RequestValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reasons: ['Request body must be an object.'] };
  }

  const request = payload as Partial<ControllerDecisionRequest>;
  const reasons: string[] = [];

  if (!request.description || typeof request.description !== 'string') {
    reasons.push('description is required');
  }

  if (request.requirements) {
    for (const field of ['speed', 'accuracy', 'stability', 'efficiency'] as const) {
      const value = request.requirements[field];
      if (typeof value !== 'number' || Number.isNaN(value)) {
        reasons.push(`requirements.${field} must be a number`);
      }
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}
