import type * as THREE from 'three';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

type ConsoleMethod = 'debug' | 'info' | 'warn' | 'error';

type LogEntry = {
  level: LogLevel;
  message: string;
  data: CoreValue;
  timestamp: number;
  time: string;
};

type LogStats = {
  total: number;
  byLevel: Record<LogLevel, number>;
};

type LogReportItem = {
  message: string;
  timestamp: number;
  data: CoreValue;
};

type FaceLike = {
  mesh?: { name?: string };
  faceIndex?: number;
  point?: CoreValue;
  distance?: number;
};

type SelectionChangeLike = {
  selectedCount?: number;
  mode?: CoreValue;
  canUndo?: boolean;
  canRedo?: boolean;
};

type MeshValidationLike = {
  isValid?: boolean;
  faceCount?: number;
  geometryType?: string;
  warnings?: CoreValue[];
};

type PerformanceMonitor = {
  name: string;
  startTime: number;
  end: (context?: Record<string, CoreValue>) => number;
  checkpoint: (checkpoint: string, context?: Record<string, CoreValue>) => void;
};

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const LOG_CONSOLE_METHOD: Record<LogLevel, ConsoleMethod> = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

function isLogLevel(value: string): value is LogLevel {
  return value in LOG_LEVELS;
}

export class DebugLogger {
  enabled: boolean;
  logs: LogEntry[];
  maxLogs: number;
  startTime: number;
  levels: Record<LogLevel, number>;
  currentLevel: number;

  constructor(enabled = false) {
    this.enabled = enabled;
    this.logs = [];
    this.maxLogs = 1000;
    this.startTime = performance.now();
    this.levels = LOG_LEVELS;
    this.currentLevel = this.levels.INFO;
  }

  enable() {
    this.enabled = true;
    this.log('DEBUG', 'Debug logging enabled');
  }

  disable() {
    this.enabled = false;
  }

  setLevel(level: string) {
    if (isLogLevel(level)) {
      this.currentLevel = this.levels[level];
    }
  }

  log(level: LogLevel, message: string, data: CoreValue = null) {
    if (!this.enabled || this.levels[level] < this.currentLevel) {
      return;
    }

    const timestamp = performance.now() - this.startTime;
    const logEntry: LogEntry = {
      level,
      message,
      data,
      timestamp: Math.round(timestamp * 100) / 100,
      time: new Date().toISOString(),
    };

    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    const consoleMethod = LOG_CONSOLE_METHOD[level];
    const prefix = `[FacePicker ${level}] ${timestamp.toFixed(2)}ms:`;
    if (data !== null && data !== undefined) {
      console[consoleMethod](prefix, message, data);
    } else {
      console[consoleMethod](prefix, message);
    }
  }

  debug(message: string, data: CoreValue = null) {
    this.log('DEBUG', message, data);
  }

  info(message: string, data: CoreValue = null) {
    this.log('INFO', message, data);
  }

  warn(message: string, data: CoreValue = null) {
    this.log('WARN', message, data);
  }

  error(message: string, data: CoreValue = null) {
    this.log('ERROR', message, data);
  }

  logPerformance(operation: string, duration: number, context: Record<string, CoreValue> = {}) {
    this.debug(`Performance: ${operation}`, {
      duration: `${duration.toFixed(2)}ms`,
      ...context,
    });
  }

  logFacePickingEvent(event: string, faceInfo: FaceLike | null | undefined) {
    this.info(`FacePicking: ${event}`, {
      mesh: faceInfo?.mesh?.name || 'Unknown',
      faceIndex: faceInfo?.faceIndex,
      position: faceInfo?.point,
      distance: faceInfo?.distance,
    });
  }

  logSelectionChange(action: string, selectionInfo: SelectionChangeLike) {
    this.info(`Selection: ${action}`, {
      selectedCount: selectionInfo.selectedCount,
      mode: selectionInfo.mode,
      canUndo: selectionInfo.canUndo,
      canRedo: selectionInfo.canRedo,
    });
  }

  logError(context: string, error: Error, additionalInfo: Record<string, CoreValue> = {}) {
    this.error(`Error [${context}]: ${error.message}`, {
      stack: error.stack,
      ...additionalInfo,
    });
  }

  logMeshValidation(mesh: THREE.Mesh, validationResult: MeshValidationLike) {
    this.debug('Mesh validation', {
      name: mesh.name || 'Unnamed',
      isValid: validationResult.isValid,
      faceCount: validationResult.faceCount,
      geometryType: validationResult.geometryType,
      warnings: validationResult.warnings,
    });
  }

  getLogStats(): LogStats {
    const byLevel: Record<LogLevel, number> = {
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
    };

    this.logs.forEach((log) => {
      byLevel[log.level] += 1;
    });

    return {
      total: this.logs.length,
      byLevel,
    };
  }

  getRecentLogs(count = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((log) => log.level === level);
  }

  searchLogs(query: string): LogEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.logs.filter((log) => {
      const inMessage = log.message.toLowerCase().includes(lowerQuery);
      const inData =
        log.data !== null &&
        log.data !== undefined &&
        JSON.stringify(log.data).toLowerCase().includes(lowerQuery);
      return inMessage || inData;
    });
  }

  clearLogs() {
    this.logs = [];
    this.info('Logs cleared');
  }

  exportLogs() {
    return JSON.stringify(
      {
        exported: new Date().toISOString(),
        stats: this.getLogStats(),
        logs: this.logs,
      },
      null,
      2
    );
  }

  generateDebugReport() {
    const stats = this.getLogStats();
    const recentErrors = this.getLogsByLevel('ERROR').slice(-10);
    const recentWarnings = this.getLogsByLevel('WARN').slice(-10);

    const mapReportItems = (items: LogEntry[]): LogReportItem[] =>
      items.map((log) => ({
        message: log.message,
        timestamp: log.timestamp,
        data: log.data,
      }));

    return {
      summary: {
        enabled: this.enabled,
        level: (Object.keys(this.levels) as LogLevel[]).find(
          (key) => this.levels[key] === this.currentLevel
        ),
        uptime: Math.round((performance.now() - this.startTime) / 1000),
        totalLogs: stats.total,
      },
      stats,
      recentErrors: mapReportItems(recentErrors),
      recentWarnings: mapReportItems(recentWarnings),
    };
  }

  createPerformanceMonitor(name: string): PerformanceMonitor {
    const startTime = performance.now();

    return {
      name,
      startTime,
      end: (context: Record<string, CoreValue> = {}) => {
        const duration = performance.now() - startTime;
        this.logPerformance(name, duration, context);
        return duration;
      },
      checkpoint: (checkpoint: string, context: Record<string, CoreValue> = {}) => {
        const duration = performance.now() - startTime;
        this.debug(`${name} - ${checkpoint}`, {
          duration: `${duration.toFixed(2)}ms`,
          ...context,
        });
      },
    };
  }
}

export const debugLogger = new DebugLogger();

if (process.env.NODE_ENV === 'development') {
  debugLogger.enable();
  debugLogger.setLevel('DEBUG');
}
