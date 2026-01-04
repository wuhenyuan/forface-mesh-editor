import * as THREE from 'three'
import { FeatureDetector, MeshFeatures } from './FeatureDetector'

interface FeaturePoolConfig {
  enableAutoPreprocessing: boolean
  maxCacheSize: number
  enableLRU: boolean
  preprocessingBatchSize: number
}

interface FeaturePoolStats {
  totalMeshes: number
  totalFeatures: number
  totalTriangles: number
  cacheHits: number
  cacheMisses: number
  preprocessingTime: number
}

interface FeatureInfo {
  meshId: string
  faceIndex: number
  type: 'plane' | 'cylinder'
  id: string
  feature: unknown
}

interface BatchPreprocessResult {
  meshId: string
  success: boolean
  features?: MeshFeatures
  error?: unknown
}

/**
 * 特征池 - 缓存和管理所有网格的特征数据
 * 提供 O(1) 的特征查找性能
 */
export class FeaturePool {
  featureDetector: FeatureDetector
  private meshFeatures: Map<string, MeshFeatures>
  private faceToFeature: Map<string, FeatureInfo>
  private registeredMeshes: Map<string, THREE.Mesh>
  private stats: FeaturePoolStats
  private config: FeaturePoolConfig
  private accessOrder: Map<string, number>

  constructor() {
    this.featureDetector = new FeatureDetector()
    
    this.meshFeatures = new Map()
    this.faceToFeature = new Map()
    this.registeredMeshes = new Map()
    this.accessOrder = new Map()
    
    this.stats = {
      totalMeshes: 0,
      totalFeatures: 0,
      totalTriangles: 0,
      cacheHits: 0,
      cacheMisses: 0,
      preprocessingTime: 0
    }
    
    this.config = {
      enableAutoPreprocessing: true,
      maxCacheSize: 100,
      enableLRU: true,
      preprocessingBatchSize: 5
    }
  }

  /**
   * 注册网格到特征池
   */
  async registerMesh(mesh: THREE.Mesh, autoPreprocess: boolean = true): Promise<string> {
    const meshId = this.featureDetector.generateMeshId(mesh)
    
    if (this.registeredMeshes.has(meshId)) {
      console.log(`网格已注册: ${meshId}`)
      return meshId
    }
    
    this.registeredMeshes.set(meshId, mesh)
    this.stats.totalMeshes++
    
    console.log(`注册网格: ${mesh.name || meshId}`)
    
    if (autoPreprocess && this.config.enableAutoPreprocessing) {
      await this.preprocessMesh(meshId)
    }
    
    return meshId
  }

