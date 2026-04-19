import { Brain, GitBranch, SlidersHorizontal } from 'lucide-react';
import { DesignedAlgorithmReport } from '../types';

interface AlgorithmDesignPanelProps {
  report: DesignedAlgorithmReport;
  isDarkMode: boolean;
}

export function AlgorithmDesignPanel({
  report,
  isDarkMode,
}: AlgorithmDesignPanelProps) {
  const sectionCard = isDarkMode
    ? 'bg-white/5 border-white/5'
    : 'bg-white/40 border-slate-100';
  const mutedText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const codeBg = isDarkMode ? 'bg-black/30' : 'bg-slate-100/70';

  return (
    <section className={`p-5 rounded-3xl border space-y-5 ${sectionCard}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-500" />
            <h4 className="font-bold text-sm text-indigo-500">
              {report.algorithmName}
            </h4>
          </div>
          <p className={`text-[10px] leading-relaxed ${mutedText}`}>
            {report.summary}
          </p>
        </div>
        <div className="text-right text-[10px]">
          <div className="font-bold uppercase text-slate-400">Template</div>
          <div className="font-mono text-indigo-500">{report.templateId}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[10px]">
        <div className={`rounded-2xl border p-3 ${sectionCard}`}>
          <div className="font-bold uppercase text-slate-400">速度目标</div>
          <div className="mt-1 text-sm font-mono">
            {Math.round(report.expectedTradeoffs.speed * 100)}%
          </div>
        </div>
        <div className={`rounded-2xl border p-3 ${sectionCard}`}>
          <div className="font-bold uppercase text-slate-400">精度目标</div>
          <div className="mt-1 text-sm font-mono">
            {Math.round(report.expectedTradeoffs.accuracy * 100)}%
          </div>
        </div>
        <div className={`rounded-2xl border p-3 ${sectionCard}`}>
          <div className="font-bold uppercase text-slate-400">平稳性目标</div>
          <div className="mt-1 text-sm font-mono">
            {Math.round(report.expectedTradeoffs.stability * 100)}%
          </div>
        </div>
        <div className={`rounded-2xl border p-3 ${sectionCard}`}>
          <div className="font-bold uppercase text-slate-400">效率目标</div>
          <div className="mt-1 text-sm font-mono">
            {Math.round(report.expectedTradeoffs.efficiency * 100)}%
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            算法结构
          </span>
        </div>
        <div className="space-y-2">
          {report.structure.stages.map((stage, index) => (
            <div
              key={stage.id}
              className={`rounded-2xl border p-3 space-y-2 ${sectionCard}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold text-indigo-500">
                    Stage {index + 1}
                  </div>
                  <div className="text-xs font-bold">{stage.name}</div>
                </div>
                <div className="text-right text-[10px]">
                  <div className="font-bold uppercase text-slate-400">
                    Controller
                  </div>
                  <div className="font-mono">{stage.controllerType}</div>
                </div>
              </div>
              <p className={`text-[10px] leading-relaxed ${mutedText}`}>
                目标: {stage.objectives.join(' / ')}
              </p>
              <p className={`text-[10px] leading-relaxed ${mutedText}`}>
                切换条件: {stage.transitionCondition}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            初始参数与范围
          </span>
        </div>
        <div className={`rounded-2xl border p-3 space-y-2 ${codeBg}`}>
          {Object.entries(report.initialParameters).map(([name, value]) => {
            const bounds = report.parameterBounds[name];
            const isOptimizable = report.optimizableParameters.includes(name);

            return (
              <div
                key={name}
                className="grid grid-cols-[1fr_auto] gap-3 items-center text-[10px]"
              >
                <div>
                  <div className="font-mono font-bold">{name}</div>
                  <div className={mutedText}>
                    {bounds
                      ? `范围 ${bounds.min.toFixed(3)} - ${bounds.max.toFixed(3)}`
                      : '当前未定义参数边界'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-indigo-500">
                    {value.toFixed(3)}
                  </div>
                  <div className={mutedText}>
                    {isOptimizable ? '可优化' : '固定'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          设计说明
        </span>
        <p className={`text-[10px] leading-relaxed ${mutedText}`}>
          {report.designRationale}
        </p>
      </div>
    </section>
  );
}
