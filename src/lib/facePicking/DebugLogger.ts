/**
 * 面拾取调试和日志工具
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface LogEntry {
  level: LogLevel
  message: string
  data: unknown
  timestamp: number
  time: string
}

export interface PerformanceMonitor {
  name: string
  startTime: number
  end: (context?: Record<string, unknown>) => number
  checkpoint: (checkpoint: string, context?: Record<string, unknown>) => void
}

export class DebugLogger {
  enabled: boolean
  logs: LogEntry[]
  maxLogs: number
  startTime: number
  levels: Record<LogLevel, number>
  currentLevel: number

  constructor(enabled: boolean = false) {
    this.enabled = enabled
    this.logs = []
    this.maxLogs = 1000
    this.startTime = performance.now()
    
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    }
    
    this.currentLevel = this.levels.INFO
  }
  
  enable(): void {
    this.enabled = true
    this.log('DEBUG', '调试模式已启用')
  }
  
  disable(): void {
    this.enabled = false
  }
  
  setLevel(level: LogLevel): void {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level]
    }
  }
  
  log(level: LogLevel, message: string, data: unknown = null): void {
    if (!this.enabled || this.levels[level] < this.currentLevel) {
      return
    }
    
    const timestamp = performance.now() - this.startTime
    const logEntry: LogEntry = {
      level,
      message,
      data,
      timestamp: Math.round(timestamp * 100) / 100,
      time: new Date().toISOString()
    }
    
    this.logs.push(logEntry)
    
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
    
    const consoleMethod = level.toLowerCase() as 'debug' | 'info' | 'warn' | 'error'
    const prefix = `[FacePicker ${level}] ${timestamp.toFixed(2)}ms:`
    if (data) {
      console[consoleMethod](prefix, message, data)
    } else {
      console[consoleMethod](prefix, message)
    }
  }
  
  debug(message: string, data?: unknown): void {
    this.log('DEBUG', message, data)
  }
  
  info(message: string, data?: unknown): void {
    this.log('INFO', message, data)
  }
  
  warn(message: string, data?: unknown): void {
    this.log('WARN', message, data)
  }
  
  error(message: string, data?: unknown): void {
    this.log('ERROR', message, data)
  }
  
  logPerformance(operation: string, duration: number, context: Record<string, unknown> = {}): void {
    this.debug(`性能: ${operation}`, {
      duration: `${duration.toFixed(2)}ms`,
      ...context
    })
  }
  
  logFacePickingEvent(event: string, faceInfo: { mesh?: { name?: string }; faceIndex?: number; point?: unknown; distance?: number } | null): void {
    this.info(`面拾取事件: ${event}`, {
      mesh: faceInfo?.mesh?.name || 'Unknown',
      faceIndex: faceInfo?.faceIndex,
      position: faceInfo?.point,
      distance: faceInfo?.distance
    })
  }
  
  logSelectionChange(action: string, selectionInfo: { selectedCount?: number; mode?: string; canUndo?: boolean; canRedo?: boolean }): void {
    this.info(`选择变化: ${action}`, selectionInfo)
  }
  
  logError(context: string, error: Error, additionalInfo: Record<string, unknown> = {}): void {
    this.error(`错误 [${context}]: ${error.message}`, {
      stack: error.stack,
      ...additionalInfo
    })
  }
  
  getLogStats(): { total: number; byLevel: Record<string, number> } {
    const stats = {
      total: this.logs.length,
      byLevel: {} as Record<string, number>
    }
    
    Object.keys(this.levels).forEach(level => {
      stats.byLevel[level] = this.logs.filter(log => log.level === level).length
    })
    
    return stats
  }
  
  getRecentLogs(count: number = 50): LogEntry[] {
    return this.logs.slice(-count)
  }
  
  clearLogs(): void {
    this.logs = []
    this.info('日志已清除')
  }
  
  createPerformanceMonitor(name: string): PerformanceMonitor {
    const startTime = performance.now()
    
    return {
      name,
      startTime,
      end: (context: Record<string, unknown> = {}) => {
        const duration = performance.now() - startTime
        this.logPerformance(name, duration, context)
        return duration
      },
      checkpoint: (checkpoint: string, context: Record<string, unknown> = {}) => {
        const duration = performance.now() - startTime
        this.debug(`${name} - ${checkpoint}`, {
          duration: `${duration.toFixed(2)}ms`,
          ...context
        })
      }
    }
  }
}

export const debugLogger = new DebugLogger()
