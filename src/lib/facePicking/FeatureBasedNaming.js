import * as THREE from 'three'
import { VertexBasedIdentifier } from './VertexBasedIdentifier.js'

/**
 * 基于特征的稳定命名系统
 * 
 * 核心概念：
 * - 一个 name 对应一整个几何特征（平面、圆柱面等）
 * - 每个特征包含多个三角形面
 * - 用户点击任意三角形，返回对应的特征名字
 * - 特征名字基于原始模型的顶点索引生成，绝对稳定唯一
 */
export class FeatureBasedNaming {
  constructor() {
    // 初始化基于顶点索引的标识符
    this.vertexIdentifier = new VertexBasedIdentifier()
    // 特征名字到特征信息的映射
    this.nameToFeatureMap = new Map() // featureName -> { type, triangles, geometry, mesh }
    
    // 三角形面到特征名字的快速查找
    this.triangleToFeatureMap = new Map() // `${meshId}_${triangleIndex}` -> featureName
    
    // 网格的特征缓存
    this.meshFeatures = new Map() // meshId -> { features: [], nameMap: Map }
    
    // 配置参数
    this.config = {
      // 平面检测参数
      planeAngleTolerance: 0.1,      // 法向量角度容差
      planeDistanceTolerance: 0.01,  // 距离容差
      minPlaneTriangles: 3,          // 最小三角形数量
      
      // 圆柱检测参数
      cylinderAngleTolerance: 0.15,  // 轴向角度容差
      minCylinderTriangles: 6,       // 最小三角形数量
      
      // 几何精度
      geometryPrecision: 1000        // 坐标精度
    }
  }

  /**
   * 为网格检测并命名所有特征
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {string} meshId - 网格标识
   * @returns {Object} 特征信息
   */
  detectAndNameFeatures(mesh, meshId) {
    console.log(`开始检测网格 ${meshId} 的特征...`)
    
    const geometry = mesh.geometry
    const triangleCount = this.getTriangleCount(geometry)
    
    // 检测所有特征
    const features = this.detectAllFeatures(mesh, meshId)
    
    // 为每个特征生成稳定名字
    const namedFeatures = []
    features.forEach((feature, index) => {
      const featureName = this.generateVertexBasedName(feature, geometry, index)
      
      // 存储特征信息
      this.nameToFeatureMap.set(featureName, {
        ...feature,
        name: featureName,
        mesh: mesh,
        meshId: meshId
      })
      
      // 建立三角形到特征的映射
      feature.triangles.forEach(triangleIndex => {
        const triangleKey = `${meshId}_${triangleIndex}`
        this.triangleToFeatureMap.set(triangleKey, featureName)
      })
      
      namedFeatures.push({
        name: featureName,
        type: feature.type,
        triangleCount: feature.triangles.length,
        area: feature.area,
        center: feature.center
      })
    })
    
    // 缓存结果
    this.meshFeatures.set(meshId, {
      features: namedFeatures,
      totalTriangles: triangleCount,
      featureCount: namedFeatures.length
    })
    
    console.log(`网格 ${meshId} 检测到 ${namedFeatures.length} 个特征`)
    return namedFeatures
  }

  /**
   * 检测网格的所有特征
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {string} meshId - 网格标识
   * @returns {Array} 特征数组
   */
  detectAllFeatures(mesh, meshId) {
    const geometry = mesh.geometry
    const triangleCount = this.getTriangleCount(geometry)
    const processed = new Set() // 已处理的三角形
    const features = []
    
    // 遍历所有三角形，寻找特征
    for (let i = 0; i < triangleCount; i++) {
      if (processed.has(i)) continue
      
      const triangleData = this.getTriangleData(geometry, i)
      if (!triangleData) continue
      
      // 尝试从这个三角形开始生长特征
      const feature = this.growFeature(geometry, i, triangleData, processed)
      
      if (feature && feature.triangles.length >= this.getMinTrianglesForType(feature.type)) {
        features.push(feature)
      }
    }
    
    return features
  }

