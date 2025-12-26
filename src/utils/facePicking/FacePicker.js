import * as THREE from 'three'
import { RaycastManager } from './RaycastManager.js'
import { SelectionManager } from './SelectionManager.js'
import { HighlightRenderer } from './HighlightRenderer.js'
import { EventHandler } from './EventHandler.js'
import { debugLogger } from './DebugLogger.js'

/**
 * 面拾取主控制器类
 * 负责协调射线投射、选择管理和事件处理
 */
export class FacePicker {
  constructor(scene, camera, renderer, domElement) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.domElement = domElement
    
    // 初始化管理器
    this.raycastManager = new RaycastManager(camera)
    this.selectionManager = new SelectionManager()
    this.highlightRenderer = new HighlightRenderer(scene)
    this.eventHandler = new EventHandler(this, domElement)
    
    // 事件系统
    this.eventListeners = new Map()
    
    // 状态
    this.enabled = false
    this.meshes = [] // 可拾取的网格列表
    this.currentHoverFace = null // 当前悬停的面
    
    // 性能监控
    this.performanceMonitor = {
      enabled: true,
      responseTimeThreshold: 50, // 50ms响应时间要求
      maxFaceCount: 100000,      // 最大面数限制
      recentOperations: [],      // 最近操作记录
      maxHistorySize: 100        // 历史记录最大数量
    }
    
    // 错误处理
    this.errorHandler = {
      maxRetries: 3,
      fallbackMode: false,
      lastError: null,
      errorCount: 0
    }
    
    // 配置选项
    this.options = {
      enableHover: true,        // 是否启用悬停效果
      enableDoubleClick: true,  // 是否启用双击
      enableRightClick: true,   // 是否启用右键
      hoverDelay: 0,           // 悬停延迟（毫秒）
      dragThreshold: 5,        // 拖拽阈值（像素）
      enablePerformanceMonitoring: true, // 是否启用性能监控
      enableErrorRecovery: true // 是否启用错误恢复
    }
    
