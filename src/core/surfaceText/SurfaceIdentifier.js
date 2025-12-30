/**
 * 表面标识器
 * 用于标识和恢复文字附着的表面
 */
import * as THREE from 'three'

export class SurfaceIdentifier {
  constructor() {
    this.meshRegistry = new Map() // meshId -> mesh
    this.faceRegistry = new Map() // surfaceId -> faceInfo
  }

  /**
   * 注册网格，生成唯一标识
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {string} 网格ID
   */
  registerMesh(mesh) {
    const meshId = this.generateMeshId(mesh)
    this.meshRegistry.set(meshId, mesh)
    mesh.userData.surfaceId = meshId
    return meshId
  }

  /**
   * 生成网格的唯一标识
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {string} 网格ID
   */
  generateMeshId(mesh) {
    // 方法1: 基于几何体特征生成哈希
    const geometry = mesh.geometry
    const positionArray = geometry.getAttribute('position').array
    
    // 计算几何体特征哈希
    let hash = 0
    const samplePoints = Math.min(100, positionArray.length / 3) // 采样100个点
    const step = Math.floor(positionArray.length / (samplePoints * 3))
    
    for (let i = 0; i < samplePoints * 3; i += step) {
      const value = Math.round(positionArray[i] * 1000) // 精度到毫米
      hash = ((hash << 5) - hash + value) & 0xffffffff
    }
    
    // 添加顶点数和面数作为额外特征
    const vertexCount = geometry.getAttribute('position').count
    const faceCount = geometry.index ? geometry.index.count / 3 : vertexCount / 3
    
    return `mesh_${Math.abs(hash)}_v${vertexCount}_f${Math.floor(faceCount)}`
  }

  /**
   * 生成表面标识
   * @param {Object} faceInfo - 面信息
   * @returns {string} 表面标识
   */
  generateSurfaceId(faceInfo) {
    const mesh = faceInfo.mesh
    const faceIndex = faceInfo.faceIndex
    
    // 确保网格已注册
    let meshId = mesh.userData.surfaceId
    if (!meshId) {
      meshId = this.registerMesh(mesh)
    }
    
    // 获取面的顶点坐标（用于验证）
    const face = this.getFaceVertices(mesh.geometry, faceIndex)
    const faceHash = this.hashFaceVertices(face)
    
    const surfaceId = `${meshId}_face${faceIndex}_${faceHash}`
    
    // 保存面信息
    this.faceRegistry.set(surfaceId, {
      meshId,
      faceIndex,
      faceHash,
      vertices: face,
      point: faceInfo.point.clone(),
      normal: this.getFaceNormal(mesh.geometry, faceIndex),
      uv: faceInfo.uv ? faceInfo.uv.clone() : null
    })
    
    return surfaceId
  }

  /**
   * 根据表面标识恢复面信息
   * @param {string} surfaceId - 表面标识
   * @returns {Object|null} 面信息
   */
  restoreSurfaceInfo(surfaceId) {
    const faceData = this.faceRegistry.get(surfaceId)
    if (!faceData) {
      console.warn('未找到表面数据:', surfaceId)
      return null
    }
    
    const mesh = this.meshRegistry.get(faceData.meshId)
    if (!mesh) {
      console.warn('未找到对应网格:', faceData.meshId)
      return null
    }
    
    // 验证面是否仍然有效
    const currentFace = this.getFaceVertices(mesh.geometry, faceData.faceIndex)
    const currentHash = this.hashFaceVertices(currentFace)
    
    if (currentHash !== faceData.faceHash) {
      console.warn('面几何体已改变，尝试查找最近的面')
      return this.findNearestFace(mesh, faceData.point, faceData.normal)
    }
    
    return {
      mesh,
      faceIndex: faceData.faceIndex,
      face: currentFace,
      point: faceData.point,
      normal: faceData.normal,
      uv: faceData.uv
    }
  }

  /**
   * 获取面的顶点坐标
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {number} faceIndex - 面索引
   * @returns {Array} 顶点坐标数组
   */
  getFaceVertices(geometry, faceIndex) {
    const positions = geometry.getAttribute('position')
    const indices = geometry.index
    
    const vertices = []
    
    if (indices) {
      // 有索引的几何体
      const i1 = indices.getX(faceIndex * 3)
      const i2 = indices.getX(faceIndex * 3 + 1)
      const i3 = indices.getX(faceIndex * 3 + 2)
      
      vertices.push(
        [positions.getX(i1), positions.getY(i1), positions.getZ(i1)],
        [positions.getX(i2), positions.getY(i2), positions.getZ(i2)],
        [positions.getX(i3), positions.getY(i3), positions.getZ(i3)]
      )
    } else {
      // 无索引的几何体
      const i = faceIndex * 3
      vertices.push(
        [positions.getX(i), positions.getY(i), positions.getZ(i)],
        [positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1)],
        [positions.getX(i + 2), positions.getY(i + 2), positions.getZ(i + 2)]
      )
    }
    