  /**
   * 预处理网格特征
   */
  async preprocessMesh(meshId: string): Promise<MeshFeatures> {
    const mesh = this.registeredMeshes.get(meshId)
    if (!mesh) {
      throw new Error(`网格未注册: ${meshId}`)
    }
    
    if (this.meshFeatures.has(meshId)) {
      this.updateAccessTime(meshId)
      this.stats.cacheHits++
      return this.meshFeatures.get(meshId)!
    }
    
    this.stats.cacheMisses++
    
    try {
      const startTime = performance.now()
      
      const features = await this.featureDetector.preprocessMesh(mesh)
      
      this.cacheFeatures(meshId, features)
      
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
   */
  private cacheFeatures(meshId: string, features: MeshFeatures): void {
    if (this.config.enableLRU && this.meshFeatures.size >= this.config.maxCacheSize) {
      this.evictLRU()
    }
    
    this.meshFeatures.set(meshId, features)
    this.updateAccessTime(meshId)
    
    this.buildFastLookupTable(meshId, features)
    
    console.log(`特征已缓存: ${meshId}, 平面: ${features.planes.length}, 圆柱: ${features.cylinders.length}`)
  }

  /**
   * 构建快速查找表
   */
  private buildFastLookupTable(meshId: string, features: MeshFeatures): void {
    const keysToDelete: string[] = []
    for (const key of this.faceToFeature.keys()) {
      if (key.startsWith(`${meshId}_`)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => this.faceToFeature.delete(key))
    
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
   */
  getFeatureByFace(meshId: string, faceIndex: number): FeatureInfo | null {
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
   */
  getMeshFeatures(meshId: string): MeshFeatures | null {
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
   */
  getFeatureDetails(meshId: string, featureId: string): unknown {
    const features = this.getMeshFeatures(meshId)
    if (!features) return null
    
    const plane = features.planes.find(p => p.id === featureId)
    if (plane) return plane
    
    const cylinder = features.cylinders.find(c => c.id === featureId)
    if (cylinder) return cylinder
    
    return null
  }

  /**
   * 获取特征的所有面索引
   */
  getFeatureTriangles(meshId: string, featureId: string): number[] {
    const feature = this.getFeatureDetails(meshId, featureId) as { triangleIndices?: number[] } | null
    return feature?.triangleIndices || []
  }

  /**
   * 检查面是否属于同一特征
   */
  areFacesInSameFeature(meshId: string, faceIndex1: number, faceIndex2: number): boolean {
    const feature1 = this.getFeatureByFace(meshId, faceIndex1)
    const feature2 = this.getFeatureByFace(meshId, faceIndex2)
    
    return feature1 !== null && feature2 !== null && feature1.id === feature2.id
  }

  /**
   * 获取特征的邻近面
   */
  getNearbyFaces(meshId: string, faceIndex: number, radius: number = 1): number[] {
    const feature = this.getFeatureByFace(meshId, faceIndex)
    if (!feature) return []
    
    const featureTriangles = this.getFeatureTriangles(meshId, feature.id)
    const currentIndex = featureTriangles.indexOf(faceIndex)
    
    if (currentIndex === -1) return []
    
    const nearbyFaces: number[] = []
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
   */
  async batchPreprocess(meshIds: string[]): Promise<BatchPreprocessResult[]> {
    const results: BatchPreprocessResult[] = []
    const batchSize = this.config.preprocessingBatchSize
    
    for (let i = 0; i < meshIds.length; i += batchSize) {
      const batch = meshIds.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (meshId): Promise<BatchPreprocessResult> => {
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
      
      if (i + batchSize < meshIds.length) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
    
    return results
  }

  /**
   * 更新访问时间（LRU）
   */
  private updateAccessTime(meshId: string): void {
    if (this.config.enableLRU) {
      this.accessOrder.set(meshId, Date.now())
    }
  }

  /**
   * 驱逐最近最少使用的缓存项
   */
  private evictLRU(): void {
    if (this.accessOrder.size === 0) return
    
    let oldestMeshId: string | null = null
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
   */
  private evictMesh(meshId: string): void {
    const features = this.meshFeatures.get(meshId)
    
    this.meshFeatures.delete(meshId)
    this.accessOrder.delete(meshId)
    
    const keysToDelete: string[] = []
    for (const key of this.faceToFeature.keys()) {
      if (key.startsWith(`${meshId}_`)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => this.faceToFeature.delete(key))
    
    if (features) {
      this.stats.totalFeatures -= features.planes.length + features.cylinders.length
      this.stats.totalTriangles -= features.triangleCount
    }
  }

  /**
   * 清理所有缓存
   */
  clearCache(): void {
    this.meshFeatures.clear()
    this.faceToFeature.clear()
    this.accessOrder.clear()
    
    this.stats.totalFeatures = 0
    this.stats.totalTriangles = 0
    this.stats.cacheHits = 0
    this.stats.cacheMisses = 0
  }

  /**
   * 获取性能统计信息
   */
  getStats(): FeaturePoolStats & {
    cacheEfficiency: string
    averagePreprocessingTime: string | number
    cachedMeshes: number
    registeredMeshes: number
    lookupTableSize: number
  } {
    const cacheEfficiency = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(2)
      : '0'
    
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
   */
  exportFeatures(meshId: string | null = null): MeshFeatures | Record<string, MeshFeatures> | null {
    if (meshId) {
      return this.getMeshFeatures(meshId)
    }
    
    const allFeatures: Record<string, MeshFeatures> = {}
    for (const [id, features] of this.meshFeatures) {
      allFeatures[id] = features
    }
    
    return allFeatures
  }

  /**
   * 导入特征数据
   */
  importFeatures(featuresData: Record<string, MeshFeatures>): void {
    for (const [meshId, features] of Object.entries(featuresData)) {
      this.cacheFeatures(meshId, features)
    }
    
    console.log(`导入了 ${Object.keys(featuresData).length} 个网格的特征数据`)
  }

  /**
   * 验证特征数据完整性
   */
  validateFeatures(meshId: string): { valid: boolean; error?: string; warnings: string[]; stats: unknown } {
    const features = this.getMeshFeatures(meshId)
    if (!features) {
      return { valid: false, error: '特征数据不存在', warnings: [], stats: null }
    }
    
    const validation = {
      valid: true,
      warnings: [] as string[],
      stats: {
        planes: features.planes.length,
        cylinders: features.cylinders.length,
        totalTriangles: features.triangleCount,
        mappedTriangles: features.faceToFeature.size
      }
    }
    
    if (features.faceToFeature.size === 0) {
      validation.warnings.push('面到特征的映射表为空')
    }
    
    if (features.planes.length === 0 && features.cylinders.length === 0) {
      validation.warnings.push('未检测到任何特征')
    }
    
    return validation
  }

  /**
   * 获取特征检测配置
   */
  getDetectorConfig(): unknown {
    return this.featureDetector.config
  }

  /**
   * 更新特征检测配置
   */
  updateDetectorConfig(config: Partial<typeof this.featureDetector.config>): void {
    Object.assign(this.featureDetector.config, config)
    console.log('特征检测配置已更新:', config)
  }

  /**
   * 销毁特征池
   */
  destroy(): void {
    this.clearCache()
    this.registeredMeshes.clear()
    this.featureDetector.clearCache()
    
    console.log('特征池已销毁')
  }
}
