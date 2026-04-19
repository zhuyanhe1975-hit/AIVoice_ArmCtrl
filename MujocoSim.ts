/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import * as THREE from 'three';
import { DragStateManager } from './DragStateManager';
import { IkSystem } from './IkSystem';
import { RenderSystem } from './RenderSystem';
import { RobotLoader } from './RobotLoader';
import { SelectionManager } from './SelectionManager';
import { SequenceAnimator } from './SequenceAnimator';
import { MujocoData, MujocoModel, MujocoModule, ControlAlgorithm, ExecutionPlan, TaskScenarioV2 } from './types';
import { getName } from './utils/StringUtils';
import { logger } from './LogManager';
import { buildPickPlacePlan } from './domain/execution/buildPickPlacePlan';
import { findNamedIndex, resolveGripperActuatorId, resolveVirtualTcpPose } from './domain/execution/pandaModelCompatibility';

/**
 * MujocoSim: The Central Orchestrator.
 * Manages the connection between the MuJoCo WASM engine and the Three.js visualization.
 */
export class MujocoSim {
    mujoco: MujocoModule;      
    mjModel: MujocoModel | null = null;     
    mjData: MujocoData | null = null;      
    mjvOption: InstanceType<MujocoModule['MjvOption']>;   

    renderSys: RenderSystem;
    ikSys: IkSystem;
    dragStateManager: DragStateManager;
    selectionManager: SelectionManager;
    sequenceAnimator: SequenceAnimator;

    frameId: number | null = null; 
    paused = false;
    gripperActuatorId = -1;
    speedMultiplier = 1;
    
    private userIkEnabled = false; 
    private firstIkEnable = true; // Track first enable to enforce default rotation

    private controlLaw: ((m: MujocoModel, d: MujocoData) => void) | null = null;
    private performanceData: { time: number[], error: number[], energy: number[] } = { time: [], error: [], energy: [] };
    private isMonitoring = false;
    private targetQpos: Float64Array | null = null;
    private activeTrialSessionId: string | null = null;
    private handBodyId = -1;
    private attachedBodyId: number | null = null;
    private attachedBodyQposAdr: number | null = null;

    // Gizmo Interpolation State
    private gizmoAnim = {
        active: false,
        startPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        startRot: new THREE.Quaternion(),
        endRot: new THREE.Quaternion(),
        startTime: 0,
        duration: 1000
    };

    constructor(container: HTMLElement, mujocoInstance: MujocoModule) {
        this.mujoco = mujocoInstance;
        this.mjvOption = new this.mujoco.MjvOption();
        
        this.renderSys = new RenderSystem(container, this.mujoco);
        
        this.dragStateManager = new DragStateManager(this.renderSys.scene, this.renderSys.renderer, this.renderSys.camera, container, this.renderSys.controls);
        this.selectionManager = new SelectionManager(this.renderSys.scene, this.renderSys.renderer, this.renderSys.camera, container);
        
        this.ikSys = new IkSystem(this.mujoco, this.renderSys.camera, this.renderSys.renderer.domElement, this.renderSys.controls);
        this.renderSys.simGroup.add(this.ikSys.target); 
        this.renderSys.scene.add(this.ikSys.control as unknown as THREE.Object3D);
        
        this.sequenceAnimator = new SequenceAnimator();
        
        this.renderSys.initLights(this.dragStateManager);
        logger.success('MujocoSim', 'Simulation initialized successfully');
    }

