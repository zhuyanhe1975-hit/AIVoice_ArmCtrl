import { requestStructuredJson } from './llmJsonClient.ts';
import type { VoiceCommandInterpretation } from './openaiVoiceCommandService.ts';

export interface VoiceAssistantReply {
  reply: string;
  source?: 'text_model' | 'vision_model' | 'fallback';
}

interface RawVoiceAssistantReply {
  reply: string;
}

function normalizeReply(payload: RawVoiceAssistantReply): VoiceAssistantReply {
  return {
    reply:
      typeof payload.reply === 'string' && payload.reply.trim().length > 0
        ? payload.reply.trim()
        : '我已经收到你的指令，准备执行。',
    source: 'text_model',
  };
}

function buildFallbackReply(
  command: string,
  interpretation: VoiceCommandInterpretation
): VoiceAssistantReply {
  if (interpretation.intent !== 'pick_place') {
    return {
      reply:
        interpretation.clarificationQuestion ??
        `我听到了“${command}”，但还不能稳定理解这句指令，请换一种更明确的说法。`,
      source: 'fallback',
    };
  }

  const targetText =
    interpretation.targetContainer === 'table_outside'
      ? '收纳栏外侧的桌面区域'
      : interpretation.targetRegion === 'left'
        ? '收纳栏左侧'
        : interpretation.targetRegion === 'right'
          ? '收纳栏右侧'
          : '收纳栏中间';
  const objectLabel =
    interpretation.objectColor === 'green'
      ? '绿色木块'
      : interpretation.objectColor === 'blue'
        ? '蓝色木块'
        : '红色木块';

  return {
    reply: `我理解为把${objectLabel}移动到${targetText}，现在开始执行。`,
    source: 'fallback',
  };
}

export async function createVoiceAssistantReply(
  command: string,
  interpretation: VoiceCommandInterpretation,
  fetchImpl: typeof fetch = fetch
): Promise<VoiceAssistantReply> {
  try {
    const payload = await requestStructuredJson(
      [
        {
          role: 'system',
          content:
            'You are the spoken feedback layer for a robotics demo. Return only JSON with a single field reply. Keep it concise, natural, and confident in Chinese. Summarize what you understood and whether execution will start or clarification is needed.',
        },
        {
          role: 'user',
          content: JSON.stringify({ command, interpretation }),
        },
      ],
      fetchImpl
    );

    return normalizeReply(payload as RawVoiceAssistantReply);
  } catch {
    return buildFallbackReply(command, interpretation);
  }
}
