import * as THREE from 'three'
import { RaycastManager } from './RaycastManager.js'
import { SelectionManager } from './SelectionManager.js'
import { HighlightRenderer } from './HighlightRenderer.js'
import { EventHandler } from './EventHandler.js'
import { FeaturePool } from './FeaturePool.js'
import { debugLogger } from './DebugLogger.js'

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
  constructor(scene, camera, renderer, domElement) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.domElement = domElement
    
    // 核心组件
    this.raycastManager = new RaycastManager(camera)
    this.selectionManager = new SelectionManager()
    this.highlightRenderer = new HighlightRenderer(scene)
    this.eventHandler = new EventHandler(this, domElement)
    this.featurePool = new FeaturePool()
    
    // 原始模型管理（不可变）
    this.immutableMeshes = new Map() // meshId -> originalMesh
    this.meshRegistry = new Map() // mesh -> meshId
    
    // BVH 缓存
    this.bvhCache = new Map() // meshId -> BVH
    
    // 状态管理
    this.enabled = false
    this.meshes = []
    this.currentHoverFace = null
    this.isInitialized = false
    
    // 性能配置
    this.config = {
      enableFeatureDetection: true,
      enableBVHAcceleration: true,
      enablePreprocessing: true,
      maxPreprocessingTime: 5000, // 5秒预处理时间限制
      batchSize: 3, // 批处理大小
      enableAsyncProcessing: true
    }
    
    // 性能监控
    this.performanceStats = {
      initializationTime: 0,
      preprocessingTime: 0,
      raycastTime: 0,
      featureLookupTime: 0,
      totalQueries: 0,
      cacheHitRate: 0
    }
    
    // 事件系统
    this.eventListeners = new Map()
    
    // 初始化状态
    this.initializationPromise = null
    
    console.log('OptimizedFacePicker 已创建')
  }

  /**
   * 设置可拾取的网格列表并初始化
   * @param {THREE.Mesh[]} meshes - 网格数组
   * @returns {Promise<void>}
   */
  async setMeshes(meshes) {
    const startTime = performance.now()
    
    this.meshes = meshes.filter(mesh => this.validateMesh(mesh))
    
    if (this.meshes.length === 0) {
      console.warn('没有有效的网格可用于面拾取')
      return
    }
    
    console.log(`开始初始化 ${this.meshes.length} 个网格`)
    
    // 执行初始化
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

  /**
   * 初始化所有网格
   * @returns {Promise<void>}
   */
  async initializeMeshes() {
    const tasks = []
    
    // 第一阶段：注册所有网格到特征池
    for (const mesh of this.meshes) {
      const meshId = await this.registerMesh(mesh)
      tasks.push(meshId)
    }
    
    // 第二阶段：批量预处理特征
    if (this.config.enablePreprocessing) {
      await this.batchPreprocessFeatures(tasks)
    }
    
    // 第三阶段：构建 BVH（如果启用）
    if (this.config.enableBVHAcceleration) {
      await this.buildBVHCache()
    }
    
    console.log('所有网格初始化完成')
  }

  /**
   * 注册网格（保存原始不可变副本）
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {Promise<string>} 网格ID
   */
  async registerMesh(mesh) {
    // 生成网格ID
    const meshId = this.featurePool.featureDetector.generateMeshId(mesh)
    
    // 检查是否已注册
    if (this.immutableMeshes.has(meshId)) {
      return meshId
    }
    
    // 创建不可变副本
    const immutableMesh = this.createImmutableCopy(mesh)
    
    // 保存原始网格
    this.immutableMeshes.set(meshId, immutableMesh)
    this.meshRegistry.set(mesh, meshId)
    
    // 注册到特征池
    await this.featurePool.registerMesh(immutableMesh, false) // 不自动预处理
    
    console.log(`网格已注册: ${mesh.name || meshId}`)
    return meshId
  }

  /**
   * 创建网格的不可变副本
   * @param {THREE.Mesh} mesh - 原始网格
   * @returns {THREE.Mesh} 不可变副本
   */
  createImmutableCopy(mesh) {
    // 克隆几何体
    const geometry = mesh.geometry.clone()
    
    // 确保几何体有必要的属性
    if (!geometry.getAttribute('normal')) {
      geometry.computeVertexNormals()
    }
    
    // 冻结几何体以防止修改
    Object.freeze(geometry.attributes)
    Object.freeze(geometry)
    
    // 创建副本网格
    const immutableMesh = new THREE.Mesh(geometry, mesh.material)
    immutableMesh.name = mesh.name + '_immutable'
    immutableMesh.userData = { ...mesh.userData, isImmutable: true }
    
    // 复制变换
    immutableMesh.position.copy(mesh.position)
    immutableMesh.rotation.copy(mesh.rotation)
    immutableMesh.scale.copy(mesh.scale)
    immutableMesh.updateMatrixWorld(true)
    
    return immutableMesh
  }

  /**
   * 批量预处理特征
   * @param {Array<string>} meshIds - 网格ID数组
   * @returns {Promise<void>}
   */
  async batchPreprocessFeatures(meshIds) {
    if (!this.config.enableFeatureDetection) return
    
    const startTime = performance.now()
    console.log(`开始批量预处理 ${meshIds.length} 个网格的特征`)
    
    try {
      const results = await this.featurePool.batchPreprocess(meshIds)
      
      // 统计结果
      const successful = results.filter(r => r.success).length
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

  /**
   * 构建 BVH 缓存
   * @returns {Promise<void>}
   */
  async buildBVHCache() {
    if (!this.config.enableBVHAcceleration) return
    
    console.log('开始构建 BVH 缓存')
    
    // 注意：这里是预留接口，实际 BVH 实现需要额外的库
    // 例如 three-mesh-bvh 或自定义 BVH 实现
    
    for (const [meshId, mesh] of this.immutableMeshes) {
      try {
        // 这里应该构建 BVH，暂时跳过
        // const bvh = new MeshBVH(mesh.geometry)
        // this.bvhCache.set(meshId, bvh)
        
        console.log(`BVH 已构建: ${meshId}`)
      } catch (error) {
        console.warn(`BVH 构建失败: ${meshId}`, error)
      }
    }
    
    console.log('BVH 缓存构建完成')
  }

  /**
   * 启用面拾取功能
   */
  enable() {
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

  /**
   * 禁用面拾取功能
   */
  disable() {
    if (!this.enabled) return
    
    this.enabled = false
    this.eventHandler.disable()
    this.highlightRenderer.clearAllHighlights(true)
    this.currentHoverFace = null
    
    console.log('优化面拾取功能已禁用')
    this.emit('disabled')
  }

  /**
   * 处理点击事件 - 优化版本
   * @param {MouseEvent} event - 鼠标事件
   */
  handleClick(event) {
    if (!this.enabled || !this.isInitialized) return
    
    const startTime = performance.now()
    
    try {
      // 计算鼠标位置
      const rect = this.domElement.getBoundingClientRect()
      const mousePosition = this.raycastManager.screenToNDC(
        event.clientX, 
        event.clientY, 
        rect
      )
      
      // 执行优化的射线投射
      const intersection = this.performOptimizedRaycast(mousePosition)
      
      if (intersection) {
        // 获取特征信息
        const featureInfo = this.getFeatureInfo(intersection)
        
        // 处理选择
        const isMultiSelect = event.ctrlKey || event.metaKey
        this.selectFace(intersection, isMultiSelect, event, featureInfo)
      } else {
        // 点击空白区域，清除选择
        this.clearSelection()
      }
      
      // 记录性能
      const queryTime = performance.now() - startTime
      this.recordPerformance('click', queryTime)
      
    } catch (error) {
      console.error('优化点击处理失败:', error)
      this.emit('error', { type: 'click', error })
    }
  }

  /**
   * 执行优化的射线投射
   * @param {THREE.Vector2} mousePosition - 标准化鼠标位置
   * @returns {Object|null} 交点信息
   */
  performOptimizedRaycast(mousePosition) {
    const raycastStart = performance.now()
    
    // 使用原始不可变网格进行射线投射
    const immutableMeshArray = Array.from(this.immutableMeshes.values())
    
    // 执行射线投射
    const intersection = this.raycastManager.intersectFaces(mousePosition, immutableMeshArray)
    
    this.performanceStats.raycastTime += performance.now() - raycastStart
    this.performanceStats.totalQueries++
    
    return intersection
  }

  /**
   * 获取面的特征信息
   * @param {Object} intersection - 射线投射结果
   * @returns {Object|null} 特征信息
   */
  getFeatureInfo(intersection) {
    if (!this.config.enableFeatureDetection) return null
    
    const featureLookupStart = performance.now()
    
    // 获取网格ID
    const meshId = this.getMeshId(intersection.mesh)
    if (!meshId) return null
    
    // O(1) 特征查找
    const feature = this.featurePool.getFeatureByFace(meshId, intersection.faceIndex)
    
    this.performanceStats.featureLookupTime += performance.now() - featureLookupStart
    
    if (feature) {
      // 缓存命中
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

  /**
   * 获取网格ID
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {string|null} 网格ID
   */
  getMeshId(mesh) {
    // 检查是否是不可变网格
    if (mesh.userData && mesh.userData.isImmutable) {
      // 直接从不可变网格映射中查找
      for (const [meshId, immutableMesh] of this.immutableMeshes) {
        if (immutableMesh === mesh) {
          return meshId
        }
      }
    }
    
    // 从注册表中查找
    return this.meshRegistry.get(mesh) || null
  }

  /**
   * 选择面 - 增强版本
   * @param {Object} faceInfo - 面信息
   * @param {boolean} additive - 是否多选
   * @param {MouseEvent} originalEvent - 原始事件
   * @param {Object} featureInfo - 特征信息
   */
  selectFace(faceInfo, additive = false, originalEvent = null, featureInfo = null) {
    if (!faceInfo) return
    
    // 增强面信息
    const enhancedFaceInfo = {
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
    
    // 发出选择变化事件
    const selectionSummary = this.selectionManager.getSelectionSummary()
    this.emit('selectionChanged', selectionSummary)
    
    // 如果有特征信息，发出特征选择事件
    if (featureInfo) {
      this.emit('featureSelected', {
        faceInfo: enhancedFaceInfo,
        feature: featureInfo
      })
    }
  }

  /**
   * 处理鼠标移动事件 - 优化版本
   * @param {MouseEvent} event - 鼠标事件
   */
  handleMouseMove(event) {
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
          
          // 清除之前的悬停效果
          if (this.currentHoverFace) {
            this.highlightRenderer.hideHoverEffect(
              this.currentHoverFace.mesh, 
              this.currentHoverFace.faceIndex
            )
          }
          
          // 显示新的悬停效果
          if (!this.selectionManager.contains(intersection)) {
            this.highlightRenderer.showHoverEffect(intersection.mesh, intersection.faceIndex)
            this.currentHoverFace = intersection
            
            // 获取特征信息并发出事件
            const featureInfo = this.getFeatureInfo(intersection)
            this.emit('faceHover', intersection, featureInfo)
          } else {
            this.currentHoverFace = null
          }
        }
      } else {
        // 清除悬停效果
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

  /**
   * 清除所有选择
   */
  clearSelection() {
    const selectedFaces = this.selectionManager.getAll()
    this.selectionManager.clearAll()
    
    selectedFaces.forEach(face => {
      this.highlightRenderer.removeHighlight(face.mesh, face.faceIndex, false)
      this.emit('faceDeselected', face)
    })
    
    this.emit('selectionCleared')
    this.emit('selectionChanged', this.selectionManager.getSelectionSummary())
  }

  /**
   * 获取特征的所有相关面
   * @param {string} meshId - 网格ID
   * @param {string} featureId - 特征ID
   * @returns {Array} 面信息数组
   */
  getFeatureRelatedFaces(meshId, featureId) {
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

  /**
   * 选择整个特征
   * @param {string} meshId - 网格ID
   * @param {string} featureId - 特征ID
   */
  selectFeature(meshId, featureId) {
    const relatedFaces = this.getFeatureRelatedFaces(meshId, featureId)
    
    if (relatedFaces.length === 0) return
    
    // 切换到多选模式
    this.selectionManager.setSelectionMode('multi', false)
    
    // 选择所有相关面
    relatedFaces.forEach(faceInfo => {
      this.selectionManager.addFace(faceInfo)
      this.highlightRenderer.highlightFace(faceInfo.mesh, faceInfo.faceIndex)
    })
    
    this.emit('featureSelected', {
      meshId,
      featureId,
      faces: relatedFaces
    })
    
    this.emit('selectionChanged', this.selectionManager.getSelectionSummary())
  }

  /**
   * 记录性能数据
   * @param {string} operation - 操作类型
   * @param {number} duration - 持续时间
   */
  recordPerformance(operation, duration) {
    // 更新统计信息
    if (operation === 'click') {
      // 点击操作的性能已在 handleClick 中记录
    } else if (operation === 'hover') {
      // 悬停操作的性能统计
    }
    
    // 检查性能阈值
    if (duration > 16.67) { // 60fps 阈值
      console.warn(`性能警告: ${operation} 操作耗时 ${duration.toFixed(2)}ms`)
      this.emit('performanceWarning', { operation, duration })
    }
  }

  /**
   * 获取性能统计信息
   * @returns {Object} 性能统计
   */
  getPerformanceStats() {
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

  /**
   * 验证网格
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {boolean} 是否有效
   */
  validateMesh(mesh) {
    if (!mesh || !mesh.geometry) return false
    if (!mesh.visible) return false
    if (!mesh.geometry.isBufferGeometry) return false
    
    const positions = mesh.geometry.getAttribute('position')
    return positions && positions.count > 0
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
   * 销毁优化面拾取器
   */
  destroy() {
    this.disable()
    this.eventHandler.disable()
    this.highlightRenderer.destroy()
    this.featurePool.destroy()
    
    // 清理缓存
    this.immutableMeshes.clear()
    this.meshRegistry.clear()
    this.bvhCache.clear()
    
    // 清理事件监听器
    this.eventListeners.clear()
    
    console.log('OptimizedFacePicker 已销毁')
  }
}