    async init(robotId = 'franka_emika_panda', sceneFile = 'scene.xml', onProgress?: (msg: string) => void) {
        logger.info('MujocoSim', `Initializing simulation with robot: ${robotId}, scene: ${sceneFile}`);
        const loader = new RobotLoader(this.mujoco);
        const { isDouble, isStacking } = await loader.load(robotId, sceneFile, onProgress);

        try {
            this.mjModel = this.mujoco.MjModel.loadFromXML(`/working/${sceneFile}`);
            this.mjData = new this.mujoco.MjData(this.mjModel);
        
        // Ensure qvel and other expected arrays exist (compatibility check)
        if (!(this.mjData as any).qvel) {
            (this.mjData as any).qvel = new Float64Array(this.mjModel.nv);
        }
        } catch (e: unknown) { 
            const errorMessage =
                e instanceof Error
                    ? e.message
                    : String(e);
            logger.event('error', {
                source: 'MujocoSim',
                eventType: 'model.load_failed',
                message: `Failed to load model entry /working/${sceneFile}`,
                data: {
                    error: errorMessage,
                    errorType: typeof e,
                    sceneFile,
                }
            });
            throw new Error(`Failed to load model: ${errorMessage || 'unknown MuJoCo error'}`); 
        }

        if (this.mjModel) {
            this.ikSys.gripperSiteId = -1; 
            this.ikSys.handBodyId = -1;
            this.gripperActuatorId = -1;
            const siteNames = Array.from({ length: this.mjModel.nsite }, (_, i) =>
                getName(this.mjModel!, this.mjModel!.name_siteadr[i])
            );
            const bodyNames = Array.from({ length: this.mjModel.nbody }, (_, i) =>
                getName(this.mjModel!, this.mjModel!.name_bodyadr[i])
            );
            const actuatorNames = Array.from({ length: this.mjModel.nu }, (_, i) =>
                getName(this.mjModel!, this.mjModel!.name_actuatoradr[i])
            );

            this.ikSys.gripperSiteId = siteNames.findIndex((name) => name.includes('tcp'));
            this.handBodyId = findNamedIndex(bodyNames, 'hand');
            this.ikSys.handBodyId = this.handBodyId;
            this.gripperActuatorId = resolveGripperActuatorId(actuatorNames);

            // Set Initial Pose
            this.setInitialPose();

            this.mujoco.mj_forward(this.mjModel, this.mjData!);
            this.renderSys.initScene(this.mjModel);
            this.ikSys.init(this.mjModel, isDouble);
            if (this.ikSys.gripperSiteId !== -1) {
                this.ikSys.syncToSite(this.mjData!);
            } else if (this.handBodyId !== -1) {
                this.ikSys.syncToVirtualTcp(this.mjData!);
            }
            
            this.ikSys.target.quaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
            this.ikSys.target.position.set(0, 0, 0.45);

            this.firstIkEnable = true;
            
            this.sequenceAnimator.init(this.mjModel, isStacking, (addr) => getName(this.mjModel!, addr));
            
            this.startLoop();
        }
    }
    
    private setInitialPose() {
        if (!this.mjModel || !this.mjData) return;
        const actuatorNames = Array.from({ length: this.mjModel.nu }, (_, i) =>
            getName(this.mjModel!, this.mjModel!.name_actuatoradr[i])
        );
        const isPandaLike = actuatorNames.some((name) => name.includes('panda_joint'));

        if (!isPandaLike) {
            this.mjData.ctrl.fill(0);
            return;
        }

        const initVals = [1.707, -1.754, 0.003, -2.702, 0.003, 0.951, 2.490, 0.000];
        
        for (let i = 0; i < Math.min(initVals.length, this.mjModel.nu); i++) {
            this.mjData.ctrl[i] = initVals[i];
            if (this.mjModel.actuator_trnid[2 * i + 1] === 1) {
                const jointId = this.mjModel.actuator_trnid[2 * i];
                if (jointId >= 0 && jointId < this.mjModel.njnt) {
                    const qposAdr = this.mjModel.jnt_qposadr[jointId];
                    this.mjData.qpos[qposAdr] = initVals[i];
                }
            }
        }
    }

