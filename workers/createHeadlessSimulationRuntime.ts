import loadMujoco from 'mujoco-js';
import { RobotLoader } from '../RobotLoader';
import { instantiateController } from '../domain/controllers/instantiateController';
import { solveFrankaIk } from '../domain/execution/solveFrankaIk';
import { resolveGripperActuatorId } from '../domain/execution/pandaModelCompatibility';
import type {
  MujocoData,
  MujocoModel,
  MujocoModule,
  TrialRequest,
} from '../types';
import type { HeadlessTrialRuntime } from '../domain/optimization/runHeadlessTrial';
import * as THREE from 'three';

interface MonitoringState {
  time: number[];
  error: number[];
  energy: number[];
}

class HeadlessSimulationRuntime implements HeadlessTrialRuntime {
  private readonly mujoco: MujocoModule;
  private readonly model: MujocoModel;
  private readonly data: MujocoData;
  private gripperActuatorId = -1;
  private monitoring: MonitoringState = { time: [], error: [], energy: [] };
  private targetQpos: Float64Array | null = null;

  constructor(mujoco: MujocoModule, model: MujocoModel, data: MujocoData, gripperActuatorId: number) {
    this.mujoco = mujoco;
    this.model = model;
    this.data = data;
    this.gripperActuatorId = gripperActuatorId;
  }

  async reset() {
    this.mujoco.mj_resetData(this.model, this.data);
    this.setInitialPose();
    this.mujoco.mj_forward(this.model, this.data);
  }

  async execute(request: TrialRequest) {
    const blueprint = {
      ...request.controllerBlueprint,
      initialParameters: {
        ...request.controllerBlueprint.initialParameters,
        ...request.parameters,
      },
    };
    const controller = instantiateController(blueprint);
    const controlFn = new Function('model', 'data', 'params', controller.code) as (
      model: MujocoModel,
      data: MujocoData,
      params: Record<string, unknown>
    ) => void;
    const plan = this.buildExecutionPlanTargets(request.executionPlan);
    const totalDuration = plan.stages.reduce((acc, stage) => acc + (stage.duration ?? 1), 0);

    let currentStage = 0;
    let stageStartTime = this.data.time;
    this.startMonitoring(plan.stages[0]?.targetQpos as Float64Array);

    const maxSteps = Math.max(1, Math.ceil(totalDuration / (1 / 60)) + 120);

    for (let step = 0; step < maxSteps; step++) {
      const elapsed = this.data.time - stageStartTime;
      if (elapsed > (plan.stages[currentStage].duration ?? 1) && currentStage < plan.stages.length - 1) {
        currentStage++;
        stageStartTime = this.data.time;
        this.startMonitoring(plan.stages[currentStage].targetQpos as Float64Array);
      }

      const params = {
        ...request.parameters,
        targetQpos: plan.stages[currentStage].targetQpos,
      };

      if (!(this.data as { qvel?: Float64Array }).qvel) {
        (this.data as { qvel: Float64Array }).qvel = new Float64Array(this.model.nv);
      }

      controlFn(this.model, this.data, params);
      if (this.gripperActuatorId !== -1) {
        this.data.ctrl[this.gripperActuatorId] = plan.stages[currentStage].gripperCommand ?? 0;
      }

      this.mujoco.mj_step(this.model, this.data);
      this.recordPerformance();

      if (this.data.time > totalDuration) {
        break;
      }
    }

    const metrics = this.stopMonitoring();
    return {
      success: (metrics.steadyStateError ?? 1) < 0.2,
      metrics: {
        totalTime: metrics.settlingTime ?? totalDuration,
        energyConsumption: metrics.energyConsumption ?? 0,
        finalPoseError: metrics.steadyStateError ?? 1,
        collisionCount: 0,
        overshootCount: metrics.overshoot ?? 0,
      },
    };
  }

