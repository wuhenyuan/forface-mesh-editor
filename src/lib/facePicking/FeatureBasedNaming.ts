import * as THREE from 'three'
import { VertexBasedIdentifier } from './VertexBasedIdentifier'

interface FeatureConfig {
  planeAngleTolerance: number
  planeDistanceTolerance: number
  minPlaneTriangles: number
  cylinderAngleTolerance: number
  minCylinderTriangles: number
  geometryPrecision: number
}

interface TriangleData {
  vertices: THREE.Vector3[]
  normal: THREE.Vector3
  center: THREE.Vector3
  area: number
}

interface PlaneFeature {
  type: 'plane'
  triangles: number[]
  normal: THREE.Vector3
  point: THREE.Vector3
  area: number
  bounds: THREE.Box3
}

interface CylinderFeature {
  type: 'cylinder'
  triangles: number[]
  axis: THREE.Vector3
  center: THREE.Vector3
  area: number
  bounds: THREE.Box3
}

interface IndividualFeature {
  type: 'individual'
  triangles: number[]
  center: THREE.Vector3
  normal: THREE.Vector3
  area: number
  bounds: THREE.Box3
}

type Feature = PlaneFeature | CylinderFeature | IndividualFeature

interface NamedFeature {
  name: string
  type: string
  triangleCount: number
  area: number
  center: THREE.Vector3
}

type StoredFeature = Feature & {
  name: string
  mesh: THREE.Mesh
  meshId: string
}

interface MeshFeatureInfo {
  features: NamedFeature[]
  totalTriangles: number
  featureCount: number
}

/**
 * 基于特征的稳定命名系统
 */
export class FeatureBasedNaming {
  private vertexIdentifier: VertexBasedIdentifier
  private nameToFeatureMap: Map<string, StoredFeature>
  private triangleToFeatureMap: Map<string, string>
  private meshFeatures: Map<string, MeshFeatureInfo>
  config: FeatureConfig

  constructor() {
    this.vertexIdentifier = new VertexBasedIdentifier()
    this.nameToFeatureMap = new Map()
    this.triangleToFeatureMap = new Map()
    this.meshFeatures = new Map()
    
    this.config = {
      planeAngleTolerance: 0.1,
      planeDistanceTolerance: 0.01,
      minPlaneTriangles: 3,
      cylinderAngleTolerance: 0.15,
      minCylinderTriangles: 6,
      geometryPrecision: 1000
    }
  }

