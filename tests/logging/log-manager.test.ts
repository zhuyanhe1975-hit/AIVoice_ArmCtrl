import { describe, expect, it } from 'vitest';
import { logger } from '../../LogManager';

describe('LogManager', () => {
  it('records structured autonomy events', () => {
    logger.clear();
    logger.event('info', {
      source: 'TaskAnalyzer',
      eventType: 'analysis.started',
      sessionId: 's1',
      trialId: 't1',
      message: 'Analyzing task'
    });

    const [log] = logger.getLogs();
    expect(log.eventType).toBe('analysis.started');
    expect(log.sessionId).toBe('s1');
    expect(log.trialId).toBe('t1');
  });
});
