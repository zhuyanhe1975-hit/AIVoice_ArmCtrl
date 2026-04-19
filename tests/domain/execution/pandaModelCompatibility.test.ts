import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  findNamedIndex,
  resolveGripperActuatorId,
  resolveVirtualTcpPose,
} from '../../../domain/execution/pandaModelCompatibility';

describe('pandaModelCompatibility', () => {
  it('falls back to actuator8 when gripper is not present', () => {
    expect(resolveGripperActuatorId(['actuator1', 'actuator8'])).toBe(1);
    expect(resolveGripperActuatorId(['actuator1', 'gripper'])).toBe(1);
  });

  it('finds the hand body by exact name', () => {
    expect(findNamedIndex(['link7', 'hand', 'left_finger'], 'hand')).toBe(1);
  });

  it('derives a virtual tcp pose 0.1m ahead of the hand frame', () => {
    const pose = resolveVirtualTcpPose(
      new THREE.Vector3(0, 0, 0.2),
      new THREE.Quaternion(),
      0.1
    );

    expect(pose.position.z).toBeCloseTo(0.3, 5);
    expect(pose.quaternion.equals(new THREE.Quaternion())).toBe(true);
  });
});
