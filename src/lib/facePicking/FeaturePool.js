import * as THREE from 'three'
import { FeatureDetector } from './FeatureDetector.js'

/**
 * 特征池 - 缓存和管理所有网格的特征数据
 * 提供 O(1) 的特征查找性能
 */
export class FeaturePool {
  constructor() {
    this.featureDetector = new FeatureDetector()
    
    // 特征缓存
    this.meshFeatures = new Map() // meshId -> features
    this.faceToFeature = new Map() // `${meshId}_${faceIndex}` -> feature
    
    // 网格注册表
    this.registeredMeshes = new Map() // meshId -> mesh
    
    // 性能监控
    this.stats = {
      totalMeshes: 0,
      totalFeatures: 0,
      totalTriangles: 0,
      cacheHits: 0,
      cacheMisses: 0,
      preprocessingTime: 0
    }
    
    // 配置
    this.config = {
      enableAutoPreprocessing: true, // 自动预处理新网格
      maxCacheSize: 100, // 最大缓存网格数量
      enableLRU: true, // 启用LRU缓存策略
      preprocessingBatchSize: 5 // 批处理大小
    }
    
    // LRU 缓存管理
    this.accessOrder = new Map() // meshId -> timestamp
  }

  /**
   * 注册网格到特征池
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {boolean} autoPreprocess - 是否自动预处理
   * @returns {Promise<string>} 网格ID
   */
  async registerMesh(mesh, autoPreprocess = true) {
    const meshId = this.featureDetector.generateMeshId(mesh)
    
    // 检查是否已注册
    if (this.registeredMeshes.has(meshId)) {
      console.log(`网格已注册: ${meshId}`)
      return meshId
    }
    
    // 注册网格
    this.registeredMeshes.set(meshId, mesh)
    this.stats.totalMeshes++
    
    console.log(`注册网格: ${mesh.name || meshId}`)
    
    // 自动预处理
    if (autoPreprocess && this.config.enableAutoPreprocessing) {
      await this.preprocessMesh(meshId)
    }
    
    return meshId
  }

  /**
   * 预处理网格特征
   * @param {string} meshId - 网格ID
   * @returns {Promise<Object>} 特征数据
   */
  async preprocessMesh(meshId) {
    const mesh = this.registeredMeshes.get(meshId)
    if (!mesh) {
      throw new Error(`网格未注册: ${meshId}`)
    }
    
    // 检查缓存
    if (this.meshFeatures.has(meshId)) {
      this.updateAccessTime(meshId)
      this.stats.cacheHits++
      return this.meshFeatures.get(meshId)
    }
    
    this.stats.cacheMisses++
    
    try {
      const startTime = performance.now()
      
      // 执行特征检测
      const features = await this.featureDetector.preprocessMesh(mesh)
      
      // 缓存特征数据
      this.cacheFeatures(meshId, features)
      
      // 更新统计信息
      const processingTime = performance.now() - startTime
      this.stats.preprocessingTime += processingTime
      this.stats.totalFeatures += features.planes.length + features.cylinders.length
      this.stats.totalTriangles += features.triangleCount
      
      console.log(`网格预处理完成: ${meshId}, 耗时: ${processingTime.toFixed(2)}ms`)
      
      return features
      
    } catch (error) {
      console.error(`网格预处理失败: ${meshId}`, error)
      throw error
    }
  }

  /**
   * 缓存特征数据
   * @param {string} meshId - 网格ID
   * @param {Object} features - 特征数据
   */
  cacheFeatures(meshId, features) {
    // 检查缓存大小限制
    if (this.config.enableLRU && this.meshFeatures.size >= this.config.maxCacheSize) {
      this.evictLRU()
    }
    
    // 缓存网格特征
    this.meshFeatures.set(meshId, features)
    this.updateAccessTime(meshId)
    
    // 构建快速查找表
    this.buildFastLookupTable(meshId, features)
    
    console.log(`特征已缓存: ${meshId}, 平面: ${features.planes.length}, 圆柱: ${features.cylinders.length}`)
  }

