import { requestStructuredJson } from './llmJsonClient.ts';

export interface VoiceTaskPlan {
  action: 'describe_scene' | 'locate_object' | 'pick_place' | 'clarify';
  summary: string;
  confidence: number;
  objectColor: 'red' | 'green' | 'blue' | 'unknown';
  targetObject: 'cube' | 'unknown';
  targetContainer: 'tray' | 'table_outside' | 'unknown';
  targetRegion: 'center' | 'left' | 'right' | 'unknown';
  source?: 'vision_model' | 'text_model' | 'fallback';
  clarificationQuestion?: string;
  steps: Array<{
    skill: 'observe_scene' | 'locate_object' | 'pick' | 'place' | 'clarify';
    target?: string;
    destination?: string;
  }>;
}

export interface VoiceTaskPlanningRequest {
  command: string;
  imageDataUrl?: string;
  sceneState?: Record<string, unknown>;
}

interface RawVoiceTaskPlan {
  action: string;
  summary: string;
  confidence: number;
  objectColor: string;
  targetObject: string;
  targetContainer: string;
  targetRegion: string;
  clarificationQuestion?: string;
  steps?: Array<{
    skill?: string;
    target?: string;
    destination?: string;
  }>;
}

function normalizeCommandText(text: string) {
  return text.replace(/\s+/g, '').toLowerCase();
}

function detectColor(text: string): VoiceTaskPlan['objectColor'] {
  if (/(绿色|绿块|绿色块|绿色方块|绿积木|green)/.test(text)) return 'green';
  if (/(蓝色|蓝块|蓝色块|蓝色方块|蓝积木|blue)/.test(text)) return 'blue';
  if (/(红色|红块|红色块|红色方块|红色积木|red)/.test(text)) return 'red';
  return 'unknown';
}

function normalizePlan(payload: RawVoiceTaskPlan, source: 'vision_model' | 'text_model'): VoiceTaskPlan {
  const action =
    payload.action === 'describe_scene' ||
    payload.action === 'locate_object' ||
    payload.action === 'pick_place'
      ? payload.action
      : 'clarify';

  return {
    action,
    summary:
      typeof payload.summary === 'string' && payload.summary.trim().length > 0
        ? payload.summary.trim()
        : '我还需要再确认你的意图。',
    confidence:
      typeof payload.confidence === 'number' && Number.isFinite(payload.confidence)
        ? Math.max(0, Math.min(1, payload.confidence))
        : 0,
    objectColor:
      payload.objectColor === 'red' || payload.objectColor === 'green' || payload.objectColor === 'blue'
        ? payload.objectColor
        : 'unknown',
    targetObject: payload.targetObject === 'cube' ? 'cube' : 'unknown',
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
    source,
    clarificationQuestion:
      typeof payload.clarificationQuestion === 'string' &&
      payload.clarificationQuestion.trim().length > 0
        ? payload.clarificationQuestion.trim()
        : undefined,
    steps: Array.isArray(payload.steps)
      ? payload.steps
          .map((step) => {
            const skill: VoiceTaskPlan['steps'][number]['skill'] =
              step.skill === 'observe_scene' ||
              step.skill === 'locate_object' ||
              step.skill === 'pick' ||
              step.skill === 'place'
                ? step.skill
                : 'clarify';

            return {
              skill,
              target: step.target,
              destination: step.destination,
            };
          })
          .slice(0, 6)
      : [],
  };
}

