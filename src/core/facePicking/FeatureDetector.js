import * as THREE from 'three'

/**
 * 特征检测器 - 基于原始模型预处理识别平面和圆柱面特征
 */
export class FeatureDetector {
  constructor() {
    // 特征检测参数
    this.config = {
      // 平面检测
      planeAngleTolerance: 0.1, // 法向量角度容差（弧度）
      planeDistanceTolerance: 0.01, // 距离容差
      minPlaneTriangles: 3, // 最小三角形数量
      
      // 圆柱面检测
      cylinderAngleTolerance: 0.15, // 圆柱轴向角度容差
      cylinderRadiusTolerance: 0.01, // 半径容差
      minCylinderTriangles: 6, // 最小三角形数量
      
      // 性能优化
      maxTrianglesPerFeature: 10000, // 单个特征最大三角形数
      enableParallelProcessing: true // 启用并行处理
    }
    
    // 特征缓存
    this.featureCache = new Map() // meshId -> features
    this.processingQueue = new Set() // 正在处理的网格ID
  }

  /**
   * 预处理网格，识别所有特征
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {Promise<Object>} 特征数据
   */
  async preprocessMesh(mesh) {
    const meshId = this.generateMeshId(mesh)
    
    // 检查缓存
    if (this.featureCache.has(meshId)) {
      return this.featureCache.get(meshId)
    }
    
    // 避免重复处理
    if (this.processingQueue.has(meshId)) {
      return this.waitForProcessing(meshId)
    }
    
    this.processingQueue.add(meshId)
    
    try {
      console.log(`开始预处理网格特征: ${mesh.name || meshId}`)
      const startTime = performance.now()
      
      const features = await this.detectFeatures(mesh)
      
      // 缓存结果
      this.featureCache.set(meshId, features)
      
      const processingTime = performance.now() - startTime
      console.log(`特征预处理完成: ${features.planes.length} 个平面, ${features.cylinders.length} 个圆柱, 耗时: ${processingTime.toFixed(2)}ms`)
      
      return features
      
    } finally {
      this.processingQueue.delete(meshId)
    }
  }

  /**
   * 检测网格中的所有特征
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {Promise<Object>} 特征数据
   */
  async detectFeatures(mesh) {
    const geometry = mesh.geometry
    
    if (!geometry.isBufferGeometry) {
      throw new Error('仅支持 BufferGeometry')
    }
    
    // 获取几何体数据
    const positions = geometry.getAttribute('position')
    const indices = geometry.getIndex()
    
    if (!positions) {
      throw new Error('几何体缺少位置属性')
    }
    
    // 计算三角形数量
    const triangleCount = indices ? indices.count / 3 : positions.count / 3
    
    // 提取三角形数据
    const triangles = this.extractTriangles(positions, indices, triangleCount)
    
    // 并行检测特征
    const [planes, cylinders] = await Promise.all([
      this.detectPlanes(triangles),
      this.detectCylinders(triangles)
    ])
    
    return {
      meshId: this.generateMeshId(mesh),
      triangleCount,
      planes,
      cylinders,
      // 快速查找表：faceIndex -> featureId
      faceToFeature: this.buildFaceToFeatureMap(planes, cylinders),
      timestamp: Date.now()
    }
  }

  /**
   * 提取三角形数据
   * @param {THREE.BufferAttribute} positions - 位置属性
   * @param {THREE.BufferAttribute} indices - 索引属性
   * @param {number} triangleCount - 三角形数量
   * @returns {Array} 三角形数据数组
   */
  extractTriangles(positions, indices, triangleCount) {
    const triangles = []
    
    for (let i = 0; i < triangleCount; i++) {
      const triangle = {
        index: i,
        vertices: [],
        normal: null,
        center: null,
        area: 0
      }
      
      // 获取三角形顶点
      for (let j = 0; j < 3; j++) {
        const vertexIndex = indices ? indices.getX(i * 3 + j) : i * 3 + j
        const vertex = new THREE.Vector3(
          positions.getX(vertexIndex),
          positions.getY(vertexIndex),
          positions.getZ(vertexIndex)
        )
        triangle.vertices.push(vertex)
      }
      
      // 计算法向量
      const v1 = triangle.vertices[1].clone().sub(triangle.vertices[0])
      const v2 = triangle.vertices[2].clone().sub(triangle.vertices[0])
      triangle.normal = new THREE.Vector3().crossVectors(v1, v2).normalize()
      
      // 计算中心点
      triangle.center = new THREE.Vector3()
        .add(triangle.vertices[0])
        .add(triangle.vertices[1])
        .add(triangle.vertices[2])
        .divideScalar(3)
      
      // 计算面积
      triangle.area = v1.cross(v2).length() * 0.5
      
      triangles.push(triangle)
    }
    
    return triangles
  }

