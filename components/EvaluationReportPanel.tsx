import { BarChart3, Clock3, GitCompareArrows, PlayCircle } from 'lucide-react';
import { AlgorithmEvaluationReport } from '../types';

interface EvaluationReportPanelProps {
  report: AlgorithmEvaluationReport;
  isDarkMode: boolean;
}

function formatImprovement(value: number): string {
  const rounded = Number.isFinite(value) ? value : 0;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}%`;
}

export function EvaluationReportPanel({
  report,
  isDarkMode,
}: EvaluationReportPanelProps) {
  const cardBg = isDarkMode
    ? 'bg-white/5 border-white/5'
    : 'bg-white/40 border-slate-100';
  const mutedText = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  const metricRows = [
    {
      label: '调节时间',
      key: 'settlingTime',
      baseline: report.baselineMetrics.settlingTime.mean,
      optimized: report.optimizedMetrics.settlingTime.mean,
    },
    {
      label: '稳态误差',
      key: 'steadyStateError',
      baseline: report.baselineMetrics.steadyStateError.mean,
      optimized: report.optimizedMetrics.steadyStateError.mean,
    },
    {
      label: '能耗',
      key: 'energyConsumption',
      baseline: report.baselineMetrics.energyConsumption.mean,
      optimized: report.optimizedMetrics.energyConsumption.mean,
    },
    {
      label: '超调',
      key: 'overshoot',
      baseline: report.baselineMetrics.overshoot.mean,
      optimized: report.optimizedMetrics.overshoot.mean,
    },
  ] as const;

  return (
    <section className={`p-5 rounded-3xl border space-y-5 ${cardBg}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-indigo-500" />
            <h4 className="font-bold text-sm text-indigo-500">算法评估结果</h4>
          </div>
          <p className={`mt-1 text-[10px] leading-relaxed ${mutedText}`}>
            基于 {report.sampleCount} 次 baseline/optimized 对比试验生成的定量评估结果。
          </p>
        </div>
        <div className="text-right text-[10px]">
          <div className="font-bold uppercase text-slate-400">报告时间</div>
          <div className="font-mono text-indigo-500">
            {new Date(report.generatedAt).toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            定量对比
          </span>
        </div>
        <div className="space-y-2">
          {metricRows.map((metric) => (
            <div
              key={metric.key}
              className={`rounded-2xl border p-3 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center text-[10px] ${cardBg}`}
            >
              <div>
                <div className="font-bold">{metric.label}</div>
                <div className={mutedText}>均值对比</div>
              </div>
              <div className="text-right">
                <div className={mutedText}>Baseline</div>
                <div className="font-mono">{metric.baseline.toFixed(3)}</div>
              </div>
              <div className="text-right">
                <div className="text-indigo-500">Optimized</div>
                <div className="font-mono text-indigo-500">
                  {metric.optimized.toFixed(3)}
                </div>
              </div>
              <div
                className={`text-right font-bold ${
                  report.improvements[metric.key] >= 0
                    ? 'text-emerald-500'
                    : 'text-amber-500'
                }`}
              >
                {formatImprovement(report.improvements[metric.key] ?? 0)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Clock3 className="w-4 h-4 text-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            动作阶段可视化
          </span>
        </div>
        <div className="space-y-2">
          {report.actionTimeline.map((stage, index) => (
            <div
              key={`${stage.name}-${index}`}
              className={`rounded-2xl border p-3 grid grid-cols-[auto_1fr_auto] gap-3 items-center text-[10px] ${cardBg}`}
            >
              <div className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold">
                {index + 1}
              </div>
              <div>
                <div className="font-bold">{stage.name}</div>
                <div className={mutedText}>{stage.objectives.join(' / ')}</div>
              </div>
              <div className="text-right">
                <div className={mutedText}>Duration</div>
                <div className="font-mono text-indigo-500">
                  {stage.duration.toFixed(1)}s
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className={`rounded-2xl border p-3 text-[10px] ${cardBg}`}>
          <div className="flex items-center gap-2 font-bold text-indigo-500">
            <PlayCircle className="w-4 h-4" />
            动作过程说明
          </div>
          <p className={`mt-2 leading-relaxed ${mutedText}`}>
            当前展示的是 pick-and-place 执行阶段时间线，可用于直观看到接近、对齐、抓取、搬运、放置和撤离的动作顺序。下一步可以在此基础上接入真实轨迹回放数据。
          </p>
        </div>
      </div>
    </section>
  );
}
