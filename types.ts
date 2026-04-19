/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


/**
 * DetectType defines the detection modes available in the application.
 */
export type DetectType = '2D bounding boxes' | 'Segmentation masks' | 'Points';

/**
 * LogEntry represents a record of a vision model interaction.
 */
export interface LogEntry {
  id: string;
  timestamp: Date;
  imageSrc: string;
  prompt: string;
  fullPrompt: string;
  type: string;
  result: unknown; 
  requestData: unknown; 
}

/**
 * Interface for the result item from detection.
 */
export interface DetectedItem {
  box_2d?: number[];
  point?: number[];
  label?: string;
  mask?: string;
  [key: string]: unknown;
}

/**
 * Minimal interface for MuJoCo Model to avoid 'any'.
 */
export interface MujocoModel {
  nbody: number;
  nv: number;
  ngeom: number;
  nsite: number;
  nu: number;
  njnt: number;
  name_siteadr: Int32Array;
  name_actuatoradr: Int32Array;
  name_bodyadr: Int32Array;
  names: Int8Array;
  jnt_qposadr: Int32Array;
  actuator_trnid: Int32Array;
  geom_group: Int32Array;
  geom_type: Int32Array;
  geom_size: Float64Array; 
  geom_pos: Float64Array;
  geom_quat: Float64Array;
  geom_matid: Int32Array;
  mat_rgba: Float32Array;
  geom_rgba: Float32Array;
  geom_dataid: Int32Array;
  mesh_vertadr: Int32Array;
  mesh_vertnum: Int32Array;
  mesh_faceadr: Int32Array;
  mesh_facenum: Int32Array;
  mesh_vert: Float32Array;
  mesh_face: Int32Array;
  geom_bodyid: Int32Array;
  delete: () => void;
  [key: string]: unknown;
}

/**
 * Minimal interface for MuJoCo Data to avoid 'any'.
 */
export interface MujocoData {
  time: number;
  qpos: Float64Array;
  qvel: Float64Array;
  ctrl: Float64Array;
  xfrc_applied: Float64Array;
  xpos: Float64Array;
  xquat: Float64Array;
  ncon: number;
  contact: unknown;
  site_xpos: Float64Array;
  site_xmat: Float64Array;
  delete: () => void;
  [key: string]: unknown;
}

/**
 * ControlAlgorithm represents a designed control law.
 */
export interface ControlAlgorithm {
  id: string;
  name: string;
  description: string;
  code: string; // The JavaScript/TypeScript code for the control law
  parameters: Record<string, number>;
  controllerBlueprint?: ControllerBlueprint;
  performanceProfile?: PerformanceProfile;
  diagnostics?: string[];
  performanceMetrics: {
    settlingTime?: number;
    overshoot?: number;
    steadyStateError?: number;
    energyConsumption?: number;
  };
}

/**
 * OptimizationLog represents a single step in the parameter optimization process.
 */
export interface OptimizationLog {
  iteration: number;
  parameters: Record<string, number>;
  score: number;
  metrics: ControlAlgorithm['performanceMetrics'];
}

export interface OptimizationBudget {
  maxTrials: number;
  batchSize: number;
  maxWallClockMs: number;
}

/**
 * TaskScenario defines the context for algorithm design.
 */
export interface TaskScenario {
  description: string;
  requirements: {
    speed: number; // response speed, 0-1
    accuracy: number; // tracking precision, 0-1
    stability: number; // motion smoothness/stability, 0-1
    efficiency: number; // energy efficiency, 0-1
  };
}

/**
 * SystemLog represents a generic system event or error.
 */
export interface SystemLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  source: string;
  message: string;
  data?: any;
}

export type ControllerTemplateId =
  | 'joint_pd'
  | 'stagewise_pd'
  | 'joint_impedance'
  | 'hybrid_tracking';

export type ControllerMode = 'single' | 'stagewise';

export type FailureType =
  | 'PlanningFailure'
  | 'BlueprintValidationFailure'
  | 'IKFailure'
  | 'ExecutionFailure'
  | 'TaskFailure'
  | 'SafetyFailure'
  | 'OptimizationFailure';

export interface TaskScenarioV2 {
  taskId: string;
  description: string;
  objectName: string;
  sourcePose: {
    position: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number; w: number };
  };
  targetPose: {
    position: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number; w: number };
  };
  constraints: Record<string, unknown>;
  preferences: Record<string, unknown>;
}

export interface PerformanceProfile {
  speedWeight: number;
  accuracyWeight: number;
  energyWeight: number;
  stabilityWeight: number;
  safetyWeight: number;
  targetThresholds: Record<string, number>;
  analysisRationale: string;
}

export interface ParameterBounds {
  [key: string]: {
    min: number;
    max: number;
  };
}

export interface StageControllerConfig {
  stage?: string;
  parameters?: Record<string, number>;
}

export interface ControllerBlueprint {
  templateId: ControllerTemplateId;
  controllerMode: ControllerMode;
  stageConfigs: StageControllerConfig[];
  optimizableParameters?: string[];
  initialParameters: Record<string, number>;
  parameterBounds: ParameterBounds;
  selectionRationale: string;
}

export interface ControllerDecisionRequest {
  description: string;
  requirements?: TaskScenario['requirements'];
}

export interface ControllerDecisionResponse {
  templateId: ControllerTemplateId;
  optimizableParameters: string[];
  initialParameters: Record<string, number>;
  parameterBounds: ParameterBounds;
  selectionRationale: string;
}

export interface DesignedAlgorithmStage {
  id: string;
  name: string;
  controllerType: ControllerTemplateId;
  objectives: string[];
  transitionCondition: string;
  parameters: Record<string, number>;
}