  /**
   * 为网格检测并命名所有特征
   */
  detectAndNameFeatures(mesh: THREE.Mesh, meshId: string): NamedFeature[] {
    console.log(`开始检测网格 ${meshId} 的特征...`)
    
    const geometry = mesh.geometry as THREE.BufferGeometry
    const triangleCount = this.getTriangleCount(geometry)
    
    const features = this.detectAllFeatures(mesh, meshId)
    
    const namedFeatures: NamedFeature[] = []
    features.forEach((feature, index) => {
      const featureName = this.generateVertexBasedName(feature, geometry, index)
      
      this.nameToFeatureMap.set(featureName, {
        ...feature,
        name: featureName,
        mesh: mesh,
        meshId: meshId
      })
      
      feature.triangles.forEach(triangleIndex => {
        const triangleKey = `${meshId}_${triangleIndex}`
        this.triangleToFeatureMap.set(triangleKey, featureName)
      })
      
      namedFeatures.push({
        name: featureName,
        type: feature.type,
        triangleCount: feature.triangles.length,
        area: feature.area,
        center: feature.type === 'plane' ? feature.point : feature.center
      })
    })
    
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
   */
  private detectAllFeatures(mesh: THREE.Mesh, _meshId: string): Feature[] {
    const geometry = mesh.geometry as THREE.BufferGeometry
    const triangleCount = this.getTriangleCount(geometry)
    const processed = new Set<number>()
    const features: Feature[] = []
    
    for (let i = 0; i < triangleCount; i++) {
      if (processed.has(i)) continue
      
      const triangleData = this.getTriangleData(geometry, i)
      if (!triangleData) continue
      
      const feature = this.growFeature(geometry, i, triangleData, processed)
      
      if (feature && feature.triangles.length >= this.getMinTrianglesForType(feature.type)) {
        features.push(feature)
      }
    }
    
    return features
  }

  /**
   * 从种子三角形开始生长特征
   */
  private growFeature(
    geometry: THREE.BufferGeometry, 
    seedIndex: number, 
    seedData: TriangleData, 
    processed: Set<number>
  ): Feature {
    const potentialType = this.classifyTriangle(seedData)
    
    if (potentialType === 'plane') {
      return this.growPlaneFeature(geometry, seedIndex, seedData, processed)
    } else if (potentialType === 'cylinder') {
      return this.growCylinderFeature(geometry, seedIndex, seedData, processed)
    } else {
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
   */
  private growPlaneFeature(
    geometry: THREE.BufferGeometry, 
    seedIndex: number, 
    seedData: TriangleData, 
    processed: Set<number>
  ): PlaneFeature {
    const plane: PlaneFeature = {
      type: 'plane',
      triangles: [seedIndex],
      normal: seedData.normal.clone(),
      point: seedData.center.clone(),
      area: seedData.area,
      bounds: new THREE.Box3()
    }
    
    processed.add(seedIndex)
    plane.bounds.expandByPoint(seedData.center)
    
    const queue = [seedIndex]
    const triangleCount = this.getTriangleCount(geometry)
    
    while (queue.length > 0) {
      const currentIndex = queue.shift()!
      const checkRange = Math.min(50, triangleCount - currentIndex)
      
      for (let i = 1; i <= checkRange; i++) {
        const neighborIndex = currentIndex + i
        if (neighborIndex >= triangleCount || processed.has(neighborIndex)) continue
        
        const neighborData = this.getTriangleData(geometry, neighborIndex)
        if (!neighborData) continue
        
        if (this.isCoplanar(plane, neighborData)) {
          processed.add(neighborIndex)
          plane.triangles.push(neighborIndex)
          plane.area += neighborData.area
          plane.bounds.expandByPoint(neighborData.center)
          queue.push(neighborIndex)
          
          this.updatePlaneParameters(plane, neighborData)
          
          if (plane.triangles.length > 1000) break
        }
      }
    }
    
    return plane
  }

  /**
   * 生长圆柱特征
   */
  private growCylinderFeature(
    geometry: THREE.BufferGeometry, 
    seedIndex: number, 
    seedData: TriangleData, 
    processed: Set<number>
  ): CylinderFeature {
    const axis = this.estimateCylinderAxis(seedData)
    const center = seedData.center.clone()
    
    const candidateTriangles: TriangleData[] = [seedData]
    const candidateIndices: number[] = [seedIndex]
    
    const queue = [seedIndex]
    const triangleCount = this.getTriangleCount(geometry)
    
    processed.add(seedIndex)
    
    while (queue.length > 0 && candidateTriangles.length < 100) {
      const currentIndex = queue.shift()!
      const checkRange = Math.min(30, triangleCount - currentIndex)
      
      for (let i = 1; i <= checkRange; i++) {
        const neighborIndex = currentIndex + i
        if (neighborIndex >= triangleCount || processed.has(neighborIndex)) continue
        
        const neighborData = this.getTriangleData(geometry, neighborIndex)
        if (!neighborData) continue
        
        if (this.isBasicCylindrical(axis, neighborData)) {
          processed.add(neighborIndex)
          candidateTriangles.push(neighborData)
          candidateIndices.push(neighborIndex)
          queue.push(neighborIndex)
        }
      }
    }
    
    return {
      type: 'cylinder',
      triangles: candidateIndices,
      axis: axis,
      center: center,
      area: candidateTriangles.reduce((sum, t) => sum + t.area, 0),
      bounds: this.calculateBounds(candidateTriangles)
    }
  }

  /**
   * 生成基于顶点索引的稳定特征名字
   */
  private generateVertexBasedName(feature: Feature, geometry: THREE.BufferGeometry, featureIndex: number): string {
    const vertexId = this.vertexIdentifier.generateVertexBasedId(feature.triangles, geometry)
    const featureName = `${feature.type}_${vertexId}_idx${featureIndex}`
    
    return featureName
  }

  /**
   * 根据三角形索引查找特征名字
   */
  getFeatureNameByTriangle(meshId: string, triangleIndex: number): string | null {
    const triangleKey = `${meshId}_${triangleIndex}`
    return this.triangleToFeatureMap.get(triangleKey) || null
  }

  /**
   * 根据特征名字查找特征信息
   */
  getFeatureByName(featureName: string): StoredFeature | null {
    return this.nameToFeatureMap.get(featureName) || null
  }

  /**
   * 获取特征包含的所有三角形
   */
  getFeatureTriangles(featureName: string): number[] {
    const feature = this.nameToFeatureMap.get(featureName)
    return feature ? feature.triangles : []
  }

  /**
   * 导出特征配置
   */
  exportFeatureConfig(): {
    version: string
    timestamp: number
    features: Record<string, unknown>
    meshInfo: Record<string, unknown>
  } {
    const config = {
      version: '1.0',
      timestamp: Date.now(),
      features: {} as Record<string, unknown>,
      meshInfo: {} as Record<string, unknown>
    }
    
    this.nameToFeatureMap.forEach((feature, featureName) => {
      config.features[featureName] = {
        type: feature.type,
        meshId: feature.meshId,
        triangleCount: feature.triangles.length,
        area: feature.area,
        center: (feature.type === 'plane' ? feature.point : feature.center).toArray()
      }
    })
    
    this.meshFeatures.forEach((meshInfo, meshId) => {
      config.meshInfo[meshId] = {
        featureCount: meshInfo.featureCount,
        totalTriangles: meshInfo.totalTriangles
      }
    })
    
    return config
  }

  // ========== 辅助方法 ==========

  private isBasicCylindrical(axis: THREE.Vector3, triangleData: TriangleData): boolean {
    const axisAngle = Math.abs(axis.dot(triangleData.normal))
    return axisAngle <= this.config.cylinderAngleTolerance
  }

  private calculateBounds(triangleDataArray: TriangleData[]): THREE.Box3 {
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

  private getTriangleData(geometry: THREE.BufferGeometry, triangleIndex: number): TriangleData | null {
    const positions = geometry.getAttribute('position')
    const indices = geometry.getIndex()
    
    if (!positions) return null
    
    let i1: number, i2: number, i3: number
    if (indices) {
      i1 = indices.getX(triangleIndex * 3)
      i2 = indices.getX(triangleIndex * 3 + 1)
      i3 = indices.getX(triangleIndex * 3 + 2)
    } else {
      i1 = triangleIndex * 3
      i2 = triangleIndex * 3 + 1
      i3 = triangleIndex * 3 + 2
    }
    
    const v1 = new THREE.Vector3(positions.getX(i1), positions.getY(i1), positions.getZ(i1))
    const v2 = new THREE.Vector3(positions.getX(i2), positions.getY(i2), positions.getZ(i2))
    const v3 = new THREE.Vector3(positions.getX(i3), positions.getY(i3), positions.getZ(i3))
    
    const edge1 = v2.clone().sub(v1)
    const edge2 = v3.clone().sub(v1)
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize()
    
    const center = new THREE.Vector3().add(v1).add(v2).add(v3).divideScalar(3)
    const area = edge1.cross(edge2).length() * 0.5
    
    return { vertices: [v1, v2, v3], normal, center, area }
  }

  private classifyTriangle(triangleData: TriangleData): string {
    if (triangleData.area > 1.0) {
      return 'plane'
    } else if (triangleData.area > 0.1) {
      return 'cylinder'
    }
    return 'individual'
  }

  private isCoplanar(plane: PlaneFeature, triangleData: TriangleData): boolean {
    const angleDiff = plane.normal.angleTo(triangleData.normal)
    if (angleDiff > this.config.planeAngleTolerance && 
        Math.PI - angleDiff > this.config.planeAngleTolerance) {
      return false
    }
    
    const distance = Math.abs(plane.normal.dot(triangleData.center.clone().sub(plane.point)))
    return distance <= this.config.planeDistanceTolerance
  }

  private updatePlaneParameters(plane: PlaneFeature, triangleData: TriangleData): void {
    const totalTriangles = plane.triangles.length
    const weight = 1 / totalTriangles
    
    plane.normal.multiplyScalar(1 - weight)
    plane.normal.add(triangleData.normal.clone().multiplyScalar(weight))
    plane.normal.normalize()
    
    plane.point.multiplyScalar(1 - weight)
    plane.point.add(triangleData.center.clone().multiplyScalar(weight))
  }

  private estimateCylinderAxis(triangleData: TriangleData): THREE.Vector3 {
    const normal = triangleData.normal
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    ]
    
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

  private getMinTrianglesForType(type: string): number {
    switch (type) {
      case 'plane': return this.config.minPlaneTriangles
      case 'cylinder': return this.config.minCylinderTriangles
      default: return 1
    }
  }

  private getTriangleCount(geometry: THREE.BufferGeometry): number {
    const positions = geometry.getAttribute('position')
    const indices = geometry.getIndex()
    return indices ? indices.count / 3 : positions.count / 3
  }

  clearCache(): void {
    this.nameToFeatureMap.clear()
    this.triangleToFeatureMap.clear()
    this.meshFeatures.clear()
  }
}
