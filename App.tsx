/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertCircle, ArrowRight, Bot, Boxes, Cpu, Gauge, Loader2, Mic, Moon, Orbit, Pause, Play, RotateCcw, Sun, Zap } from 'lucide-react';
import loadMujoco from 'mujoco-js';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MujocoSim } from './MujocoSim';
import { ControlAlgorithm, MujocoModule, TaskScenarioV2 } from './types';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

type RobotPreset = {
  id: string;
  name: string;
  subtitle: string;
  sceneFile: string;
  category: string;
  source: string;
  description: string;
  rewardFocus: string[];
  highlights: string[];
};

type RuntimeSummary = {
  bodies: number;
  geoms: number;
  actuators: number;
  sites: number;
};

type VoiceCommandInterpretation = {
  intent: 'pick_place' | 'unknown';
  objectColor: 'red' | 'green' | 'blue' | 'unknown';
  targetContainer: 'tray' | 'table_outside' | 'unknown';
  targetRegion: 'center' | 'left' | 'right' | 'unknown';
  confidence: number;
  reasoning: string;
  source?: 'vision_model' | 'text_model' | 'fallback';
  clarificationQuestion?: string;
};

type VoiceAssistantReply = {
  reply: string;
  source?: 'vision_model' | 'text_model' | 'fallback';
};

type VoiceTaskPlan = {
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
};

const ROBOT_LIBRARY: RobotPreset[] = [
  {
    id: 'franka_emika_panda',
    name: 'Franka Panda',
    subtitle: '7-DoF manipulation',
    sceneFile: 'scene.xml',
    category: '机械臂',
    source: '本地资源 + MuJoCo Menagerie 回退',
    description: '适合抓取、到位控制和策略学习，当前仓库也为它提供了本地资产缓存。',
    rewardFocus: ['末端位姿误差', '抓取成功率', '能耗惩罚'],
    highlights: ['本地加载最快', '支持交互拖拽', '适合 RL pick-and-place'],
  },
  {
    id: 'universal_robots_ur5e',
    name: 'UR5e',
    subtitle: 'Industrial arm',
    sceneFile: 'scene.xml',
    category: '工业机械臂',
    source: 'MuJoCo Menagerie',
    description: '常见工业臂模型，适合验证轨迹跟踪、避障和鲁棒控制策略。',
    rewardFocus: ['轨迹平滑度', '关节速度惩罚', '目标跟踪误差'],
    highlights: ['经典六轴臂', '场景资源完整', '适合控制器对比'],
  },
  {
    id: 'kinova_gen3',
    name: 'Kinova Gen3',
    subtitle: 'Lightweight arm',
    sceneFile: 'scene.xml',
    category: '协作机械臂',
    source: 'MuJoCo Menagerie',
    description: '轻量协作臂，适用于研究精细操作、接触控制和安全约束。',
    rewardFocus: ['接触稳定性', '跟踪精度', '控制输入平滑度'],
    highlights: ['灵巧操作友好', '协作臂设定', '便于做 sim-to-real 预研'],
  },
  {
    id: 'unitree_go2',
    name: 'Unitree Go2',
    subtitle: 'Quadruped locomotion',
    sceneFile: 'scene.xml',
    category: '足式机器人',
    source: 'MuJoCo Menagerie',
    description: '四足机器人适合做步态生成、稳定性学习和地形适应类强化学习。',
    rewardFocus: ['躯干稳定度', '前进速度', '足端接触约束'],
    highlights: ['多自由度机体', '适合 locomotion RL', '动态反馈更明显'],
  },
  {
    id: 'google_robot',
    name: 'Google Robot',
    subtitle: 'Mobile manipulation',
    sceneFile: 'scene.xml',
    category: '移动操作',
    source: 'MuJoCo Menagerie',
    description: '移动底盘 + 机械臂组合，可以用来探索导航、抓取和长时序任务。',
    rewardFocus: ['任务完成率', '路径效率', '复合动作协同'],
    highlights: ['移动操作一体化', '任务空间更复杂', '适合层级策略'],
  },
];

