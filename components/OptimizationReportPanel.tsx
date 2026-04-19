import { Activity, Gauge, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { OptimizationReport } from '../types';

interface OptimizationReportPanelProps {
  report: OptimizationReport;
  isDarkMode: boolean;
}

export function OptimizationReportPanel({
  report,
  isDarkMode,
}: OptimizationReportPanelProps) {
  const cardBg = isDarkMode
    ? 'bg-white/5 border-white/5'
    : 'bg-white/40 border-slate-100';
  const mutedText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const maxScore = report.convergenceHistory.reduce(
    (best, point) => Math.max(best, point.bestScore),
    report.bestScore || 1
  );

  return (
    <section className={`p-5 rounded-3xl border space-y-5 ${cardBg}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            <h4 className="font-bold text-sm text-indigo-500">参数优化结果</h4>
          </div>
          <p className={`mt-1 text-[10px] leading-relaxed ${mutedText}`}>
            已完成 {report.completedTrials} / {report.totalTrials} 次 trial，最优分数为{' '}
            {report.bestScore.toFixed(2)}。
          </p>
        </div>
        <div className="text-right text-[10px]">
          <div className="font-bold uppercase text-slate-400">耗时</div>
          <div className="font-mono text-indigo-500">
            {(report.totalDurationMs / 1000).toFixed(2)}s
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-[10px]">
        <div className={`rounded-2xl border p-3 ${cardBg}`}>
          <div className="font-bold uppercase text-slate-400">Best Score</div>
          <div className="mt-1 text-sm font-mono">{report.bestScore.toFixed(2)}</div>
        </div>
        <div className={`rounded-2xl border p-3 ${cardBg}`}>
          <div className="font-bold uppercase text-slate-400">Batch Size</div>
          <div className="mt-1 text-sm font-mono">{report.budget.batchSize}</div>
        </div>
        <div className={`rounded-2xl border p-3 ${cardBg}`}>
          <div className="font-bold uppercase text-slate-400">结束原因</div>
          <div className="mt-1 text-sm font-mono">{report.finishedReason}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            参数前后对比
          </span>
        </div>
        <div className="space-y-2">
          {Object.entries(report.optimizedParameters).map(([name, optimizedValue]) => {
            const baselineValue = report.baselineParameters[name];
            const delta =
              typeof baselineValue === 'number' ? optimizedValue - baselineValue : 0;

            return (
              <div
                key={name}
                className={`rounded-2xl border p-3 grid grid-cols-[1fr_auto_auto] gap-3 items-center text-[10px] ${cardBg}`}
              >
                <div>
                  <div className="font-mono font-bold">{name}</div>
                  <div className={mutedText}>优化前后参数对比</div>
                </div>
                <div className="text-right">
                  <div className={mutedText}>Before</div>
                  <div className="font-mono">{baselineValue?.toFixed?.(3) ?? '-'}</div>
                </div>
                <div className="text-right">
                  <div className="text-indigo-500">After</div>
                  <div className="font-mono font-bold text-indigo-500">
                    {optimizedValue.toFixed(3)}
                  </div>
                  <div className={delta >= 0 ? 'text-emerald-500' : 'text-amber-500'}>
                    {delta >= 0 ? '+' : ''}
                    {delta.toFixed(3)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            收敛过程
          </span>
        </div>
        <div className="space-y-2">
          {report.convergenceHistory.map((point) => {
            const width = maxScore > 0 ? Math.max(8, (point.bestScore / maxScore) * 100) : 8;
            return (
              <div key={point.trial} className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className={mutedText}>Trial {point.trial}</span>
                  <span className="font-mono text-indigo-500">
                    latest {point.latestScore.toFixed(2)} / best {point.bestScore.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-200/70 dark:bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.min(width, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {report.bestTrial && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-indigo-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              最优 Trial
            </span>
          </div>
          <div className={`rounded-2xl border p-3 text-[10px] space-y-2 ${cardBg}`}>
            <div className="flex justify-between">
              <span className={mutedText}>Trial ID</span>
              <span className="font-mono">{report.bestTrial.trialId}</span>
            </div>
            <div className="flex justify-between">
              <span className={mutedText}>Iteration</span>
              <span className="font-mono">{report.bestTrial.iteration}</span>
            </div>
            <div className="flex justify-between">
              <span className={mutedText}>Score</span>
              <span className="font-mono text-indigo-500">
                {report.bestTrial.score.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
