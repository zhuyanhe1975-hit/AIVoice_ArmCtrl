import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { solveFrankaIk } from '../../../domain/execution/solveFrankaIk';

describe('solveFrankaIk', () => {
  it('returns a 7-joint solution for a reachable target pose', () => {
    const solution = solveFrankaIk(
      new THREE.Vector3(0.3, 0, 0.4),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)),
      [0, -0.785, 0, -2.356, 0, 1.571, 0.785]
    );

    expect(solution).toHaveLength(7);
  });
});
