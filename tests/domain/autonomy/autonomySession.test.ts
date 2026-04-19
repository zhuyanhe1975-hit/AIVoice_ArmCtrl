import { describe, expect, it } from 'vitest';
import { getAutonomyStatusMessage } from '../../../domain/autonomy/autonomySession';

describe('autonomySession', () => {
  it('returns a user-facing status message for each phase', () => {
    expect(getAutonomyStatusMessage('idle')).toContain('待机');
    expect(getAutonomyStatusMessage('designing')).toContain('设计');
    expect(getAutonomyStatusMessage('optimizing')).toContain('优化');
    expect(getAutonomyStatusMessage('completed')).toContain('完成');
    expect(getAutonomyStatusMessage('failed')).toContain('失败');
  });
});
