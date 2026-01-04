import * as THREE from 'three'

interface FeatureDetectorConfig {
  planeAngleTolerance: number
  planeDistanceTolerance: number
  minPlaneTriangles: number
  cylinderAngleTolerance: number
  cylinderRadiusTolerance: number
  minCylinderTriangles: number
  maxTrianglesPerFeature: number
  enableParallelProcessing: boolean
}

interface TriangleData {
  index: number
  vertices: THREE.Vector3[]
  normal: THREE.Vector3
  center: THREE.Vector3
  area: number
}

interface PlaneFeature {
  id: string
  type: 'plane'
  normal: THREE.Vector3
  point: THREE.Vector3
  triangleIndices: number[]
  area: number
  bounds: THREE.Box3
}

interface CylinderFeature {
  id: string
  type: 'cylinder'
  axis: THREE.Vector3
  center: THREE.Vector3
  radius: number
  triangleIndices: number[]
  area: number
  bounds: THREE.Box3
}

interface FeatureInfo {
  type: 'plane' | 'cylinder'
  id: string
  feature: PlaneFeature | CylinderFeature
}

export interface MeshFeatures {
  meshId: string
  triangleCount: number
  planes: PlaneFeature[]
  cylinders: CylinderFeature[]
  faceToFeature: Map<number, FeatureInfo>
  timestamp: number
}

/**
 * 特征检测器 - 基于原始模型预处理识别平面和圆柱面特征
 */
export class FeatureDetector {
  config: FeatureDetectorConfig
  private featureCache: Map<string, MeshFeatures>
  private processingQueue: Set<string>

  constructor() {
    // 特征检测参数
    this.config = {
      planeAngleTolerance: 0.1,
      planeDistanceTolerance: 0.01,
      minPlaneTriangles: 3,
      cylinderAngleTolerance: 0.15,
      cylinderRadiusTolerance: 0.01,
      minCylinderTriangles: 6,
      maxTrianglesPerFeature: 10000,
      enableParallelProcessing: true
    }
    
    this.featureCache = new Map()
    this.processingQueue = new Set()
  }

