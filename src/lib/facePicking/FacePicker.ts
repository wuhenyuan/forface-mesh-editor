import * as THREE from 'three'
import { RaycastManager } from './RaycastManager'
import { SelectionManager } from './SelectionManager'
import type { FaceInfoWithId } from './SelectionManager'
import { HighlightRenderer } from './HighlightRenderer'
import { EventHandler } from './EventHandler'
import { debugLogger } from './DebugLogger'

interface FacePickerOptions {
  enableHover: boolean
  enableDoubleClick: boolean
  enableRightClick: boolean
  hoverDelay: number
  dragThreshold: number
  enablePerformanceMonitoring: boolean
  enableErrorRecovery: boolean
}

interface PerformanceMonitor {
  enabled: boolean
  responseTimeThreshold: number
  maxFaceCount: number
  recentOperations: PerformanceRecord[]
  maxHistorySize: number
}

interface PerformanceRecord {
  operation: string
  duration: number
  timestamp: number
  meshCount: number
  selectedCount: number
}

interface ErrorHandler {
  maxRetries: number
  fallbackMode: boolean
  lastError: ErrorInfo | null
  errorCount: number
}

interface ErrorInfo {
  context: string
  error: string
  timestamp: number
  stack?: string
}

type EventCallback = (...args: unknown[]) => void

/**
 * 面拾取主控制器类
 * 负责协调射线投射、选择管理和事件处理
 */
export class FacePicker {
  private scene: THREE.Scene
  private camera: THREE.Camera
  private renderer: THREE.WebGLRenderer
  private domElement: HTMLElement
  
  private raycastManager: RaycastManager
  private selectionManager: SelectionManager
  private highlightRenderer: HighlightRenderer
  private eventHandler: EventHandler
  
  private eventListeners: Map<string, EventCallback[]>
  private enabled: boolean
  private meshes: THREE.Mesh[]
  private currentHoverFace: FaceInfoWithId | null
  
