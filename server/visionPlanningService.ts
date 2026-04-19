import { requestStructuredJson } from './llmJsonClient.ts';
import type { VoiceCommandInterpretation } from './openaiVoiceCommandService.ts';

export interface VisionPlanningRequest {
  command: string;
  imageDataUrl: string;
  sceneState?: Record<string, unknown>;
}

interface RawVisionInterpretation {
  intent: string;
  objectColor: string;
  targetContainer: string;
  targetRegion: string;
  confidence: number;
  reasoning: string;
  clarificationQuestion?: string;
}

function normalizeVisionInterpretation(
  payload: RawVisionInterpretation
): VoiceCommandInterpretation {
  return {
    intent: payload.intent === 'pick_place' ? 'pick_place' : 'unknown',
    objectColor:
      payload.objectColor === 'red' || payload.objectColor === 'green' || payload.objectColor === 'blue'
        ? payload.objectColor
        : 'unknown',
    targetContainer:
      payload.targetContainer === 'tray' || payload.targetContainer === 'table_outside'
        ? payload.targetContainer
        : 'unknown',
    targetRegion:
      payload.targetRegion === 'left' ||
      payload.targetRegion === 'right' ||
      payload.targetRegion === 'center'
        ? payload.targetRegion
        : 'unknown',
    confidence:
      typeof payload.confidence === 'number' && Number.isFinite(payload.confidence)
        ? Math.max(0, Math.min(1, payload.confidence))
        : 0,
    reasoning:
      typeof payload.reasoning === 'string' && payload.reasoning.length > 0
        ? payload.reasoning
        : 'No reasoning provided.',
    source: 'vision_model',
    clarificationQuestion:
      typeof payload.clarificationQuestion === 'string' &&
      payload.clarificationQuestion.length > 0
        ? payload.clarificationQuestion
        : undefined,
  };
}

export async function createVisionPlan(
  request: VisionPlanningRequest,
  fetchImpl: typeof fetch = fetch
): Promise<VoiceCommandInterpretation> {
  const payload = await requestStructuredJson(
    [
        {
          role: 'system',
          content:
          'You are a robotics visual planner for a Franka Panda MuJoCo simulation. Return only JSON. Interpret the spoken command using both the screenshot and provided scene state. Supported intent is pick_place. The selectable objects are the visible red, green, and blue cube/block. objectColor must be red, green, blue, or unknown. targetContainer must be tray, table_outside, or unknown. targetRegion must be center, left, right, or unknown. If uncertain, set intent to unknown and ask a clarificationQuestion.',
        },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              command: request.command,
              sceneState: request.sceneState ?? {},
            }),
          },
          {
            type: 'image_url',
            image_url: {
              url: request.imageDataUrl,
            },
          },
        ],
      },
    ],
    fetchImpl
  );

  return normalizeVisionInterpretation(payload as RawVisionInterpretation);
}
