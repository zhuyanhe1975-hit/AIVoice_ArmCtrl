/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { Activity, Brain, Code, Cpu, History, Loader2, Sparkles, Target, TrendingUp, X } from 'lucide-react';
import { useState } from 'react';
import { AlgorithmEvaluationReport, ControlAlgorithm, DesignedAlgorithmReport, OptimizationBudget, OptimizationLog, OptimizationReport, TaskScenario } from '../types';
import { AutonomyPhase } from '../domain/autonomy/autonomySession';
import { AlgorithmDesignPanel } from './AlgorithmDesignPanel';
import { OptimizationReportPanel } from './OptimizationReportPanel';
import { EvaluationReportPanel } from './EvaluationReportPanel';

interface UnifiedSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onDesign: (scenario: TaskScenario) => void;
  onOptimize: (algorithm: ControlAlgorithm, budget: OptimizationBudget) => void;
  onRunAutonomy: (scenario: TaskScenario, budget: OptimizationBudget) => void;
  isLoading: boolean;
  isOptimizing: boolean;
  autonomyStatus: string;
  autonomyPhase: AutonomyPhase;
  autonomyError: string | null;
  currentAlgorithm: ControlAlgorithm | null;
  designReport: DesignedAlgorithmReport | null;
  optimizationReport: OptimizationReport | null;
  evaluationReport: AlgorithmEvaluationReport | null;
  optimizationLogs: OptimizationLog[];
  optimizationBudget: OptimizationBudget;
  onOptimizationBudgetChange: (budget: OptimizationBudget) => void;
  isDarkMode: boolean;
}

/**
 * UnifiedSidebar
 * The main control panel for the Robot Control Algorithm Designer.
 */
