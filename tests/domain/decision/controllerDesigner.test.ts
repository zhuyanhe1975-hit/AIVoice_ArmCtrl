import { describe, expect, it } from 'vitest';
import { ensureRegisteredTemplate } from '../../../domain/decision/ControllerDesigner';

describe('ControllerDesigner', () => {
  it('rejects unregistered templates', () => {
    expect(() => ensureRegisteredTemplate('free_code')).toThrow();
  });
});
