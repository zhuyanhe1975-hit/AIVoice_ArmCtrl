import { requestStructuredJson } from './llmJsonClient.ts';
import type { VoiceAssistantReply } from './openaiVoiceResponseService.ts';

export interface VisionDescriptionRequest {
  command: string;
  imageDataUrl: string;
  sceneState?: Record<string, unknown>;
}

interface RawVisionDescriptionReply {
  reply: string;
}

function normalizeCommandText(text: string) {
  return text.replace(/\s+/g, '').toLowerCase();
}

function detectColor(text: string): 'red' | 'green' | 'blue' | 'unknown' {
  if (/(绿色|绿块|绿色块|绿色方块|绿积木|green)/.test(text)) return 'green';
  if (/(蓝色|蓝块|蓝色块|蓝色方块|蓝积木|blue)/.test(text)) return 'blue';
  if (/(红色|红块|红色块|红色方块|红积木|red)/.test(text)) return 'red';
  return 'unknown';
}

function describeHorizontalZone(x: number) {
  if (x < 0.32) return '偏左前方';
  if (x > 0.48) return '偏右前方';
  return '中间偏前';
}

function describeVerticalZone(y: number) {
  if (y < -0.05) return '靠下方';
  if (y > 0.1) return '靠上方';
  return '接近中线';
}

function buildCubeLocationReply(
  command: string,
  cubePosition: { x?: number; y?: number; z?: number } | null | undefined,
  trayPosition: { x?: number; y?: number; z?: number } | null | undefined
): VoiceAssistantReply | null {
  const normalized = normalizeCommandText(command);
  const asksCubeLocation = /(红色木块|绿色木块|蓝色木块|红色块|绿色块|蓝色块|木块|积木|方块|red|green|blue|cube|block).*(在哪|在哪里|位置)|((在哪|在哪里|位置).*(红色木块|绿色木块|蓝色木块|红色块|绿色块|蓝色块|木块|积木|方块|red|green|blue|cube|block))/.test(
    normalized
  );
  const color = detectColor(normalized);
  const colorLabel = color === 'green' ? '绿色木块' : color === 'blue' ? '蓝色木块' : '红色木块';

  if (!asksCubeLocation || !cubePosition) {
    return null;
  }

  const x = Number(cubePosition.x ?? 0);
  const y = Number(cubePosition.y ?? 0);
  const zone = `${describeHorizontalZone(x)}、${describeVerticalZone(y)}`;

  let relativeToTray = '';
  if (trayPosition) {
    const trayX = Number(trayPosition.x ?? 0);
    const trayY = Number(trayPosition.y ?? 0);
    const horizontal =
      x < trayX - 0.04 ? '在收纳栏左侧' : x > trayX + 0.04 ? '在收纳栏右侧' : '与收纳栏大致同一列';
    const vertical =
      y < trayY - 0.06 ? '并且在收纳栏前方' : y > trayY + 0.06 ? '并且在收纳栏后方' : '并且与收纳栏前后位置接近';
    relativeToTray = `，${horizontal}，${vertical}`;
  }

  return {
    reply: `${colorLabel}现在在画面${zone}，坐标大约是 x=${x.toFixed(2)}、y=${y.toFixed(2)}${relativeToTray}。`,
    source: 'fallback',
  };
}

function normalizeReply(payload: RawVisionDescriptionReply): VoiceAssistantReply {
  return {
    reply:
      typeof payload.reply === 'string' && payload.reply.trim().length > 0
        ? payload.reply.trim()
        : '我看到机械臂、红色木块和收纳栏。',
    source: 'vision_model',
  };
}

function buildFallbackReply(sceneState?: Record<string, unknown>): VoiceAssistantReply {
  const cubePosition = sceneState?.cubePosition as
    | { x?: number; y?: number; z?: number }
    | null
    | undefined;
  const trayPosition = sceneState?.trayPosition as
    | { x?: number; y?: number; z?: number }
    | null
    | undefined;
  const cubes = sceneState?.cubes as
    | {
        red?: { x?: number; y?: number; z?: number } | null;
        green?: { x?: number; y?: number; z?: number } | null;
        blue?: { x?: number; y?: number; z?: number } | null;
      }
    | null
    | undefined;

  const parts = ['我现在看到一台 Franka Panda 机械臂'];
  if (cubes?.red || cubes?.green || cubes?.blue) {
    const visibleCubes = [
      cubes?.red ? '红色木块' : null,
      cubes?.green ? '绿色木块' : null,
      cubes?.blue ? '蓝色木块' : null,
    ].filter(Boolean);
    if (visibleCubes.length > 0) {
      parts.push(`当前可见的木块有${visibleCubes.join('、')}`);
    }
  }
  if (cubePosition) {
    parts.push(
      `一个红色木块，位置大约在 x=${Number(cubePosition.x ?? 0).toFixed(2)}、y=${Number(cubePosition.y ?? 0).toFixed(2)}`
    );
  }
  if (trayPosition) {
    parts.push(
      `以及一个收纳栏，位置大约在 x=${Number(trayPosition.x ?? 0).toFixed(2)}、y=${Number(trayPosition.y ?? 0).toFixed(2)}`
    );
  }

  return {
    reply: `${parts.join('，')}。`,
    source: 'fallback',
  };
}

export async function createVisionDescription(
  request: VisionDescriptionRequest,
  fetchImpl: typeof fetch = fetch
): Promise<VoiceAssistantReply> {
  const cubePosition = request.sceneState?.cubePosition as
    | { x?: number; y?: number; z?: number }
    | null
    | undefined;
  const trayPosition = request.sceneState?.trayPosition as
    | { x?: number; y?: number; z?: number }
    | null
    | undefined;
  const cubes = request.sceneState?.cubes as
    | {
        red?: { x?: number; y?: number; z?: number } | null;
        green?: { x?: number; y?: number; z?: number } | null;
        blue?: { x?: number; y?: number; z?: number } | null;
      }
    | null
    | undefined;
  const requestedColor = detectColor(request.command);
  const selectedCubePosition =
    requestedColor === 'green'
      ? cubes?.green ?? cubePosition
      : requestedColor === 'blue'
        ? cubes?.blue ?? cubePosition
        : cubes?.red ?? cubePosition;
  const fallbackLocationReply = buildCubeLocationReply(
    request.command,
    selectedCubePosition,
    trayPosition
  );

  try {
    const payload = await requestStructuredJson(
      [
        {
          role: 'system',
          content:
            'You are the visual narration layer for a MuJoCo Franka Panda robotics demo. Return only JSON with a single field reply. Answer in concise Chinese. If the user asks where a red, green, or blue block is, answer with its approximate screen-relative or scene-relative location, and mention its relation to the tray when possible. Otherwise, describe what is currently visible in the screenshot and mention the robot arm, the red/green/blue blocks, and the tray when visible. If uncertain, say what you can still identify.',
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

    return normalizeReply(payload as RawVisionDescriptionReply);
  } catch {
    return fallbackLocationReply ?? buildFallbackReply(request.sceneState);
  }
}
