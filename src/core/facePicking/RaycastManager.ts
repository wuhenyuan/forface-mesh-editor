import * as THREE from 'three'

/**
 * 射线投射管理器
 * 负责处理鼠标位置到3D空间的射线投射和面检测
 */
export class RaycastManager {
  camera: any
  raycaster: THREE.Raycaster

  constructor(camera: any) {
    this.camera = camera
    this.raycaster = new THREE.Raycaster()
    
    // 设置射线投射参数
    this.raycaster.params.Points.threshold = 0.1
    this.raycaster.params.Line.threshold = 1
    
    // 性能优化设置
    this.raycaster.far = 1000 // 限制射线距离
    this.raycaster.near = 0.1
  }
  
  /**
   * 将屏幕坐标转换为标准化设备坐标
   * @param {number} clientX - 屏幕X坐标
   * @param {number} clientY - 屏幕Y坐标
   * @param {DOMRect} rect - 容器边界矩形
   * @returns {THREE.Vector2} 标准化坐标 (-1 到 1)
   */
  screenToNDC(clientX: number, clientY: number, rect: DOMRect) {
    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    const y = -((clientY - rect.top) / rect.height) * 2 + 1
    return new THREE.Vector2(x, y)
  }
  
  /**
   * 执行面级射线投射检测
   * @param {THREE.Vector2} mousePosition - 标准化的鼠标位置 (-1 到 1)
   * @param {THREE.Mesh[]} meshes - 要检测的网格数组
   * @param {Object} options - 检测选项
   * @returns {Object|null} 面信息对象或null
   */
  intersectFaces(mousePosition: any, meshes: any[], options: Record<string, any> = {}): any {
    // 输入验证
    if (!this.validateInput(mousePosition, meshes)) {
      return null
    }
    
    // 过滤有效的网格
    const validMeshes = meshes.filter(mesh => RaycastManager.validateMesh(mesh))
    
    if (validMeshes.length === 0) {
      return null
    }
    
    try {
      // 从相机位置发射射线
      this.raycaster.setFromCamera(mousePosition, this.camera)
      
      // 执行射线投射检测
      const intersects = this.raycaster.intersectObjects(validMeshes, false)
      
      if (intersects.length === 0) {
        return null
      }
      
      // 按距离排序，获取最近的交点
      intersects.sort((a, b) => a.distance - b.distance)
      
      // 如果需要，可以返回多个交点
      if (options.returnAll) {
        return intersects.map(intersection => this.buildFaceInfo(intersection))
      }
      
      // 返回最近的交点
      return this.buildFaceInfo(intersects[0])
      
    } catch (error) {
      console.error('射线投射检测失败:', error)
      return null
    }
  }
  
  /**
   * 执行多网格深度排序的面检测
   * @param {THREE.Vector2} mousePosition - 标准化的鼠标位置
   * @param {THREE.Mesh[]} meshes - 要检测的网格数组
   * @returns {Object[]} 按距离排序的面信息数组
   */
  intersectFacesWithDepthSorting(mousePosition: any, meshes: any[]): any[] {
    const result = this.intersectFaces(mousePosition, meshes, { returnAll: true }) as any[]
    
    if (!result || result.length === 0) {
      return []
    }
    
    // 按距离排序（已经在intersectFaces中排序了）
    return result.sort((a, b) => a.distance - b.distance)
  }
  
