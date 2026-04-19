import { describe, expect, it } from 'vitest';
import { classifyFailure } from '../../../domain/evaluation/classifyFailure';

describe('classifyFailure', () => {
  it('marks timeout as task failure', () => {
    const result = classifyFailure({ timeout: true, collisionCount: 0, graspSuccess: false });
    expect(result.type).toBe('TaskFailure');
  });
});