  /**
   * 从种子三角形开始生长特征
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {number} seedIndex - 种子三角形索引
   * @param {Object} seedData - 种子三角形数据
   * @param {Set} processed - 已处理的三角形集合
   * @returns {Object} 特征对象
   */
  growFeature(geometry, seedIndex, seedData, processed) {
    // 首先判断可能的特征类型
    const potentialType = this.classifyTriangle(seedData)
    
    if (potentialType === 'plane') {
      return this.growPlaneFeature(geometry, seedIndex, seedData, processed)
    } else if (potentialType === 'cylinder') {
      return this.growCylinderFeature(geometry, seedIndex, seedData, processed)
    } else {
      // 单独的三角形作为独立特征
      processed.add(seedIndex)
      return {
        type: 'individual',
        triangles: [seedIndex],
        center: seedData.center.clone(),
        normal: seedData.normal.clone(),
        area: seedData.area,
        bounds: new THREE.Box3().expandByPoint(seedData.center)
      }
    }
  }

  /**
   * 生长平面特征
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {number} seedIndex - 种子索引
   * @param {Object} seedData - 种子数据
   * @param {Set} processed - 已处理集合
   * @returns {Object} 平面特征
   */
  growPlaneFeature(geometry, seedIndex, seedData, processed) {
    const plane = {
      type: 'plane',
      triangles: [seedIndex],
      normal: seedData.normal.clone(),
      point: seedData.center.clone(),
      area: seedData.area,
      bounds: new THREE.Box3()
    }
    
    processed.add(seedIndex)
    plane.bounds.expandByPoint(seedData.center)
    
    // 使用队列进行区域生长
    const queue = [seedIndex]
    const triangleCount = this.getTriangleCount(geometry)
    
    while (queue.length > 0) {
      const currentIndex = queue.shift()
      
      // 检查相邻的三角形（简化：检查附近的三角形）
      const checkRange = Math.min(50, triangleCount - currentIndex)
      
      for (let i = 1; i <= checkRange; i++) {
        const neighborIndex = currentIndex + i
        if (neighborIndex >= triangleCount || processed.has(neighborIndex)) continue
        
        const neighborData = this.getTriangleData(geometry, neighborIndex)
        if (!neighborData) continue
        
        // 检查是否共面
        if (this.isCoplanar(plane, neighborData)) {
          processed.add(neighborIndex)
          plane.triangles.push(neighborIndex)
          plane.area += neighborData.area
          plane.bounds.expandByPoint(neighborData.center)
          queue.push(neighborIndex)
          
          // 更新平面参数
          this.updatePlaneParameters(plane, neighborData)
          
          // 限制特征大小
          if (plane.triangles.length > 1000) break
        }
      }
    }
    
    return plane
  }

  /**
   * 生长圆柱特征 - 使用精度适配
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {number} seedIndex - 种子索引
   * @param {Object} seedData - 种子数据
   * @param {Set} processed - 已处理集合
   * @returns {Object} 圆柱特征
   */
  growCylinderFeature(geometry, seedIndex, seedData, processed) {
    // 估算圆柱轴向和中心
    const axis = this.estimateCylinderAxis(seedData)
    const center = seedData.center.clone()
    
    // 收集候选三角形
    const candidateTriangles = [seedData]
    const candidateIndices = [seedIndex]
    
    // 简化的区域生长收集候选三角形
    const queue = [seedIndex]
    const triangleCount = this.getTriangleCount(geometry)
    
    processed.add(seedIndex)
    
    while (queue.length > 0 && candidateTriangles.length < 100) {
      const currentIndex = queue.shift()
      const checkRange = Math.min(30, triangleCount - currentIndex)
      
      for (let i = 1; i <= checkRange; i++) {
        const neighborIndex = currentIndex + i
        if (neighborIndex >= triangleCount || processed.has(neighborIndex)) continue
        
        const neighborData = this.getTriangleData(geometry, neighborIndex)
        if (!neighborData) continue
        
        // 基础圆柱检查
        if (this.isBasicCylindrical(axis, neighborData)) {
          processed.add(neighborIndex)
          candidateTriangles.push(neighborData)
          candidateIndices.push(neighborIndex)
          queue.push(neighborIndex)
        }
      }
    }
    
    // 使用精度适配器进行精确检测
    const precisionAdaptedFeature = this.cylinderAdapter.detectCylinderWithPrecisionAdaptation(
      candidateTriangles,
      axis,
      center
    )
    
    if (!precisionAdaptedFeature) {
      // 回退到基础圆柱特征
      return {
        type: 'cylinder',
        triangles: candidateIndices,
        axis: axis,
        center: center,
        area: candidateTriangles.reduce((sum, t) => sum + t.area, 0),
        bounds: this.calculateBounds(candidateTriangles),
        precision: { level: 'unknown', segments: candidateTriangles.length }
      }
    }
    
    return {
      ...precisionAdaptedFeature,
      triangles: candidateIndices // 使用实际的三角形索引
    }
  }

