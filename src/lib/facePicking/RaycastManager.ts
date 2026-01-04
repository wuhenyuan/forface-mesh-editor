import * as THREE from 'three'
import type { FaceInfo } from '../../types/events'

export interface IntersectOptions {
  returnAll?: boolean
}

export interface FaceInfoExtended extends FaceInfo {
  uv?: THREE.Vector2 | null
  center?: THREE.Vector3 | null
  vertices: THREE.Vector3[]
  worldVertices: THREE.Vector3[]
  worldNormal?: THREE.Vector3
  worldCenter?: THREE.Vector3
  area?: number
  id: string
}

export interface GeometryCompatibility {
  isCompatible: boolean
  type: string
  faceCount: number
  hasIndices: boolean
  warnings: string[]
}

/**
 * 射线投射管理器
 * 负责处理鼠标位置到3D空间的射线投射和面检测
 */
export class RaycastManager {
  camera: THREE.Camera
  raycaster: THREE.Raycaster

  constructor(camera: THREE.Camera) {
    this.camera = camera
    this.raycaster = new THREE.Raycaster()
    
    this.raycaster.params.Points!.threshold = 0.1
    this.raycaster.params.Line!.threshold = 1
    this.raycaster.far = 1000
    this.raycaster.near = 0.1
  }
  
  screenToNDC(clientX: number, clientY: number, rect: DOMRect): THREE.Vector2 {
    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = -((clientY - rect.top) / rect.height) * 2 + 1
    return new THREE.Vector2(x, y)
  }
  
  intersectFaces(mousePosition: THREE.Vector2, meshes: THREE.Mesh[], options: IntersectOptions = {}): FaceInfoExtended | FaceInfoExtended[] | null {
    if (!this.validateInput(mousePosition, meshes)) {
      return null
    }
    
    const validMeshes = meshes.filter(mesh => RaycastManager.validateMesh(mesh))
    
    if (validMeshes.length === 0) {
      return null
    }
    
    try {
      this.raycaster.setFromCamera(mousePosition, this.camera)
      const intersects = this.raycaster.intersectObjects(validMeshes, false)
      
      if (intersects.length === 0) {
        return null
      }
      
      intersects.sort((a, b) => a.distance - b.distance)
      
      if (options.returnAll) {
        return intersects.map(intersection => this.buildFaceInfo(intersection)).filter((f): f is FaceInfoExtended => f !== null)
      }
      
      return this.buildFaceInfo(intersects[0])
      
    } catch (error) {
      console.error('射线投射检测失败:', error)
      return null
    }
  }
  
  intersectFacesWithDepthSorting(mousePosition: THREE.Vector2, meshes: THREE.Mesh[]): FaceInfoExtended[] {
    const result = this.intersectFaces(mousePosition, meshes, { returnAll: true })
    
    if (!result || !Array.isArray(result) || result.length === 0) {
      return []
    }
    
    return result.sort((a, b) => (a.distance || 0) - (b.distance || 0))
  }
  
  intersectSingleMesh(mousePosition: THREE.Vector2, mesh: THREE.Mesh): FaceInfoExtended | null {
    if (!this.validateInput(mousePosition, [mesh])) {
      return null
    }
    
    if (!RaycastManager.validateMesh(mesh)) {
      return null
    }
    
    try {
      this.raycaster.setFromCamera(mousePosition, this.camera)
      const intersects = this.raycaster.intersectObject(mesh, false)
      
      if (intersects.length === 0) {
        return null
      }
      
      return this.buildFaceInfo(intersects[0])
      
    } catch (error) {
      console.error('单网格射线投射检测失败:', error)
      return null
    }
  }
  
  buildFaceInfo(intersection: THREE.Intersection): FaceInfoExtended | null {
    const { object: mesh, face, faceIndex, point, distance, uv } = intersection
    
    if (!mesh || !(mesh as THREE.Mesh).geometry) {
      return null
    }
    
    const meshObj = mesh as THREE.Mesh
    const geometry = meshObj.geometry
    
    const faceInfo: FaceInfoExtended = {
      mesh: meshObj,
      faceIndex: faceIndex ?? 0,
      face: face as THREE.Face,
      point: point.clone(),
      normal: new THREE.Vector3(),
      distance: distance,
      uv: uv ? uv.clone() : null,
      center: null,
      vertices: [],
      worldVertices: [],
      id: ''
    }
    
    if (geometry.isBufferGeometry) {
      faceInfo.vertices = this.getBufferGeometryFaceVertices(geometry, faceIndex ?? 0)
    }
    
    faceInfo.worldVertices = faceInfo.vertices.map(vertex => {
      const worldVertex = vertex.clone()
      worldVertex.applyMatrix4(meshObj.matrixWorld)
      return worldVertex
    })
    
    if (faceInfo.vertices.length >= 3) {
      faceInfo.normal = this.calculateFaceNormal(faceInfo.vertices)
      const worldNormal = faceInfo.normal.clone()
      worldNormal.transformDirection(meshObj.matrixWorld)
      faceInfo.worldNormal = worldNormal
    } else if (face && face.normal) {
      faceInfo.normal = face.normal.clone()
      faceInfo.worldNormal = faceInfo.normal.clone()
      faceInfo.worldNormal.transformDirection(meshObj.matrixWorld)
    }
    
    if (faceInfo.vertices.length > 0) {
      faceInfo.center = this.calculateFaceCenter(faceInfo.vertices)
      faceInfo.worldCenter = faceInfo.center.clone()
      faceInfo.worldCenter.applyMatrix4(meshObj.matrixWorld)
    }
    
    if (faceInfo.vertices.length >= 3) {
      faceInfo.area = this.calculateFaceArea(faceInfo.vertices)
    }
    
    faceInfo.id = this.generateFaceId(meshObj, faceIndex ?? 0)
    
    return faceInfo
  }
  
