export type AutonomyPhase =
  | 'idle'
  | 'designing'
  | 'design_completed'
  | 'executing'
  | 'optimizing'
  | 'evaluating'
  | 'completed'
  | 'failed';

export function getAutonomyStatusMessage(phase: AutonomyPhase): string {
  switch (phase) {
    case 'idle':
      return '自治流程待机中';
    case 'designing':
      return '正在分析任务并设计控制器';
    case 'design_completed':
      return '算法设计已完成，等待参数优化或评估';
    case 'executing':
      return '正在执行初始自主控制方案';
    case 'optimizing':
      return '正在根据日志和指标优化参数';
    case 'evaluating':
      return '正在评估优化前后算法并生成定量对比结果';
    case 'completed':
      return '自治流程已完成';
    case 'failed':
      return '自治流程执行失败';
  }
}