    // 绑定方法（保持向后兼容）
    this.handleClick = this.handleClick.bind(this)
    this.handleMouseMove = this.handleMouseMove.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    
    // 设置选择管理器事件监听
    this.setupSelectionEvents()
  }
  
  /**
   * 启用面拾取功能
   */
  enable() {
    if (this.enabled) return
    
    this.enabled = true
    
    // 启用事件处理器
    this.eventHandler.enable()
    
    // 设置事件处理器配置
    this.eventHandler.setDragThreshold(this.options.dragThreshold)
    
    debugLogger.info('面拾取功能已启用', {
      meshCount: this.meshes.length,
      options: this.options
    })
    
    this.emit('enabled')
  }
  
  /**
   * 禁用面拾取功能
   */
  disable() {
    if (!this.enabled) return
    
    this.enabled = false
    
    // 禁用事件处理器
    this.eventHandler.disable()
    
    // 清除所有高亮效果
    this.highlightRenderer.clearAllHighlights(true)
    this.currentHoverFace = null
    
    this.emit('disabled')
  }
  
  /**
   * 设置可拾取的网格列表
   * @param {THREE.Mesh[]} meshes - 网格数组
   */
  setMeshes(meshes) {
    this.meshes = meshes
  }
  
  /**
   * 添加可拾取的网格
   * @param {THREE.Mesh} mesh - 网格对象
   */
  addMesh(mesh) {
    if (!this.meshes.includes(mesh)) {
      this.meshes.push(mesh)
    }
  }
  
  /**
   * 移除可拾取的网格
   * @param {THREE.Mesh} mesh - 网格对象
   */
  removeMesh(mesh) {
    const index = this.meshes.indexOf(mesh)
    if (index !== -1) {
      this.meshes.splice(index, 1)
    }
  }
  
  /**
   * 选择面
   * @param {Object} faceInfo - 面信息对象
   * @param {boolean} additive - 是否为多选模式
   */
  selectFace(faceInfo, additive = false) {
    if (!faceInfo) return
    
    const monitor = debugLogger.createPerformanceMonitor('selectFace')
    
    const wasSelected = this.selectionManager.contains(faceInfo)
    
    if (additive) {
      // 多选模式：切换选择状态
      this.selectionManager.setSelectionMode('multi', false)
      
      if (wasSelected) {
        this.selectionManager.removeFace(faceInfo)
        debugLogger.logFacePickingEvent('面取消选择', faceInfo)
        this.emit('faceDeselected', faceInfo)
      } else {
        this.selectionManager.addFace(faceInfo)
        debugLogger.logFacePickingEvent('面选择 (多选)', faceInfo)
        this.emit('faceSelected', faceInfo)
      }
    } else {
      // 单选模式：替换当前选择
      this.selectionManager.setSelectionMode('single', false)
      
      const previousSelection = this.selectionManager.getAll()
      this.selectionManager.clearAll(false)
      
      // 发出取消选择事件
      previousSelection.forEach(face => {
        this.emit('faceDeselected', face)
      })
      
      // 选择新面
      this.selectionManager.addFace(faceInfo)
      debugLogger.logFacePickingEvent('面选择 (单选)', faceInfo)
      this.emit('faceSelected', faceInfo)
    }
    
    // 发出选择变化事件
    const selectionSummary = this.selectionManager.getSelectionSummary()
    debugLogger.logSelectionChange('选择状态变化', selectionSummary)
    this.emit('selectionChanged', selectionSummary)
    
    monitor.end({ additive, wasSelected })
  }
  
  /**
   * 清除所有选择
   */
  clearSelection() {
    const selectedFaces = this.selectionManager.getAll()
    this.selectionManager.clearAll()
    
    // 清除选择高亮
    selectedFaces.forEach(face => {
      this.highlightRenderer.removeHighlight(face.mesh, face.faceIndex, false)
      this.emit('faceDeselected', face)
    })
    
    this.emit('selectionCleared')
    this.emit('selectionChanged', this.selectionManager.getSelectionSummary())
  }
  
  /**
   * 处理鼠标移动事件（悬停效果）
   * @param {MouseEvent} event - 鼠标事件
   */
  handleMouseMove(event) {
    if (!this.enabled || !this.options.enableHover) return
    
    const startTime = performance.now()
    
    try {
      // 计算鼠标位置
      const rect = this.domElement.getBoundingClientRect()
      const mousePosition = this.raycastManager.screenToNDC(
        event.clientX, 
        event.clientY, 
        rect
      )
      
      // 执行射线投射
      const intersection = this.raycastManager.intersectFaces(mousePosition, this.meshes)
      
      if (intersection) {
        // 检查是否与当前悬停面不同
        if (!this.currentHoverFace || 
            this.currentHoverFace.mesh !== intersection.mesh || 
            this.currentHoverFace.faceIndex !== intersection.faceIndex) {
          
          // 清除之前的悬停效果
          if (this.currentHoverFace) {
            this.highlightRenderer.hideHoverEffect(
              this.currentHoverFace.mesh, 
              this.currentHoverFace.faceIndex
            )
          }
          
          // 显示新的悬停效果（只有在面未被选中时才显示）
          if (!this.selectionManager.contains(intersection)) {
            this.highlightRenderer.showHoverEffect(intersection.mesh, intersection.faceIndex)
            this.currentHoverFace = intersection
            this.emit('faceHover', intersection)
          } else {
            this.currentHoverFace = null
          }
        }
      } else {
        // 鼠标不在任何面上，清除悬停效果
        if (this.currentHoverFace) {
          this.highlightRenderer.hideHoverEffect(
            this.currentHoverFace.mesh, 
            this.currentHoverFace.faceIndex
          )
          this.currentHoverFace = null
          this.emit('faceHoverEnd')
        }
      }
      
      // 记录性能数据
      this.recordPerformance('hover', performance.now() - startTime)
      
    } catch (error) {
      this.handleError('handleMouseMove', error)
    }
  }
  
  /**
   * 设置配置选项
   * @param {Object} options - 配置选项
   */
  setOptions(options) {
    Object.assign(this.options, options)
    
    // 更新事件处理器配置
    if (options.dragThreshold !== undefined) {
      this.eventHandler.setDragThreshold(options.dragThreshold)
    }
  }
  
  /**
   * 获取配置选项
   * @returns {Object} 当前配置
   */
  getOptions() {
    return { ...this.options }
  }
  
  /**
   * 启用/禁用悬停效果
   * @param {boolean} enabled - 是否启用
   */
  setHoverEnabled(enabled) {
    this.options.enableHover = enabled
    
    if (!enabled && this.currentHoverFace) {
      this.highlightRenderer.hideHoverEffect(
        this.currentHoverFace.mesh, 
        this.currentHoverFace.faceIndex
      )
      this.currentHoverFace = null
    }
  }
  
  /**
   * 获取当前悬停的面
   * @returns {Object|null} 悬停面信息
   */
  getCurrentHoverFace() {
    return this.currentHoverFace
  }
  
  /**
   * 手动触发面选择（程序化选择）
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {number} faceIndex - 面索引
   * @param {boolean} additive - 是否为多选模式
   * @returns {boolean} 是否成功选择
   */
  selectFaceByIndex(mesh, faceIndex, additive = false) {
    if (!mesh || faceIndex < 0) {
      return false
    }
    
    // 构建面信息对象
    const faceInfo = this.raycastManager.buildFaceInfo({
      object: mesh,
      faceIndex: faceIndex,
      face: null,
      point: new THREE.Vector3(),
      distance: 0
    })
    
    if (faceInfo) {
      this.selectFace(faceInfo, additive)
      return true
    }
    
    return false
  }
  
  /**
   * 获取指定位置的面信息（不触发选择）
   * @param {number} clientX - 屏幕X坐标
   * @param {number} clientY - 屏幕Y坐标
   * @returns {Object|null} 面信息或null
   */
  getFaceAtPosition(clientX, clientY) {
    const rect = this.domElement.getBoundingClientRect()
    const mousePosition = this.raycastManager.screenToNDC(clientX, clientY, rect)
    
    return this.raycastManager.intersectFaces(mousePosition, this.meshes)
  }
  
  /**
   * 获取所有相交面（按距离排序）
   * @param {number} clientX - 屏幕X坐标
   * @param {number} clientY - 屏幕Y坐标
   * @returns {Object[]} 面信息数组
   */
  getAllFacesAtPosition(clientX, clientY) {
    const rect = this.domElement.getBoundingClientRect()
    const mousePosition = this.raycastManager.screenToNDC(clientX, clientY, rect)
    
    return this.raycastManager.intersectFacesWithDepthSorting(mousePosition, this.meshes)
  }
  
  /**
   * 获取当前选中的面
   * @returns {Object[]} 选中的面信息数组
   */
  getSelectedFaces() {
    return this.selectionManager.getAll()
  }
  
  /**
   * 处理点击事件
   * @param {MouseEvent} event - 鼠标事件
   */
  handleClick(event) {
    if (!this.enabled) return
    
    const startTime = performance.now()
    
    try {
      // 计算鼠标位置
      const rect = this.domElement.getBoundingClientRect()
      const mousePosition = this.raycastManager.screenToNDC(
        event.clientX, 
        event.clientY, 
        rect
      )
      
      // 执行射线投射
      const intersection = this.raycastManager.intersectFaces(mousePosition, this.meshes)
      
      if (intersection) {
        // 检查是否为多选模式（Ctrl键）
        const isMultiSelect = event.ctrlKey || event.metaKey
        this.selectFace(intersection, isMultiSelect)
      } else {
        // 点击空白区域，清除选择
        this.clearSelection()
      }
      
      // 记录性能数据
      this.recordPerformance('click', performance.now() - startTime)
      
    } catch (error) {
      this.handleError('handleClick', error)
    }
  }
  
  /**
   * 处理键盘事件
   * @param {KeyboardEvent} event - 键盘事件
   */
  handleKeyDown(event) {
    if (!this.enabled) return
    
    switch (event.key) {
      case 'Escape':
        this.clearSelection()
        break
      case 'z':
        if (event.ctrlKey || event.metaKey) {
          if (event.shiftKey) {
            // Ctrl+Shift+Z: 重做
            this.redo()
          } else {
            // Ctrl+Z: 撤销
            this.undo()
          }
          event.preventDefault()
        }
        break
      case 'y':
        if (event.ctrlKey || event.metaKey) {
          // Ctrl+Y: 重做（Windows风格）
          this.redo()
          event.preventDefault()
        }
        break
      case 'a':
        if (event.ctrlKey || event.metaKey) {
          // Ctrl+A: 全选（如果有实现的话）
          this.selectAllFaces()
          event.preventDefault()
        }
        break
    }
  }
  
  /**
   * 撤销上一次选择操作
   * @returns {boolean} 是否成功撤销
   */
  undo() {
    const success = this.selectionManager.undo()
    if (success) {
      this.emit('undoPerformed')
      this.emit('selectionChanged', this.selectionManager.getSelectionSummary())
    }
    return success
  }
  
  /**
   * 重做下一次选择操作
   * @returns {boolean} 是否成功重做
   */
  redo() {
    const success = this.selectionManager.redo()
    if (success) {
      this.emit('redoPerformed')
      this.emit('selectionChanged', this.selectionManager.getSelectionSummary())
    }
    return success
  }
  
  /**
   * 选择所有可见的面（如果网格不太复杂）
   */
  selectAllFaces() {
    // 这是一个高级功能，需要谨慎实现以避免性能问题
    console.warn('全选功能需要根据具体需求实现')
    // 可以在后续版本中实现
  }
  
  /**
   * 设置选择模式
   * @param {'single'|'multi'} mode - 选择模式
   */
  setSelectionMode(mode) {
    this.selectionManager.setSelectionMode(mode)
    this.emit('selectionModeChanged', mode)
  }
  
  /**
   * 获取当前选择模式
   * @returns {'single'|'multi'} 选择模式
   */
  getSelectionMode() {
    return this.selectionManager.getSelectionMode()
  }
  
  /**
   * 设置选择管理器事件监听
   */
  setupSelectionEvents() {
    // 监听面添加事件
    this.selectionManager.on('faceAdded', (faceInfo) => {
      this.highlightRenderer.highlightFace(faceInfo.mesh, faceInfo.faceIndex)
      
      // 如果当前悬停的面被选中，清除悬停效果
      if (this.currentHoverFace && 
          this.currentHoverFace.mesh === faceInfo.mesh && 
          this.currentHoverFace.faceIndex === faceInfo.faceIndex) {
        this.highlightRenderer.hideHoverEffect(faceInfo.mesh, faceInfo.faceIndex)
        this.currentHoverFace = null
      }
    })
    
    // 监听面移除事件
    this.selectionManager.on('faceRemoved', (faceInfo) => {
      this.highlightRenderer.removeHighlight(faceInfo.mesh, faceInfo.faceIndex)
    })
    
    // 监听选择清除事件
    this.selectionManager.on('selectionCleared', (clearedFaces) => {
      clearedFaces.forEach(faceInfo => {
        this.highlightRenderer.removeHighlight(faceInfo.mesh, faceInfo.faceIndex)
      })
    })
    
    // 监听批量操作事件
    this.selectionManager.on('multipleFacesAdded', (faceInfos) => {
      faceInfos.forEach(faceInfo => {
        this.highlightRenderer.highlightFace(faceInfo.mesh, faceInfo.faceIndex)
      })
    })
    
    this.selectionManager.on('multipleFacesRemoved', (faceInfos) => {
      faceInfos.forEach(faceInfo => {
        this.highlightRenderer.removeHighlight(faceInfo.mesh, faceInfo.faceIndex)
      })
    })
  }
  
  /**
   * 设置高亮颜色
   * @param {Object} colors - 颜色配置
   */
  setHighlightColors(colors) {
    this.highlightRenderer.updateColors(colors)
    
    // 重新应用当前选择的高亮
    const selectedFaces = this.selectionManager.getAll()
    selectedFaces.forEach(faceInfo => {
      this.highlightRenderer.removeHighlight(faceInfo.mesh, faceInfo.faceIndex)
      this.highlightRenderer.highlightFace(faceInfo.mesh, faceInfo.faceIndex)
    })
  }
  
  /**
   * 获取高亮统计信息
   * @returns {Object} 统计信息
   */
  getHighlightStats() {
    return this.highlightRenderer.getHighlightStats()
  }
  
  /**
   * 添加事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, [])
    }
    this.eventListeners.get(eventName).push(callback)
  }
  
  /**
   * 移除事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(eventName, callback) {
    if (!this.eventListeners.has(eventName)) return
    
    const listeners = this.eventListeners.get(eventName)
    const index = listeners.indexOf(callback)
    if (index !== -1) {
      listeners.splice(index, 1)
    }
  }
  
  /**
   * 发出事件
   * @param {string} eventName - 事件名称
   * @param {...any} args - 事件参数
   */
  emit(eventName, ...args) {
    if (!this.eventListeners.has(eventName)) return
    
    const listeners = this.eventListeners.get(eventName)
    listeners.forEach(callback => {
      try {
        callback(...args)
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error)
      }
    })
  }
  
  /**
   * 获取指定位置的所有相交面（按距离排序）
   * @param {MouseEvent} event - 鼠标事件
   * @returns {Object[]} 相交面信息数组
   */
  getAllIntersectionsAtPosition(event) {
    if (!this.enabled) return []
    
    const rect = this.domElement.getBoundingClientRect()
    const mousePosition = this.raycastManager.screenToNDC(
      event.clientX, 
      event.clientY, 
      rect
    )
    
    return this.raycastManager.intersectFacesWithDepthSorting(mousePosition, this.meshes)
  }
  
  /**
   * 检查指定网格在鼠标位置是否有相交面
   * @param {MouseEvent} event - 鼠标事件
   * @param {THREE.Mesh} mesh - 要检查的网格
   * @returns {Object|null} 面信息对象或null
   */
  intersectSpecificMesh(event, mesh) {
    if (!this.enabled) return null
    
    const rect = this.domElement.getBoundingClientRect()
    const mousePosition = this.raycastManager.screenToNDC(
      event.clientX, 
      event.clientY, 
      rect
    )
    
    return this.raycastManager.intersectSingleMesh(mousePosition, mesh)
  }
  
  /**
   * 验证并添加网格到可拾取列表
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {boolean} 是否成功添加
   */
  addValidatedMesh(mesh) {
    if (RaycastManager.validateMesh(mesh)) {
      this.addMesh(mesh)
      return true
    }
    return false
  }
  
  /**
   * 获取几何体兼容性信息
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {Object} 兼容性信息
   */
  getGeometryCompatibility(mesh) {
    if (!mesh || !mesh.geometry) {
      return { isCompatible: false, warnings: ['网格缺少几何体'] }
    }
    
    return RaycastManager.checkGeometryCompatibility(mesh.geometry)
  }
  
  /**
   * 获取选择统计信息
   * @returns {Object} 统计信息
   */
  getSelectionStats() {
    return this.selectionManager.getSelectionStats()
  }
  
  /**
   * 获取事件处理器状态
   * @returns {Object} 事件处理器状态
   */
  getEventHandlerState() {
    return this.eventHandler.getState()
  }
  
  /**
   * 获取完整的面拾取器状态
   * @returns {Object} 完整状态信息
   */
  getFullState() {
    return {
      enabled: this.enabled,
      options: this.getOptions(),
      meshCount: this.meshes.length,
      selection: this.getSelectionStats(),
      highlight: this.getHighlightStats(),
      eventHandler: this.getEventHandlerState(),
      currentHover: this.currentHoverFace ? {
        meshName: this.currentHoverFace.mesh.name || 'Unnamed',
        faceIndex: this.currentHoverFace.faceIndex
      } : null
    }
  }
  
  /**
   * 记录性能数据
   * @param {string} operation - 操作类型
   * @param {number} duration - 持续时间（毫秒）
   */
  recordPerformance(operation, duration) {
    if (!this.options.enablePerformanceMonitoring) return
    
    const record = {
      operation,
      duration,
      timestamp: Date.now(),
      meshCount: this.meshes.length,
      selectedCount: this.selectionManager.getAll().length
    }
    
    this.performanceMonitor.recentOperations.push(record)
    
    // 保持历史记录大小限制
    if (this.performanceMonitor.recentOperations.length > this.performanceMonitor.maxHistorySize) {
      this.performanceMonitor.recentOperations.shift()
    }
    
    // 检查性能阈值
    if (duration > this.performanceMonitor.responseTimeThreshold) {
      console.warn(`面拾取操作 ${operation} 响应时间过长: ${duration.toFixed(2)}ms (阈值: ${this.performanceMonitor.responseTimeThreshold}ms)`)
      this.emit('performanceWarning', { operation, duration, threshold: this.performanceMonitor.responseTimeThreshold })
      
      // 如果启用错误恢复，尝试优化
      if (this.options.enableErrorRecovery) {
        this.optimizeForPerformance()
      }
    }
  }
  
  /**
   * 处理错误
   * @param {string} context - 错误上下文
   * @param {Error} error - 错误对象
   */
  handleError(context, error) {
    this.errorHandler.lastError = {
      context,
      error: error.message,
      timestamp: Date.now(),
      stack: error.stack
    }
    this.errorHandler.errorCount++
    
    debugLogger.logError(context, error, {
      errorCount: this.errorHandler.errorCount,
      fallbackMode: this.errorHandler.fallbackMode
    })
    
    this.emit('error', this.errorHandler.lastError)
    
    // 如果启用错误恢复
    if (this.options.enableErrorRecovery) {
      this.attemptErrorRecovery(context, error)
    }
  }
  
  /**
   * 尝试错误恢复
   * @param {string} context - 错误上下文
   * @param {Error} error - 错误对象
   */
  attemptErrorRecovery(context, error) {
    if (this.errorHandler.errorCount > this.errorHandler.maxRetries) {
      console.warn('错误次数过多，启用降级模式')
      this.enableFallbackMode()
      return
    }
    
    switch (context) {
      case 'handleClick':
      case 'handleMouseMove':
        // 射线投射错误，尝试清理无效网格
        this.validateAndCleanMeshes()
        break
      case 'selectFace':
        // 选择错误，尝试清除当前选择
        this.clearSelection()
        break
      default:
        console.warn(`未知错误上下文: ${context}`)
    }
  }
  
  /**
   * 启用降级模式
   */
  enableFallbackMode() {
    this.errorHandler.fallbackMode = true
    
    // 禁用悬停效果以减少计算负担
    this.options.enableHover = false
    
    // 增加拖拽阈值
    this.options.dragThreshold = Math.max(this.options.dragThreshold, 10)
    
    // 限制可拾取网格数量
    if (this.meshes.length > 10) {
      console.warn('降级模式：限制可拾取网格数量')
      this.meshes = this.meshes.slice(0, 10)
    }
    
    this.emit('fallbackModeEnabled')
    console.warn('面拾取已启用降级模式')
  }
  
  /**
   * 性能优化
   */
  optimizeForPerformance() {
    // 检查网格复杂度
    const complexMeshes = this.meshes.filter(mesh => {
      const faceCount = RaycastManager.getFaceCount(mesh.geometry)
      return faceCount > this.performanceMonitor.maxFaceCount
    })
    
    if (complexMeshes.length > 0) {
      console.warn(`发现 ${complexMeshes.length} 个复杂网格，面数超过 ${this.performanceMonitor.maxFaceCount}`)
      
      // 可以选择移除复杂网格或降低精度
      complexMeshes.forEach(mesh => {
        console.warn(`复杂网格: ${mesh.name || 'Unnamed'}, 面数: ${RaycastManager.getFaceCount(mesh.geometry)}`)
      })
      
      this.emit('complexMeshDetected', complexMeshes)
    }
    
    // 如果悬停效果导致性能问题，暂时禁用
    const hoverOperations = this.performanceMonitor.recentOperations.filter(op => op.operation === 'hover')
    if (hoverOperations.length > 0) {
      const avgHoverTime = hoverOperations.reduce((sum, op) => sum + op.duration, 0) / hoverOperations.length
      if (avgHoverTime > this.performanceMonitor.responseTimeThreshold * 0.8) {
        console.warn('悬停效果性能不佳，暂时禁用')
        this.options.enableHover = false
        this.emit('hoverDisabledForPerformance')
      }
    }
  }
  
  /**
   * 验证并清理无效网格
   */
  validateAndCleanMeshes() {
    const validMeshes = []
    const invalidMeshes = []
    
    this.meshes.forEach(mesh => {
      if (RaycastManager.validateMesh(mesh)) {
        validMeshes.push(mesh)
      } else {
        invalidMeshes.push(mesh)
      }
    })
    
    if (invalidMeshes.length > 0) {
      console.warn(`移除 ${invalidMeshes.length} 个无效网格`)
      this.meshes = validMeshes
      this.emit('invalidMeshesRemoved', invalidMeshes)
    }
  }
  
  /**
   * 获取性能统计信息
   * @returns {Object} 性能统计
   */
  getPerformanceStats() {
    const operations = this.performanceMonitor.recentOperations
    
    if (operations.length === 0) {
      return {
        totalOperations: 0,
        averageResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: 0,
        operationsOverThreshold: 0,
        performanceGrade: 'A'
      }
    }
    
    const durations = operations.map(op => op.duration)
    const totalOperations = operations.length
    const averageResponseTime = durations.reduce((sum, d) => sum + d, 0) / totalOperations
    const maxResponseTime = Math.max(...durations)
    const minResponseTime = Math.min(...durations)
    const operationsOverThreshold = durations.filter(d => d > this.performanceMonitor.responseTimeThreshold).length
    
    // 计算性能等级
    let performanceGrade = 'A'
    const overThresholdRatio = operationsOverThreshold / totalOperations
    
    if (overThresholdRatio > 0.5) {
      performanceGrade = 'D'
    } else if (overThresholdRatio > 0.3) {
      performanceGrade = 'C'
    } else if (overThresholdRatio > 0.1) {
      performanceGrade = 'B'
    }
    
    return {
      totalOperations,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      maxResponseTime: Math.round(maxResponseTime * 100) / 100,
      minResponseTime: Math.round(minResponseTime * 100) / 100,
      operationsOverThreshold,
      overThresholdRatio: Math.round(overThresholdRatio * 100),
      performanceGrade,
      threshold: this.performanceMonitor.responseTimeThreshold,
      fallbackMode: this.errorHandler.fallbackMode,
      errorCount: this.errorHandler.errorCount
    }
  }
  
  /**
   * 重置性能监控数据
   */
  resetPerformanceStats() {
    this.performanceMonitor.recentOperations = []
    this.errorHandler.errorCount = 0
    this.errorHandler.lastError = null
    this.errorHandler.fallbackMode = false
  }
  
  /**
   * 设置性能监控配置
   * @param {Object} config - 配置对象
   */
  setPerformanceConfig(config) {
    Object.assign(this.performanceMonitor, config)
  }
  
  /**
   * 输入验证和边界检查
   * @param {THREE.Vector2} mousePosition - 鼠标位置
   * @param {THREE.Mesh[]} meshes - 网格数组
   * @returns {boolean} 是否通过验证
   */
  validateInput(mousePosition, meshes) {
    // 检查鼠标位置是否有效
    if (!mousePosition || 
        typeof mousePosition.x !== 'number' || 
        typeof mousePosition.y !== 'number' ||
        Math.abs(mousePosition.x) > 1 || 
        Math.abs(mousePosition.y) > 1) {
      console.warn('无效的鼠标位置:', mousePosition)
      return false
    }
    
    // 检查网格数组
    if (!Array.isArray(meshes) || meshes.length === 0) {
      return false
    }
    
    // 检查网格总面数
    const totalFaces = meshes.reduce((total, mesh) => {
      return total + RaycastManager.getFaceCount(mesh.geometry)
    }, 0)
    
    if (totalFaces > this.performanceMonitor.maxFaceCount) {
      console.warn(`场景面数过多: ${totalFaces}, 最大限制: ${this.performanceMonitor.maxFaceCount}`)
      if (this.options.enableErrorRecovery) {
        this.optimizeForPerformance()
      }
    }
    
    return true
  }
  
  /**
   * 销毁面拾取器，清理资源
   */
  destroy() {
    this.disable()
    this.eventHandler.disable()
    this.highlightRenderer.destroy()
    this.eventListeners.clear()
    this.meshes = []
    this.currentHoverFace = null
    
    // 清理性能监控数据
    this.resetPerformanceStats()
  }
}