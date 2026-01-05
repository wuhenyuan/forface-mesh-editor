/**
 * 基于几何特征的表面标识系统
 * 结合GPT方案的特征识别和我的哈希标识
 */
import * as THREE from 'three'

export class FeatureBasedIdentifier {
  features: Map<string, any>
  meshFeatures: Map<string, any[]>

  constructor() {
    this.features = new Map() // featureId -> Feature
    this.meshFeatures = new Map() // meshId -> Feature[]
  }

  /**
   * 分析网格的几何特征
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {Array} 特征数组
   */
  analyzeGeometryFeatures(mesh) {
    const geometry = mesh.geometry
    const features = []
    
    // 1. 平面特征检测
    const planeFeatures = this.detectPlaneFeatures(geometry)
    features.push(...planeFeatures)
    
    // 2. 圆柱面特征检测
    const cylinderFeatures = this.detectCylinderFeatures(geometry)
    features.push(...cylinderFeatures)
    
    // 3. 球面特征检测
    const sphereFeatures = this.detectSphereFeatures(geometry)
    features.push(...sphereFeatures)
    
    // 注册特征
    const meshId = this.generateMeshId(mesh)
    this.meshFeatures.set(meshId, features)
    
    features.forEach(feature => {
      feature.meshId = meshId
      this.features.set(feature.id, feature)
    })
    
    console.log(`网格 ${meshId} 检测到 ${features.length} 个特征`)
    return features
  }

  /**
   * 检测平面特征
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {Array} 平面特征数组
   */
  detectPlaneFeatures(geometry) {
    const features = []
    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal') || this.computeNormals(geometry)
    
    // 简化的平面检测算法
    const faceCount = geometry.index ? geometry.index.count / 3 : positions.count / 3
    const processedFaces = new Set()
    
    for (let i = 0; i < faceCount; i++) {
      if (processedFaces.has(i)) continue
      
      const faceNormal = this.getFaceNormal(geometry, i)
      const faceCenter = this.getFaceCenter(geometry, i)
      
      // 查找共面的相邻面
      const coplanarFaces = this.findCoplanarFaces(geometry, i, faceNormal, faceCenter, processedFaces)
      
      if (coplanarFaces.length >= 2) { // 至少2个面才算平面特征
        const feature = {
          id: `plane_${features.length}`,
          type: 'PlaneFeature',
          normal: faceNormal.clone(),
          center: this.calculateCenterOfFaces(geometry, coplanarFaces),
          faces: coplanarFaces,
          area: this.calculateAreaOfFaces(geometry, coplanarFaces),
          bounds: this.calculateBoundsOfFaces(geometry, coplanarFaces)
        }
        
        features.push(feature)
        coplanarFaces.forEach(faceIndex => processedFaces.add(faceIndex))
      }
    }
    
    return features
  }

  /**
   * 检测圆柱面特征
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {Array} 圆柱面特征数组
   */
  detectCylinderFeatures(geometry) {
    const features = []
    // 简化实现：检测法向量指向中心轴的面群
    // 实际实现需要更复杂的几何算法
    
    const positions = geometry.getAttribute('position')
    const faceCount = geometry.index ? geometry.index.count / 3 : positions.count / 3
    
    // 这里只是示例，实际需要复杂的圆柱面检测算法
    for (let i = 0; i < Math.min(faceCount, 10); i += 10) {
      const center = this.getFaceCenter(geometry, i)
      const normal = this.getFaceNormal(geometry, i)
      
      // 简单的圆柱面判断（实际需要更复杂的算法）
      if (Math.abs(normal.y) < 0.1) { // 法向量接近水平
        const feature = {
          id: `cylinder_${features.length}`,
          type: 'CylinderFeature',
          axis: new THREE.Vector3(0, 1, 0),
          center: center.clone(),
          radius: 1.0, // 需要计算
          height: 2.0, // 需要计算
          faces: [i] // 需要找到所有相关面
        }
        
        features.push(feature)
      }
    }
    
    return features
  }

  /**
   * 检测球面特征
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {Array} 球面特征数组
   */
  detectSphereFeatures(geometry) {
    // 简化实现，实际需要复杂的球面检测算法
    return []
  }

  /**
   * 查找共面的面
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {number} baseFaceIndex - 基准面索引
   * @param {THREE.Vector3} baseNormal - 基准法向量
   * @param {THREE.Vector3} baseCenter - 基准中心点
   * @param {Set} processedFaces - 已处理的面
   * @returns {Array} 共面的面索引数组
   */
  findCoplanarFaces(geometry, baseFaceIndex, baseNormal, baseCenter, processedFaces) {
    const coplanarFaces = [baseFaceIndex]
    const faceCount = geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3
    
    const normalThreshold = 0.95 // cos(18°)
    const distanceThreshold = 0.01 // 1cm
    
    for (let i = 0; i < faceCount; i++) {
      if (i === baseFaceIndex || processedFaces.has(i)) continue
      
      const faceNormal = this.getFaceNormal(geometry, i)
      const faceCenter = this.getFaceCenter(geometry, i)
      
      // 检查法向量是否平行
      const normalSimilarity = Math.abs(baseNormal.dot(faceNormal))
      if (normalSimilarity < normalThreshold) continue
      
      // 检查是否在同一平面上
      const centerDiff = faceCenter.clone().sub(baseCenter)
      const distanceToPlane = Math.abs(centerDiff.dot(baseNormal))
      if (distanceToPlane < distanceThreshold) {
        coplanarFaces.push(i)
      }
    }
    
    return coplanarFaces
  }