  /**
   * 生成基于顶点索引的稳定特征名字
   * @param {Object} feature - 特征对象
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {number} featureIndex - 特征索引
   * @returns {string} 稳定特征名字
   */
  generateVertexBasedName(feature, geometry, featureIndex) {
    // 1. 基于顶点索引生成稳定标识
    const vertexId = this.vertexIdentifier.generateVertexBasedId(feature.triangles, geometry)
    
    // 2. 添加特征类型和索引
    const featureName = `${feature.type}_${vertexId}_idx${featureIndex}`
    
    return featureName
  }

  /**
   * 根据三角形索引查找特征名字
   * @param {string} meshId - 网格ID
   * @param {number} triangleIndex - 三角形索引
   * @returns {string|null} 特征名字
   */
  getFeatureNameByTriangle(meshId, triangleIndex) {
    const triangleKey = `${meshId}_${triangleIndex}`
    return this.triangleToFeatureMap.get(triangleKey) || null
  }

  /**
   * 根据特征名字查找特征信息
   * @param {string} featureName - 特征名字
   * @returns {Object|null} 特征信息
   */
  getFeatureByName(featureName) {
    return this.nameToFeatureMap.get(featureName) || null
  }

  /**
   * 获取特征包含的所有三角形
   * @param {string} featureName - 特征名字
   * @returns {Array} 三角形索引数组
   */
  getFeatureTriangles(featureName) {
    const feature = this.nameToFeatureMap.get(featureName)
    return feature ? feature.triangles : []
  }

  /**
   * 导出特征配置
   * @returns {Object} 配置对象
   */
  exportFeatureConfig() {
    const config = {
      version: '1.0',
      timestamp: Date.now(),
      features: {},
      meshInfo: {}
    }
    
    // 导出特征信息
    this.nameToFeatureMap.forEach((feature, featureName) => {
      config.features[featureName] = {
        type: feature.type,
        meshId: feature.meshId,
        triangleCount: feature.triangles.length,
        area: feature.area,
        center: feature.center.toArray(),
        // 不存储具体的三角形列表，运行时重新生成
      }
    })
    
    // 导出网格信息
    this.meshFeatures.forEach((meshInfo, meshId) => {
      config.meshInfo[meshId] = {
        featureCount: meshInfo.featureCount,
        totalTriangles: meshInfo.totalTriangles
      }
    })
    
    return config
  }

  // ========== 辅助方法 ==========

  /**
   * 基础圆柱检查
   * @param {THREE.Vector3} axis - 圆柱轴向
   * @param {Object} triangleData - 三角形数据
   * @returns {boolean} 是否可能属于圆柱
   */
  isBasicCylindrical(axis, triangleData) {
    // 检查法向量是否大致垂直于轴向
    const axisAngle = Math.abs(axis.dot(triangleData.normal))
    return axisAngle <= this.config.cylinderAngleTolerance
  }

  /**
   * 计算三角形数据的边界框
   * @param {Array} triangleDataArray - 三角形数据数组
   * @returns {THREE.Box3} 边界框
   */
  calculateBounds(triangleDataArray) {
    const bounds = new THREE.Box3()
    triangleDataArray.forEach(triangleData => {
      if (triangleData.center) {
        bounds.expandByPoint(triangleData.center)
      }
      if (triangleData.vertices) {
        triangleData.vertices.forEach(vertex => {
          bounds.expandByPoint(vertex)
        })
      }
    })
    return bounds
  }