  /**
   * 检测特定网格的面
   * @param {THREE.Vector2} mousePosition - 标准化的鼠标位置
   * @param {THREE.Mesh} mesh - 单个网格对象
   * @returns {Object|null} 面信息对象或null
   */
  intersectSingleMesh(mousePosition, mesh) {
    // 输入验证
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
  
  /**
   * 构建面信息对象
   * @param {Object} intersection - Three.js射线投射结果
   * @returns {Object} 面信息对象
   */
  buildFaceInfo(intersection: any): any {
    const { object: mesh, face, faceIndex, point, distance, uv } = intersection
    
    if (!mesh || !mesh.geometry) {
      return null
    }
    
    const geometry = mesh.geometry
    const faceInfo: any = {
      mesh: mesh,
      faceIndex: faceIndex,
      face: face,
      point: point.clone(),
      distance: distance,
      uv: uv ? uv.clone() : null,
      normal: null,
      center: null,
      vertices: [],
      worldVertices: []
    }
    
    // 获取面的顶点信息
    if (geometry.isBufferGeometry) {
      faceInfo.vertices = this.getBufferGeometryFaceVertices(geometry, faceIndex)
    } else if (geometry.isGeometry && face) {
      faceInfo.vertices = this.getGeometryFaceVertices(geometry, face)
    }
    
    // 计算世界坐标系下的顶点
    faceInfo.worldVertices = faceInfo.vertices.map(vertex => {
      const worldVertex = vertex.clone()
      worldVertex.applyMatrix4(mesh.matrixWorld)
      return worldVertex
    })
    
    // 计算面法向量
    if (faceInfo.vertices.length >= 3) {
      faceInfo.normal = this.calculateFaceNormal(faceInfo.vertices)
      // 将法向量转换到世界坐标系
      const worldNormal = faceInfo.normal.clone()
      worldNormal.transformDirection(mesh.matrixWorld)
      faceInfo.worldNormal = worldNormal
    } else if (face && face.normal) {
      faceInfo.normal = face.normal.clone()
      // 将法向量转换到世界坐标系
      faceInfo.worldNormal = faceInfo.normal.clone()
      faceInfo.worldNormal.transformDirection(mesh.matrixWorld)
    }
    
    // 计算面中心点
    if (faceInfo.vertices.length > 0) {
      faceInfo.center = this.calculateFaceCenter(faceInfo.vertices)
      // 转换到世界坐标系
      faceInfo.worldCenter = faceInfo.center.clone()
      faceInfo.worldCenter.applyMatrix4(mesh.matrixWorld)
    }
    
    // 计算面积
    if (faceInfo.vertices.length >= 3) {
      faceInfo.area = this.calculateFaceArea(faceInfo.vertices)
    }
    
    // 生成唯一标识符
    faceInfo.id = this.generateFaceId(mesh, faceIndex)
    
    return faceInfo
  }
  
  /**
   * 计算面的法向量
   * @param {THREE.Vector3[]} vertices - 顶点数组
   * @returns {THREE.Vector3} 法向量
   */
  calculateFaceNormal(vertices) {
    if (vertices.length < 3) {
      return new THREE.Vector3(0, 1, 0) // 默认向上
    }
    
    const v1 = vertices[1].clone().sub(vertices[0])
    const v2 = vertices[2].clone().sub(vertices[0])
    const normal = new THREE.Vector3().crossVectors(v1, v2).normalize()
    
    return normal
  }
  
  /**
   * 计算面的面积
   * @param {THREE.Vector3[]} vertices - 顶点数组
   * @returns {number} 面积
   */
  calculateFaceArea(vertices) {
    if (vertices.length < 3) {
      return 0
    }
    
    // 使用三角形面积公式：0.5 * |AB × AC|
    const v1 = vertices[1].clone().sub(vertices[0])
    const v2 = vertices[2].clone().sub(vertices[0])
    const cross = new THREE.Vector3().crossVectors(v1, v2)
    
    return cross.length() * 0.5
  }
  
  /**
   * 从BufferGeometry获取面的顶点
   * @param {THREE.BufferGeometry} geometry - 缓冲几何体
   * @param {number} faceIndex - 面索引
   * @returns {THREE.Vector3[]} 顶点数组
   */
  getBufferGeometryFaceVertices(geometry, faceIndex) {
    const vertices = []
    const positionAttribute = geometry.getAttribute('position')
    
    if (!positionAttribute) {
      return vertices
    }
    
    // 检查是否有索引
    const indexAttribute = geometry.getIndex()
    
    if (indexAttribute) {
      // 有索引的几何体
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
      // 无索引的几何体
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
  
  /**
   * 从Geometry获取面的顶点
   * @param {THREE.Geometry} geometry - 几何体
   * @param {THREE.Face3} face - 面对象
   * @returns {THREE.Vector3[]} 顶点数组
   */
  getGeometryFaceVertices(geometry, face) {
    const vertices = []
    const geometryVertices = geometry.vertices
    
    if (face && geometryVertices) {
      vertices.push(geometryVertices[face.a].clone())
      vertices.push(geometryVertices[face.b].clone())
      vertices.push(geometryVertices[face.c].clone())
    }
    
    return vertices
  }
  
  /**
   * 计算面的中心点
   * @param {THREE.Vector3[]} vertices - 顶点数组
   * @returns {THREE.Vector3} 中心点
   */
  calculateFaceCenter(vertices) {
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
  
  /**
   * 生成面的唯一标识符
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {number} faceIndex - 面索引
   * @returns {string} 唯一标识符
   */
  generateFaceId(mesh, faceIndex) {
    // 使用网格的UUID和面索引生成唯一ID
    return `${mesh.uuid}_face_${faceIndex}`
  }
  
  /**
   * 验证网格是否适合面拾取
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {boolean} 是否有效
   */
  static validateMesh(mesh) {
    if (!mesh || !mesh.geometry) {
      console.warn('网格缺少几何体数据')
      return false
    }
    
    // 检查网格是否可见
    if (!mesh.visible) {
      return false
    }
    
    const geometry = mesh.geometry
    
    // 检查BufferGeometry
    if (geometry.isBufferGeometry) {
      const positionAttribute = geometry.getAttribute('position')
      if (!positionAttribute || positionAttribute.count === 0) {
        console.warn('BufferGeometry缺少位置属性')
        return false
      }
      
      // 检查是否有足够的顶点组成面
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
    
    // 检查Geometry（已废弃但仍需支持）
    if (geometry.isGeometry) {
      if (!geometry.vertices || geometry.vertices.length === 0) {
        console.warn('Geometry缺少顶点数据')
        return false
      }
      if (!geometry.faces || geometry.faces.length === 0) {
        console.warn('Geometry缺少面数据')
        return false
      }
      return true
    }
    
    console.warn('不支持的几何体类型')
    return false
  }
  
  /**
   * 获取几何体的面数量
   * @param {THREE.Geometry|THREE.BufferGeometry} geometry - 几何体
   * @returns {number} 面数量
   */
  static getFaceCount(geometry) {
    if (geometry.isBufferGeometry) {
      const positionAttribute = geometry.getAttribute('position')
      if (!positionAttribute) return 0
      
      const indexAttribute = geometry.getIndex()
      return indexAttribute 
        ? indexAttribute.count / 3 
        : positionAttribute.count / 3
    }
    
    if (geometry.isGeometry) {
      return geometry.faces ? geometry.faces.length : 0
    }
    
    return 0
  }
  
  /**
   * 输入验证
   * @param {THREE.Vector2} mousePosition - 鼠标位置
   * @param {THREE.Mesh[]} meshes - 网格数组
   * @returns {boolean} 是否通过验证
   */
  validateInput(mousePosition, meshes) {
    // 检查鼠标位置
    if (!mousePosition || 
        typeof mousePosition.x !== 'number' || 
        typeof mousePosition.y !== 'number') {
      console.warn('无效的鼠标位置:', mousePosition)
      return false
    }
    
    // 检查鼠标位置范围
    if (Math.abs(mousePosition.x) > 1.1 || Math.abs(mousePosition.y) > 1.1) {
      console.warn('鼠标位置超出有效范围:', mousePosition)
      return false
    }
    
    // 检查网格数组
    if (!Array.isArray(meshes) || meshes.length === 0) {
      return false
    }
    
    // 检查相机是否有效
    if (!this.camera) {
      console.error('射线投射管理器缺少相机对象')
      return false
    }
    
    return true
  }
  
  /**
   * 检查几何体类型兼容性
   * @param {THREE.Geometry|THREE.BufferGeometry} geometry - 几何体
   * @returns {Object} 兼容性信息
   */
  static checkGeometryCompatibility(geometry) {
    const result = {
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
    } else if (geometry.isGeometry) {
      result.type = 'Geometry'
      result.faceCount = this.getFaceCount(geometry)
      result.isCompatible = result.faceCount > 0
      result.warnings.push('Geometry已废弃，建议使用BufferGeometry')
    } else {
      result.warnings.push('不支持的几何体类型')
    }
    
    return result
  }
}
