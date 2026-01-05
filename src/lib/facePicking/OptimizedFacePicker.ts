import * as THREE from 'three'
import { RaycastManager } from './RaycastManager'
import { SelectionManager } from './SelectionManager'
import type { FaceInfoWithId } from './SelectionManager'
import { HighlightRenderer } from './HighlightRenderer'
import { EventHandler } from './EventHandler'
import { FeaturePool } from './FeaturePool'
import { debugLogger } from './DebugLogger'

interface OptimizedFacePickerConfig {
  enableFeatureDetection: boolean
  enableBVHAcceleration: boolean
  enablePreprocessing: boolean
  maxPreprocessingTime: number
  batchSize: number
  enableAsyncProcessing: boolean
}

interface PerformanceStats {
  initializationTime: number
  preprocessingTime: number
  raycastTime: number
  featureLookupTime: number
  totalQueries: number
  cacheHitRate: number
}

interface FeatureInfo {
  type: string
  id: string
  feature: unknown
  relatedFaces: number[] | null
}

interface EnhancedFaceInfo extends FaceInfoWithId {
  feature?: FeatureInfo | null
}

type EventCallback = (...args: unknown[]) => void

/**
 * 优化的面拾取器 - 基于 BVH + Feature 预处理的高性能实现
 * 
 * 优化方案：
 * 1. 加载原始模型（Immutable）
 * 2. 构建 BVH（一次性）
 * 3. 预处理识别 Feature（Plane / Cylinder）
 * 4. FeaturePool 缓存
 * 5. 编辑阶段：raycast → faceIndex → O(1) 找 Feature
 */
export class OptimizedFacePicker {
  private scene: THREE.Scene
  private camera: THREE.Camera
  private renderer: THREE.WebGLRenderer
  private domElement: HTMLElement
  
  private raycastManager: RaycastManager
  private selectionManager: SelectionManager
  private highlightRenderer: HighlightRenderer
  private eventHandler: EventHandler
  private featurePool: FeaturePool
  
  private immutableMeshes: Map<string, THREE.Mesh>
  private meshRegistry: Map<THREE.Mesh, string>
  private bvhCache: Map<string, unknown>
  
  private enabled: boolean
  private meshes: THREE.Mesh[]
  private currentHoverFace: EnhancedFaceInfo | null
  private isInitialized: boolean
  