  /**
   * 构建快速查找表
   * @param {string} meshId - 网格ID
   * @param {Object} features - 特征数据
   */
  buildFastLookupTable(meshId, features) {
    // 清理旧的查找表项
    const keysToDelete = []
    for (const key of this.faceToFeature.keys()) {
      if (key.startsWith(`${meshId}_`)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => this.faceToFeature.delete(key))
    
    // 构建新的查找表
    features.faceToFeature.forEach((feature, faceIndex) => {
      const key = `${meshId}_${faceIndex}`
      this.faceToFeature.set(key, {
        meshId,
        faceIndex,
        ...feature
      })
    })
  }

  /**
   * 根据面索引快速查找特征 - O(1) 性能
   * @param {string} meshId - 网格ID
   * @param {number} faceIndex - 面索引
   * @returns {Object|null} 特征信息
   */
  getFeatureByFace(meshId, faceIndex) {
    const key = `${meshId}_${faceIndex}`
    const feature = this.faceToFeature.get(key)
    
    if (feature) {
      this.updateAccessTime(meshId)
      this.stats.cacheHits++
      return feature
    }
    
    this.stats.cacheMisses++
    return null
  }

  /**
   * 获取网格的所有特征
   * @param {string} meshId - 网格ID
   * @returns {Object|null} 特征数据
   */
  getMeshFeatures(meshId) {
    const features = this.meshFeatures.get(meshId)
    
    if (features) {
      this.updateAccessTime(meshId)
      this.stats.cacheHits++
      return features
    }
    
    this.stats.cacheMisses++
    return null
  }

  /**
   * 获取特征的详细信息
   * @param {string} meshId - 网格ID
   * @param {string} featureId - 特征ID
   * @returns {Object|null} 特征详细信息
   */
  getFeatureDetails(meshId, featureId) {
    const features = this.getMeshFeatures(meshId)
    if (!features) return null
    
    // 在平面中查找
    const plane = features.planes.find(p => p.id === featureId)
    if (plane) return plane
    
    // 在圆柱面中查找
    const cylinder = features.cylinders.find(c => c.id === featureId)
    if (cylinder) return cylinder
    
    return null
  }

  /**
   * 获取特征的所有面索引
   * @param {string} meshId - 网格ID
   * @param {string} featureId - 特征ID
   * @returns {Array} 面索引数组
   */
  getFeatureTriangles(meshId, featureId) {
    const feature = this.getFeatureDetails(meshId, featureId)
    return feature ? feature.triangleIndices : []
  }

  /**
   * 检查面是否属于同一特征
   * @param {string} meshId - 网格ID
   * @param {number} faceIndex1 - 面索引1
   * @param {number} faceIndex2 - 面索引2
   * @returns {boolean} 是否属于同一特征
   */
  areFacesInSameFeature(meshId, faceIndex1, faceIndex2) {
    const feature1 = this.getFeatureByFace(meshId, faceIndex1)
    const feature2 = this.getFeatureByFace(meshId, faceIndex2)
    
    return feature1 && feature2 && feature1.id === feature2.id
  }

  /**
   * 获取特征的邻近面
   * @param {string} meshId - 网格ID
   * @param {number} faceIndex - 面索引
   * @param {number} radius - 搜索半径（面数）
   * @returns {Array} 邻近面索引数组
   */
  getNearbyFaces(meshId, faceIndex, radius = 1) {
    const feature = this.getFeatureByFace(meshId, faceIndex)
    if (!feature) return []
    
    const featureTriangles = feature.feature.triangleIndices
    const currentIndex = featureTriangles.indexOf(faceIndex)
    
    if (currentIndex === -1) return []
    
    // 简单实现：返回特征内的相邻面
    const nearbyFaces = []
    const start = Math.max(0, currentIndex - radius)
    const end = Math.min(featureTriangles.length, currentIndex + radius + 1)
    
    for (let i = start; i < end; i++) {
      if (i !== currentIndex) {
        nearbyFaces.push(featureTriangles[i])
      }
    }
    
    return nearbyFaces
  }

  /**
   * 批量预处理网格
   * @param {Array<string>} meshIds - 网格ID数组
   * @returns {Promise<Array>} 处理结果数组
   */
  async batchPreprocess(meshIds) {
    const results = []
    const batchSize = this.config.preprocessingBatchSize
    
    for (let i = 0; i < meshIds.length; i += batchSize) {
      const batch = meshIds.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (meshId) => {
        try {
          const features = await this.preprocessMesh(meshId)
          return { meshId, success: true, features }
        } catch (error) {
          console.error(`批量预处理失败: ${meshId}`, error)
          return { meshId, success: false, error }
        }
      })
      
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
      
      // 避免阻塞主线程
      if (i + batchSize < meshIds.length) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
    
    return results
  }

  /**
   * 更新访问时间（LRU）
   * @param {string} meshId - 网格ID
   */
  updateAccessTime(meshId) {
    if (this.config.enableLRU) {
      this.accessOrder.set(meshId, Date.now())
    }
  }

  /**
   * 驱逐最近最少使用的缓存项
   */
  evictLRU() {
    if (this.accessOrder.size === 0) return
    
    // 找到最旧的访问时间
    let oldestMeshId = null
    let oldestTime = Infinity
    
    for (const [meshId, accessTime] of this.accessOrder) {
      if (accessTime < oldestTime) {
        oldestTime = accessTime
        oldestMeshId = meshId
      }
    }
    
    if (oldestMeshId) {
      this.evictMesh(oldestMeshId)
      console.log(`LRU驱逐缓存: ${oldestMeshId}`)
    }
  }

  /**
   * 驱逐指定网格的缓存
   * @param {string} meshId - 网格ID
   */
  evictMesh(meshId) {
    // 清理特征缓存
    this.meshFeatures.delete(meshId)
    this.accessOrder.delete(meshId)
    
    // 清理快速查找表
    const keysToDelete = []
    for (const key of this.faceToFeature.keys()) {
      if (key.startsWith(`${meshId}_`)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => this.faceToFeature.delete(key))
    
    // 更新统计信息
    const features = this.meshFeatures.get(meshId)
    if (features) {
      this.stats.totalFeatures -= features.planes.length + features.cylinders.length
      this.stats.totalTriangles -= features.triangleCount
    }
  }

  /**
   * 清理所有缓存
   */
  clearCache() {
    this.meshFeatures.clear()
    this.faceToFeature.clear()
    this.accessOrder.clear()
    
    // 重置统计信息
    this.stats.totalFeatures = 0
    this.stats.totalTriangles = 0
    this.stats.cacheHits = 0
    this.stats.cacheMisses = 0
  }

  /**
   * 获取性能统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const cacheEfficiency = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2)
      : 0
    
    return {
      ...this.stats,
      cacheEfficiency: `${cacheEfficiency}%`,
      averagePreprocessingTime: this.stats.totalMeshes > 0
        ? (this.stats.preprocessingTime / this.stats.totalMeshes).toFixed(2)
        : 0,
      cachedMeshes: this.meshFeatures.size,
      registeredMeshes: this.registeredMeshes.size,
      lookupTableSize: this.faceToFeature.size
    }
  }

  /**
   * 导出特征数据
   * @param {string} meshId - 网格ID（可选）
   * @returns {Object} 特征数据
   */
  exportFeatures(meshId = null) {
    if (meshId) {
      return this.getMeshFeatures(meshId)
    }
    
    const allFeatures = {}
    for (const [id, features] of this.meshFeatures) {
      allFeatures[id] = features
    }
    
    return allFeatures
  }

  /**
   * 导入特征数据
   * @param {Object} featuresData - 特征数据
   */
  importFeatures(featuresData) {
    for (const [meshId, features] of Object.entries(featuresData)) {
      this.cacheFeatures(meshId, features)
    }
    
    console.log(`导入了 ${Object.keys(featuresData).length} 个网格的特征数据`)
  }

  /**
   * 验证特征数据完整性
   * @param {string} meshId - 网格ID
   * @returns {Object} 验证结果
   */
  validateFeatures(meshId) {
    const features = this.getMeshFeatures(meshId)
    if (!features) {
      return { valid: false, error: '特征数据不存在' }
    }
    
    const validation = {
      valid: true,
      warnings: [],
      stats: {
        planes: features.planes.length,
        cylinders: features.cylinders.length,
        totalTriangles: features.triangleCount,
        mappedTriangles: features.faceToFeature.size
      }
    }
    
    // 检查映射完整性
    if (features.faceToFeature.size === 0) {
      validation.warnings.push('面到特征的映射表为空')
    }
    
    // 检查特征数量
    if (features.planes.length === 0 && features.cylinders.length === 0) {
      validation.warnings.push('未检测到任何特征')
    }
    
    return validation
  }

  /**
   * 获取特征检测配置
   * @returns {Object} 配置对象
   */
  getDetectorConfig() {
    return this.featureDetector.config
  }

  /**
   * 更新特征检测配置
   * @param {Object} config - 配置更新
   */
  updateDetectorConfig(config) {
    Object.assign(this.featureDetector.config, config)
    console.log('特征检测配置已更新:', config)
  }

  /**
   * 销毁特征池
   */
  destroy() {
    this.clearCache()
    this.registeredMeshes.clear()
    this.featureDetector.clearCache()
    
    console.log('特征池已销毁')
  }
}