  private setInitialPose() {
    const initVals = [1.707, -1.754, 0.003, -2.702, 0.003, 0.951, 2.49, 0];

    for (let i = 0; i < Math.min(initVals.length, this.model.nu); i++) {
      this.data.ctrl[i] = initVals[i];
      if (this.model.actuator_trnid[2 * i + 1] === 1) {
        const jointId = this.model.actuator_trnid[2 * i];
        if (jointId >= 0 && jointId < this.model.njnt) {
          const qposAdr = this.model.jnt_qposadr[jointId];
          this.data.qpos[qposAdr] = initVals[i];
        }
      }
    }
  }

  private buildExecutionPlanTargets(plan: TrialRequest['executionPlan']) {
    const downRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
    let seedQpos = [0, -0.785, 0, -2.356, 0, 1.571, 0.785];

    return {
      ...plan,
      stages: plan.stages.map((stage) => {
        if (!stage.targetPose) return stage;
        const targetPosition = new THREE.Vector3(
          stage.targetPose.position.x,
          stage.targetPose.position.y,
          stage.targetPose.position.z
        );
        const solved = solveFrankaIk(targetPosition, downRot, seedQpos) ?? seedQpos;
        seedQpos = [...solved];
        return {
          ...stage,
          targetQpos: Float64Array.from(solved),
        };
      }),
    };
  }

  private startMonitoring(targetQpos: Float64Array) {
    this.targetQpos = targetQpos;
    this.monitoring = { time: [], error: [], energy: [] };
  }

  private stopMonitoring() {
    const { time, error, energy } = this.monitoring;
    if (time.length === 0) {
      return {
        settlingTime: 0,
        overshoot: 0,
        steadyStateError: 1,
        energyConsumption: 0,
      };
    }

    const steadyStateError = error[error.length - 1];
    const energyConsumption = energy.reduce((a, b) => a + b, 0) / energy.length;
    const threshold = 0.05;
    let settlingTime = time[time.length - 1];
    for (let i = error.length - 1; i >= 0; i--) {
      if (error[i] > threshold) {
        settlingTime = time[i];
        break;
      }
    }
    const overshoot = Math.max(...error) - error[0];

    return {
      settlingTime,
      overshoot: Math.max(0, overshoot),
      steadyStateError,
      energyConsumption,
    };
  }

  private recordPerformance() {
    if (!this.targetQpos) return;

    this.monitoring.time.push(this.data.time);

    let err = 0;
    for (let i = 0; i < 7; i++) {
      err += Math.pow(this.data.qpos[i] - this.targetQpos[i], 2);
    }
    this.monitoring.error.push(Math.sqrt(err));

    let energy = 0;
    for (let i = 0; i < this.model.nu; i++) {
      energy += Math.abs(this.data.ctrl[i]);
    }
    this.monitoring.energy.push(energy);
  }
}

export async function createHeadlessSimulationRuntime(): Promise<HeadlessTrialRuntime> {
  const mujoco = (await loadMujoco({
    locateFile: (path: string) =>
      path.endsWith('.wasm')
        ? 'https://unpkg.com/mujoco-js@0.0.7/dist/mujoco_wasm.wasm'
        : path,
  })) as unknown as MujocoModule;
  const loader = new RobotLoader(mujoco);
  await loader.load('franka_panda_stack', 'scene.xml');

  const model = mujoco.MjModel.loadFromXML('/working/scene.xml');
  const data = new mujoco.MjData(model);

  const getName = (addresses: Int32Array, index: number) => {
    const start = addresses[index];
    let result = '';
    for (let i = start; i < model.names.length && model.names[i] !== 0; i++) {
      result += String.fromCharCode(model.names[i]);
    }
    return result;
  };

  const resolvedActuatorNames = Array.from({ length: model.nu }, (_, i) =>
    getName(model.name_actuatoradr, i)
  );
  const gripperActuatorId = resolveGripperActuatorId(resolvedActuatorNames);

  return new HeadlessSimulationRuntime(mujoco, model, data, gripperActuatorId);
}