export interface DesignedAlgorithmReport {
  algorithmId: string;
  algorithmName: string;
  templateId: ControllerTemplateId;
  summary: string;
  structure: {
    mode: ControllerMode;
    stages: DesignedAlgorithmStage[];
  };
  initialParameters: Record<string, number>;
  optimizableParameters: string[];
  parameterBounds: ParameterBounds;
  designRationale: string;
  expectedTradeoffs: {
    speed: number;
    accuracy: number;
    stability: number;
    efficiency: number;
  };
  sourceScenario: TaskScenario;
  createdAt: number;
}

export interface OptimizationTrialSummary {
  trialId: string;
  iteration: number;
  parameters: Record<string, number>;
  score: number;
  metrics: ControlAlgorithm['performanceMetrics'];
  status: 'success' | 'failed';
  failureReason?: string;
}

export interface OptimizationReport {
  algorithmId: string;
  algorithmName: string;
  baselineParameters: Record<string, number>;
  optimizedParameters: Record<string, number>;
  bestScore: number;
  totalTrials: number;
  completedTrials: number;
  totalDurationMs: number;
  convergenceHistory: Array<{
    trial: number;
    bestScore: number;
    latestScore: number;
  }>;
  bestTrial: OptimizationTrialSummary | null;
  trialSummaries: OptimizationTrialSummary[];
  budget: OptimizationBudget;
  finishedReason: 'budget_exhausted' | 'wall_clock_exhausted' | 'stopped' | 'error';
}

export interface EvaluationMetricStats {
  mean: number;
  min: number;
  max: number;
}

export interface EvaluationSummaryMetrics {
  settlingTime: EvaluationMetricStats;
  steadyStateError: EvaluationMetricStats;
  energyConsumption: EvaluationMetricStats;
  overshoot: EvaluationMetricStats;
}

export interface ActionVisualizationStage {
  name: string;
  duration: number;
  objectives: string[];
}

export interface AlgorithmEvaluationReport {
  algorithmId: string;
  algorithmName: string;
  sampleCount: number;
  baselineMetrics: EvaluationSummaryMetrics;
  optimizedMetrics: EvaluationSummaryMetrics;
  improvements: Record<string, number>;
  baselineParameters: Record<string, number>;
  optimizedParameters: Record<string, number>;
  actionTimeline: ActionVisualizationStage[];
  generatedAt: number;
}

export interface ExecutionPlanStage {
  name: string;
  duration?: number;
  gripperCommand?: number;
  targetPose?: TaskScenarioV2['targetPose'];
  targetQpos?: number[] | Float64Array;
}

export interface ExecutionPlan {
  stages: ExecutionPlanStage[];
  transitionRules?: Record<string, unknown>;
}

export interface EvaluationReport {
  trialId: string;
  success: boolean;
  score: number;
  metrics: Record<string, number | boolean>;
  stageReports?: Array<Record<string, unknown>>;
  failureType?: FailureType;
  failureSummary?: string;
  optimizationHints?: Array<Record<string, unknown>>;
}

export interface OptimizationSession {
  sessionId: string;
  scenario: TaskScenarioV2;
  performanceProfile: PerformanceProfile;
  controllerBlueprint: ControllerBlueprint;
  trials: EvaluationReport[];
  bestTrial?: EvaluationReport;
  status: 'idle' | 'running' | 'completed' | 'failed';
}

export interface AutonomyLog extends SystemLog {
  eventType: string;
  sessionId?: string;
  trialId?: string;
  stage?: string;
}

export interface HeadlessMonitoringConfig {
  sampleRate: number;
}

export interface TrialRequest {
  trialId: string;
  scenario: TaskScenarioV2;
  controllerBlueprint: ControllerBlueprint;
  parameters: Record<string, number>;
  executionPlan: ExecutionPlan;
  monitoringConfig: HeadlessMonitoringConfig;
}

export interface TrialResult {
  trialId: string;
  success: boolean;
  metrics: Record<string, number | boolean>;
  score: number;
  failureType?: FailureType;
  failureSummary?: string;
  durationMs: number;
}

export interface WorkerInitMessage {
  type: 'worker.init';
}

export interface WorkerReadyMessage {
  type: 'worker.ready';
}

export interface TrialRunMessage {
  type: 'trial.run';
  payload: TrialRequest;
}

export interface TrialResultMessage {
  type: 'trial.result';
  payload: TrialResult;
}

export interface TrialErrorMessage {
  type: 'trial.error';
  payload: {
    trialId: string;
    error: string;
  };
}

export type HeadlessWorkerIncomingMessage = WorkerInitMessage | TrialRunMessage;
export type HeadlessWorkerOutgoingMessage =
  | WorkerReadyMessage
  | TrialResultMessage
  | TrialErrorMessage;

/**
 * Minimal interface for the MuJoCo WASM Module.
 */
export interface MujocoModule {
  MjModel: { loadFromXML: (path: string) => MujocoModel; [key: string]: unknown };
  MjData: new (model: MujocoModel) => MujocoData;
  MjvOption: new () => { delete: () => void; [key: string]: unknown };
  mj_forward: (m: MujocoModel, d: MujocoData) => void;
  mj_step: (m: MujocoModel, d: MujocoData) => void;
  mj_resetData: (m: MujocoModel, d: MujocoData) => void;
  mjtGeom: Record<string, number | {value: number}>;
  FS: {
      writeFile: (path: string, content: string | Uint8Array) => void;
      mkdir: (path: string) => void;
      mount: (type: unknown, opts: Record<string, unknown>, mountpoint: string) => void;
      unmount: (path: string) => void;
  };
  MEMFS?: unknown;
  [key: string]: unknown;
}
