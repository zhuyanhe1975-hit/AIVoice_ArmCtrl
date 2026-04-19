import {
  ControlAlgorithm,
  ControllerTemplateId,
  DesignedAlgorithmReport,
  DesignedAlgorithmStage,
  TaskScenario,
} from '../../types.ts';

const PICK_PLACE_STAGE_TEMPLATES: Array<{
  id: string;
  name: string;
  objectives: string[];
  transitionCondition: string;
}> = [
  {
    id: 'approach',
    name: '接近目标',
    objectives: ['抬高末端执行器', '对齐抓取路径'],
    transitionCondition: '到达抓取点上方的安全高度',
  },
  {
    id: 'align',
    name: '姿态对齐',
    objectives: ['缩小位姿偏差', '为下降做准备'],
    transitionCondition: '抓取姿态误差收敛到阈值内',
  },
  {
    id: 'descend',
    name: '下降接触',
    objectives: ['受控下降', '避免接触震荡'],
    transitionCondition: '末端执行器到达抓取高度',
  },
  {
    id: 'grasp',
    name: '闭合抓取',
    objectives: ['稳定闭合夹爪', '建立物体约束'],
    transitionCondition: '夹爪闭合并确认物体已抓取',
  },
  {
    id: 'transfer',
    name: '搬运转移',
    objectives: ['保持抓取稳定', '沿安全轨迹移动到目标区域'],
    transitionCondition: '末端执行器到达放置区域上方',
  },
  {
    id: 'place',
    name: '放置释放',
    objectives: ['平稳落放', '控制释放冲击'],
    transitionCondition: '物体落入目标位姿范围并完成释放',
  },
  {
    id: 'retreat',
    name: '撤离复位',
    objectives: ['安全退出工作区', '准备下一个循环'],
    transitionCondition: '末端执行器回到安全撤离高度',
  },
];

function buildStageParameters(
  algorithm: ControlAlgorithm,
  templateId: ControllerTemplateId
): DesignedAlgorithmStage[] {
  const blueprint = algorithm.controllerBlueprint;
  const stageConfigs = blueprint?.stageConfigs ?? [];
  const isStagewise = blueprint?.controllerMode === 'stagewise';

  return PICK_PLACE_STAGE_TEMPLATES.map((stageTemplate, index) => {
    const stageOverrides = stageConfigs[index]?.parameters ?? {};

    return {
      id: stageTemplate.id,
      name: stageTemplate.name,
      controllerType: templateId,
      objectives: stageTemplate.objectives,
      transitionCondition: stageTemplate.transitionCondition,
      parameters: isStagewise
        ? {
            ...algorithm.parameters,
            ...stageOverrides,
          }
        : { ...algorithm.parameters },
    };
  });
}

export class AlgorithmDesigner {
  buildReport(
    scenario: TaskScenario,
    algorithm: ControlAlgorithm
  ): DesignedAlgorithmReport {
    const blueprint = algorithm.controllerBlueprint;
    const templateId = blueprint?.templateId ?? 'joint_pd';

    return {
      algorithmId: algorithm.id,
      algorithmName: algorithm.name,
      templateId,
      summary: algorithm.description,
      structure: {
        mode: blueprint?.controllerMode ?? 'single',
        stages: buildStageParameters(algorithm, templateId),
      },
      initialParameters: { ...algorithm.parameters },
      optimizableParameters: [
        ...(blueprint?.optimizableParameters ?? Object.keys(algorithm.parameters)),
      ],
      parameterBounds: { ...(blueprint?.parameterBounds ?? {}) },
      designRationale:
        blueprint?.selectionRationale ?? algorithm.description,
      expectedTradeoffs: {
        speed: scenario.requirements.speed,
        accuracy: scenario.requirements.accuracy,
        stability: scenario.requirements.stability,
        efficiency: scenario.requirements.efficiency,
      },
      sourceScenario: scenario,
      createdAt: Date.now(),
    };
  }
}