  /**
   * 检测平面特征
   * @param {Array} triangles - 三角形数据
   * @returns {Promise<Array>} 平面特征数组
   */
  async detectPlanes(triangles) {
    const planes = []
    const processed = new Set()
    
    for (let i = 0; i < triangles.length; i++) {
      if (processed.has(i)) continue
      
      const seedTriangle = triangles[i]
      const plane = this.growPlane(triangles, i, processed)
      
      if (plane.triangleIndices.length >= this.config.minPlaneTriangles) {
        plane.id = `plane_${planes.length}`
        plane.type = 'plane'
        planes.push(plane)
      }
    }
    
    return planes
  }

  /**
   * 从种子三角形生长平面
   * @param {Array} triangles - 所有三角形
   * @param {number} seedIndex - 种子三角形索引
   * @param {Set} processed - 已处理的三角形集合
   * @returns {Object} 平面特征
   */
  growPlane(triangles, seedIndex, processed) {
    const seedTriangle = triangles[seedIndex]
    const plane = {
      normal: seedTriangle.normal.clone(),
      point: seedTriangle.center.clone(),
      triangleIndices: [seedIndex],
      area: seedTriangle.area,
      bounds: new THREE.Box3()
    }
    
    processed.add(seedIndex)
    plane.bounds.expandByPoint(seedTriangle.center)
    
    // 使用队列进行区域生长
    const queue = [seedIndex]
    
    while (queue.length > 0) {
      const currentIndex = queue.shift()
      const currentTriangle = triangles[currentIndex]
      
      // 查找相邻的共面三角形
      for (let i = 0; i < triangles.length; i++) {
        if (processed.has(i)) continue
        
        const triangle = triangles[i]
        
        // 检查是否共面
        if (this.isCoplanar(plane, triangle)) {
          processed.add(i)
          plane.triangleIndices.push(i)
          plane.area += triangle.area
          plane.bounds.expandByPoint(triangle.center)
          queue.push(i)
          
          // 更新平面参数（加权平均）
          this.updatePlaneParameters(plane, triangle)
          
          // 防止特征过大
          if (plane.triangleIndices.length >= this.config.maxTrianglesPerFeature) {
            break
          }
        }
      }
    }
    
    return plane
  }

  /**
   * 检查三角形是否与平面共面
   * @param {Object} plane - 平面特征
   * @param {Object} triangle - 三角形
   * @returns {boolean} 是否共面
   */
  isCoplanar(plane, triangle) {
    // 检查法向量角度
    const angleDiff = plane.normal.angleTo(triangle.normal)
    if (angleDiff > this.config.planeAngleTolerance && 
        Math.PI - angleDiff > this.config.planeAngleTolerance) {
      return false
    }
    
    // 检查点到平面距离
    const distance = Math.abs(plane.normal.dot(triangle.center.clone().sub(plane.point)))
    return distance <= this.config.planeDistanceTolerance
  }

  /**
   * 更新平面参数
   * @param {Object} plane - 平面特征
   * @param {Object} triangle - 新三角形
   */
  updatePlaneParameters(plane, triangle) {
    const totalTriangles = plane.triangleIndices.length
    const weight = 1 / totalTriangles
    
    // 加权平均更新法向量
    plane.normal.multiplyScalar(1 - weight)
    plane.normal.add(triangle.normal.clone().multiplyScalar(weight))
    plane.normal.normalize()
    
    // 加权平均更新参考点
    plane.point.multiplyScalar(1 - weight)
    plane.point.add(triangle.center.clone().multiplyScalar(weight))
  }

  /**
   * 检测圆柱面特征
   * @param {Array} triangles - 三角形数据
   * @returns {Promise<Array>} 圆柱面特征数组
   */
  async detectCylinders(triangles) {
    const cylinders = []
    const processed = new Set()
    
    // 简化实现：基于法向量模式检测圆柱面
    for (let i = 0; i < triangles.length; i++) {
      if (processed.has(i)) continue
      
      const cylinder = this.growCylinder(triangles, i, processed)
      
      if (cylinder.triangleIndices.length >= this.config.minCylinderTriangles) {
        cylinder.id = `cylinder_${cylinders.length}`
        cylinder.type = 'cylinder'
        cylinders.push(cylinder)
      }
    }
    
    return cylinders
  }

  /**
   * 从种子三角形生长圆柱面
   * @param {Array} triangles - 所有三角形
   * @param {number} seedIndex - 种子三角形索引
   * @param {Set} processed - 已处理的三角形集合
   * @returns {Object} 圆柱面特征
   */
  growCylinder(triangles, seedIndex, processed) {
    const seedTriangle = triangles[seedIndex]
    
    // 估算圆柱轴向（简化：使用第一个三角形的切向量）
    const edge1 = seedTriangle.vertices[1].clone().sub(seedTriangle.vertices[0])
    const edge2 = seedTriangle.vertices[2].clone().sub(seedTriangle.vertices[0])
    const axis = edge1.cross(seedTriangle.normal).normalize()
    
    const cylinder = {
      axis: axis,
      center: seedTriangle.center.clone(),
      radius: 0,
      triangleIndices: [seedIndex],
      area: seedTriangle.area,
      bounds: new THREE.Box3()
    }
    
    processed.add(seedIndex)
    cylinder.bounds.expandByPoint(seedTriangle.center)
    
    // 区域生长（简化实现）
    const queue = [seedIndex]
    
    while (queue.length > 0 && cylinder.triangleIndices.length < this.config.maxTrianglesPerFeature) {
      const currentIndex = queue.shift()
      
      for (let i = 0; i < triangles.length; i++) {
        if (processed.has(i)) continue
        
        const triangle = triangles[i]
        
        if (this.isCylindrical(cylinder, triangle)) {
          processed.add(i)
          cylinder.triangleIndices.push(i)
          cylinder.area += triangle.area
          cylinder.bounds.expandByPoint(triangle.center)
          queue.push(i)
          
          this.updateCylinderParameters(cylinder, triangle)
        }
      }
    }
    
    return cylinder
  }

