import { ExecutionPlan, TaskScenarioV2 } from '../../types';

const APPROACH_CLEARANCE = 0.2;
const ALIGN_CLEARANCE = 0.12;
const PICK_CLEARANCE = 0.045;
const TRANSFER_CLEARANCE = 0.2;
const PLACE_CLEARANCE = 0.05;

function offsetPosition(
  position: TaskScenarioV2['sourcePose']['position'],
  zOffset: number
) {
  return {
    x: position.x,
    y: position.y,
    z: position.z + zOffset,
  };
}

export function buildPickPlacePlan(scenario: TaskScenarioV2): ExecutionPlan {
  return {
    stages: [
      {
        name: 'approach',
        targetPose: { position: offsetPosition(scenario.sourcePose.position, APPROACH_CLEARANCE) },
        gripperCommand: 255,
        duration: 1.2,
      },
      {
        name: 'align',
        targetPose: { position: offsetPosition(scenario.sourcePose.position, ALIGN_CLEARANCE) },
        gripperCommand: 255,
        duration: 0.8,
      },
      {
        name: 'descend',
        targetPose: { position: offsetPosition(scenario.sourcePose.position, PICK_CLEARANCE) },
        gripperCommand: 255,
        duration: 0.9,
      },
      {
        name: 'grasp',
        targetPose: { position: offsetPosition(scenario.sourcePose.position, PICK_CLEARANCE) },
        gripperCommand: 0,
        duration: 0.7,
      },
      {
        name: 'lift',
        targetPose: { position: offsetPosition(scenario.sourcePose.position, TRANSFER_CLEARANCE) },
        gripperCommand: 0,
        duration: 1,
      },
      {
        name: 'transfer',
        targetPose: { position: offsetPosition(scenario.targetPose.position, TRANSFER_CLEARANCE) },
        gripperCommand: 0,
        duration: 1.4,
      },
      {
        name: 'place',
        targetPose: { position: offsetPosition(scenario.targetPose.position, PLACE_CLEARANCE) },
        gripperCommand: 255,
        duration: 0.9,
      },
      {
        name: 'retreat',
        targetPose: { position: offsetPosition(scenario.targetPose.position, 0.18) },
        gripperCommand: 255,
        duration: 1,
      },
    ],
    transitionRules: {
      completionMode: 'sequential',
    },
  };
}