const DEFAULT_ROBOT_ID = 'franka_emika_panda';
const DEFAULT_SPEED = 1;
const VOICE_PICK_PLACE_ALGORITHM: ControlAlgorithm = {
  id: 'voice_joint_pd',
  name: 'Voice Joint PD',
  description: 'Lightweight built-in controller for voice-driven pick and place.',
  code: `
    if (!params.targetQpos || !data.qpos || !data.qvel) return;
    const blend = Math.max(0.05, Math.min(1, params.blend ?? 0.35));
    const damping = Math.max(0, Math.min(0.5, params.damping ?? 0.08));
    for (let i = 0; i < 7; i++) {
      const error = params.targetQpos[i] - data.qpos[i];
      const desired = data.qpos[i] + error * blend - data.qvel[i] * damping;
      data.ctrl[i] = desired;
    }
  `,
  parameters: {
    blend: 0.34,
    damping: 0.08,
  },
  performanceMetrics: {},
};

function formatSpeedLabel(speed: number) {
  return `${speed.toFixed(1)}x`;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function normalizeCommandText(text: string) {
  return text.replace(/\s+/g, '').toLowerCase();
}

function detectColorFromCommand(text: string): VoiceCommandInterpretation['objectColor'] {
  const normalized = normalizeCommandText(text);
  if (/(绿色|绿块|绿色块|绿色方块|绿积木|green)/.test(normalized)) return 'green';
  if (/(蓝色|蓝块|蓝色块|蓝色方块|蓝积木|blue)/.test(normalized)) return 'blue';
  if (/(红色|红块|红色块|红色方块|红积木|red)/.test(normalized)) return 'red';
  return 'unknown';
}

function getCubeBodyNameByColor(color: VoiceCommandInterpretation['objectColor']) {
  if (color === 'green') return 'cube_green';
  if (color === 'blue') return 'cube_blue';
  return 'cube';
}

function isSceneDescriptionRequest(text: string) {
  const normalized = normalizeCommandText(text);
  return /(你看到了什么|看到了什么|现在看到了什么|画面里有什么|场景里有什么|现在有什么|你看见了什么|看见了什么|红色木块在哪里|红色块在哪里|木块在哪里|积木在哪里|方块在哪里|红色木块在哪|红色块在哪|木块在哪|积木在哪|方块在哪|位置在哪|在哪里|在哪儿|在左边还是右边|whatdoyousee|whatcanyousee|whereisthe(red)?(cube|block))/i.test(
    normalized
  );
}

function taskPlanToInterpretation(plan: VoiceTaskPlan): VoiceCommandInterpretation {
  return {
    intent: plan.action === 'pick_place' ? 'pick_place' : 'unknown',
    objectColor: plan.objectColor,
    targetContainer: plan.targetContainer,
    targetRegion: plan.targetRegion,
    confidence: plan.confidence,
    reasoning: plan.summary,
    source: plan.source,
    clarificationQuestion: plan.clarificationQuestion,
  };
}

function buildFallbackVoiceInterpretation(text: string): VoiceCommandInterpretation {
  const normalized = normalizeCommandText(text);
  const mentionsMove = /(放|拿|抓|移动|pick|place|put)/.test(normalized);
  const mentionsObject = /(红色|绿色|蓝色|红块|绿块|蓝块|红色块|绿色块|蓝色块|红色方块|绿色方块|蓝色方块|红色积木|绿色积木|蓝色积木|方块|块|木块|积木|cube|block)/.test(normalized);
  const mentionsTray = /(收纳栏|收纳盒|托盘|tray|bin|篮)/.test(normalized);
  const mentionsTakeOut = /(拿出来|取出来|拿出|取出|移出来|moveout|takeout|remove)/.test(normalized);
  const mentionsLeft = /(左边|左侧|left)/.test(normalized);
  const mentionsRight = /(右边|右侧|right)/.test(normalized);
  const objectColor = detectColorFromCommand(normalized);

  if ((mentionsTakeOut || (/拿/.test(normalized) && !mentionsTray)) && mentionsObject) {
    return {
      intent: 'pick_place',
      objectColor,
      targetContainer: 'table_outside',
      targetRegion: mentionsLeft ? 'left' : mentionsRight ? 'right' : 'center',
      confidence: 0.64,
      reasoning: 'Fallback parser interpreted the command as taking the block out to an outside placement zone.',
    };
  }

  if (mentionsMove && mentionsObject && mentionsTray) {
    return {
      intent: 'pick_place',
      objectColor,
      targetContainer: 'tray',
      targetRegion: mentionsLeft ? 'left' : mentionsRight ? 'right' : 'center',
      confidence: 0.62,
      reasoning: 'Fallback parser matched movement, object, and tray keywords.',
    };
  }

  return {
    intent: 'unknown',
    objectColor: 'unknown',
    targetContainer: 'unknown',
    targetRegion: 'unknown',
    confidence: 0.2,
    reasoning: 'Fallback parser could not confidently interpret the command.',
    clarificationQuestion: '请再说一次，比如“把红色块放到收纳栏的中间”。',
  };
}

async function interpretVoiceCommand(text: string): Promise<VoiceCommandInterpretation> {
  try {
    const response = await fetch('/api/voice/interpret', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command: text }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as VoiceCommandInterpretation;
  } catch {
    return buildFallbackVoiceInterpretation(text);
  }
}

async function requestVoiceAssistantReply(
  command: string,
  interpretation: VoiceCommandInterpretation
): Promise<VoiceAssistantReply | null> {
  try {
    const response = await fetch('/api/voice/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command, interpretation }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as VoiceAssistantReply;
  } catch {
    return null;
  }
}

async function requestVisionDescription(
  command: string,
  imageDataUrl: string,
  sceneState: Record<string, unknown>
): Promise<VoiceAssistantReply | null> {
  try {
    const response = await fetch('/api/vision/describe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command, imageDataUrl, sceneState }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as VoiceAssistantReply;
  } catch {
    return null;
  }
}

async function requestVoiceTaskPlan(
  command: string,
  imageDataUrl: string,
  sceneState: Record<string, unknown>
): Promise<VoiceTaskPlan | null> {
  try {
    const response = await fetch('/api/voice/task-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command, imageDataUrl, sceneState }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as VoiceTaskPlan;
  } catch {
    return null;
  }
}

async function requestVisionPlan(
  command: string,
  imageDataUrl: string,
  sceneState: Record<string, unknown>
): Promise<VoiceCommandInterpretation | null> {
  try {
    const response = await fetch('/api/vision/plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command, imageDataUrl, sceneState }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as VoiceCommandInterpretation;
  } catch {
    return null;
  }
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<MujocoSim | null>(null);
  const isMounted = useRef(true);
  const mujocoModuleRef = useRef<MujocoModule | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef('');
  const shouldProcessTranscriptRef = useRef(false);

  const [selectedRobotId, setSelectedRobotId] = useState(DEFAULT_ROBOT_ID);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('正在初始化 MuJoCo WASM 引擎...');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mujocoReady, setMujocoReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(DEFAULT_SPEED);
  const [runtimeSummary, setRuntimeSummary] = useState<RuntimeSummary | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'processing' | 'executing'>('idle');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [voicePlanSource, setVoicePlanSource] = useState<'vision_model' | 'text_model' | 'fallback' | null>(null);

  const selectedRobot = useMemo(
    () => ROBOT_LIBRARY.find((robot) => robot.id === selectedRobotId) ?? ROBOT_LIBRARY[0],
    [selectedRobotId]
  );

  useEffect(() => {
    isMounted.current = true;

    loadMujoco({
      locateFile: (path: string) =>
        path.endsWith('.wasm')
          ? 'https://unpkg.com/mujoco-js@0.0.7/dist/mujoco_wasm.wasm'
          : path,
      printErr: (text: string) => {
        if (text.includes('Aborted') && isMounted.current) {
          setLoadError((prev) => prev ?? 'MuJoCo 运行时中断，请刷新页面后重试。');
        }
      },
    })
      .then((instance: unknown) => {
        if (!isMounted.current) return;
        mujocoModuleRef.current = instance as MujocoModule;
        setMujocoReady(true);
      })
      .catch((error: Error) => {
        if (!isMounted.current) return;
        setLoadError(error.message || 'MuJoCo 引擎初始化失败');
        setIsLoading(false);
      });

    return () => {
      isMounted.current = false;
      recognitionRef.current?.abort();
      simRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!mujocoReady || !containerRef.current || !mujocoModuleRef.current) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setIsPaused(false);
    setRuntimeSummary(null);
    setLoadingStatus(`正在载入 ${selectedRobot.name} 模型...`);

    simRef.current?.dispose();
    simRef.current = null;

    const nextSim = new MujocoSim(containerRef.current, mujocoModuleRef.current);
    nextSim.renderSys.setDarkMode(isDarkMode);
    nextSim.setSpeedMultiplier(speedMultiplier);

    simRef.current = nextSim;

    nextSim
      .init(selectedRobot.id, selectedRobot.sceneFile, (message) => {
        if (!cancelled && isMounted.current) {
          setLoadingStatus(message);
        }
      })
      .then(() => {
        if (cancelled || !isMounted.current) return;
        const model = nextSim.mjModel;
        setRuntimeSummary(
          model
            ? {
                bodies: model.nbody,
                geoms: model.ngeom,
                actuators: model.nu,
                sites: model.nsite,
              }
            : null
        );
        nextSim.setIkEnabled(false);
        setShowStatus(false);
        setIsLoading(false);
      })
      .catch((error: Error) => {
        if (cancelled || !isMounted.current) return;
        setLoadError(error.message || `加载 ${selectedRobot.name} 失败`);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mujocoReady, selectedRobot]);

  useEffect(() => {
    simRef.current?.setSpeedMultiplier(speedMultiplier);
  }, [speedMultiplier]);

  useEffect(() => {
    simRef.current?.renderSys.setDarkMode(isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const togglePause = () => {
    if (!simRef.current) return;
    const paused = simRef.current.togglePause();
    setIsPaused(paused);
  };

  const handleReset = () => {
    simRef.current?.reset();
    setIsPaused(false);
  };

  const handleThemeToggle = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    simRef.current?.renderSys.setDarkMode(next);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.error('Failed to toggle fullscreen mode', error);
    }
  };

  const runVoiceCommand = async (spokenText: string) => {
    const sim = simRef.current;
    const trimmed = spokenText.trim();

    if (!sim || !trimmed) {
      setVoiceStatus('idle');
      return;
    }

    if (selectedRobot.id !== 'franka_emika_panda') {
      setVoiceMessage('当前语音执行先支持 Franka Panda 抓取场景。');
      setVoiceStatus('idle');
      return;
    }

    const sceneCubes = {
      red: sim.getBodyPosition('cube'),
      green: sim.getBodyPosition('cube_green'),
      blue: sim.getBodyPosition('cube_blue'),
    };
    const trayPos = sim.getBodyPosition('tray');
    const sceneState: Record<string, unknown> = {
      robotId: selectedRobot.id,
      runtimeState: runtimeStateLabel,
      cubePosition: sceneCubes.red ? { x: sceneCubes.red.x, y: sceneCubes.red.y, z: sceneCubes.red.z } : null,
      cubes: {
        red: sceneCubes.red ? { x: sceneCubes.red.x, y: sceneCubes.red.y, z: sceneCubes.red.z } : null,
        green: sceneCubes.green ? { x: sceneCubes.green.x, y: sceneCubes.green.y, z: sceneCubes.green.z } : null,
        blue: sceneCubes.blue ? { x: sceneCubes.blue.x, y: sceneCubes.blue.y, z: sceneCubes.blue.z } : null,
      },
      trayPosition: trayPos ? { x: trayPos.x, y: trayPos.y, z: trayPos.z } : null,
    };
    const snapshot = sim.renderSys.getCanvasSnapshot(768, 768, 'image/jpeg');

    const taskPlan =
      (await requestVoiceTaskPlan(trimmed, snapshot, sceneState)) ??
      (isSceneDescriptionRequest(trimmed)
        ? {
            action: 'describe_scene',
            summary: '用户在询问当前画面内容。',
            confidence: 0.5,
            objectColor: 'unknown',
            targetObject: 'unknown',
            targetContainer: 'unknown',
            targetRegion: 'unknown',
            source: 'fallback',
            steps: [{ skill: 'observe_scene' }],
          }
        : null);

    if (taskPlan?.action === 'describe_scene' || taskPlan?.action === 'locate_object') {
      const visionReply = await requestVisionDescription(trimmed, snapshot, sceneState);
      setVoicePlanSource(visionReply?.source ?? taskPlan.source ?? 'fallback');
      setVoiceStatus('idle');
      setVoiceMessage(
        visionReply?.reply ?? '我现在看到机械臂、红色木块和收纳栏，但这次视觉描述没有成功返回。'
      );
      return;
    }

    const interpretation =
      taskPlan?.action === 'pick_place'
        ? taskPlanToInterpretation(taskPlan)
        : (await requestVisionPlan(trimmed, snapshot, sceneState)) ??
          (await interpretVoiceCommand(trimmed));
    const spokenColor = detectColorFromCommand(trimmed);
    const effectiveObjectColor =
      interpretation.objectColor !== 'unknown' ? interpretation.objectColor : spokenColor;
    const effectiveInterpretation: VoiceCommandInterpretation = {
      ...interpretation,
      objectColor: effectiveObjectColor,
    };
    setVoicePlanSource(taskPlan?.source ?? effectiveInterpretation.source ?? null);

    const targetCubeName = getCubeBodyNameByColor(effectiveInterpretation.objectColor);
    const cubePos = sim.getBodyPosition(targetCubeName);

    if (taskPlan?.action === 'clarify') {
      setVoiceMessage(
        taskPlan.clarificationQuestion ??
          taskPlan.summary ??
          '我还需要你换一种更明确的说法。'
      );
      setVoiceStatus('idle');
      return;
    }

    if (effectiveInterpretation.intent !== 'pick_place') {
      const assistantReply = await requestVoiceAssistantReply(trimmed, effectiveInterpretation);
      setVoiceMessage(
        assistantReply?.reply ??
        effectiveInterpretation.clarificationQuestion ??
          '我还没完全听懂这句指令，请换一种更明确的说法。'
      );
      setVoiceStatus('idle');
      return;
    }

    if (!cubePos || !trayPos) {
      setVoiceMessage('当前场景里没有找到可抓取方块或收纳栏。');
      setVoiceStatus('idle');
      return;
    }

    const targetOffsetX =
      interpretation.targetRegion === 'left'
        ? -0.05
        : interpretation.targetRegion === 'right'
          ? 0.05
          : 0;
    const targetPosition =
      interpretation.targetContainer === 'table_outside'
        ? {
            x: trayPos.x + 0.22 + targetOffsetX,
            y: trayPos.y - 0.24,
            z: Math.max(0.0, trayPos.z),
          }
        : {
            x: trayPos.x + targetOffsetX,
            y: trayPos.y,
            z: trayPos.z,
          };

    const scenario: TaskScenarioV2 = {
      taskId: `voice_${Date.now()}`,
      description: trimmed,
      objectName: targetCubeName,
      sourcePose: {
        position: { x: cubePos.x, y: cubePos.y, z: cubePos.z },
      },
      targetPose: {
        position: targetPosition,
      },
      constraints: {
        spokenCommand: trimmed,
        trayTarget: effectiveInterpretation.targetRegion,
        targetContainer: effectiveInterpretation.targetContainer,
        voiceReasoning: effectiveInterpretation.reasoning,
      },
      preferences: {},
    };

    try {
      const assistantReply = await requestVoiceAssistantReply(trimmed, effectiveInterpretation);
      setVoiceStatus('executing');
      setVoiceMessage(
        assistantReply?.reply ??
          `我理解为执行“${trimmed}”，现在开始动作。`
      );
      sim.setPaused(false);
      setIsPaused(false);
      if (effectiveInterpretation.targetContainer === 'tray') {
        await new Promise<void>((resolve) => {
          const targetBodyId = sim.getBodyId(targetCubeName);
          const started = targetBodyId !== -1
            ? sim.pickupBodyIds([targetBodyId], () => {
                resolve();
              })
            : sim.pickupItems([cubePos.clone()], [0], () => {
                resolve();
              });
          if (!started) {
            throw new Error('抓取序列没有成功启动，请确认当前场景里存在收纳栏、木块和可用的机械臂末端位姿。');
          }
        });
      } else {
        await sim.executeAlgorithmPlan(VOICE_PICK_PLACE_ALGORITHM, {
          scenario,
          preserveScene: true,
        });
      }
      setVoiceStatus('idle');
      setVoiceMessage(`已完成: ${trimmed}`);
    } catch (error) {
      console.error('Voice command execution failed', error);
      setVoiceStatus('idle');
      setVoiceMessage(error instanceof Error ? error.message : '语音指令执行失败');
    }
  };

  const startVoiceCapture = () => {
    if (voiceStatus === 'executing') {
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setVoiceMessage('当前浏览器不支持语音识别，请使用 Chrome 系浏览器。');
      return;
    }

    recognitionRef.current?.abort();
    transcriptRef.current = '';
    shouldProcessTranscriptRef.current = true;
    setVoiceTranscript('');
    setVoicePlanSource(null);
    setVoiceMessage('请按住说话，松开后执行。');
    setVoiceStatus('listening');

    const recognition = new RecognitionCtor();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let finalText = transcriptRef.current;
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const piece = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalText += piece;
        } else {
          interimText += piece;
        }
      }
      transcriptRef.current = finalText;
      setVoiceTranscript((finalText + interimText).trim());
    };
    recognition.onerror = (event) => {
      setVoiceStatus('idle');
      setVoiceMessage(`语音识别失败${event.error ? `: ${event.error}` : ''}`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      const spoken = (transcriptRef.current || voiceTranscript).trim();
      if (!shouldProcessTranscriptRef.current) {
        setVoiceStatus('idle');
        return;
      }
      shouldProcessTranscriptRef.current = false;
      if (!spoken) {
        setVoiceStatus('idle');
        setVoiceMessage('没有识别到语音内容。');
        return;
      }
      setVoiceStatus('processing');
      void runVoiceCommand(spoken);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopVoiceCapture = () => {
    if (voiceStatus !== 'listening') return;
    recognitionRef.current?.stop();
  };

  const runtimeStateLabel = loadError ? 'Error' : isLoading ? 'Loading' : isPaused ? 'Paused' : 'Running';

  return (
    <div
      className={`relative h-full w-full overflow-hidden font-sans transition-colors duration-500 ${
        isDarkMode ? 'bg-black text-slate-100' : 'bg-[#dbe4ea] text-slate-900'
      }`}
    >
      <div ref={containerRef} className="absolute inset-0 z-0" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(2,6,23,0.08),rgba(2,6,23,0.22))]" />

      <div className="pointer-events-none relative z-20 h-full">
        <motion.header
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="pointer-events-auto absolute left-4 right-4 top-4 md:left-6 md:right-6 md:top-6"
        >
          <div className="minimal-topbar">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-sky-200">
              <Zap className="h-3.5 w-3.5" />
              MuJoCo WASM RL Lab
            </div>
            <div className="minimal-links">
              <button className="link-button" onClick={() => setShowLibrary((value) => !value)}>模型库</button>
              <button className="link-button" onClick={() => setShowNotes((value) => !value)}>实验说明</button>
              <button className="link-button" onClick={() => setShowStatus((value) => !value)}>状态</button>
              <button
                className={`link-button ${voiceStatus === 'listening' ? 'voice-link-active' : ''}`}
                onPointerDown={startVoiceCapture}
                onPointerUp={stopVoiceCapture}
                onPointerCancel={stopVoiceCapture}
                onPointerLeave={stopVoiceCapture}
                disabled={isLoading || !!loadError || voiceStatus === 'executing'}
                title="按住说话，松开执行"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Mic className="h-3.5 w-3.5" />
                  按住说话
                </span>
              </button>
              <button className="link-button" onClick={toggleFullscreen}>{isFullscreen ? '退出全屏' : '全屏'}</button>
              <button className="link-button" onClick={togglePause} disabled={isLoading || !!loadError}>
                {isPaused ? '继续' : '暂停'}
              </button>
              <button className="link-button" onClick={handleReset} disabled={isLoading || !!loadError}>重置</button>
              <button className="link-button" onClick={handleThemeToggle}>{isDarkMode ? '浅色' : '深色'}</button>
            </div>
          </div>
        </motion.header>

        <AnimatePresence>
          {showLibrary && (
            <motion.aside
              initial={{ opacity: 0, x: -18, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -12, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className="pointer-events-auto absolute left-4 top-16 w-[300px] max-w-[calc(100vw-2rem)] md:left-6 md:top-20 md:w-[320px]"
            >
              <div className="popup-panel max-h-[min(70vh,720px)] overflow-hidden">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">模型库</p>
                    <h2 className="panel-title">Robot Library</h2>
                  </div>
                  <button className="panel-close" onClick={() => setShowLibrary(false)}>关闭</button>
                </div>

                <div className="mt-4 space-y-3 overflow-auto pr-1 side-scroll">
                  {ROBOT_LIBRARY.map((robot, index) => {
                    const isActive = robot.id === selectedRobot.id;
                    return (
                      <motion.button
                        key={robot.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.04 * index, duration: 0.24 }}
                        onClick={() => setSelectedRobotId(robot.id)}
                        className={`robot-card text-left ${isActive ? 'robot-card-active' : ''}`}
                        disabled={isLoading && isActive}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">{robot.name}</p>
                            <p className="mt-1 text-xs text-slate-400">{robot.subtitle}</p>
                          </div>
                          <ArrowRight className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? 'text-cyan-300' : 'text-slate-500'}`} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-slate-300">{robot.category}</span>
                          <span className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-slate-300">{robot.sceneFile}</span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showNotes && (
            <motion.aside
              initial={{ opacity: 0, x: 18, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 12, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className="pointer-events-auto absolute right-4 top-16 w-[300px] max-w-[calc(100vw-2rem)] md:right-6 md:top-20 md:w-[320px]"
            >
              <div className="popup-panel max-h-[min(70vh,720px)] overflow-hidden">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">实验说明</p>
                    <h2 className="panel-title">Experiment Notes</h2>
                  </div>
                  <button className="panel-close" onClick={() => setShowNotes(false)}>关闭</button>
                </div>

                <div className="mt-5 space-y-4 overflow-auto pr-1 side-scroll text-sm leading-6 text-slate-300">
                  <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">当前模型</p>
                    <p className="mt-2">{selectedRobot.description}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                    <div className="flex gap-3">
                      <Bot className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
                      <p>默认主屏幕只展示可交互的仿真背景，额外信息通过点击入口再展开。</p>
                    </div>
                    <div className="mt-3 flex gap-3">
                      <Cpu className="mt-1 h-4 w-4 shrink-0 text-orange-300" />
                      <p>模型切换、实验摘要和状态被收进轻量窗口，减少对中间视图的干扰。</p>
                    </div>
                    <div className="mt-3 flex gap-3">
                      <Gauge className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
                      <p>后续可以继续把 reward、episode、checkpoint 也做成这种按需弹出式窗口。</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showStatus && (
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className="pointer-events-auto absolute bottom-4 left-4 right-4 md:bottom-6 md:left-6 md:right-6"
            >
              <div className="popup-panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">状态</p>
                    <h2 className="panel-title">Runtime Status</h2>
                  </div>
                  <button className="panel-close" onClick={() => setShowStatus(false)}>关闭</button>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
                  <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">仿真速度</p>
                    <span className="mt-3 inline-flex rounded-full bg-cyan-400/10 px-3 py-1 text-sm font-medium text-cyan-200">
                      {formatSpeedLabel(speedMultiplier)}
                    </span>
                    <input
                      type="range"
                      min="0.25"
                      max="2.5"
                      step="0.25"
                      value={speedMultiplier}
                      onChange={(event) => setSpeedMultiplier(Number(event.target.value))}
                      className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-400"
                    />
                  </div>

                  <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">模型摘要</p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="mini-stat">
                        <span className="mini-stat-label">Bodies</span>
                        <strong>{runtimeSummary?.bodies ?? '--'}</strong>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-stat-label">Geoms</span>
                        <strong>{runtimeSummary?.geoms ?? '--'}</strong>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-stat-label">Actuators</span>
                        <strong>{runtimeSummary?.actuators ?? '--'}</strong>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-stat-label">Sites</span>
                        <strong>{runtimeSummary?.sites ?? '--'}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">任务标签</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedRobot.rewardFocus.map((item) => (
                        <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                          {item}
                        </span>
                      ))}
                      {selectedRobot.highlights.map((item) => (
                        <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(voiceStatus !== 'idle' || voiceTranscript || voiceMessage) && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none absolute left-1/2 top-16 w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 md:top-20"
            >
              <div className="voice-hud">
                <div className="voice-hud-status">
                  <span className={`voice-dot ${voiceStatus === 'listening' ? 'voice-dot-live' : ''}`} />
                  <span>
                    {voiceStatus === 'listening' && '正在监听，松开后执行'}
                    {voiceStatus === 'processing' && '正在理解你的语音意图'}
                    {voiceStatus === 'executing' && '机器人正在执行动作'}
                    {voiceStatus === 'idle' && '语音待命'}
                  </span>
                </div>
                {voiceTranscript && <p className="voice-hud-text">“{voiceTranscript}”</p>}
                {voiceMessage && <p className="voice-hud-message">{voiceMessage}</p>}
                {voicePlanSource && (
                  <p className="voice-hud-meta">
                    当前理解来源: {voicePlanSource === 'vision_model' ? '视觉模型' : voicePlanSource === 'text_model' ? '文本模型' : '本地兜底'}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#020617]/75 backdrop-blur-xl"
          >
            <div className="w-[min(420px,calc(100%-2rem))] rounded-[30px] border border-white/10 bg-slate-950/80 p-8 text-center shadow-2xl shadow-cyan-950/30">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10">
                <Loader2 className="h-9 w-9 animate-spin text-cyan-300" />
              </div>
              <h3 className="mt-6 text-2xl font-semibold text-white">载入动力学场景</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{loadingStatus}</p>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#fb923c)]"
                  initial={{ width: '20%' }}
                  animate={{ width: ['20%', '72%', '48%', '88%'] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {loadError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-[#11090b]/70 px-4 backdrop-blur-xl"
          >
            <div className="w-[min(560px,100%)] rounded-[32px] border border-red-400/20 bg-[#170d11]/95 p-8 shadow-2xl shadow-red-950/30">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3">
                  <AlertCircle className="h-7 w-7 text-red-300" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.25em] text-red-200">Runtime Error</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">模型初始化失败</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{loadError}</p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={() => window.location.reload()} className="rounded-full bg-red-500 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-400">
                  刷新页面
                </button>
                <button
                  onClick={() => {
                    setLoadError(null);
                    setSelectedRobotId(DEFAULT_ROBOT_ID);
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/10"
                >
                  切回默认模型
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