    return vertices
  }

  /**
   * 计算面顶点的哈希值
   * @param {Array} vertices - 顶点数组
   * @returns {string} 哈希值
   */
  hashFaceVertices(vertices) {
    // 将顶点坐标转换为字符串并排序（避免顶点顺序影响）
    const vertexStrings = vertices.map(v => 
      v.map(coord => Math.round(coord * 1000)).join(',')
    ).sort()
    
    return this.simpleHash(vertexStrings.join('|'))
  }

  /**
   * 简单哈希函数
   * @param {string} str - 输入字符串
   * @returns {string} 哈希值
   */
  simpleHash(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    return Math.abs(hash).toString(16)
  }

  /**
   * 获取面法向量
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {number} faceIndex - 面索引
   * @returns {THREE.Vector3} 法向量
   */
  getFaceNormal(geometry, faceIndex) {
    const vertices = this.getFaceVertices(geometry, faceIndex)
    const v1 = new THREE.Vector3(...vertices[0])
    const v2 = new THREE.Vector3(...vertices[1])
    const v3 = new THREE.Vector3(...vertices[2])
    
    const normal = new THREE.Vector3()
    const edge1 = v2.clone().sub(v1)
    const edge2 = v3.clone().sub(v1)
    normal.crossVectors(edge1, edge2).normalize()
    
    return normal
  }

  /**
   * 查找最近的面（当原面不可用时）
   * @param {THREE.Mesh} mesh - 网格
   * @param {THREE.Vector3} targetPoint - 目标点
   * @param {THREE.Vector3} targetNormal - 目标法向量
   * @returns {Object|null} 最近的面信息
   */
  findNearestFace(mesh, targetPoint, targetNormal) {
    const geometry = mesh.geometry
    const faceCount = geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3
    
    let bestFace = null
    let bestScore = Infinity
    
    for (let i = 0; i < faceCount; i++) {
      const vertices = this.getFaceVertices(geometry, i)
      const center = new THREE.Vector3()
        .add(new THREE.Vector3(...vertices[0]))
        .add(new THREE.Vector3(...vertices[1]))
        .add(new THREE.Vector3(...vertices[2]))
        .divideScalar(3)
      
      const normal = this.getFaceNormal(geometry, i)
      
      // 计算距离和法向量相似度
      const distance = center.distanceTo(targetPoint)
      const normalSimilarity = normal.dot(targetNormal)
      
      // 综合评分（距离越小越好，法向量相似度越高越好）
      const score = distance - normalSimilarity * 2
      
      if (score < bestScore) {
        bestScore = score
        bestFace = {
          mesh,
          faceIndex: i,
          face: vertices,
          point: center,
          normal: normal
        }
      }
    }
    
    return bestFace
  }

  /**
   * 导出配置数据
   * @returns {Object} 配置数据
   */
  exportConfig() {
    const meshData = {}
    const faceData = {}
    
    // 导出网格数据
    this.meshRegistry.forEach((mesh, meshId) => {
      meshData[meshId] = {
        name: mesh.name,
        position: mesh.position.toArray(),
        rotation: mesh.rotation.toArray(),
        scale: mesh.scale.toArray(),
        geometryHash: this.generateMeshId(mesh)
      }
    })
    
    // 导出面数据
    this.faceRegistry.forEach((faceInfo, surfaceId) => {
      faceData[surfaceId] = {
        meshId: faceInfo.meshId,
        faceIndex: faceInfo.faceIndex,
        faceHash: faceInfo.faceHash,
        point: faceInfo.point.toArray(),
        normal: faceInfo.normal.toArray(),
        uv: faceInfo.uv ? faceInfo.uv.toArray() : null
      }
    })
    
    return {
      meshes: meshData,
      faces: faceData,
      version: '1.0'
    }
  }

  /**
   * 导入配置数据
   * @param {Object} config - 配置数据
   */
  importConfig(config) {
    if (!config || config.version !== '1.0') {
      console.warn('不支持的配置版本')
      return
    }
    
    // 导入面数据
    Object.entries(config.faces || {}).forEach(([surfaceId, faceData]) => {
      this.faceRegistry.set(surfaceId, {
        meshId: faceData.meshId,
        faceIndex: faceData.faceIndex,
        faceHash: faceData.faceHash,
        point: new THREE.Vector3(...faceData.point),
        normal: new THREE.Vector3(...faceData.normal),
        uv: faceData.uv ? new THREE.Vector2(...faceData.uv) : null
      })
    })
  }
}

// 全局实例
export const surfaceIdentifier = new SurfaceIdentifier()