export function UnifiedSidebar({ 
  isOpen, 
  onClose, 
  onDesign, 
  onOptimize,
  onRunAutonomy,
  isLoading, 
  isOptimizing,
  autonomyStatus,
  autonomyPhase,
  autonomyError,
  currentAlgorithm,
  designReport,
  optimizationReport,
  evaluationReport,
  optimizationLogs,
  optimizationBudget,
  onOptimizationBudgetChange,
  isDarkMode,
}: UnifiedSidebarProps) {
  const [scenario, setScenario] = useState('设计一个高精度的搬运任务：机械臂需要从起始点（A）精确抓取一个小型立方体，将其平稳搬运至目标托盘（B）中心，并缓慢释放。要求在搬运过程中最大限度减少末端执行器的震荡，并优化关节能量消耗。');
  const [requirements, setRequirements] = useState({
    speed: 0.5,
    accuracy: 0.8,
    stability: 0.7,
    efficiency: 0.4
  });
  const [showCode, setShowCode] = useState(false);

  if (!isOpen) return null;

  const panelBase = isDarkMode ? "bg-slate-900/80 border-white/10 text-slate-100 shadow-slate-950/40" : "bg-white/70 border-white/80 text-slate-800 shadow-slate-200/40";
  const headerBorder = isDarkMode ? "border-white/5 bg-white/5" : "border-slate-100 bg-white/40";
  const inputBg = isDarkMode ? "bg-slate-950 border-white/5 text-slate-100 focus:ring-indigo-400/20 shadow-none" : "bg-white/50 border-slate-200 text-slate-800 focus:ring-indigo-500/5 shadow-inner";
  const cardBg = isDarkMode ? "bg-white/5 border-white/5" : "bg-white/40 border-slate-100";
  const handleBudgetFieldChange = (field: keyof OptimizationBudget, value: string) => {
    const parsed = Number.parseInt(value, 10);
    const safeValue = Number.isFinite(parsed) ? parsed : optimizationBudget[field];
    onOptimizationBudgetChange({
      ...optimizationBudget,
      [field]: safeValue,
    });
  };

  return (
    <div className={`absolute top-4 bottom-4 left-4 right-4 min-[660px]:left-auto min-[660px]:top-10 min-[660px]:right-10 min-[660px]:bottom-10 min-[660px]:w-96 glass-panel rounded-[2.5rem] flex flex-col z-40 overflow-hidden shadow-2xl transition-all border border-white/20 ${panelBase}`}>
      
      {/* Header */}
      <div className={`p-8 border-b flex justify-between items-center ${headerBorder}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500 rounded-xl text-white">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-none">智能控制设计</h2>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Robot Control AI</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-200/20 rounded-full transition-colors text-slate-400">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pt-4 pb-6 space-y-6">
        
        {/* Task Scenario */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Target className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider">任务场景描述</h3>
          </div>
          <textarea 
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            className={`w-full rounded-2xl px-4 py-3 text-sm focus:outline-none transition-all resize-none h-24 border ${inputBg}`}
            placeholder="描述机器人需要完成的任务及环境..."
          />
        </section>

        {/* Performance Requirements */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Activity className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider">性能需求分析</h3>
          </div>
          <div className="space-y-3 px-1">
            {Object.entries(requirements).map(([key, value]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400">
                  <span>
                    {key === 'speed'
                      ? '响应速度'
                      : key === 'accuracy'
                        ? '跟踪精度'
                        : key === 'stability'
                          ? '平稳性'
                          : '能量效率'}
                  </span>
                  <span>{Math.round(value * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.1" value={value}
                  onChange={(e) => setRequirements({...requirements, [key]: parseFloat(e.target.value)})}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:bg-slate-700"
                />
              </div>
            ))}
          </div>
        </section>

        <section className={`p-4 rounded-2xl border space-y-3 ${cardBg}`}>
          <div className="flex items-center gap-2 px-1">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider">优化预算</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[10px]">
            <label className="space-y-1">
              <span className="block font-bold uppercase text-slate-400">Trials</span>
              <input
                type="number"
                min="1"
                max="1000"
                step="1"
                value={optimizationBudget.maxTrials}
                onChange={(e) => handleBudgetFieldChange('maxTrials', e.target.value)}
                className={`w-full rounded-xl px-3 py-2 text-xs border focus:outline-none ${inputBg}`}
              />
            </label>
            <label className="space-y-1">
              <span className="block font-bold uppercase text-slate-400">Batch</span>
              <input
                type="number"
                min="1"
                max={optimizationBudget.maxTrials}
                step="1"
                value={optimizationBudget.batchSize}
                onChange={(e) => handleBudgetFieldChange('batchSize', e.target.value)}
                className={`w-full rounded-xl px-3 py-2 text-xs border focus:outline-none ${inputBg}`}
              />
            </label>
            <label className="space-y-1">
              <span className="block font-bold uppercase text-slate-400">Minutes</span>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                value={Math.max(1, Math.round(optimizationBudget.maxWallClockMs / 60000))}
                onChange={(e) =>
                  handleBudgetFieldChange(
                    'maxWallClockMs',
                    String(Math.max(1, Number.parseInt(e.target.value, 10) || 1) * 60000)
                  )
                }
                className={`w-full rounded-xl px-3 py-2 text-xs border focus:outline-none ${inputBg}`}
              />
            </label>
          </div>
          <p className="text-[10px] leading-relaxed text-slate-400">
            增大 trials 会提升找到更优参数的概率，批量大小建议接近 worker 数。
          </p>
        </section>

        {/* Action Button */}
        <button 
          onClick={() => onDesign({ description: scenario, requirements })}
          disabled={isLoading || !scenario.trim()}
          className={`w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] ${
            isLoading 
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {isLoading ? '正在设计算法...' : '自主设计控制算法'}
        </button>

        <button 
          onClick={() => onRunAutonomy({ description: scenario, requirements }, optimizationBudget)}
          disabled={isLoading || isOptimizing || !scenario.trim()}
          className={`w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] ${
            isLoading || isOptimizing
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800' 
              : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900'
          }`}
        >
          {isLoading || isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {isLoading || isOptimizing ? '正在执行自主闭环...' : '一键自主运行'}
        </button>

        <section className={`p-4 rounded-2xl border space-y-2 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">自治会话</span>
            <span className="text-[10px] font-mono text-indigo-500">{autonomyPhase}</span>
          </div>
          <p className="text-xs leading-relaxed">{autonomyStatus}</p>
          {autonomyError && (
            <p className="text-[10px] text-red-500 leading-relaxed">{autonomyError}</p>
          )}
        </section>

        {/* Current Algorithm Display */}
        {designReport && (
          <AlgorithmDesignPanel
            report={designReport}
            isDarkMode={isDarkMode}
          />
        )}

        {optimizationReport && (
          <OptimizationReportPanel
            report={optimizationReport}
            isDarkMode={isDarkMode}
          />
        )}

        {evaluationReport && (
          <EvaluationReportPanel
            report={evaluationReport}
            isDarkMode={isDarkMode}
          />
        )}

        {currentAlgorithm && (
          <section className={`p-5 rounded-3xl border space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 ${cardBg}`}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-bold text-sm text-indigo-500">{currentAlgorithm.name}</h4>
                <p className="text-[10px] text-slate-400 mt-1">{currentAlgorithm.description}</p>
              </div>
              <button 
                onClick={() => setShowCode(!showCode)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400"
              >
                <Code className="w-4 h-4" />
              </button>
            </div>

            {showCode && (
              <div className={`p-3 rounded-xl font-mono text-[10px] overflow-x-auto ${isDarkMode ? 'bg-black/40' : 'bg-slate-100/50'}`}>
                <pre>{currentAlgorithm.code}</pre>
              </div>
            )}

            {currentAlgorithm.controllerBlueprint && (
              <div className="space-y-2 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-400 uppercase font-bold">模板</span>
                  <span className="font-mono text-indigo-500">{currentAlgorithm.controllerBlueprint.templateId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 uppercase font-bold">模式</span>
                  <span className="font-mono">{currentAlgorithm.controllerBlueprint.controllerMode}</span>
                </div>
              </div>
            )}

            {currentAlgorithm.performanceProfile && (
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <span>响应速度 {Math.round(currentAlgorithm.performanceProfile.speedWeight * 100)}%</span>
                <span>跟踪精度 {Math.round(currentAlgorithm.performanceProfile.accuracyWeight * 100)}%</span>
                <span>平稳性 {Math.round(currentAlgorithm.performanceProfile.stabilityWeight * 100)}%</span>
                <span>能量效率 {Math.round(currentAlgorithm.performanceProfile.energyWeight * 100)}%</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => onOptimize(currentAlgorithm, optimizationBudget)}
                disabled={isOptimizing}
                className="col-span-2 py-3 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                {isOptimizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
                {isOptimizing ? '正在优化参数...' : '智能优化参数'}
              </button>
            </div>

            {/* Metrics Display */}
            {currentAlgorithm.performanceMetrics.settlingTime !== undefined && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <span className="text-[8px] font-bold text-slate-400 uppercase">调节时间</span>
                  <p className="text-xs font-mono font-bold">{currentAlgorithm.performanceMetrics.settlingTime.toFixed(2)}s</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] font-bold text-slate-400 uppercase">稳态误差</span>
                  <p className="text-xs font-mono font-bold">{currentAlgorithm.performanceMetrics.steadyStateError?.toFixed(4)}</p>
                </div>
              </div>
            )}

            {currentAlgorithm.diagnostics && currentAlgorithm.diagnostics.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-indigo-500/10">
                <span className="text-[8px] font-bold text-slate-400 uppercase">自动诊断</span>
                {currentAlgorithm.diagnostics.map((diagnostic, idx) => (
                  <p key={idx} className="text-[10px] leading-relaxed text-slate-500">
                    {diagnostic}
                  </p>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Optimization History */}
        {optimizationLogs.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <History className="w-4 h-4 text-slate-400" />
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">优化对比与历史</h3>
            </div>
            
            {/* Comparison Card */}
            {optimizationLogs.length >= 1 && (
              <div className={`p-5 rounded-3xl border border-indigo-500/20 bg-indigo-500/5 space-y-4`}>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-bold">性能提升分析</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <span className="text-[8px] font-bold text-slate-400 uppercase">初始性能 (Iteration #1)</span>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">调节时间</span>
                        <span className="font-mono">{optimizationLogs[0].metrics.settlingTime?.toFixed(2)}s</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">稳态误差</span>
                        <span className="font-mono">{optimizationLogs[0].metrics.steadyStateError?.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <span className="text-[8px] font-bold text-indigo-500 uppercase">当前最优</span>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">调节时间</span>
                        <span className="font-mono font-bold text-indigo-500">{currentAlgorithm?.performanceMetrics.settlingTime?.toFixed(2)}s</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">稳态误差</span>
                        <span className="font-mono font-bold text-indigo-500">{currentAlgorithm?.performanceMetrics.steadyStateError?.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Improvement Badge */}
                {optimizationLogs.length > 1 && currentAlgorithm?.performanceMetrics.settlingTime && optimizationLogs[0].metrics.settlingTime && (
                  <div className="pt-2 border-t border-indigo-500/10">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-500">效率提升</span>
                      <span className="text-xs font-bold text-emerald-500">
                        +{Math.max(0, ((optimizationLogs[0].metrics.settlingTime - currentAlgorithm.performanceMetrics.settlingTime) / optimizationLogs[0].metrics.settlingTime * 100)).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {optimizationLogs.map((log, idx) => (
                <div key={idx} className={`p-3 rounded-xl border flex justify-between items-center ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-white/40 border-slate-100'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-indigo-500">#{log.iteration}</span>
                    <span className="text-[10px] font-mono text-slate-400">Score: {log.score.toFixed(1)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-white/5 rounded text-slate-500">
                      {log.metrics.settlingTime?.toFixed(2)}s
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
