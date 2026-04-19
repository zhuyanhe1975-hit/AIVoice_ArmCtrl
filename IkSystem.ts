/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MujocoData, MujocoModel, MujocoModule } from './types';
import { logger } from './LogManager';
import { resolveVirtualTcpPose } from './domain/execution/pandaModelCompatibility';
import { solveFrankaIk } from './domain/execution/solveFrankaIk';

/**
 * IkSystem
 * Handles Inverse Kinematics calculations using the analytical solver.
 */
export class IkSystem {
    target: THREE.Group;
    control: TransformControls;
    
    calculating = false;
    gripperSiteId = -1;
    handBodyId = -1;
    
    constructor(mujoco: MujocoModule, camera: THREE.Camera, domElement: HTMLElement, orbitControls: OrbitControls) {
        this.target = new THREE.Group();
        this.target.name = "IK Target";
        
        // Visual aid for target
        const axes = new THREE.AxesHelper(0.2);
        this.target.add(axes);
        
        this.control = new TransformControls(camera, domElement);
        this.control.addEventListener('dragging-changed', (event) => {
            const e = event as unknown as { value: boolean };
            orbitControls.enabled = !e.value;
        });
        this.control.attach(this.target);
    }
    
    init(mjModel: MujocoModel, isDouble: boolean) {
        // Reset internal state if needed
    }
    
    syncToSite(mjData: MujocoData) {
        if (this.gripperSiteId === -1) return;
        // Get site position and rotation from MuJoCo
        const sitePos = mjData.site_xpos.subarray(this.gripperSiteId * 3, this.gripperSiteId * 3 + 3);
        const siteMat = mjData.site_xmat.subarray(this.gripperSiteId * 9, this.gripperSiteId * 9 + 9);
        
        this.target.position.set(sitePos[0], sitePos[1], sitePos[2]);
        
        const m = new THREE.Matrix4().set(
            siteMat[0], siteMat[1], siteMat[2], 0,
            siteMat[3], siteMat[4], siteMat[5], 0,
            siteMat[6], siteMat[7], siteMat[8], 0,
            0, 0, 0, 1
        );
        this.target.quaternion.setFromRotationMatrix(m);
    }

    syncToVirtualTcp(mjData: MujocoData) {
        if (this.handBodyId === -1) return;

        const handPos = new THREE.Vector3().fromArray(mjData.xpos, this.handBodyId * 3);
        const handQuat = new THREE.Quaternion(
            mjData.xquat[this.handBodyId * 4 + 1],
            mjData.xquat[this.handBodyId * 4 + 2],
            mjData.xquat[this.handBodyId * 4 + 3],
            mjData.xquat[this.handBodyId * 4 + 0]
        );
        const tcpPose = resolveVirtualTcpPose(handPos, handQuat);

        this.target.position.copy(tcpPose.position);
        this.target.quaternion.copy(tcpPose.quaternion);
    }

    /**
     * Solves IK for a specific Cartesian pose.
     * Returns the joint angles (array of 7 numbers) or null if no solution found.
     */
    solve(pos: THREE.Vector3, quat: THREE.Quaternion, currentQ: number[]): number[] | null {
        const bestSolution = solveFrankaIk(pos, quat, currentQ);

        if (!bestSolution) {
            logger.warn('IkSystem', 'Failed to find IK solution for target', { position: pos, rotation: quat });
        }

        return bestSolution;
    }
    
    update(mjModel: MujocoModel, mjData: MujocoData) {
        if (!this.calculating) return;
        
        // Prepare current state
        const currentQ = [];
        for(let i=0; i<7; i++) currentQ.push(mjData.qpos[i]);

        // Solve
        const solution = this.solve(this.target.position, this.target.quaternion, currentQ);
        
        if (solution) {
            // Apply solution to control
            for(let i=0; i<7; i++) {
                mjData.ctrl[i] = solution[i];
            }
        }
    }
    
    setCalculating(enabled: boolean) {
        this.calculating = enabled;
    }
    
    setGizmoVisible(visible: boolean) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.control as any).visible = this.control.enabled = visible;
    }
    
    setTargetVisible(visible: boolean) {
        this.target.visible = visible;
    }
    
    setMode(mode: string) {
        // Only freeform implemented
    }
    
    isActuatorIkControlled(id: number) {
        return id >= 0 && id < 7;
    }
    
    dispose() {
        this.control.dispose();
    }
}