  /**
   * 预处理网格，识别所有特征
   */
  async preprocessMesh(mesh: THREE.Mesh): Promise<MeshFeatures> {
    const meshId = this.generateMeshId(mesh)
    
    // 检查缓存
    if (this.featureCache.has(meshId)) {
      return this.featureCache.get(meshId)!
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
   */
  async detectFeatures(mesh: THREE.Mesh): Promise<MeshFeatures> {
    const geometry = mesh.geometry as THREE.BufferGeometry
    
    if (!geometry.isBufferGeometry) {
      throw new Error('仅支持 BufferGeometry')
    }
    
    const positions = geometry.getAttribute('position')
    const indices = geometry.getIndex()
    
    if (!positions) {
      throw new Error('几何体缺少位置属性')
    }
    
    const triangleCount = indices ? indices.count / 3 : positions.count / 3
    const triangles = this.extractTriangles(positions, indices, triangleCount)
    
    const [planes, cylinders] = await Promise.all([
      this.detectPlanes(triangles),
      this.detectCylinders(triangles)
    ])
    
    return {
      meshId: this.generateMeshId(mesh),
      triangleCount,
      planes,
      cylinders,
      faceToFeature: this.buildFaceToFeatureMap(planes, cylinders),
      timestamp: Date.now()
    }
  }

  /**
   * 提取三角形数据
   */
  private extractTriangles(
    positions: THREE.BufferAttribute, 
    indices: THREE.BufferAttribute | null, 
    triangleCount: number
  ): TriangleData[] {
    const triangles: TriangleData[] = []
    
    for (let i = 0; i < triangleCount; i++) {
      const triangle: TriangleData = {
        index: i,
        vertices: [],
        normal: new THREE.Vector3(),
        center: new THREE.Vector3(),
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
   */
  private async detectPlanes(triangles: TriangleData[]): Promise<PlaneFeature[]> {
    const planes: PlaneFeature[] = []
    const processed = new Set<number>()
    
    for (let i = 0; i < triangles.length; i++) {
      if (processed.has(i)) continue
      
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
   */
  private growPlane(triangles: TriangleData[], seedIndex: number, processed: Set<number>): PlaneFeature {
    const seedTriangle = triangles[seedIndex]
    const plane: PlaneFeature = {
      id: '',
      type: 'plane',
      normal: seedTriangle.normal.clone(),
      point: seedTriangle.center.clone(),
      triangleIndices: [seedIndex],
      area: seedTriangle.area,
      bounds: new THREE.Box3()
    }
    
    processed.add(seedIndex)
    plane.bounds.expandByPoint(seedTriangle.center)
    
    const queue = [seedIndex]
    
    while (queue.length > 0) {
      const currentIndex = queue.shift()!
      
      for (let i = 0; i < triangles.length; i++) {
        if (processed.has(i)) continue
        
        const triangle = triangles[i]
        
        if (this.isCoplanar(plane, triangle)) {
          processed.add(i)
          plane.triangleIndices.push(i)
          plane.area += triangle.area
          plane.bounds.expandByPoint(triangle.center)
          queue.push(i)
          
          this.updatePlaneParameters(plane, triangle)
          
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
   */
  private isCoplanar(plane: PlaneFeature, triangle: TriangleData): boolean {
    const angleDiff = plane.normal.angleTo(triangle.normal)
    if (angleDiff > this.config.planeAngleTolerance && 
        Math.PI - angleDiff > this.config.planeAngleTolerance) {
      return false
    }
    
    const distance = Math.abs(plane.normal.dot(triangle.center.clone().sub(plane.point)))
    return distance <= this.config.planeDistanceTolerance
  }

  /**
   * 更新平面参数
   */
  private updatePlaneParameters(plane: PlaneFeature, triangle: TriangleData): void {
    const totalTriangles = plane.triangleIndices.length
    const weight = 1 / totalTriangles
    
    plane.normal.multiplyScalar(1 - weight)
    plane.normal.add(triangle.normal.clone().multiplyScalar(weight))
    plane.normal.normalize()
    
    plane.point.multiplyScalar(1 - weight)
    plane.point.add(triangle.center.clone().multiplyScalar(weight))
  }

  /**
   * 检测圆柱面特征
   */
  private async detectCylinders(triangles: TriangleData[]): Promise<CylinderFeature[]> {
    const cylinders: CylinderFeature[] = []
    const processed = new Set<number>()
    
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
   */
  private growCylinder(triangles: TriangleData[], seedIndex: number, processed: Set<number>): CylinderFeature {
    const seedTriangle = triangles[seedIndex]
    
    const edge1 = seedTriangle.vertices[1].clone().sub(seedTriangle.vertices[0])
    const axis = edge1.cross(seedTriangle.normal).normalize()
    
    const cylinder: CylinderFeature = {
      id: '',
      type: 'cylinder',
      axis: axis,
      center: seedTriangle.center.clone(),
      radius: 0,
      triangleIndices: [seedIndex],
      area: seedTriangle.area,
      bounds: new THREE.Box3()
    }
    
    processed.add(seedIndex)
    cylinder.bounds.expandByPoint(seedTriangle.center)
    
    const queue = [seedIndex]
    
    while (queue.length > 0 && cylinder.triangleIndices.length < this.config.maxTrianglesPerFeature) {
      const currentIndex = queue.shift()!
      
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
   */
  private isCylindrical(cylinder: CylinderFeature, triangle: TriangleData): boolean {
    const axisAngle = Math.abs(cylinder.axis.dot(triangle.normal))
    return axisAngle <= this.config.cylinderAngleTolerance
  }

  /**
   * 更新圆柱面参数
   */
  private updateCylinderParameters(cylinder: CylinderFeature, triangle: TriangleData): void {
    const totalTriangles = cylinder.triangleIndices.length
    const weight = 1 / totalTriangles
    
    cylinder.center.multiplyScalar(1 - weight)
    cylinder.center.add(triangle.center.clone().multiplyScalar(weight))
  }

  /**
   * 构建面索引到特征的映射表
   */
  private buildFaceToFeatureMap(planes: PlaneFeature[], cylinders: CylinderFeature[]): Map<number, FeatureInfo> {
    const map = new Map<number, FeatureInfo>()
    
    planes.forEach(plane => {
      plane.triangleIndices.forEach(faceIndex => {
        map.set(faceIndex, {
          type: 'plane',
          id: plane.id,
          feature: plane
        })
      })
    })
    
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
   */
  getFeatureByFaceIndex(meshId: string, faceIndex: number): FeatureInfo | null {
    const features = this.featureCache.get(meshId)
    if (!features) return null
    
    return features.faceToFeature.get(faceIndex) || null
  }

  /**
   * 获取网格的所有特征
   */
  getFeatures(meshId: string): MeshFeatures | null {
    return this.featureCache.get(meshId) || null
  }

  /**
   * 生成网格唯一ID
   */
  generateMeshId(mesh: THREE.Mesh): string {
    const geometry = mesh.geometry as THREE.BufferGeometry
    const positions = geometry.getAttribute('position')
    
    if (!positions) return mesh.uuid
    
    const vertexCount = positions.count
    geometry.computeBoundingBox()
    const bbox = geometry.boundingBox!
    
    const hash = `mesh_${vertexCount}_${bbox.min.x.toFixed(3)}_${bbox.max.x.toFixed(3)}_${bbox.min.y.toFixed(3)}_${bbox.max.y.toFixed(3)}_${bbox.min.z.toFixed(3)}_${bbox.max.z.toFixed(3)}`
    
    return hash
  }

  /**
   * 等待处理完成
   */
  private async waitForProcessing(meshId: string): Promise<MeshFeatures> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.processingQueue.has(meshId)) {
          clearInterval(checkInterval)
          resolve(this.featureCache.get(meshId)!)
        }
      }, 10)
    })
  }

  /**
   * 清理缓存
   */
  clearCache(meshId: string | null = null): void {
    if (meshId) {
      this.featureCache.delete(meshId)
    } else {
      this.featureCache.clear()
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): {
    cachedMeshes: number
    processingQueue: number
    totalFeatures: number
    totalTriangles: number
  } {
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
