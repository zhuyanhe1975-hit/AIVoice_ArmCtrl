import * as THREE from 'three';
import { calculateAnalyticalIK } from '../../FrankaAnalyticalIK';

function squaredDistance(arr1: number[], arr2: number[]) {
  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    sum += (arr1[i] - arr2[i]) ** 2;
  }
  return sum;
}

const Q_NEUTRAL = [0, -0.785, 0, -2.356, 0, 1.571, 0.785];
const Q7_MIN = -2.8973;
const Q7_MAX = 2.8973;
const Q7_STEP = 0.1;

export function solveFrankaIk(
  pos: THREE.Vector3,
  quat: THREE.Quaternion,
  currentQ: number[]
): number[] | null {
  const target = new THREE.Group();
  target.position.copy(pos);
  target.quaternion.copy(quat);
  target.updateMatrixWorld();
  const transform = target.matrixWorld;

  const alpha = 1.0;
  const beta = 0.05;
  let bestSolution: number[] | null = null;
  let minCost = Infinity;

  const processCandidateQ7 = (q7: number) => {
    const solutions = calculateAnalyticalIK(transform, q7);
    for (const solution of solutions) {
      const distCurrent = squaredDistance(solution, currentQ);
      const distNeutral = squaredDistance(solution, Q_NEUTRAL);
      const cost = alpha * distCurrent + beta * distNeutral;

      if (cost < minCost) {
        minCost = cost;
        bestSolution = solution;
      }
    }
  };

  const currentQ7 = currentQ[6];
  processCandidateQ7(currentQ7);

  const searchRange = 0.5;
  for (
    let q7 = Math.max(Q7_MIN, currentQ7 - searchRange);
    q7 <= Math.min(Q7_MAX, currentQ7 + searchRange);
    q7 += Q7_STEP
  ) {
    processCandidateQ7(q7);
  }

  if (!bestSolution) {
    for (let q7 = Q7_MIN; q7 <= Q7_MAX; q7 += Q7_STEP * 2) {
      processCandidateQ7(q7);
    }
  }

  return bestSolution;
}