  /**
   * 获取三角形数据
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {number} triangleIndex - 三角形索引
   * @returns {Object} 三角形数据
   */
  getTriangleData(geometry, triangleIndex) {
    const positions = geometry.getAttribute('position')
    const indices = geometry.index
    
    if (!positions) return null
    
    // 获取顶点索引
    let i1, i2, i3
    if (indices) {
      i1 = indices.getX(triangleIndex * 3)
      i2 = indices.getX(triangleIndex * 3 + 1)
      i3 = indices.getX(triangleIndex * 3 + 2)
    } else {
      i1 = triangleIndex * 3
      i2 = triangleIndex * 3 + 1
      i3 = triangleIndex * 3 + 2
    }
    
    // 获取顶点坐标
    const v1 = new THREE.Vector3(positions.getX(i1), positions.getY(i1), positions.getZ(i1))
    const v2 = new THREE.Vector3(positions.getX(i2), positions.getY(i2), positions.getZ(i2))
    const v3 = new THREE.Vector3(positions.getX(i3), positions.getY(i3), positions.getZ(i3))
    
    // 计算法向量
    const edge1 = v2.clone().sub(v1)
    const edge2 = v3.clone().sub(v1)
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize()
    
    // 计算中心点
    const center = new THREE.Vector3().add(v1).add(v2).add(v3).divideScalar(3)
    
    // 计算面积
    const area = edge1.cross(edge2).length() * 0.5
    
    return { vertices: [v1, v2, v3], normal, center, area }
  }

  /**
   * 分类三角形类型
   * @param {Object} triangleData - 三角形数据
   * @returns {string} 类型
   */
  classifyTriangle(triangleData) {
    // 简化分类：基于面积大小
    if (triangleData.area > 1.0) {
      return 'plane' // 大面积可能是平面的一部分
    } else if (triangleData.area > 0.1) {
      return 'cylinder' // 中等面积可能是圆柱的一部分
    }
    return 'individual'
  }

  /**
   * 检查是否共面
   * @param {Object} plane - 平面特征
   * @param {Object} triangleData - 三角形数据
   * @returns {boolean} 是否共面
   */
  isCoplanar(plane, triangleData) {
    // 检查法向量角度
    const angleDiff = plane.normal.angleTo(triangleData.normal)
    if (angleDiff > this.config.planeAngleTolerance && 
        Math.PI - angleDiff > this.config.planeAngleTolerance) {
      return false
    }
    
    // 检查点到平面距离
    const distance = Math.abs(plane.normal.dot(triangleData.center.clone().sub(plane.point)))
    return distance <= this.config.planeDistanceTolerance
  }

  /**
   * 检查是否属于圆柱
   * @param {Object} cylinder - 圆柱特征
   * @param {Object} triangleData - 三角形数据
   * @returns {boolean} 是否属于圆柱
   */
  isCylindrical(cylinder, triangleData) {
    // 检查法向量是否垂直于轴
    const axisAngle = Math.abs(cylinder.axis.dot(triangleData.normal))
    return axisAngle <= this.config.cylinderAngleTolerance
  }

  /**
   * 更新平面参数
   * @param {Object} plane - 平面特征
   * @param {Object} triangleData - 新三角形数据
   */
  updatePlaneParameters(plane, triangleData) {
    const totalTriangles = plane.triangles.length
    const weight = 1 / totalTriangles
    
    // 加权平均更新法向量
    plane.normal.multiplyScalar(1 - weight)
    plane.normal.add(triangleData.normal.clone().multiplyScalar(weight))
    plane.normal.normalize()
    
    // 加权平均更新参考点
    plane.point.multiplyScalar(1 - weight)
    plane.point.add(triangleData.center.clone().multiplyScalar(weight))
  }

  /**
   * 估算圆柱轴向
   * @param {Object} triangleData - 三角形数据
   * @returns {THREE.Vector3} 轴向量
   */
  estimateCylinderAxis(triangleData) {
    // 简化：假设主要轴向之一
    const normal = triangleData.normal
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    ]
    
    // 选择与法向量最垂直的轴
    let bestAxis = axes[0]
    let minDot = Math.abs(normal.dot(axes[0]))
    
    for (let i = 1; i < axes.length; i++) {
      const dot = Math.abs(normal.dot(axes[i]))
      if (dot < minDot) {
        minDot = dot
        bestAxis = axes[i]
      }
    }
    
    return bestAxis.clone()
  }

  /**
   * 获取类型的最小三角形数
   * @param {string} type - 特征类型
   * @returns {number} 最小三角形数
   */
  getMinTrianglesForType(type) {
    switch (type) {
      case 'plane': return this.config.minPlaneTriangles
      case 'cylinder': return this.config.minCylinderTriangles
      default: return 1
    }
  }

  /**
   * 获取三角形数量
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {number} 三角形数量
   */
  getTriangleCount(geometry) {
    const positions = geometry.getAttribute('position')
    return geometry.index ? geometry.index.count / 3 : positions.count / 3
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.nameToFeatureMap.clear()
    this.triangleToFeatureMap.clear()
    this.meshFeatures.clear()
  }
}