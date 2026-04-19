import React, { useEffect, useState, useRef } from 'react';
import { Terminal, Trash2, ChevronDown, ChevronUp, Info, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';
import { logger } from '../LogManager';
import { AutonomyLog, SystemLog } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export const SystemLogs: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const [logs, setLogs] = useState<AutonomyLog[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
  }, []);

  const getLevelIcon = (level: SystemLog['level']) => {
    switch (level) {
      case 'info': return <Info className="w-3 h-3 text-blue-500" />;
      case 'warn': return <AlertTriangle className="w-3 h-3 text-yellow-500" />;
      case 'error': return <XCircle className="w-3 h-3 text-red-500" />;
      case 'success': return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
    }
  };

  const getLevelClass = (level: SystemLog['level']) => {
    switch (level) {
      case 'info': return 'text-blue-600 dark:text-blue-400';
      case 'warn': return 'text-yellow-600 dark:text-yellow-400';
      case 'error': return 'text-red-600 dark:text-red-400';
      case 'success': return 'text-emerald-600 dark:text-emerald-400';
    }
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${isExpanded ? 'w-96' : 'w-48'}`}>
      <div className={`glass-panel rounded-2xl border border-white/20 overflow-hidden shadow-2xl ${isDarkMode ? 'bg-slate-900/80' : 'bg-white/80'}`}>
        {/* Header */}
        <div 
          className="px-4 py-2 flex items-center justify-between cursor-pointer border-b border-white/10"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-bold uppercase tracking-widest opacity-70">System Logs</span>
            <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 text-[10px] font-bold">
              {logs.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={(e) => { e.stopPropagation(); logger.clear(); }}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              title="Clear Logs"
            >
              <Trash2 className="w-3 h-3 opacity-50 hover:opacity-100" />
            </button>
            {isExpanded ? <ChevronDown className="w-4 h-4 opacity-50" /> : <ChevronUp className="w-4 h-4 opacity-50" />}
          </div>
        </div>

        {/* Log List */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: 300 }}
              exit={{ height: 0 }}
              className="overflow-y-auto font-mono text-[10px] p-2 flex flex-col gap-1"
              ref={scrollRef}
            >
              {logs.length === 0 ? (
                <div className="h-full flex items-center justify-center opacity-30 italic">
                  No logs yet...
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="group flex flex-col gap-0.5 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5">{getLevelIcon(log.level)}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5 gap-2">
                          <span className="font-bold opacity-50">[{log.source}]</span>
                          {log.eventType && (
                            <span className="opacity-40 truncate">{log.eventType}</span>
                          )}
                          <span className="opacity-30">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        {(log.stage || log.sessionId || log.trialId) && (
                          <p className="opacity-40 mb-0.5">
                            {[log.stage, log.sessionId, log.trialId].filter(Boolean).join(' | ')}
                          </p>
                        )}
                        <p className={`leading-relaxed ${getLevelClass(log.level)}`}>
                          {log.message}
                        </p>
                      </div>
                    </div>
                    {log.data && (
                      <pre className="mt-1 ml-5 p-1.5 rounded bg-black/20 overflow-x-auto opacity-60 group-hover:opacity-100 transition-opacity">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
