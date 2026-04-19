import { describe, expect, it } from 'vitest';
import { buildPickPlacePlan } from '../../../domain/execution/buildPickPlacePlan';

describe('buildPickPlacePlan', () => {
  it('creates the default pick-and-place stage sequence', () => {
    const plan = buildPickPlacePlan({
      taskId: 'task1',
      description: 'pick cube and place in tray',
      objectName: 'cube',
      sourcePose: { position: { x: 0.4, y: -0.1, z: 0.02 } },
      targetPose: { position: { x: 0.4, y: 0.2, z: 0.05 } },
      constraints: {},
      preferences: {}
    });

    expect(plan.stages.map(stage => stage.name)).toEqual([
      'approach',
      'align',
      'descend',
      'grasp',
      'lift',
      'transfer',
      'place',
      'retreat'
    ]);
    expect(plan.stages.find(stage => stage.name === 'approach')?.targetPose?.position.z).toBeGreaterThan(
      plan.stages.find(stage => stage.name === 'align')?.targetPose?.position.z ?? 0
    );
    expect(plan.stages.find(stage => stage.name === 'descend')?.targetPose?.position.z).toBeCloseTo(0.065);
    expect(plan.stages.find(stage => stage.name === 'grasp')?.targetPose?.position.z).toBeCloseTo(0.065);
    expect(plan.stages.find(stage => stage.name === 'place')?.targetPose?.position.z).toBeCloseTo(0.1);
    expect(plan.stages.find(stage => stage.name === 'approach')?.gripperCommand).toBe(255);
    expect(plan.stages.find(stage => stage.name === 'grasp')?.gripperCommand).toBe(0);
    expect(plan.stages.find(stage => stage.name === 'place')?.gripperCommand).toBe(255);
  });
});
