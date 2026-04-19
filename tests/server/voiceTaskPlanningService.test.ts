import { describe, expect, it, vi } from 'vitest';
import { createVoiceTaskPlan } from '../../server/voiceTaskPlanningService';

describe('voiceTaskPlanningService', () => {
  it('classifies scene description requests in fallback mode', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));

    const plan = await createVoiceTaskPlan(
      {
        command: '你看到了什么',
        imageDataUrl: 'data:image/jpeg;base64,test',
      },
      fetchMock as unknown as typeof fetch
    );

    expect(plan.action).toBe('describe_scene');
    expect(plan.steps[0]?.skill).toBe('observe_scene');
    expect(plan.source).toBe('fallback');
  });

  it('classifies location questions in fallback mode', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));

    const plan = await createVoiceTaskPlan(
      {
        command: '告诉我红色木块在哪里',
        imageDataUrl: 'data:image/jpeg;base64,test',
      },
      fetchMock as unknown as typeof fetch
    );

    expect(plan.action).toBe('locate_object');
    expect(plan.targetObject).toBe('cube');
    expect(plan.steps[0]?.skill).toBe('locate_object');
  });

  it('classifies pick-and-place commands in fallback mode', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));

    const plan = await createVoiceTaskPlan(
      {
        command: '把红色木块放到收纳栏右边',
        imageDataUrl: 'data:image/jpeg;base64,test',
      },
      fetchMock as unknown as typeof fetch
    );

    expect(plan.action).toBe('pick_place');
    expect(plan.targetContainer).toBe('tray');
    expect(plan.targetRegion).toBe('right');
    expect(plan.steps).toHaveLength(2);
  });
});