  calculateFaceNormal(vertices: THREE.Vector3[]): THREE.Vector3 {
    if (vertices.length < 3) {
      return new THREE.Vector3(0, 1, 0)
    }
    
    const v1 = vertices[1].clone().sub(vertices[0])
    const v2 = vertices[2].clone().sub(vertices[0])
    const normal = new THREE.Vector3().crossVectors(v1, v2).normalize()
    
    return normal
  }
  
  calculateFaceArea(vertices: THREE.Vector3[]): number {
    if (vertices.length < 3) {
      return 0
    }
    
    const v1 = vertices[1].clone().sub(vertices[0])
    const v2 = vertices[2].clone().sub(vertices[0])
    const cross = new THREE.Vector3().crossVectors(v1, v2)
    
    return cross.length() * 0.5
  }
  
  getBufferGeometryFaceVertices(geometry: THREE.BufferGeometry, faceIndex: number): THREE.Vector3[] {
    const vertices: THREE.Vector3[] = []
    const positionAttribute = geometry.getAttribute('position')
    
    if (!positionAttribute) {
      return vertices
    }
    
    const indexAttribute = geometry.getIndex()
    
    if (indexAttribute) {
      const startIndex = faceIndex * 3
      
      for (let i = 0; i < 3; i++) {
        const vertexIndex = indexAttribute.getX(startIndex + i)
        if (vertexIndex < positionAttribute.count) {
          const vertex = new THREE.Vector3(
            positionAttribute.getX(vertexIndex),
            positionAttribute.getY(vertexIndex),
            positionAttribute.getZ(vertexIndex)
          )
          vertices.push(vertex)
        }
      }
    } else {
      const startIndex = faceIndex * 3
      
      for (let i = 0; i < 3; i++) {
        const vertexIndex = startIndex + i
        if (vertexIndex < positionAttribute.count) {
          const vertex = new THREE.Vector3(
            positionAttribute.getX(vertexIndex),
            positionAttribute.getY(vertexIndex),
            positionAttribute.getZ(vertexIndex)
          )
          vertices.push(vertex)
        }
      }
    }
    
    return vertices
  }
  
  calculateFaceCenter(vertices: THREE.Vector3[]): THREE.Vector3 {
    const center = new THREE.Vector3()
    
    if (vertices.length === 0) {
      return center
    }
    
    vertices.forEach(vertex => {
      center.add(vertex)
    })
    
    center.divideScalar(vertices.length)
    return center
  }
  
  generateFaceId(mesh: THREE.Mesh, faceIndex: number): string {
    return `${mesh.uuid}_face_${faceIndex}`
  }
  
  static validateMesh(mesh: THREE.Mesh): boolean {
    if (!mesh || !mesh.geometry) {
      console.warn('网格缺少几何体数据')
      return false
    }
    
    if (!mesh.visible) {
      return false
    }
    
    const geometry = mesh.geometry
    
    if (geometry.isBufferGeometry) {
      const positionAttribute = geometry.getAttribute('position')
      if (!positionAttribute || positionAttribute.count === 0) {
        console.warn('BufferGeometry缺少位置属性')
        return false
      }
      
      const indexAttribute = geometry.getIndex()
      const faceCount = indexAttribute 
        ? indexAttribute.count / 3 
        : positionAttribute.count / 3
      
      if (faceCount < 1) {
        console.warn('几何体没有足够的顶点组成面')
        return false
      }
      
      return true
    }
    
    console.warn('不支持的几何体类型')
    return false
  }
  
  static getFaceCount(geometry: THREE.BufferGeometry): number {
    if (geometry.isBufferGeometry) {
      const positionAttribute = geometry.getAttribute('position')
      if (!positionAttribute) return 0
      
      const indexAttribute = geometry.getIndex()
      return indexAttribute 
        ? indexAttribute.count / 3 
        : positionAttribute.count / 3
    }
    
    return 0
  }
  
  validateInput(mousePosition: THREE.Vector2, meshes: THREE.Mesh[]): boolean {
    if (!mousePosition || 
        typeof mousePosition.x !== 'number' || 
        typeof mousePosition.y !== 'number') {
      console.warn('无效的鼠标位置:', mousePosition)
      return false
    }
    
    if (Math.abs(mousePosition.x) > 1.1 || Math.abs(mousePosition.y) > 1.1) {
      console.warn('鼠标位置超出有效范围:', mousePosition)
      return false
    }
    
    if (!Array.isArray(meshes) || meshes.length === 0) {
      return false
    }
    
    if (!this.camera) {
      console.error('射线投射管理器缺少相机对象')
      return false
    }
    
    return true
  }
  
  static checkGeometryCompatibility(geometry: THREE.BufferGeometry): GeometryCompatibility {
    const result: GeometryCompatibility = {
      isCompatible: false,
      type: 'unknown',
      faceCount: 0,
      hasIndices: false,
      warnings: []
    }
    
    if (geometry.isBufferGeometry) {
      result.type = 'BufferGeometry'
      result.faceCount = this.getFaceCount(geometry)
      result.hasIndices = !!geometry.getIndex()
      result.isCompatible = result.faceCount > 0
      
      if (!geometry.getAttribute('position')) {
        result.warnings.push('缺少位置属性')
      }
      if (!geometry.getAttribute('normal')) {
        result.warnings.push('缺少法向量属性（将自动计算）')
      }
    } else {
      result.warnings.push('不支持的几何体类型')
    }
    
    return result
  }
}