    private randomizeCubes() {
        if (!this.mjModel || !this.mjData) return;
        const positions: Array<{x: number, y: number}> = [];
        
        for (let i = 0; i < this.mjModel.nbody; i++) {
            const name = getName(this.mjModel, this.mjModel.name_bodyadr[i]);
            if (name.startsWith('cube')) {
                let x = 0;
                let y = 0;
                let valid = false;
                let attempts = 0;
                while (!valid && attempts < 100) {
                    const minR = 0.35;
                    const maxR = 0.8;
                    const r = Math.sqrt(Math.random() * (maxR*maxR - minR*minR) + minR*minR);
                    const theta = Math.random() * 2 * Math.PI;
                    x = r * Math.cos(theta);
                    y = r * Math.sin(theta);
                    valid = true;
                    const distStack = Math.sqrt((x - 0.6)**2 + (y - 0)**2);
                    if (distStack < 0.35) valid = false;
                    if (valid) {
                        for (const p of positions) {
                            if ((p.x - x)**2 + (p.y - y)**2 < 0.004) { valid = false; break; }
                        }
                    }
                    attempts++;
                }
                if (valid) {
                    positions.push({x, y});
                    
                    // Assuming body_jntadr exists in the model wrapper or bindings
                    // Standard MuJoCo has body_jntadr.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const jntIdVal = (this.mjModel as any).body_jntadr[i];
                    if (jntIdVal >= 0) {
                        const qp = this.mjModel.jnt_qposadr[jntIdVal];
                        this.mjData.qpos[qp] = x;
                        this.mjData.qpos[qp + 1] = y;
                        this.mjData.qpos[qp + 2] = 0.02;
                        // Orientation (Identity)
                        this.mjData.qpos[qp + 3] = 1;
                        this.mjData.qpos[qp + 4] = 0;
                        this.mjData.qpos[qp + 5] = 0;
                        this.mjData.qpos[qp + 6] = 0;
                    }
                }
            }
        }
    }

    private startLoop() {
        if (this.frameId) cancelAnimationFrame(this.frameId);

        const loop = () => {
            if (!this.mjModel || !this.mjData) {
                 this.frameId = requestAnimationFrame(loop);
                 return;
            }

            this.dragStateManager.update();
            if (this.draggedBodyId() !== null) this.mjData.xfrc_applied.fill(0);
            if (this.dragStateManager.active && this.dragStateManager.physicsObject) {
                this.applyDragForce();
            }
            
            if (this.gizmoAnim.active) {
                const now = performance.now();
                const elapsed = now - this.gizmoAnim.startTime;
                const t = Math.min(elapsed / this.gizmoAnim.duration, 1.0);
                const ease = 1 - Math.pow(1 - t, 3);
                
                this.ikSys.target.position.lerpVectors(this.gizmoAnim.startPos, this.gizmoAnim.endPos, ease);
                this.ikSys.target.quaternion.slerpQuaternions(this.gizmoAnim.startRot, this.gizmoAnim.endRot, ease);
                
                if (t >= 1.0) {
                    this.gizmoAnim.active = false;
                }
            }

            if (!this.paused) {
                if (this.sequenceAnimator.running) {
                    this.sequenceAnimator.update((1/60) * this.speedMultiplier, this.ikSys.target, this.mjData, this.gripperActuatorId, this.ikSys);
                    this.setIkEnabled(false);
                } else {
                     this.syncIkState();
                     this.ikSys.update(this.mjModel, this.mjData);
                }

                const startSimTime = this.mjData.time;
                // Allow simulation to run faster than real-time based on speedMultiplier
                while (this.mjData.time - startSimTime < (1.0 / 60.0) * this.speedMultiplier) {
                    if (this.controlLaw && this.mjModel && this.mjData) {
                        this.controlLaw(this.mjModel, this.mjData);
                    }
                    this.mujoco.mj_step(this.mjModel, this.mjData);
                    this.updateAttachedBodyPose();
                    
                    if (this.isMonitoring && this.mjData && this.targetQpos) {
                        this.recordPerformance();
                    }
                }
            }

            this.renderSys.update(this.mjData, this.renderSys.contactMarkers.visible);
            this.frameId = requestAnimationFrame(loop);
        };
        this.frameId = requestAnimationFrame(loop);
    }

    private draggedBodyId(): number | null { 
        return this.dragStateManager.active && this.dragStateManager.physicsObject ? this.dragStateManager.physicsObject.userData.bodyID : null; 
    }