  /**
   * 检查三角形是否属于圆柱面
   * @param {Object} cylinder - 圆柱面特征
   * @param {Object} triangle - 三角形
   * @returns {boolean} 是否属于圆柱面
   */
  isCylindrical(cylinder, triangle) {
    // 简化检测：检查法向量是否垂直于轴向
    const axisAngle = Math.abs(cylinder.axis.dot(triangle.normal))
    return axisAngle <= this.config.cylinderAngleTolerance
  }

  /**
   * 更新圆柱面参数
   * @param {Object} cylinder - 圆柱面特征
   * @param {Object} triangle - 新三角形
   */
  updateCylinderParameters(cylinder, triangle) {
    // 简化实现：更新中心点
    const totalTriangles = cylinder.triangleIndices.length
    const weight = 1 / totalTriangles
    
    cylinder.center.multiplyScalar(1 - weight)
    cylinder.center.add(triangle.center.clone().multiplyScalar(weight))
  }

  /**
   * 构建面索引到特征的映射表
   * @param {Array} planes - 平面特征
   * @param {Array} cylinders - 圆柱面特征
   * @returns {Map} faceIndex -> featureId
   */
  buildFaceToFeatureMap(planes, cylinders) {
    const map = new Map()
    
    // 添加平面映射
    planes.forEach(plane => {
      plane.triangleIndices.forEach(faceIndex => {
        map.set(faceIndex, {
          type: 'plane',
          id: plane.id,
          feature: plane
        })
      })
    })
    
    // 添加圆柱面映射
    cylinders.forEach(cylinder => {
      cylinder.triangleIndices.forEach(faceIndex => {
        map.set(faceIndex, {
          type: 'cylinder',
          id: cylinder.id,
          feature: cylinder
        })
      })
    })
    
    return map
  }

  /**
   * 根据面索引快速查找特征
   * @param {string} meshId - 网格ID
   * @param {number} faceIndex - 面索引
   * @returns {Object|null} 特征信息
   */
  getFeatureByFaceIndex(meshId, faceIndex) {
    const features = this.featureCache.get(meshId)
    if (!features) return null
    
    return features.faceToFeature.get(faceIndex) || null
  }

  /**
   * 获取网格的所有特征
   * @param {string} meshId - 网格ID
   * @returns {Object|null} 特征数据
   */
  getFeatures(meshId) {
    return this.featureCache.get(meshId) || null
  }

  /**
   * 生成网格唯一ID
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {string} 网格ID
   */
  generateMeshId(mesh) {
    // 基于几何体特征生成稳定的ID
    const geometry = mesh.geometry
    const positions = geometry.getAttribute('position')
    
    if (!positions) return mesh.uuid
    
    // 使用顶点数量和边界框生成哈希
    const vertexCount = positions.count
    geometry.computeBoundingBox()
    const bbox = geometry.boundingBox
    
    const hash = `mesh_${vertexCount}_${bbox.min.x.toFixed(3)}_${bbox.max.x.toFixed(3)}_${bbox.min.y.toFixed(3)}_${bbox.max.y.toFixed(3)}_${bbox.min.z.toFixed(3)}_${bbox.max.z.toFixed(3)}`
    
    return hash
  }

  /**
   * 等待处理完成
   * @param {string} meshId - 网格ID
   * @returns {Promise<Object>} 特征数据
   */
  async waitForProcessing(meshId) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.processingQueue.has(meshId)) {
          clearInterval(checkInterval)
          resolve(this.featureCache.get(meshId))
        }
      }, 10)
    })
  }

  /**
   * 清理缓存
   * @param {string} meshId - 网格ID（可选）
   */
  clearCache(meshId = null) {
    if (meshId) {
      this.featureCache.delete(meshId)
    } else {
      this.featureCache.clear()
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 统计信息
   */
  getCacheStats() {
    const stats = {
      cachedMeshes: this.featureCache.size,
      processingQueue: this.processingQueue.size,
      totalFeatures: 0,
      totalTriangles: 0
    }
    
    this.featureCache.forEach(features => {
      stats.totalFeatures += features.planes.length + features.cylinders.length
      stats.totalTriangles += features.triangleCount
    })
    
    return stats
  }
}