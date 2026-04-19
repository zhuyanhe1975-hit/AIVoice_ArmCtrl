import { describe, expect, it } from 'vitest';
import {
  getControllerTemplate,
  listControllerTemplates,
} from '../../../domain/controllers/controllerTemplates';

describe('controller templates', () => {
  it('returns registered templates and bounds', () => {
    const templates = listControllerTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(getControllerTemplate('joint_pd')?.parameterBounds.blend.max).toBeGreaterThan(0);
  });
});
