import * as THREE from 'three';

export interface VirtualTcpPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export function findNamedIndex(names: string[], target: string): number {
  return names.findIndex((name) => name === target);
}

export function resolveGripperActuatorId(names: string[]): number {
  const preferred = names.findIndex((name) => name.includes('gripper'));
  if (preferred !== -1) return preferred;

  return names.findIndex((name) => name === 'actuator8');
}

export function resolveVirtualTcpPose(
  handPosition: THREE.Vector3,
  handQuaternion: THREE.Quaternion,
  offset = 0.1
): VirtualTcpPose {
  const tcpOffset = new THREE.Vector3(0, 0, offset).applyQuaternion(handQuaternion);

  return {
    position: handPosition.clone().add(tcpOffset),
    quaternion: handQuaternion.clone(),
  };
}