  private performanceMonitor: PerformanceMonitor
  private errorHandler: ErrorHandler
  private options: FacePickerOptions

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, domElement: HTMLElement) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.domElement = domElement
    
    this.raycastManager = new RaycastManager(camera)
    this.selectionManager = new SelectionManager()
    this.highlightRenderer = new HighlightRenderer(scene)
    this.eventHandler = new EventHandler(this, domElement)
    
    this.eventListeners = new Map()
    this.enabled = false
    this.meshes = []
    this.currentHoverFace = null
    
    this.performanceMonitor = {
      enabled: true,
      responseTimeThreshold: 50,
      maxFaceCount: 100000,
      recentOperations: [],
      maxHistorySize: 100
    }
    
    this.errorHandler = {
      maxRetries: 3,
      fallbackMode: false,
      lastError: null,
      errorCount: 0
    }
    
    this.options = {
      enableHover: true,
      enableDoubleClick: true,
      enableRightClick: true,
      hoverDelay: 0,
      dragThreshold: 5,
      enablePerformanceMonitoring: true,
      enableErrorRecovery: true
    }
    
    this.handleClick = this.handleClick.bind(this)
    this.handleMouseMove = this.handleMouseMove.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    
    this.setupSelectionEvents()
  }
  
  enable(): void {
    if (this.enabled) return
    
    this.enabled = true
    this.eventHandler.enable()
    this.eventHandler.setDragThreshold(this.options.dragThreshold)
    
    debugLogger.info('面拾取功能已启用', {
      meshCount: this.meshes.length,
      options: this.options
    })
    
    this.emit('enabled')
  }
  
  disable(): void {
    if (!this.enabled) return
    
    this.enabled = false
    this.eventHandler.disable()
    this.highlightRenderer.clearAllHighlights(true)
    this.currentHoverFace = null
    
    this.emit('disabled')
  }
  
  setMeshes(meshes: THREE.Mesh[]): void {
    this.meshes = meshes
  }
  
  addMesh(mesh: THREE.Mesh): void {
    if (!this.meshes.includes(mesh)) {
      this.meshes.push(mesh)
    }
  }
  
  removeMesh(mesh: THREE.Mesh): void {
    const index = this.meshes.indexOf(mesh)
    if (index !== -1) {
      this.meshes.splice(index, 1)
    }
  }

  /**
   * 将 FaceInfo 转换为 FaceInfoWithId
   */
  private toFaceInfoWithId(faceInfo: unknown): FaceInfoWithId | null {
    if (!faceInfo || typeof faceInfo !== 'object') return null
    
    const info = faceInfo as Record<string, unknown>
    const mesh = info.mesh as THREE.Mesh
    const faceIndex = info.faceIndex as number
    
    if (!mesh || typeof faceIndex !== 'number') return null
    
    // 生成唯一ID
    const id = `${mesh.uuid}_${faceIndex}`
    
    return {
      ...info,
      id,
      mesh,
      faceIndex
    } as FaceInfoWithId
  }

  selectFace(faceInfo: unknown, additive: boolean = false, originalEvent: MouseEvent | null = null): void {
    const faceInfoWithId = this.toFaceInfoWithId(faceInfo)
    if (!faceInfoWithId) return
    
    const monitor = debugLogger.createPerformanceMonitor('selectFace')
    
    const wasSelected = this.selectionManager.contains(faceInfoWithId)
    
    if (additive) {
      this.selectionManager.setSelectionMode('multi', false)
      
      if (wasSelected) {
        this.selectionManager.removeFace(faceInfoWithId)
        debugLogger.logFacePickingEvent('面取消选择', faceInfoWithId)
        this.emit('faceDeselected', faceInfoWithId, originalEvent)
      } else {
        this.selectionManager.addFace(faceInfoWithId)
        debugLogger.logFacePickingEvent('面选择 (多选)', faceInfoWithId)
        this.emit('faceSelected', faceInfoWithId, originalEvent)
      }
    } else {
      this.selectionManager.setSelectionMode('single', false)
      
      const previousSelection = this.selectionManager.getAll()
      this.selectionManager.clearAll(false)
      
      previousSelection.forEach(face => {
        this.emit('faceDeselected', face, originalEvent)
      })
      
      this.selectionManager.addFace(faceInfoWithId)
      debugLogger.logFacePickingEvent('面选择 (单选)', faceInfoWithId)
      this.emit('faceSelected', faceInfoWithId, originalEvent)
    }
    
    const selectionSummary = this.selectionManager.getSelectionSummary()
    debugLogger.logSelectionChange('选择状态变化', selectionSummary)
    this.emit('selectionChanged', selectionSummary)
    
    monitor.end({ additive, wasSelected })
  }
  
  clearSelection(): void {
    const selectedFaces = this.selectionManager.getAll()
    this.selectionManager.clearAll()
    
    selectedFaces.forEach(face => {
      this.highlightRenderer.removeHighlight(face.mesh, face.faceIndex, false)
      this.emit('faceDeselected', face)
    })
    
    this.emit('selectionCleared')
    this.emit('selectionChanged', this.selectionManager.getSelectionSummary())
  }

  handleMouseMove(event: MouseEvent): void {
    if (!this.enabled || !this.options.enableHover) return
    
    const startTime = performance.now()
    
    try {
      const rect = this.domElement.getBoundingClientRect()
      const mousePosition = this.raycastManager.screenToNDC(
        event.clientX, 
        event.clientY, 
        rect
      )
      
      const intersection = this.raycastManager.intersectFaces(mousePosition, this.meshes)
      
      if (intersection) {
        const intersectionWithId = this.toFaceInfoWithId(intersection)
        
        if (!this.currentHoverFace || 
            this.currentHoverFace.mesh !== intersection.mesh || 
            this.currentHoverFace.faceIndex !== intersection.faceIndex) {
          
          if (this.currentHoverFace) {
            this.highlightRenderer.hideHoverEffect(
              this.currentHoverFace.mesh, 
              this.currentHoverFace.faceIndex
            )
          }
          
          if (intersectionWithId && !this.selectionManager.contains(intersectionWithId)) {
            this.highlightRenderer.showHoverEffect(intersection.mesh, intersection.faceIndex)
            this.currentHoverFace = intersectionWithId
            this.emit('faceHover', intersection)
          } else {
            this.currentHoverFace = null
          }
        }
      } else {
        if (this.currentHoverFace) {
          this.highlightRenderer.hideHoverEffect(
            this.currentHoverFace.mesh, 
            this.currentHoverFace.faceIndex
          )
          this.currentHoverFace = null
          this.emit('faceHoverEnd')
        }
      }
      
      this.recordPerformance('hover', performance.now() - startTime)
      
    } catch (error) {
      this.handleError('handleMouseMove', error as Error)
    }
  }

  setOptions(options: Partial<FacePickerOptions>): void {
    Object.assign(this.options, options)
    
    if (options.dragThreshold !== undefined) {
      this.eventHandler.setDragThreshold(options.dragThreshold)
    }
  }
  
  getOptions(): FacePickerOptions {
    return { ...this.options }
  }
  
  setHoverEnabled(enabled: boolean): void {
    this.options.enableHover = enabled
    
    if (!enabled && this.currentHoverFace) {
      this.highlightRenderer.hideHoverEffect(
        this.currentHoverFace.mesh, 
        this.currentHoverFace.faceIndex
      )
      this.currentHoverFace = null
    }
  }
  
  getCurrentHoverFace(): FaceInfoWithId | null {
    return this.currentHoverFace
  }
  
  selectFaceByIndex(mesh: THREE.Mesh, faceIndex: number, additive: boolean = false): boolean {
    if (!mesh || faceIndex < 0) {
      return false
    }
    
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
  
  getFaceAtPosition(clientX: number, clientY: number): unknown {
    const rect = this.domElement.getBoundingClientRect()
    const mousePosition = this.raycastManager.screenToNDC(clientX, clientY, rect)
    
    return this.raycastManager.intersectFaces(mousePosition, this.meshes)
  }
  
  getAllFacesAtPosition(clientX: number, clientY: number): unknown[] {
    const rect = this.domElement.getBoundingClientRect()
    const mousePosition = this.raycastManager.screenToNDC(clientX, clientY, rect)
    
    return this.raycastManager.intersectFacesWithDepthSorting(mousePosition, this.meshes)
  }
  
  getSelectedFaces(): FaceInfoWithId[] {
    return this.selectionManager.getAll()
  }

  handleClick(event: MouseEvent): void {
    console.log('FacePicker.handleClick 被调用', {
      enabled: this.enabled,
      meshCount: this.meshes.length,
      eventType: event.type,
      clientX: event.clientX,
      clientY: event.clientY
    })
    
    if (!this.enabled) {
      console.log('面拾取未启用，跳过处理')
      return
    }
    
    const startTime = performance.now()
    
    try {
      const rect = this.domElement.getBoundingClientRect()
      console.log('DOM元素边界:', rect)
      
      const mousePosition = this.raycastManager.screenToNDC(
        event.clientX, 
        event.clientY, 
        rect
      )
      console.log('标准化鼠标位置:', mousePosition)
      
      const intersection = this.raycastManager.intersectFaces(mousePosition, this.meshes)
      console.log('射线投射结果:', intersection)
      
      if (intersection) {
        const isMultiSelect = event.ctrlKey || event.metaKey
        console.log('检测到面，选择面:', intersection.mesh.name, intersection.faceIndex)
        this.selectFace(intersection, isMultiSelect, event)
      } else {
        console.log('未检测到面，清除选择')
        this.clearSelection()
      }
      
      this.recordPerformance('click', performance.now() - startTime)
      
    } catch (error) {
      console.error('handleClick 错误:', error)
      this.handleError('handleClick', error as Error)
    }
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return
    
    switch (event.key) {
      case 'Escape':
        this.clearSelection()
        break
      case 'z':
        if (event.ctrlKey || event.metaKey) {
          if (event.shiftKey) {
            this.redo()
          } else {
            this.undo()
          }
          event.preventDefault()
        }
        break
      case 'y':
        if (event.ctrlKey || event.metaKey) {
          this.redo()
          event.preventDefault()
        }
        break
      case 'a':
        if (event.ctrlKey || event.metaKey) {
          this.selectAllFaces()
          event.preventDefault()
        }
        break
    }
  }
  
  undo(): boolean {
    const success = this.selectionManager.undo()
    if (success) {
      this.emit('undoPerformed')
      this.emit('selectionChanged', this.selectionManager.getSelectionSummary())
    }
    return success
  }
  
  redo(): boolean {
    const success = this.selectionManager.redo()
    if (success) {
      this.emit('redoPerformed')
      this.emit('selectionChanged', this.selectionManager.getSelectionSummary())
    }
    return success
  }
  
  selectAllFaces(): void {
    console.warn('全选功能需要根据具体需求实现')
  }
  
  setSelectionMode(mode: 'single' | 'multi'): void {
    this.selectionManager.setSelectionMode(mode)
    this.emit('selectionModeChanged', mode)
  }
  
  getSelectionMode(): 'single' | 'multi' {
    return this.selectionManager.getSelectionMode()
  }
  
  private setupSelectionEvents(): void {
    this.selectionManager.on('faceAdded', (faceInfo: unknown) => {
      const info = faceInfo as FaceInfoWithId
      this.highlightRenderer.highlightFace(info.mesh, info.faceIndex)
      
      if (this.currentHoverFace && 
          this.currentHoverFace.mesh === info.mesh && 
          this.currentHoverFace.faceIndex === info.faceIndex) {
        this.highlightRenderer.hideHoverEffect(info.mesh, info.faceIndex)
        this.currentHoverFace = null
      }
    })
    
    this.selectionManager.on('faceRemoved', (faceInfo: unknown) => {
      const info = faceInfo as FaceInfoWithId
      this.highlightRenderer.removeHighlight(info.mesh, info.faceIndex)
    })
    
    this.selectionManager.on('selectionCleared', (clearedFaces: unknown) => {
      const faces = clearedFaces as FaceInfoWithId[]
      faces.forEach(faceInfo => {
        this.highlightRenderer.removeHighlight(faceInfo.mesh, faceInfo.faceIndex)
      })
    })
    
    this.selectionManager.on('multipleFacesAdded', (faceInfos: unknown) => {
      const infos = faceInfos as FaceInfoWithId[]
      infos.forEach(faceInfo => {
        this.highlightRenderer.highlightFace(faceInfo.mesh, faceInfo.faceIndex)
      })
    })
    
    this.selectionManager.on('multipleFacesRemoved', (faceInfos: unknown) => {
      const infos = faceInfos as FaceInfoWithId[]
      infos.forEach(faceInfo => {
        this.highlightRenderer.removeHighlight(faceInfo.mesh, faceInfo.faceIndex)
      })
    })
  }

  setHighlightColors(colors: { selection?: number; hover?: number; multiSelection?: number }): void {
    this.highlightRenderer.updateColors(colors)
    
    const selectedFaces = this.selectionManager.getAll()
    selectedFaces.forEach(faceInfo => {
      this.highlightRenderer.removeHighlight(faceInfo.mesh, faceInfo.faceIndex)
      this.highlightRenderer.highlightFace(faceInfo.mesh, faceInfo.faceIndex)
    })
  }
  
  getHighlightStats(): { selectionHighlights: number; hoverHighlights: number; totalHighlights: number; cachedMaterials: number } {
    return this.highlightRenderer.getHighlightStats()
  }
  
  on(eventName: string, callback: EventCallback): void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, [])
    }
    this.eventListeners.get(eventName)!.push(callback)
  }
  
  off(eventName: string, callback: EventCallback): void {
    if (!this.eventListeners.has(eventName)) return
    
    const listeners = this.eventListeners.get(eventName)!
    const index = listeners.indexOf(callback)
    if (index !== -1) {
      listeners.splice(index, 1)
    }
  }
  
  emit(eventName: string, ...args: unknown[]): void {
    if (!this.eventListeners.has(eventName)) return
    
    const listeners = this.eventListeners.get(eventName)!
    listeners.forEach(callback => {
      try {
        callback(...args)
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error)
      }
    })
  }
  
  getAllIntersectionsAtPosition(event: MouseEvent): unknown[] {
    if (!this.enabled) return []
    
    const rect = this.domElement.getBoundingClientRect()
    const mousePosition = this.raycastManager.screenToNDC(event.clientX, event.clientY, rect)
    
    return this.raycastManager.intersectFacesWithDepthSorting(mousePosition, this.meshes)
  }
  
  intersectSpecificMesh(event: MouseEvent, mesh: THREE.Mesh): unknown {
    if (!this.enabled) return null
    
    const rect = this.domElement.getBoundingClientRect()
    const mousePosition = this.raycastManager.screenToNDC(event.clientX, event.clientY, rect)
    
    return this.raycastManager.intersectSingleMesh(mousePosition, mesh)
  }
  
  addValidatedMesh(mesh: THREE.Mesh): boolean {
    if (RaycastManager.validateMesh(mesh)) {
      this.addMesh(mesh)
      return true
    }
    return false
  }
  
  getGeometryCompatibility(mesh: THREE.Mesh): { isCompatible: boolean; warnings: string[] } {
    if (!mesh || !mesh.geometry) {
      return { isCompatible: false, warnings: ['网格缺少几何体'] }
    }
    
    return RaycastManager.checkGeometryCompatibility(mesh.geometry as THREE.BufferGeometry)
  }
  
  getSelectionStats(): unknown {
    return this.selectionManager.getSelectionStats()
  }
  
  getEventHandlerState(): unknown {
    return this.eventHandler.getState()
  }
  
  getFullState(): {
    enabled: boolean
    options: FacePickerOptions
    meshCount: number
    selection: unknown
    highlight: unknown
    eventHandler: unknown
    currentHover: { meshName: string; faceIndex: number } | null
  } {
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


  private recordPerformance(operation: string, duration: number): void {
    if (!this.options.enablePerformanceMonitoring) return
    
    const record: PerformanceRecord = {
      operation,
      duration,
      timestamp: Date.now(),
      meshCount: this.meshes.length,
      selectedCount: this.selectionManager.getAll().length
    }
    
    this.performanceMonitor.recentOperations.push(record)
    
    if (this.performanceMonitor.recentOperations.length > this.performanceMonitor.maxHistorySize) {
      this.performanceMonitor.recentOperations.shift()
    }
    
    if (duration > this.performanceMonitor.responseTimeThreshold) {
      console.warn(`面拾取操作 ${operation} 响应时间过长: ${duration.toFixed(2)}ms (阈值: ${this.performanceMonitor.responseTimeThreshold}ms)`)
      this.emit('performanceWarning', { operation, duration, threshold: this.performanceMonitor.responseTimeThreshold })
      
      if (this.options.enableErrorRecovery) {
        this.optimizeForPerformance()
      }
    }
  }
  
  private handleError(context: string, error: Error): void {
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
    
    if (this.options.enableErrorRecovery) {
      this.attemptErrorRecovery(context, error)
    }
  }
  
  private attemptErrorRecovery(context: string, _error: Error): void {
    if (this.errorHandler.errorCount > this.errorHandler.maxRetries) {
      console.warn('错误次数过多，启用降级模式')
      this.enableFallbackMode()
      return
    }
    
    switch (context) {
      case 'handleClick':
      case 'handleMouseMove':
        this.validateAndCleanMeshes()
        break
      case 'selectFace':
        this.clearSelection()
        break
      default:
        console.warn(`未知错误上下文: ${context}`)
    }
  }
  
  private enableFallbackMode(): void {
    this.errorHandler.fallbackMode = true
    
    this.options.enableHover = false
    this.options.dragThreshold = Math.max(this.options.dragThreshold, 10)
    
    if (this.meshes.length > 10) {
      console.warn('降级模式：限制可拾取网格数量')
      this.meshes = this.meshes.slice(0, 10)
    }
    
    this.emit('fallbackModeEnabled')
    console.warn('面拾取已启用降级模式')
  }
  
  private optimizeForPerformance(): void {
    const complexMeshes = this.meshes.filter(mesh => {
      const faceCount = RaycastManager.getFaceCount(mesh.geometry as THREE.BufferGeometry)
      return faceCount > this.performanceMonitor.maxFaceCount
    })
    
    if (complexMeshes.length > 0) {
      console.warn(`发现 ${complexMeshes.length} 个复杂网格，面数超过 ${this.performanceMonitor.maxFaceCount}`)
      
      complexMeshes.forEach(mesh => {
        console.warn(`复杂网格: ${mesh.name || 'Unnamed'}, 面数: ${RaycastManager.getFaceCount(mesh.geometry as THREE.BufferGeometry)}`)
      })
      
      this.emit('complexMeshDetected', complexMeshes)
    }
    
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
  
  private validateAndCleanMeshes(): void {
    const validMeshes: THREE.Mesh[] = []
    const invalidMeshes: THREE.Mesh[] = []
    
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
  
  getPerformanceStats(): {
    totalOperations: number
    averageResponseTime: number
    maxResponseTime: number
    minResponseTime: number
    operationsOverThreshold: number
    overThresholdRatio?: number
    performanceGrade: string
    threshold?: number
    fallbackMode?: boolean
    errorCount?: number
  } {
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
  
  resetPerformanceStats(): void {
    this.performanceMonitor.recentOperations = []
    this.errorHandler.errorCount = 0
    this.errorHandler.lastError = null
    this.errorHandler.fallbackMode = false
  }
  
  setPerformanceConfig(config: Partial<PerformanceMonitor>): void {
    Object.assign(this.performanceMonitor, config)
  }
  
  validateInput(mousePosition: THREE.Vector2, meshes: THREE.Mesh[]): boolean {
    if (!mousePosition || 
        typeof mousePosition.x !== 'number' || 
        typeof mousePosition.y !== 'number' ||
        Math.abs(mousePosition.x) > 1 || 
        Math.abs(mousePosition.y) > 1) {
      console.warn('无效的鼠标位置:', mousePosition)
      return false
    }
    
    if (!Array.isArray(meshes) || meshes.length === 0) {
      return false
    }
    
    const totalFaces = meshes.reduce((total, mesh) => {
      return total + RaycastManager.getFaceCount(mesh.geometry as THREE.BufferGeometry)
    }, 0)
    
    if (totalFaces > this.performanceMonitor.maxFaceCount) {
      console.warn(`场景面数过多: ${totalFaces}, 最大限制: ${this.performanceMonitor.maxFaceCount}`)
      if (this.options.enableErrorRecovery) {
        this.optimizeForPerformance()
      }
    }
    
    return true
  }
  
  destroy(): void {
    this.disable()
    this.eventHandler.disable()
    this.highlightRenderer.destroy()
    this.eventListeners.clear()
    this.meshes = []
    this.currentHoverFace = null
    
    this.resetPerformanceStats()
  }
}
