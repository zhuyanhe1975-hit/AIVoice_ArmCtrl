import { AutonomyLog, SystemLog } from './types';

class LogManager {
  private static instance: LogManager;
  private logs: AutonomyLog[] = [];
  private listeners: ((logs: AutonomyLog[]) => void)[] = [];
  private maxLogs = 1000;

  private constructor() {}

  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  public event(
    level: SystemLog['level'],
    payload: Omit<AutonomyLog, 'id' | 'timestamp' | 'level'>
  ) {
    const log: AutonomyLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      level,
      ...payload,
    };

    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this.notify();
    
    // Also log to console for developer convenience
    const consoleMsg = `[${log.source}] ${log.message}`;
    if (level === 'error') console.error(consoleMsg, log.data || '');
    else if (level === 'warn') console.warn(consoleMsg, log.data || '');
    else console.log(consoleMsg, log.data || '');
  }

  public addLog(level: SystemLog['level'], source: string, message: string, data?: any) {
    this.event(level, {
      source,
      message,
      data,
      eventType: 'system.log'
    });
  }

  public info(source: string, message: string, data?: any) {
    this.addLog('info', source, message, data);
  }

  public warn(source: string, message: string, data?: any) {
    this.addLog('warn', source, message, data);
  }

  public error(source: string, message: string, data?: any) {
    this.addLog('error', source, message, data);
  }

  public success(source: string, message: string, data?: any) {
    this.addLog('success', source, message, data);
  }

  public getLogs(): AutonomyLog[] {
    return [...this.logs];
  }

  public clear() {
    this.logs = [];
    this.notify();
  }

  public subscribe(listener: (logs: AutonomyLog[]) => void) {
    this.listeners.push(listener);
    listener(this.getLogs());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    const currentLogs = this.getLogs();
    this.listeners.forEach(listener => listener(currentLogs));
  }
}

export const logger = LogManager.getInstance();