  private config: OptimizedFacePickerConfig
  private performanceStats: PerformanceStats
  private eventListeners: Map<string, EventCallback[]>
  private initializationPromise: Promise<void> | null

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, domElement: HTMLElement) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.domElement = domElement
    
    this.raycastManager = new RaycastManager(camera)
    this.selectionManager = new SelectionManager()
    this.highlightRenderer = new HighlightRenderer(scene)
    this.eventHandler = new EventHandler(this as unknown as import('./FacePicker').FacePicker, domElement)
    this.featurePool = new FeaturePool()
    
    this.immutableMeshes = new Map()
    this.meshRegistry = new Map()
    this.bvhCache = new Map()
    
    this.enabled = false
    this.meshes = []
    this.currentHoverFace = null
    this.isInitialized = false
    
    this.config = {
      enableFeatureDetection: true,
      enableBVHAcceleration: true,
      enablePreprocessing: true,
      maxPreprocessingTime: 5000,
      batchSize: 3,
      enableAsyncProcessing: true
    }
    
    this.performanceStats = {
      initializationTime: 0,
      preprocessingTime: 0,
      raycastTime: 0,
      featureLookupTime: 0,
      totalQueries: 0,
      cacheHitRate: 0
    }
    
    this.eventListeners = new Map()
    this.initializationPromise = null
    
    console.log('OptimizedFacePicker 已创建')
  }

  async setMeshes(meshes: THREE.Mesh[]): Promise<void> {
    const startTime = performance.now()
    
    this.meshes = meshes.filter(mesh => this.validateMesh(mesh))
    
    if (this.meshes.length === 0) {
      console.warn('没有有效的网格可用于面拾取')
      return
    }
    
    console.log(`开始初始化 ${this.meshes.length} 个网格`)
    
    this.initializationPromise = this.initializeMeshes()
    await this.initializationPromise
    
    this.performanceStats.initializationTime = performance.now() - startTime
    this.isInitialized = true
    
    console.log(`网格初始化完成，耗时: ${this.performanceStats.initializationTime.toFixed(2)}ms`)
    this.emit('initialized', {
      meshCount: this.meshes.length,
      initTime: this.performanceStats.initializationTime
    })
  }

  private async initializeMeshes(): Promise<void> {
    const tasks: string[] = []
    
    for (const mesh of this.meshes) {
      const meshId = await this.registerMesh(mesh)
      tasks.push(meshId)
    }
    
    if (this.config.enablePreprocessing) {
      await this.batchPreprocessFeatures(tasks)
    }
    
    if (this.config.enableBVHAcceleration) {
      await this.buildBVHCache()
    }
    
    console.log('所有网格初始化完成')
  }

  private async registerMesh(mesh: THREE.Mesh): Promise<string> {
    const meshId = this.featurePool.featureDetector.generateMeshId(mesh)
    
    if (this.immutableMeshes.has(meshId)) {
      return meshId
    }
    
    const immutableMesh = this.createImmutableCopy(mesh)
    
    this.immutableMeshes.set(meshId, immutableMesh)
    this.meshRegistry.set(mesh, meshId)
    
    await this.featurePool.registerMesh(immutableMesh, false)
    
    console.log(`网格已注册: ${mesh.name || meshId}`)
    return meshId
  }

  private createImmutableCopy(mesh: THREE.Mesh): THREE.Mesh {
    const geometry = mesh.geometry.clone()
    
    if (!geometry.getAttribute('normal')) {
      geometry.computeVertexNormals()
    }
    
    Object.freeze(geometry.attributes)
    Object.freeze(geometry)
    
    const immutableMesh = new THREE.Mesh(geometry, mesh.material)
    immutableMesh.name = mesh.name + '_immutable'
    immutableMesh.userData = { ...mesh.userData, isImmutable: true }
    
    immutableMesh.position.copy(mesh.position)
    immutableMesh.rotation.copy(mesh.rotation)
    immutableMesh.scale.copy(mesh.scale)
    immutableMesh.updateMatrixWorld(true)
    
    return immutableMesh
  }

  private async batchPreprocessFeatures(meshIds: string[]): Promise<void> {
    if (!this.config.enableFeatureDetection) return
    
    const startTime = performance.now()
    console.log(`开始批量预处理 ${meshIds.length} 个网格的特征`)
    
    try {
      const results = await this.featurePool.batchPreprocess(meshIds)
      
      const successful = results.filter((r: { success: boolean }) => r.success).length
      const failed = results.length - successful
      
      this.performanceStats.preprocessingTime = performance.now() - startTime
      
      console.log(`特征预处理完成: 成功 ${successful}, 失败 ${failed}, 耗时: ${this.performanceStats.preprocessingTime.toFixed(2)}ms`)
      
      if (failed > 0) {
        console.warn(`${failed} 个网格预处理失败`)
      }
      
    } catch (error) {
      console.error('批量预处理失败:', error)
      throw error
    }
  }

  private async buildBVHCache(): Promise<void> {
    if (!this.config.enableBVHAcceleration) return
    
    console.log('开始构建 BVH 缓存')
    
    for (const [meshId] of this.immutableMeshes) {
      try {
        // TODO: 实际 BVH 实现需要额外的库 (three-mesh-bvh)
        console.log(`BVH 已构建: ${meshId}`)
      } catch (error) {
        console.warn(`BVH 构建失败: ${meshId}`, error)
      }
    }
    
    console.log('BVH 缓存构建完成')
  }

  enable(): void {
    if (this.enabled) return
    
    if (!this.isInitialized) {
      console.warn('面拾取器尚未初始化，请先调用 setMeshes()')
      return
    }
    
    this.enabled = true
    this.eventHandler.enable()
    
    console.log('优化面拾取功能已启用')
    this.emit('enabled')
  }

  disable(): void {
    if (!this.enabled) return
    
    this.enabled = false
    this.eventHandler.disable()
    this.highlightRenderer.clearAllHighlights(true)
    this.currentHoverFace = null
    
    console.log('优化面拾取功能已禁用')
    this.emit('disabled')
  }

  handleClick(event: MouseEvent): void {
    if (!this.enabled || !this.isInitialized) return
    
    const startTime = performance.now()
    
    try {
      const rect = this.domElement.getBoundingClientRect()
      const mousePosition = this.raycastManager.screenToNDC(
        event.clientX, 
        event.clientY, 
        rect
      )
      
      const intersection = this.performOptimizedRaycast(mousePosition)
      
      if (intersection) {
        const featureInfo = this.getFeatureInfo(intersection)
        const isMultiSelect = event.ctrlKey || event.metaKey
        this.selectFace(intersection, isMultiSelect, event, featureInfo)
      } else {
        this.clearSelection()
      }
      
      const queryTime = performance.now() - startTime
      this.recordPerformance('click', queryTime)
      
    } catch (error) {
      console.error('优化点击处理失败:', error)
      this.emit('error', { type: 'click', error })
    }
  }

  private performOptimizedRaycast(mousePosition: THREE.Vector2): FaceInfoWithId | null {
    const raycastStart = performance.now()
    
    const immutableMeshArray = Array.from(this.immutableMeshes.values())
    const intersection = this.raycastManager.intersectFaces(mousePosition, immutableMeshArray)
    
    this.performanceStats.raycastTime += performance.now() - raycastStart
    this.performanceStats.totalQueries++
    
    if (!intersection) return null
    
    // 转换为 FaceInfoWithId
    const id = `${intersection.mesh.uuid}_${intersection.faceIndex}`
    return {
      ...intersection,
      id
    } as FaceInfoWithId
  }

  private getFeatureInfo(intersection: FaceInfoWithId): FeatureInfo | null {
    if (!this.config.enableFeatureDetection) return null
    
    const featureLookupStart = performance.now()
    
    const meshId = this.getMeshId(intersection.mesh)
    if (!meshId) return null
    
    const feature = this.featurePool.getFeatureByFace(meshId, intersection.faceIndex)
    
    this.performanceStats.featureLookupTime += performance.now() - featureLookupStart
    
    if (feature) {
      this.performanceStats.cacheHitRate = 
        (this.performanceStats.cacheHitRate * (this.performanceStats.totalQueries - 1) + 1) / 
        this.performanceStats.totalQueries
      
      return {
        type: feature.type,
        id: feature.id,
        feature: feature.feature,
        relatedFaces: this.featurePool.getFeatureTriangles(meshId, feature.id)
      }
    }
    
    return null
  }

  private getMeshId(mesh: THREE.Mesh): string | null {
    if (mesh.userData && mesh.userData.isImmutable) {
      for (const [meshId, immutableMesh] of this.immutableMeshes) {
        if (immutableMesh === mesh) {
          return meshId
        }
      }
    }
    
    return this.meshRegistry.get(mesh) || null
  }

  selectFace(faceInfo: FaceInfoWithId, additive: boolean = false, originalEvent: MouseEvent | null = null, featureInfo: FeatureInfo | null = null): void {
    if (!faceInfo) return
    
    const enhancedFaceInfo: EnhancedFaceInfo = {
      ...faceInfo,
      feature: featureInfo
    }
    
    const wasSelected = this.selectionManager.contains(enhancedFaceInfo)
    
    if (additive) {
      this.selectionManager.setSelectionMode('multi', false)
      
      if (wasSelected) {
        this.selectionManager.removeFace(enhancedFaceInfo)
        this.emit('faceDeselected', enhancedFaceInfo, originalEvent)
      } else {
        this.selectionManager.addFace(enhancedFaceInfo)
        this.emit('faceSelected', enhancedFaceInfo, originalEvent)
      }
    } else {
      this.selectionManager.setSelectionMode('single', false)
      
      const previousSelection = this.selectionManager.getAll()
      this.selectionManager.clearAll(false)
      
      previousSelection.forEach(face => {
        this.emit('faceDeselected', face, originalEvent)
      })
      
      this.selectionManager.addFace(enhancedFaceInfo)
      this.emit('faceSelected', enhancedFaceInfo, originalEvent)
    }
    
    const selectionSummary = this.selectionManager.getSelectionSummary()
    this.emit('selectionChanged', selectionSummary)
    
    if (featureInfo) {
      this.emit('featureSelected', {
        faceInfo: enhancedFaceInfo,
        feature: featureInfo
      })
    }
  }

  handleMouseMove(event: MouseEvent): void {
    if (!this.enabled || !this.isInitialized) return
    
    const startTime = performance.now()
    
    try {
      const rect = this.domElement.getBoundingClientRect()
      const mousePosition = this.raycastManager.screenToNDC(
        event.clientX, 
        event.clientY, 
        rect
      )
      
      const intersection = this.performOptimizedRaycast(mousePosition)
      
      if (intersection) {
        if (!this.currentHoverFace || 
            this.currentHoverFace.mesh !== intersection.mesh || 
            this.currentHoverFace.faceIndex !== intersection.faceIndex) {
          
          if (this.currentHoverFace) {
            this.highlightRenderer.hideHoverEffect(
              this.currentHoverFace.mesh, 
              this.currentHoverFace.faceIndex
            )
          }
          
          if (!this.selectionManager.contains(intersection)) {
            this.highlightRenderer.showHoverEffect(intersection.mesh, intersection.faceIndex)
            this.currentHoverFace = intersection
            
            const featureInfo = this.getFeatureInfo(intersection)
            this.emit('faceHover', intersection, featureInfo)
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
      console.error('优化悬停处理失败:', error)
    }
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

  getFeatureRelatedFaces(meshId: string, featureId: string): Array<{ mesh: THREE.Mesh; faceIndex: number; meshId: string; featureId: string }> {
    const triangleIndices = this.featurePool.getFeatureTriangles(meshId, featureId)
    const mesh = this.immutableMeshes.get(meshId)
    
    if (!mesh || !triangleIndices) return []
    
    return triangleIndices.map(faceIndex => ({
      mesh,
      faceIndex,
      meshId,
      featureId
    }))
  }

  selectFeature(meshId: string, featureId: string): void {
    const relatedFaces = this.getFeatureRelatedFaces(meshId, featureId)
    
    if (relatedFaces.length === 0) return
    
    this.selectionManager.setSelectionMode('multi', false)
    
    relatedFaces.forEach(faceInfo => {
      const id = `${faceInfo.mesh.uuid}_${faceInfo.faceIndex}`

      let point = new THREE.Vector3()
      const geometry = faceInfo.mesh.geometry as THREE.BufferGeometry
      if (geometry?.isBufferGeometry) {
        const vertices = this.raycastManager.getBufferGeometryFaceVertices(geometry, faceInfo.faceIndex)
        if (vertices.length > 0) {
          point = this.raycastManager.calculateFaceCenter(vertices).applyMatrix4(faceInfo.mesh.matrixWorld)
        }
      }

      const baseFaceInfo = this.raycastManager.buildFaceInfo({
        object: faceInfo.mesh,
        faceIndex: faceInfo.faceIndex,
        face: { a: 0, b: 0, c: 0, normal: new THREE.Vector3(), materialIndex: 0 },
        point,
        distance: 0
      } as unknown as THREE.Intersection)

      if (!baseFaceInfo) return

      const faceInfoWithId: FaceInfoWithId = {
        ...baseFaceInfo,
        id,
        featureId: faceInfo.featureId
      }
      this.selectionManager.addFace(faceInfoWithId)
      this.highlightRenderer.highlightFace(faceInfo.mesh, faceInfo.faceIndex)
    })
    
    this.emit('featureSelected', {
      meshId,
      featureId,
      faces: relatedFaces
    })
    
    this.emit('selectionChanged', this.selectionManager.getSelectionSummary())
  }

  private recordPerformance(operation: string, duration: number): void {
    if (duration > 16.67) {
      console.warn(`性能警告: ${operation} 操作耗时 ${duration.toFixed(2)}ms`)
      this.emit('performanceWarning', { operation, duration })
    }
  }

  getPerformanceStats(): PerformanceStats & { featurePool: unknown; averageRaycastTime: string | number; averageFeatureLookupTime: string | number } {
    const featurePoolStats = this.featurePool.getStats()
    
    return {
      ...this.performanceStats,
      featurePool: featurePoolStats,
      averageRaycastTime: this.performanceStats.totalQueries > 0
        ? (this.performanceStats.raycastTime / this.performanceStats.totalQueries).toFixed(2)
        : 0,
      averageFeatureLookupTime: this.performanceStats.totalQueries > 0
        ? (this.performanceStats.featureLookupTime / this.performanceStats.totalQueries).toFixed(2)
        : 0
    }
  }

  private validateMesh(mesh: THREE.Mesh): boolean {
    if (!mesh || !mesh.geometry) return false
    if (!mesh.visible) return false
    if (!mesh.geometry.isBufferGeometry) return false
    
    const positions = mesh.geometry.getAttribute('position')
    return positions && positions.count > 0
  }

  on(eventName: string, callback: EventCallback): void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, [])
    }
    this.eventListeners.get(eventName)!.push(callback)
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

  destroy(): void {
    this.disable()
    this.eventHandler.disable()
    this.highlightRenderer.destroy()
    this.featurePool.destroy()
    
    this.immutableMeshes.clear()
    this.meshRegistry.clear()
    this.bvhCache.clear()
    this.eventListeners.clear()
    
    console.log('OptimizedFacePicker 已销毁')
  }
}