    private applyDragForce() {
        if (!this.mjData) return;
        const bodyId = this.draggedBodyId()!;
        const force = new THREE.Vector3().subVectors(this.dragStateManager.currentWorld, this.dragStateManager.worldHit).multiplyScalar(1.5);
        if (force.lengthSq() > 25) force.setLength(5.0); 
        
        const bodyPos = new THREE.Vector3().fromArray(this.mjData.xpos, bodyId * 3);
        const leverArm = new THREE.Vector3().subVectors(this.dragStateManager.worldHit, bodyPos);
        const torque = leverArm.cross(force);

        this.mjData.xfrc_applied.set([force.x, force.y, force.z, torque.x, torque.y, torque.z], bodyId * 6);
    }
    
    private syncIkState() {
        const shouldCalculate = this.userIkEnabled;
        const shouldShowGizmo = this.userIkEnabled && !this.gizmoAnim.active && !this.sequenceAnimator.running; 
        
        this.ikSys.setCalculating(shouldCalculate);
        this.ikSys.setGizmoVisible(shouldShowGizmo);
        
        if (this.sequenceAnimator.running) {
            this.ikSys.setTargetVisible(true);
        } else if(shouldCalculate) {
            this.ikSys.setTargetVisible(true);
        }
    }

    moveIkTargetTo(pos: THREE.Vector3, duration = 0) {
        if (!this.userIkEnabled) {
            this.setIkEnabled(true);
        }
        
        const targetPos = new THREE.Vector3(pos.x, pos.y, pos.z + 0.05);
        const targetRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));

        if (duration > 0) {
            this.gizmoAnim.active = true;
            this.gizmoAnim.startPos.copy(this.ikSys.target.position);
            this.gizmoAnim.endPos.copy(targetPos);
            this.gizmoAnim.startRot.copy(this.ikSys.target.quaternion);
            this.gizmoAnim.endRot.copy(targetRot);
            this.gizmoAnim.startTime = performance.now();
            this.gizmoAnim.duration = duration;
        } else {
            this.gizmoAnim.active = false;
            this.ikSys.target.position.copy(targetPos);
            this.ikSys.target.quaternion.copy(targetRot);
        }
    }

    pickupItems(positions: THREE.Vector3[], markerIds: number[], onFinished?: () => void) {
        if (this.sequenceAnimator && this.mjData) {
            if (this.ikSys.gripperSiteId !== -1) {
                this.ikSys.syncToSite(this.mjData);
            } else if (this.handBodyId !== -1) {
                this.ikSys.syncToVirtualTcp(this.mjData);
            }

            const started = this.sequenceAnimator.start(
                this.ikSys.target, 
                this.mjData, 
                this.ikSys, 
                { positions, markerIds }, 
                (markerId) => {
                    this.renderSys.removeMarkerById(markerId);
                },
                onFinished
            );
            if (started) {
                this.setIkEnabled(false);
            }
            return started;
        }

        return false;
    }

    pickupBodyIds(bodyIds: number[], onFinished?: () => void) {
        if (this.sequenceAnimator && this.mjData) {
            if (this.ikSys.gripperSiteId !== -1) {
                this.ikSys.syncToSite(this.mjData);
            } else if (this.handBodyId !== -1) {
                this.ikSys.syncToVirtualTcp(this.mjData);
            }

            const started = this.sequenceAnimator.start(
                this.ikSys.target,
                this.mjData,
                this.ikSys,
                bodyIds,
                undefined,
                onFinished
            );
            if (started) {
                this.setIkEnabled(false);
            }
            return started;
        }

        return false;
    }

    reset() {
        if (!this.mjModel || !this.mjData) return;
        this.renderSys.clearErMarkers();
        this.gizmoAnim.active = false;
        this.sequenceAnimator.reset(); 
        this.mujoco.mj_resetData(this.mjModel, this.mjData);
        this.setInitialPose();
        this.randomizeCubes(); 
        this.releaseAttachedBody();
        this.mujoco.mj_forward(this.mjModel, this.mjData); 
        if (this.ikSys.gripperSiteId !== -1) {
            this.ikSys.syncToSite(this.mjData);
        } else if (this.handBodyId !== -1) {
            this.ikSys.syncToVirtualTcp(this.mjData);
        }
        
        this.ikSys.target.quaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
        this.ikSys.target.position.set(0, 0, 0.45);
        this.firstIkEnable = true;
    }
    
    togglePause() { return this.paused = !this.paused; }

    setPaused(paused: boolean) {
        this.paused = paused;
        return this.paused;
    }
    
    setIkEnabled(enabled: boolean) {
        this.userIkEnabled = enabled;
        this.syncIkState();
        if (enabled && this.mjData && !this.gizmoAnim.active && !this.sequenceAnimator.running) {
            if (this.firstIkEnable) {
                this.ikSys.target.quaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
                this.ikSys.target.position.set(0, 0, 0.45);
                this.firstIkEnable = false;
            } else {
                if (this.ikSys.gripperSiteId !== -1) {
                    this.ikSys.syncToSite(this.mjData);
                } else if (this.handBodyId !== -1) {
                    this.ikSys.syncToVirtualTcp(this.mjData);
                }
            }
        }
    }
    
    setSpeedMultiplier(speed: number) {
        this.speedMultiplier = speed;
    }

    setControlLaw(fn: ((m: MujocoModel, d: MujocoData) => void) | null) {
        this.controlLaw = fn;
    }

    private resolveBodyId(name: string): number {
        if (!this.mjModel) return -1;
        for (let i = 0; i < this.mjModel.nbody; i++) {
            if (getName(this.mjModel, this.mjModel.name_bodyadr[i]) === name) {
                return i;
            }
        }

        return -1;
    }

    getBodyId(name: string) {
        return this.resolveBodyId(name);
    }

    private resolveBodyQposAdr(bodyId: number): number | null {
        if (!this.mjModel || bodyId < 0) return null;
        const bodyJntAdr = (this.mjModel as MujocoModel & { body_jntadr?: Int32Array }).body_jntadr;
        const jointId = bodyJntAdr?.[bodyId] ?? -1;

        if (jointId < 0) return null;

        return this.mjModel.jnt_qposadr[jointId] ?? null;
    }

    private getTcpPose(): { position: THREE.Vector3; quaternion: THREE.Quaternion } | null {
        if (!this.mjData) return null;

        if (this.ikSys.gripperSiteId !== -1) {
            const sitePos = this.mjData.site_xpos.subarray(this.ikSys.gripperSiteId * 3, this.ikSys.gripperSiteId * 3 + 3);
            const siteMat = this.mjData.site_xmat.subarray(this.ikSys.gripperSiteId * 9, this.ikSys.gripperSiteId * 9 + 9);
            const matrix = new THREE.Matrix4().set(
                siteMat[0], siteMat[1], siteMat[2], 0,
                siteMat[3], siteMat[4], siteMat[5], 0,
                siteMat[6], siteMat[7], siteMat[8], 0,
                0, 0, 0, 1
            );

            return {
                position: new THREE.Vector3(sitePos[0], sitePos[1], sitePos[2]),
                quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix),
            };
        }

        if (this.handBodyId !== -1) {
            const handPos = new THREE.Vector3().fromArray(this.mjData.xpos, this.handBodyId * 3);
            const handQuat = new THREE.Quaternion(
                this.mjData.xquat[this.handBodyId * 4 + 1],
                this.mjData.xquat[this.handBodyId * 4 + 2],
                this.mjData.xquat[this.handBodyId * 4 + 3],
                this.mjData.xquat[this.handBodyId * 4 + 0]
            );

            return resolveVirtualTcpPose(handPos, handQuat);
        }

        return null;
    }

    private tryAttachBody(gripperCommand: number) {
        if (!this.mjData || gripperCommand > 10 || this.attachedBodyId !== null) return;
        const tcpPose = this.getTcpPose();
        if (!tcpPose || !this.mjModel) return;

        let nearestBodyId = -1;
        let nearestDistance = Infinity;

        for (let i = 0; i < this.mjModel.nbody; i++) {
            const bodyName = getName(this.mjModel, this.mjModel.name_bodyadr[i]);
            if (!bodyName.startsWith('cube')) continue;

            const cubePosition = this.getBodyPosition(bodyName);
            if (!cubePosition) continue;

            const distance = cubePosition.distanceTo(tcpPose.position);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestBodyId = i;
            }
        }

        if (nearestBodyId === -1 || nearestDistance > 0.055) return;
        const qposAdr = this.resolveBodyQposAdr(nearestBodyId);
        if (qposAdr === null) return;

        this.attachedBodyId = nearestBodyId;
        this.attachedBodyQposAdr = qposAdr;
        this.updateAttachedBodyPose();
    }

    private updateAttachedBodyPose() {
        if (!this.mjData || this.attachedBodyId === null || this.attachedBodyQposAdr === null) return;
        const tcpPose = this.getTcpPose();

        if (!tcpPose) return;

        const carryOffset = new THREE.Vector3(0, 0, -0.015).applyQuaternion(tcpPose.quaternion);
        const cubePosition = tcpPose.position.clone().add(carryOffset);
        const qposAdr = this.attachedBodyQposAdr;

        this.mjData.qpos[qposAdr] = cubePosition.x;
        this.mjData.qpos[qposAdr + 1] = cubePosition.y;
        this.mjData.qpos[qposAdr + 2] = Math.max(0.03, cubePosition.z);
        this.mjData.qpos[qposAdr + 3] = 1;
        this.mjData.qpos[qposAdr + 4] = 0;
        this.mjData.qpos[qposAdr + 5] = 0;
        this.mjData.qpos[qposAdr + 6] = 0;
    }

    private releaseAttachedBody() {
        this.attachedBodyId = null;
        this.attachedBodyQposAdr = null;
    }

    getBodyPosition(name: string): THREE.Vector3 | null {
        if (!this.mjModel || !this.mjData) return null;
        for (let i = 0; i < this.mjModel.nbody; i++) {
            const bodyName = getName(this.mjModel, this.mjModel.name_bodyadr[i]);
            if (bodyName === name) {
                const pos = this.mjData.xpos.subarray(i * 3, i * 3 + 3);
                return new THREE.Vector3(pos[0], pos[1], pos[2]);
            }
        }
        return null;
    }

    createAutonomyScenario(): TaskScenarioV2 {
        const cubePosActual = this.getBodyPosition('cube') || new THREE.Vector3(0.4, -0.1, 0.02);
        const trayPosActual = this.getBodyPosition('tray') || new THREE.Vector3(0.4, 0.2, 0.0);

        return {
            taskId: `session_${Date.now()}`,
            description: 'Autonomous pick-and-place trial',
            objectName: 'cube',
            sourcePose: { position: { x: cubePosActual.x, y: cubePosActual.y, z: cubePosActual.z } },
            targetPose: { position: { x: trayPosActual.x, y: trayPosActual.y, z: trayPosActual.z } },
            constraints: {},
            preferences: {}
        };
    }

    getCubePositions() {
        return {
            red: this.getBodyPosition('cube'),
            green: this.getBodyPosition('cube_green'),
            blue: this.getBodyPosition('cube_blue'),
        };
    }

    async executeAlgorithmPlan(
        algorithm: ControlAlgorithm,
        options?: {
            sessionId?: string;
            parameters?: Record<string, number>;
            plan?: ExecutionPlan;
            scenario?: TaskScenarioV2;
            monitor?: boolean;
            preserveScene?: boolean;
        }
    ): Promise<ControlAlgorithm['performanceMetrics']> {
        if (!this.mjModel || !this.mjData) {
            logger.error('MujocoSim', 'Cannot execute algorithm plan: Simulation not initialized');
            return {};
        }

        if (!options?.preserveScene) {
            this.reset();
        } else {
            this.sequenceAnimator.reset();
            this.gizmoAnim.active = false;
            this.releaseAttachedBody();
            this.setControlLaw(null);
            this.mujoco.mj_forward(this.mjModel, this.mjData);
        }
        this.paused = false;

        const scenario = options?.scenario ?? this.createAutonomyScenario();
        const sessionId = options?.sessionId ?? scenario.taskId;
        const plan = this.buildExecutionPlanTargets(options?.plan ?? buildPickPlacePlan(scenario));
        const algorithmParameters = options?.parameters ?? algorithm.parameters;
        const totalDuration = plan.stages.reduce((acc, stage) => acc + (stage.duration ?? 1), 0);
        const timeout = 30000;
        const startWallClock = Date.now();
        const planStartSimTime = this.mjData.time;
        const controlFn = new Function('model', 'data', 'params', algorithm.code);

        this.activeTrialSessionId = sessionId;

        logger.event('info', {
            source: 'MujocoSim',
            eventType: 'execution.plan_built',
            sessionId,
            trialId: algorithm.id,
            message: 'Built execution plan for autonomous run',
            data: {
                stages: plan.stages.map((stage) => stage.name)
            }
        });

        let currentStage = 0;
        let stageStartTime = this.mjData.time;
        logger.event('info', {
            source: 'MujocoSim',
            eventType: 'trial.started',
            sessionId,
            trialId: algorithm.id,
            stage: plan.stages[0]?.name,
            message: `Trial started for ${algorithm.name}`
        });
        logger.event('info', {
            source: 'MujocoSim',
            eventType: 'trial.stage_started',
            sessionId,
            trialId: algorithm.id,
            stage: plan.stages[0]?.name,
            message: `Stage ${plan.stages[0]?.name} started`
        });

        this.startMonitoring(plan.stages[0].targetQpos as Float64Array);

        this.setControlLaw((m, d) => {
            const elapsed = d.time - stageStartTime;
            if (elapsed > (plan.stages[currentStage].duration ?? 1) && currentStage < plan.stages.length - 1) {
                logger.event('success', {
                    source: 'MujocoSim',
                    eventType: 'trial.stage_completed',
                    sessionId,
                    trialId: algorithm.id,
                    stage: plan.stages[currentStage].name,
                    message: `Stage ${plan.stages[currentStage].name} completed`
                });
                currentStage++;
                stageStartTime = d.time;
                this.startMonitoring(plan.stages[currentStage].targetQpos as Float64Array);
                logger.event('info', {
                    source: 'MujocoSim',
                    eventType: 'trial.stage_started',
                    sessionId,
                    trialId: algorithm.id,
                    stage: plan.stages[currentStage].name,
                    message: `Stage ${plan.stages[currentStage].name} started`
                });
            }

            const params = {
                ...algorithmParameters,
                targetQpos: plan.stages[currentStage].targetQpos
            };

            if (!(d as any).qvel) {
                (d as any).qvel = new Float64Array(m.nv);
            }

            try {
                controlFn(m, d, params);
            } catch (e) {
                logger.event('error', {
                    source: 'MujocoSim',
                    eventType: 'trial.failure_detected',
                    sessionId,
                    trialId: algorithm.id,
                    stage: plan.stages[currentStage].name,
                    message: 'Control law execution failed',
                    data: e instanceof Error ? { message: e.message } : e
                });
            }

            if (this.gripperActuatorId !== -1) {
                const gripperCommand = plan.stages[currentStage].gripperCommand ?? 0;
                d.ctrl[this.gripperActuatorId] = gripperCommand;
                if (gripperCommand > 10) {
                    this.releaseAttachedBody();
                } else {
                    this.tryAttachBody(gripperCommand);
                }
            }
        });

        return new Promise((resolve) => {
            const check = () => {
                const simTimedOut = Date.now() - startWallClock > timeout;
                if ((this.mjData && this.mjData.time - planStartSimTime > totalDuration) || simTimedOut) {
                    const metrics = this.stopMonitoring() || {};
                    this.setControlLaw(null);
                    logger.event(simTimedOut ? 'warn' : 'success', {
                        source: 'MujocoSim',
                        eventType: simTimedOut ? 'trial.failure_detected' : 'trial.completed',
                        sessionId,
                        trialId: algorithm.id,
                        stage: plan.stages[currentStage]?.name,
                        message: simTimedOut ? 'Trial timed out before completion' : 'Trial completed',
                        data: metrics
                    });
                    this.activeTrialSessionId = null;
                    resolve(metrics);
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    /**
     * Runs a full pick and place sequence using the provided algorithm.
     */
    async runAlgorithm(algorithm: ControlAlgorithm) {
        if (!this.mjModel || !this.mjData) {
            logger.error('MujocoSim', 'Cannot run algorithm: Simulation not initialized');
            return;
        }

        logger.info('MujocoSim', `Starting control algorithm: ${algorithm.name}`);
        void this.executeAlgorithmPlan(algorithm);
    }

    private buildExecutionPlanTargets(plan: ExecutionPlan): ExecutionPlan {
        if (!this.mjModel || !this.mjData) return plan;
        const downRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
        const qNeutral = [0, -0.785, 0, -2.356, 0, 1.571, 0.785];
        let seedQpos = qNeutral;

        return {
            ...plan,
            stages: plan.stages.map((stage) => {
                if (!stage.targetPose) return stage;
                const targetPosition = new THREE.Vector3(
                    stage.targetPose.position.x,
                    stage.targetPose.position.y,
                    stage.targetPose.position.z
                );
                const solved = this.ikSys.solve(targetPosition, downRot, seedQpos) || new Float64Array(seedQpos);
                seedQpos = Array.from(solved as Float64Array);
                return {
                    ...stage,
                    targetQpos: solved as Float64Array
                };
            })
        };
    }

    startMonitoring(targetQpos: Float64Array) {
        this.targetQpos = targetQpos;
        this.performanceData = { time: [], error: [], energy: [] };
        this.isMonitoring = true;
    }

    stopMonitoring() {
        this.isMonitoring = false;
        return this.calculateMetrics();
    }

    private recordPerformance() {
        if (!this.mjData || !this.targetQpos) return;
        this.performanceData.time.push(this.mjData.time);
        
        // Calculate joint error (Euclidean distance in qpos space for the first 7 joints of Panda)
        let err = 0;
        for (let i = 0; i < 7; i++) {
            err += Math.pow(this.mjData.qpos[i] - this.targetQpos[i], 2);
        }
        this.performanceData.error.push(Math.sqrt(err));

        // Calculate energy (sum of absolute control signals)
        let energy = 0;
        for (let i = 0; i < this.mjModel!.nu; i++) {
            energy += Math.abs(this.mjData.ctrl[i]);
        }
        this.performanceData.energy.push(energy);
    }

    private calculateMetrics() {
        const { time, error, energy } = this.performanceData;
        if (time.length === 0) return null;

        const steadyStateError = error[error.length - 1];
        const energyConsumption = energy.reduce((a, b) => a + b, 0) / energy.length;
        
        // Settling time: time to stay within 2% of final error
        const threshold = 0.05; // 5cm error threshold for "settled"
        let settlingTime = time[time.length - 1];
        for (let i = error.length - 1; i >= 0; i--) {
            if (error[i] > threshold) {
                settlingTime = time[i];
                break;
            }
        }

        const overshoot = Math.max(...error) - error[0]; // Simplified overshoot

        return {
            settlingTime,
            overshoot: Math.max(0, overshoot),
            steadyStateError,
            energyConsumption
        };
    }
    
    getGizmoStats() { return this.ikSys.calculating && this.ikSys.target ? { pos: this.ikSys.target.position.clone(), rot: new THREE.Euler().setFromQuaternion(this.ikSys.target.quaternion) } : null; }
    
    dispose() {
        if (this.frameId) cancelAnimationFrame(this.frameId);
        this.dragStateManager.dispose(); 
        this.selectionManager.dispose(); 
        this.renderSys.dispose(); 
        this.ikSys.dispose();
        if (this.mjvOption) this.mjvOption.delete(); 
        if (this.mjModel) this.mjModel.delete(); 
        if (this.mjData) this.mjData.delete();
        try { this.mujoco.FS.unmount('/working'); } catch (e) { /* ignore */ }
    }
}
