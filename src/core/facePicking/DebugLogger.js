/**
 * 面拾取调试和日志工具
 * 提供详细的调试信息和性能监控
 */

export class DebugLogger {
  constructor(enabled = false) {
    this.enabled = enabled
    this.logs = []
    this.maxLogs = 1000
    this.startTime = performance.now()
    
    // 日志级别
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    }
    
    this.currentLevel = this.levels.INFO
  }
  
  /**
   * 启用调试模式
   */
  enable() {
    this.enabled = true
    this.log('DEBUG', '调试模式已启用')
  }
  
  /**
   * 禁用调试模式
   */
  disable() {
    this.enabled = false
  }
  
  /**
   * 设置日志级别
   * @param {string} level - 日志级别 (DEBUG, INFO, WARN, ERROR)
   */
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level]
    }
  }
  
  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 消息
   * @param {Object} data - 附加数据
   */
  log(level, message, data = null) {
    if (!this.enabled || this.levels[level] < this.currentLevel) {
      return
    }
    
    const timestamp = performance.now() - this.startTime
    const logEntry = {
      level,
      message,
      data,
      timestamp: Math.round(timestamp * 100) / 100,
      time: new Date().toISOString()
    }
    
    this.logs.push(logEntry)
    
    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
    
    // 输出到控制台
    const consoleMethod = level.toLowerCase()
    if (console[consoleMethod]) {
      const prefix = `[FacePicker ${level}] ${timestamp.toFixed(2)}ms:`
      if (data) {
        console[consoleMethod](prefix, message, data)
      } else {
        console[consoleMethod](prefix, message)
      }
    }
  }
  
  /**
   * 调试级别日志
   */
  debug(message, data) {
    this.log('DEBUG', message, data)
  }
  
  /**
   * 信息级别日志
   */
  info(message, data) {
    this.log('INFO', message, data)
  }
  
  /**
   * 警告级别日志
   */
  warn(message, data) {
    this.log('WARN', message, data)
  }
  
  /**
   * 错误级别日志
   */
  error(message, data) {
    this.log('ERROR', message, data)
  }
  
  /**
   * 记录性能数据
   * @param {string} operation - 操作名称
   * @param {number} duration - 持续时间
   * @param {Object} context - 上下文信息
   */
  logPerformance(operation, duration, context = {}) {
    this.debug(`性能: ${operation}`, {
      duration: `${duration.toFixed(2)}ms`,
      ...context
    })
  }
  
  /**
   * 记录面拾取事件
   * @param {string} event - 事件类型
   * @param {Object} faceInfo - 面信息
   */
  logFacePickingEvent(event, faceInfo) {
    this.info(`面拾取事件: ${event}`, {
      mesh: faceInfo?.mesh?.name || 'Unknown',
      faceIndex: faceInfo?.faceIndex,
      position: faceInfo?.point,
      distance: faceInfo?.distance
    })
  }
  
  /**
   * 记录选择状态变化
   * @param {string} action - 动作类型
   * @param {Object} selectionInfo - 选择信息
   */
  logSelectionChange(action, selectionInfo) {
    this.info(`选择变化: ${action}`, {
      selectedCount: selectionInfo.selectedCount,
      mode: selectionInfo.mode,
      canUndo: selectionInfo.canUndo,
      canRedo: selectionInfo.canRedo
    })
  }
  
  /**
   * 记录错误信息
   * @param {string} context - 错误上下文
   * @param {Error} error - 错误对象
   * @param {Object} additionalInfo - 附加信息
   */
  logError(context, error, additionalInfo = {}) {
    this.error(`错误 [${context}]: ${error.message}`, {
      stack: error.stack,
      ...additionalInfo
    })
  }
  
  /**
   * 记录网格验证结果
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {Object} validationResult - 验证结果
   */
  logMeshValidation(mesh, validationResult) {
    this.debug('网格验证', {
      name: mesh.name || 'Unnamed',
      isValid: validationResult.isValid,
      faceCount: validationResult.faceCount,
      geometryType: validationResult.geometryType,
      warnings: validationResult.warnings
    })
  }
  
  /**
   * 获取日志统计
   * @returns {Object} 统计信息
   */
  getLogStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {}
    }
    
    Object.keys(this.levels).forEach(level => {
      stats.byLevel[level] = this.logs.filter(log => log.level === level).length
    })
    
    return stats
  }
  
  /**
   * 获取最近的日志
   * @param {number} count - 数量
   * @returns {Array} 日志数组
   */
  getRecentLogs(count = 50) {
    return this.logs.slice(-count)
  }
  
  /**
   * 按级别过滤日志
   * @param {string} level - 日志级别
   * @returns {Array} 过滤后的日志
   */
  getLogsByLevel(level) {
    return this.logs.filter(log => log.level === level)
  }
  
  /**
   * 搜索日志
   * @param {string} query - 搜索关键词
   * @returns {Array} 匹配的日志
   */
  searchLogs(query) {
    const lowerQuery = query.toLowerCase()
    return this.logs.filter(log => 
      log.message.toLowerCase().includes(lowerQuery) ||
      (log.data && JSON.stringify(log.data).toLowerCase().includes(lowerQuery))
    )
  }
  
  /**
   * 清除所有日志
   */
  clearLogs() {
    this.logs = []
    this.info('日志已清除')
  }
  
  /**
   * 导出日志为JSON
   * @returns {string} JSON字符串
   */
  exportLogs() {
    return JSON.stringify({
      exported: new Date().toISOString(),
      stats: this.getLogStats(),
      logs: this.logs
    }, null, 2)
  }
  
  /**
   * 生成调试报告
   * @returns {Object} 调试报告
   */
  generateDebugReport() {
    const stats = this.getLogStats()
    const recentErrors = this.getLogsByLevel('ERROR').slice(-10)
    const recentWarnings = this.getLogsByLevel('WARN').slice(-10)
    
    return {
      summary: {
        enabled: this.enabled,
        level: Object.keys(this.levels).find(key => this.levels[key] === this.currentLevel),
        uptime: Math.round((performance.now() - this.startTime) / 1000),
        totalLogs: stats.total
      },
      stats,
      recentErrors: recentErrors.map(log => ({
        message: log.message,
        timestamp: log.timestamp,
        data: log.data
      })),
      recentWarnings: recentWarnings.map(log => ({
        message: log.message,
        timestamp: log.timestamp,
        data: log.data
      }))
    }
  }
  
  /**
   * 创建性能监控器
   * @param {string} name - 监控器名称
   * @returns {Object} 监控器对象
   */
  createPerformanceMonitor(name) {
    const startTime = performance.now()
    
    return {
      name,
      startTime,
      
      /**
       * 结束监控并记录结果
       * @param {Object} context - 上下文信息
       */
      end: (context = {}) => {
        const duration = performance.now() - startTime
        this.logPerformance(name, duration, context)
        return duration
      },
      
      /**
       * 记录中间点
       * @param {string} checkpoint - 检查点名称
       * @param {Object} context - 上下文信息
       */
      checkpoint: (checkpoint, context = {}) => {
        const duration = performance.now() - startTime
        this.debug(`${name} - ${checkpoint}`, {
          duration: `${duration.toFixed(2)}ms`,
          ...context
        })
      }
    }
  }
}

// 创建全局调试器实例
export const debugLogger = new DebugLogger()

// 在开发环境中自动启用调试
if (process.env.NODE_ENV === 'development') {
  debugLogger.enable()
  debugLogger.setLevel('DEBUG')
}