  /**
   * 根据射线投射查找特征
   * @param {THREE.Vector3} origin - 射线起点
   * @param {THREE.Vector3} direction - 射线方向
   * @param {THREE.Mesh} mesh - 目标网格
   * @returns {Object|null} 特征信息
   */
  raycastToFeature(origin, direction, mesh) {
    const raycaster = new THREE.Raycaster(origin, direction)
    const intersects = raycaster.intersectObject(mesh)
    
    if (intersects.length === 0) return null
    
    const hit = intersects[0]
    const faceIndex = hit.faceIndex
    
    // 查找包含此面的特征
    const meshId = this.generateMeshId(mesh)
    const meshFeatures = this.meshFeatures.get(meshId) || []
    
    for (const feature of meshFeatures) {
      if (feature.faces && feature.faces.includes(faceIndex)) {
        return {
          feature,
          hit,
          point: hit.point,
          normal: this.getFeatureNormalAtPoint(feature, hit.point),
          uv: hit.uv
        }
      }
    }
    
    // 如果没找到特征，返回null（禁止在非特征面上操作）
    return null
  }

  /**
   * 生成特征标识
   * @param {Object} featureHit - 特征命中信息
   * @returns {string} 特征标识
   */
  generateFeatureId(featureHit) {
    const feature = featureHit.feature
    const point = featureHit.point
    
    // 在特征内的相对位置
    const relativePos = this.getRelativePositionInFeature(feature, point)
    
    return `${feature.id}_pos_${relativePos.x.toFixed(3)}_${relativePos.y.toFixed(3)}`
  }

  /**
   * 恢复特征位置
   * @param {string} featureId - 特征标识
   * @returns {Object|null} 恢复的位置信息
   */
  restoreFeaturePosition(featureId) {
    const parts = featureId.split('_')
    if (parts.length < 5) return null
    
    const baseFeatureId = `${parts[0]}_${parts[1]}`
    const x = parseFloat(parts[3])
    const y = parseFloat(parts[4])
    
    const feature = this.features.get(baseFeatureId)
    if (!feature) return null
    
    const worldPos = this.getWorldPositionFromRelative(feature, { x, y })
    const normal = this.getFeatureNormalAtPoint(feature, worldPos)
    
    return {
      feature,
      point: worldPos,
      normal,
      relativePosition: { x, y }
    }
  }

  // 辅助方法...
  generateMeshId(mesh) {
    // 复用之前的网格ID生成逻辑
    return `mesh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  getFaceNormal(geometry, faceIndex) {
    // 计算面法向量
    const positions = geometry.getAttribute('position')
    const indices = geometry.index
    
    let i1, i2, i3
    if (indices) {
      i1 = indices.getX(faceIndex * 3)
      i2 = indices.getX(faceIndex * 3 + 1)
      i3 = indices.getX(faceIndex * 3 + 2)
    } else {
      i1 = faceIndex * 3
      i2 = faceIndex * 3 + 1
      i3 = faceIndex * 3 + 2
    }
    
    const v1 = new THREE.Vector3(positions.getX(i1), positions.getY(i1), positions.getZ(i1))
    const v2 = new THREE.Vector3(positions.getX(i2), positions.getY(i2), positions.getZ(i2))
    const v3 = new THREE.Vector3(positions.getX(i3), positions.getY(i3), positions.getZ(i3))
    
    const normal = new THREE.Vector3()
    const edge1 = v2.clone().sub(v1)
    const edge2 = v3.clone().sub(v1)
    normal.crossVectors(edge1, edge2).normalize()
    
    return normal
  }

  getFaceCenter(geometry, faceIndex) {
    // 计算面中心点
    const positions = geometry.getAttribute('position')
    const indices = geometry.index
    
    let i1, i2, i3
    if (indices) {
      i1 = indices.getX(faceIndex * 3)
      i2 = indices.getX(faceIndex * 3 + 1)
      i3 = indices.getX(faceIndex * 3 + 2)
    } else {
      i1 = faceIndex * 3
      i2 = faceIndex * 3 + 1
      i3 = faceIndex * 3 + 2
    }
    
    const v1 = new THREE.Vector3(positions.getX(i1), positions.getY(i1), positions.getZ(i1))
    const v2 = new THREE.Vector3(positions.getX(i2), positions.getY(i2), positions.getZ(i2))
    const v3 = new THREE.Vector3(positions.getX(i3), positions.getY(i3), positions.getZ(i3))
    
    return v1.add(v2).add(v3).divideScalar(3)
  }

  // 其他辅助方法的简化实现...
  calculateCenterOfFaces(geometry, faces) {
    const center = new THREE.Vector3()
    faces.forEach(faceIndex => {
      center.add(this.getFaceCenter(geometry, faceIndex))
    })
    return center.divideScalar(faces.length)
  }

  calculateAreaOfFaces(geometry, faces) {
    // 简化实现
    return faces.length * 0.1
  }

  calculateBoundsOfFaces(geometry, faces) {
    // 简化实现
    return { min: new THREE.Vector3(-1, -1, -1), max: new THREE.Vector3(1, 1, 1) }
  }

  getFeatureNormalAtPoint(feature, point) {
    return feature.normal || new THREE.Vector3(0, 1, 0)
  }

  getRelativePositionInFeature(feature, point) {
    // 简化实现：返回在特征局部坐标系中的位置
    return { x: point.x, y: point.z }
  }

  getWorldPositionFromRelative(feature, relativePos) {
    // 简化实现：从相对位置恢复世界坐标
    return new THREE.Vector3(relativePos.x, 0, relativePos.y).add(feature.center)
  }

  computeNormals(geometry) {
    geometry.computeVertexNormals()
    return geometry.getAttribute('normal')
  }
}

export const featureIdentifier = new FeatureBasedIdentifier()