function buildFallbackTaskPlan(command: string): VoiceTaskPlan {
  const text = normalizeCommandText(command);
  const asksScene = /(你看到了什么|看到了什么|画面里有什么|场景里有什么|看见了什么|whatdoyousee|whatcanyousee)/.test(text);
  const asksLocation = /(在哪里|在哪|在哪儿|位置|左边还是右边)/.test(text);
  const objectColor = detectColor(text);
  const mentionsColoredBlock = /(红色|绿色|蓝色|红块|绿块|蓝块|红色块|绿色块|蓝色块|红色方块|绿色方块|蓝色方块|红色积木|绿色积木|蓝色积木|red|green|blue)/.test(text);
  const mentionsBlock = /(方块|块|木块|积木|cube|block)/.test(text);
  const mentionsTray = /(收纳栏|收纳盒|托盘|tray|bin|篮)/.test(text);
  const mentionsTakeOut = /(拿出来|取出来|拿出|取出|移出来|moveout|takeout|remove)/.test(text);
  const mentionsPick = /(放|拿|抓|移动|pick|place|put)/.test(text);
  const mentionsLeft = /(左边|左侧|left)/.test(text);
  const mentionsRight = /(右边|右侧|right)/.test(text);

  if (asksScene && !mentionsPick) {
    return {
      action: 'describe_scene',
      summary: '用户在询问当前仿真画面里有什么。',
      confidence: 0.84,
      objectColor,
      targetObject: mentionsBlock ? 'cube' : 'unknown',
      targetContainer: 'unknown',
      targetRegion: 'unknown',
      source: 'fallback',
      steps: [{ skill: 'observe_scene' }],
    };
  }

  if (asksLocation && (mentionsColoredBlock || mentionsBlock)) {
    return {
      action: 'locate_object',
      summary: '用户在询问某个木块的位置。',
      confidence: 0.86,
      objectColor,
      targetObject: 'cube',
      targetContainer: 'unknown',
      targetRegion: 'unknown',
      source: 'fallback',
      steps: [{ skill: 'locate_object', target: objectColor === 'unknown' ? 'cube' : `${objectColor}_cube` }],
    };
  }

  if ((mentionsTakeOut || (mentionsPick && !mentionsTray)) && (mentionsColoredBlock || mentionsBlock)) {
    return {
      action: 'pick_place',
      summary: '用户希望把木块从收纳区域取出来，放到外侧桌面。',
      confidence: 0.74,
      objectColor,
      targetObject: 'cube',
      targetContainer: 'table_outside',
      targetRegion: mentionsLeft ? 'left' : mentionsRight ? 'right' : 'center',
      source: 'fallback',
      steps: [
        { skill: 'pick', target: objectColor === 'unknown' ? 'cube' : `${objectColor}_cube` },
        { skill: 'place', destination: 'table_outside' },
      ],
    };
  }

  if (mentionsPick && (mentionsColoredBlock || mentionsBlock) && mentionsTray) {
    return {
      action: 'pick_place',
      summary: '用户希望抓取木块并放到收纳栏指定区域。',
      confidence: 0.76,
      objectColor,
      targetObject: 'cube',
      targetContainer: 'tray',
      targetRegion: mentionsLeft ? 'left' : mentionsRight ? 'right' : 'center',
      source: 'fallback',
      steps: [
        { skill: 'pick', target: objectColor === 'unknown' ? 'cube' : `${objectColor}_cube` },
        { skill: 'place', destination: mentionsLeft ? 'tray_left' : mentionsRight ? 'tray_right' : 'tray_center' },
      ],
    };
  }

  return {
    action: 'clarify',
    summary: '当前还无法把这句自然语言稳定映射到已有技能。',
    confidence: 0.2,
    objectColor: 'unknown',
    targetObject: 'unknown',
    targetContainer: 'unknown',
    targetRegion: 'unknown',
    source: 'fallback',
    clarificationQuestion: '你可以直接问我看到了什么、木块在哪里，或者让我把红色木块放到收纳栏里。',
    steps: [{ skill: 'clarify' }],
  };
}

export async function createVoiceTaskPlan(
  request: VoiceTaskPlanningRequest,
  fetchImpl: typeof fetch = fetch
): Promise<VoiceTaskPlan> {
  const hasImage = typeof request.imageDataUrl === 'string' && request.imageDataUrl.length > 0;

  try {
    const payload = await requestStructuredJson(
      [
        {
          role: 'system',
          content:
            'You are the task planner for a MuJoCo Franka Panda robotics demo. Return only JSON. First decide whether the user is asking to describe the scene, locate one of the red/green/blue blocks, perform a pick-and-place manipulation, or whether clarification is needed. action must be one of describe_scene, locate_object, pick_place, clarify. objectColor must be red, green, blue, or unknown. targetObject must be cube or unknown. targetContainer must be tray, table_outside, or unknown. targetRegion must be center, left, right, or unknown. Include a short summary and a concise skills list. If the user asks where a block is, use locate_object instead of pick_place.',
        },
        {
          role: 'user',
          content: hasImage
            ? [
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
                    url: request.imageDataUrl!,
                  },
                },
              ]
            : JSON.stringify({
                command: request.command,
                sceneState: request.sceneState ?? {},
              }),
        },
      ],
      fetchImpl
    );

    return normalizePlan(
      payload as RawVoiceTaskPlan,
      hasImage ? 'vision_model' : 'text_model'
    );
  } catch {
    return buildFallbackTaskPlan(request.command);
  }
}
