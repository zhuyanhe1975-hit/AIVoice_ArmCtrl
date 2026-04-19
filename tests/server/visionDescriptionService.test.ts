import { describe, expect, it, vi } from 'vitest';
import { createVisionDescription } from '../../server/visionDescriptionService';

describe('visionDescriptionService', () => {
  it('falls back to scene-state narration when the multimodal model is unavailable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('local model offline'));

    const reply = await createVisionDescription(
      {
        command: '你看到了什么',
        imageDataUrl: 'data:image/jpeg;base64,test',
        sceneState: {
          cubePosition: { x: 0.12, y: -0.08, z: 0.03 },
          trayPosition: { x: 0.31, y: 0.24, z: 0.0 },
        },
      },
      fetchMock as unknown as typeof fetch
    );

    expect(reply.source).toBe('fallback');
    expect(reply.reply).toContain('Franka Panda 机械臂');
    expect(reply.reply).toContain('红色木块');
    expect(reply.reply).toContain('收纳栏');
  });

  it('answers cube location questions from scene state when the multimodal model is unavailable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('local model offline'));

    const reply = await createVisionDescription(
      {
        command: '告诉我红色木块在哪里',
        imageDataUrl: 'data:image/jpeg;base64,test',
        sceneState: {
          cubePosition: { x: 0.18, y: -0.12, z: 0.03 },
          trayPosition: { x: 0.4, y: 0.2, z: 0.0 },
        },
      },
      fetchMock as unknown as typeof fetch
    );

    expect(reply.source).toBe('fallback');
    expect(reply.reply).toContain('红色木块现在在画面');
    expect(reply.reply).toContain('在收纳栏左侧');
  });
});
