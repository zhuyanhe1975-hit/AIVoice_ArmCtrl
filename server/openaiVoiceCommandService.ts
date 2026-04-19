import type { TaskScenarioV2 } from '../types.ts';
import { requestStructuredJson } from './llmJsonClient.ts';

export interface VoiceCommandInterpretation {
  intent: 'pick_place' | 'unknown';
  objectColor: 'red' | 'green' | 'blue' | 'unknown';
  targetContainer: 'tray' | 'table_outside' | 'unknown';
  targetRegion: 'center' | 'left' | 'right' | 'unknown';
  confidence: number;
  reasoning: string;
  source?: 'text_model' | 'vision_model' | 'fallback';
  clarificationQuestion?: string;
}

interface RawVoiceCommandInterpretation {
  intent: string;
  objectColor: string;
  targetContainer: string;
  targetRegion: string;
  confidence: number;
  reasoning: string;
  clarificationQuestion?: string;
}

function normalizeInterpretation(
  payload: RawVoiceCommandInterpretation
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
    source: 'text_model',
    clarificationQuestion:
      typeof payload.clarificationQuestion === 'string' &&
      payload.clarificationQuestion.length > 0
        ? payload.clarificationQuestion
        : undefined,
  };
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, '').toLowerCase();
}

function detectColor(text: string): VoiceCommandInterpretation['objectColor'] {
  if (/(绿色|绿块|绿色块|绿色方块|绿积木|green)/.test(text)) return 'green';
  if (/(蓝色|蓝块|蓝色块|蓝色方块|蓝积木|blue)/.test(text)) return 'blue';
  if (/(红色|红块|红色块|红色方块|红色积木|red)/.test(text)) return 'red';
  return 'unknown';
}

function buildFallbackInterpretation(command: string): VoiceCommandInterpretation {
  const text = normalizeText(command);
  const mentionsMove = /(放|拿|抓|移动|pick|place|put)/.test(text);
  const objectColor = detectColor(text);
  const mentionsColoredBlock = /(红色|绿色|蓝色|红块|绿块|蓝块|红色块|绿色块|蓝色块|红色方块|绿色方块|蓝色方块|红色积木|绿色积木|蓝色积木|red|green|blue)/.test(text);
  const mentionsBlock = /(方块|块|木块|积木|cube|block)/.test(text);
  const mentionsTray = /(收纳栏|收纳盒|托盘|tray|bin|篮)/.test(text);
  const mentionsTakeOut = /(拿出来|取出来|拿出|取出|移出来|moveout|takeout|remove)/.test(text);
  const mentionsLeft = /(左边|左侧|left)/.test(text);
  const mentionsRight = /(右边|右侧|right)/.test(text);
  const mentionsCenter = /(中间|中央|center|middle)/.test(text);

  if ((mentionsTakeOut || (/拿/.test(text) && !mentionsTray)) && (mentionsColoredBlock || mentionsBlock)) {
    return {
      intent: 'pick_place',
      objectColor,
      targetContainer: 'table_outside',
      targetRegion: mentionsLeft ? 'left' : mentionsRight ? 'right' : 'center',
      confidence: 0.66,
      reasoning: 'Fallback parser interpreted the command as taking the block out to an outside table zone.',
      source: 'fallback',
    };
  }

  if (mentionsMove && (mentionsColoredBlock || mentionsBlock) && mentionsTray) {
    return {
      intent: 'pick_place',
      objectColor,
      targetContainer: 'tray',
      targetRegion: mentionsLeft ? 'left' : mentionsRight ? 'right' : 'center',
      confidence: 0.62,
      reasoning: 'Fallback parser matched pick/place, block, and tray-related keywords.',
      source: 'fallback',
    };
  }

  return {
    intent: 'unknown',
    objectColor: 'unknown',
    targetContainer: 'unknown',
    targetRegion: 'unknown',
    confidence: 0.18,
    reasoning: 'Fallback parser could not confidently map the spoken command.',
    source: 'fallback',
    clarificationQuestion: '请再说一次，比如“把红色块放到收纳栏的中间”。',
  };
}

export async function interpretVoiceCommand(
  command: string,
  _scene?: TaskScenarioV2,
  fetchImpl: typeof fetch = fetch
): Promise<VoiceCommandInterpretation> {
  try {
    const payload = await requestStructuredJson(
      [
        {
          role: 'system',
          content:
            'You interpret spoken robot commands for a MuJoCo Franka Panda scene. Return only JSON. Supported intent is pick_place. The selectable objects are red, green, and blue cubes, and users may call them red/green/blue block, cube, wood block, or toy block. objectColor must be red, green, blue, or unknown. targetContainer must be one of tray, table_outside, unknown. Use table_outside when the user says to take the block out, remove it, or place it outside the tray. targetRegion must be one of center, left, right, unknown. If the command is ambiguous, set intent to unknown and include clarificationQuestion.',
        },
        {
          role: 'user',
          content: JSON.stringify({ command }),
        },
      ],
      fetchImpl
    );

    return normalizeInterpretation(payload as RawVoiceCommandInterpretation);
  } catch {
    return buildFallbackInterpretation(command);
  }
}
