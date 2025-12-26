import * as THREE from 'three'

/**
 * 高亮渲染管理器
 * 负责管理面级高亮显示和悬停效果
 */
export class HighlightRenderer {
  constructor(scene) {
    this.scene = scene
    
    // 高亮网格存储 - key: meshId_faceIndex, value: highlightMesh
    this.highlightMeshes = new Map()
    
    // 悬停高亮网格存储
    this.hoverMeshes = new Map()
    
    // 高亮颜色配置
    this.colors = {
      selection: 0xff6b35,    // 橙色 - 选中高亮
      hover: 0x4fc3f7,        // 浅蓝色 - 悬停高亮
      multiSelection: 0xe91e63 // 粉色 - 多选高亮
    }
    
    // 高亮材质缓存
    this.materialCache = new Map()
    
    // 高亮组 - 用于管理所有高亮网格
    this.highlightGroup = new THREE.Group()
    this.highlightGroup.name = 'FaceHighlightGroup'
    this.scene.add(this.highlightGroup)
    
    // 悬停组
    this.hoverGroup = new THREE.Group()
    this.hoverGroup.name = 'FaceHoverGroup'
    this.scene.add(this.hoverGroup)
  }
  
  /**
   * 高亮显示面
   * @param {THREE.Mesh} mesh - 原始网格
   * @param {number} faceIndex - 面索引
   * @param {number} color - 高亮颜色（可选）
   * @param {boolean} isHover - 是否为悬停效果
   * @returns {boolean} 是否成功创建高亮
   */
  highlightFace(mesh, faceIndex, color = null, isHover = false) {
    if (!mesh || !mesh.geometry || faceIndex < 0) {
      console.warn('无效的网格或面索引')
      return false
    }
    
    const highlightId = this.generateHighlightId(mesh, faceIndex)
    const targetGroup = isHover ? this.hoverGroup : this.highlightGroup
    const targetMap = isHover ? this.hoverMeshes : this.highlightMeshes
    
    // 如果已经存在高亮，先移除
    if (targetMap.has(highlightId)) {
      this.removeHighlightById(highlightId, isHover)
    }
    
    // 创建面高亮网格
    const highlightMesh = this.createFaceHighlightMesh(mesh, faceIndex, color, isHover)
    
    if (highlightMesh) {
      targetMap.set(highlightId, highlightMesh)
      targetGroup.add(highlightMesh)
      return true
    }
    
    return false
  }
  
  /**
   * 移除面高亮
   * @param {THREE.Mesh} mesh - 原始网格
   * @param {number} faceIndex - 面索引
   * @param {boolean} isHover - 是否为悬停效果
   * @returns {boolean} 是否成功移除
   */
  removeHighlight(mesh, faceIndex, isHover = false) {
    const highlightId = this.generateHighlightId(mesh, faceIndex)
    return this.removeHighlightById(highlightId, isHover)
  }
  
  /**
   * 根据ID移除高亮
   * @param {string} highlightId - 高亮ID
   * @param {boolean} isHover - 是否为悬停效果
   * @returns {boolean} 是否成功移除
   */
  removeHighlightById(highlightId, isHover = false) {
    const targetGroup = isHover ? this.hoverGroup : this.highlightGroup
    const targetMap = isHover ? this.hoverMeshes : this.highlightMeshes
    
    const highlightMesh = targetMap.get(highlightId)
    if (highlightMesh) {
      targetGroup.remove(highlightMesh)
      
      // 清理几何体和材质
      if (highlightMesh.geometry) {
        highlightMesh.geometry.dispose()
      }
      if (highlightMesh.material) {
        if (Array.isArray(highlightMesh.material)) {
          highlightMesh.material.forEach(mat => mat.dispose())
        } else {
          highlightMesh.material.dispose()
        }
      }
      
      targetMap.delete(highlightId)
      return true
    }
    
    return false
  }
  
  /**
   * 清除所有高亮
   * @param {boolean} includeHover - 是否包括悬停效果
   */
  clearAllHighlights(includeHover = false) {
    // 清除选择高亮
    this.highlightMeshes.forEach((mesh, id) => {
      this.removeHighlightById(id, false)
    })
    
    // 清除悬停高亮
    if (includeHover) {
      this.hoverMeshes.forEach((mesh, id) => {
        this.removeHighlightById(id, true)
      })
    }
  }
  
  /**
   * 显示悬停效果
   * @param {THREE.Mesh} mesh - 原始网格
   * @param {number} faceIndex - 面索引
   * @returns {boolean} 是否成功显示
   */
  showHoverEffect(mesh, faceIndex) {
    return this.highlightFace(mesh, faceIndex, this.colors.hover, true)
  }
  
  /**
   * 隐藏悬停效果
   * @param {THREE.Mesh} mesh - 原始网格（可选）
   * @param {number} faceIndex - 面索引（可选）
   */
  hideHoverEffect(mesh = null, faceIndex = null) {
    if (mesh !== null && faceIndex !== null) {
      this.removeHighlight(mesh, faceIndex, true)
    } else {
      // 清除所有悬停效果
      this.hoverMeshes.forEach((highlightMesh, id) => {
        this.removeHighlightById(id, true)
      })
    }
  }
  
  /**
   * 创建面高亮网格
   * @param {THREE.Mesh} originalMesh - 原始网格
   * @param {number} faceIndex - 面索引
   * @param {number} color - 高亮颜色
   * @param {boolean} isHover - 是否为悬停效果
   * @returns {THREE.Mesh|null} 高亮网格或null
   */
  createFaceHighlightMesh(originalMesh, faceIndex, color, isHover) {
    const geometry = originalMesh.geometry
    
    if (geometry.isBufferGeometry) {
      return this.createBufferGeometryHighlight(originalMesh, faceIndex, color, isHover)
    } else if (geometry.isGeometry) {
      return this.createGeometryHighlight(originalMesh, faceIndex, color, isHover)
    }
    
    console.warn('不支持的几何体类型')
    return null
  }
  
  /**
   * 为BufferGeometry创建面高亮
   * @param {THREE.Mesh} originalMesh - 原始网格
   * @param {number} faceIndex - 面索引
   * @param {number} color - 高亮颜色
   * @param {boolean} isHover - 是否为悬停效果
   * @returns {THREE.Mesh|null} 高亮网格
   */
  createBufferGeometryHighlight(originalMesh, faceIndex, color, isHover) {
    const originalGeometry = originalMesh.geometry
    const positionAttribute = originalGeometry.getAttribute('position')
    const normalAttribute = originalGeometry.getAttribute('normal')
    const uvAttribute = originalGeometry.getAttribute('uv')
    const indexAttribute = originalGeometry.getIndex()
    
    if (!positionAttribute) {
      console.warn('几何体缺少位置属性')
      return null
    }
    
    // 创建新的几何体，只包含选中的面
    const highlightGeometry = new THREE.BufferGeometry()
    
    // 获取面的顶点索引
    let vertexIndices = []
    
    if (indexAttribute) {
      // 有索引的几何体
      const startIndex = faceIndex * 3
      for (let i = 0; i < 3; i++) {
        vertexIndices.push(indexAttribute.getX(startIndex + i))
      }
    } else {
      // 无索引的几何体
      const startIndex = faceIndex * 3
      for (let i = 0; i < 3; i++) {
        vertexIndices.push(startIndex + i)
      }
    }
    
    // 提取面的顶点数据
    const positions = []
    const normals = []
    const uvs = []
    
    vertexIndices.forEach(index => {
      // 位置
      positions.push(
        positionAttribute.getX(index),
        positionAttribute.getY(index),
        positionAttribute.getZ(index)
      )
      
      // 法向量
      if (normalAttribute) {
        normals.push(
          normalAttribute.getX(index),
          normalAttribute.getY(index),
          normalAttribute.getZ(index)
        )
      }
      
      // UV坐标
      if (uvAttribute) {
        uvs.push(
          uvAttribute.getX(index),
          uvAttribute.getY(index)
        )
      }
    })
    
    // 设置几何体属性
    highlightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    
    if (normals.length > 0) {
      highlightGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    } else {
      highlightGeometry.computeVertexNormals()
    }
    
    if (uvs.length > 0) {
      highlightGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    }
    
    // 创建高亮材质
    const highlightMaterial = this.createHighlightMaterial(originalMesh.material, color, isHover)
    
    // 创建高亮网格
    const highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial)
    
    // 复制原始网格的变换
    highlightMesh.matrix.copy(originalMesh.matrix)
    highlightMesh.matrixAutoUpdate = false
    
    // 设置渲染顺序，确保高亮在原始网格之上
    highlightMesh.renderOrder = originalMesh.renderOrder + (isHover ? 2 : 1)
    
    return highlightMesh
  }
  
  /**
   * 为传统Geometry创建面高亮
   * @param {THREE.Mesh} originalMesh - 原始网格
   * @param {number} faceIndex - 面索引
   * @param {number} color - 高亮颜色
   * @param {boolean} isHover - 是否为悬停效果
   * @returns {THREE.Mesh|null} 高亮网格
   */
  createGeometryHighlight(originalMesh, faceIndex, color, isHover) {
    const originalGeometry = originalMesh.geometry
    
    if (!originalGeometry.faces || faceIndex >= originalGeometry.faces.length) {
      console.warn('无效的面索引')
      return null
    }
    
    const face = originalGeometry.faces[faceIndex]
    const vertices = originalGeometry.vertices
    
    // 创建新的几何体
    const highlightGeometry = new THREE.Geometry()
    
    // 添加面的顶点
    highlightGeometry.vertices.push(
      vertices[face.a].clone(),
      vertices[face.b].clone(),
      vertices[face.c].clone()
    )
    
    // 添加面
    const newFace = new THREE.Face3(0, 1, 2)
    newFace.normal.copy(face.normal)
    newFace.vertexNormals = face.vertexNormals.slice()
    highlightGeometry.faces.push(newFace)
    
    // 复制UV坐标（如果存在）
    if (originalGeometry.faceVertexUvs && originalGeometry.faceVertexUvs[0]) {
      const faceUvs = originalGeometry.faceVertexUvs[0][faceIndex]
      if (faceUvs) {
        highlightGeometry.faceVertexUvs[0] = [faceUvs.slice()]
      }
    }
    
    // 创建高亮材质
    const highlightMaterial = this.createHighlightMaterial(originalMesh.material, color, isHover)
    
    // 创建高亮网格
    const highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial)
    
    // 复制原始网格的变换
    highlightMesh.matrix.copy(originalMesh.matrix)
    highlightMesh.matrixAutoUpdate = false
    
    // 设置渲染顺序
    highlightMesh.renderOrder = originalMesh.renderOrder + (isHover ? 2 : 1)
    
    return highlightMesh
  }
  
  /**
   * 创建高亮材质
   * @param {THREE.Material} originalMaterial - 原始材质
   * @param {number} color - 高亮颜色
   * @param {boolean} isHover - 是否为悬停效果
   * @returns {THREE.Material} 高亮材质
   */
  createHighlightMaterial(originalMaterial, color, isHover) {
    // 确定高亮颜色
    const highlightColor = color || (isHover ? this.colors.hover : this.colors.selection)
    
    // 生成材质缓存键
    const cacheKey = `${highlightColor}_${isHover ? 'hover' : 'selection'}`
    
    // 检查缓存
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey)
    }
    
    // 创建高亮材质
    let highlightMaterial
    
    if (originalMaterial.isMeshStandardMaterial || originalMaterial.isMeshPhongMaterial) {
      // 对于标准材质，创建发光效果
      highlightMaterial = new THREE.MeshStandardMaterial({
        color: highlightColor,
        emissive: highlightColor,
        emissiveIntensity: isHover ? 0.3 : 0.5,
        transparent: true,
        opacity: isHover ? 0.6 : 0.8,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false
      })
    } else {
      // 对于其他材质，使用基础材质
      highlightMaterial = new THREE.MeshBasicMaterial({
        color: highlightColor,
        transparent: true,
        opacity: isHover ? 0.4 : 0.7,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false
      })
    }
    
    // 缓存材质
    this.materialCache.set(cacheKey, highlightMaterial)
    
    return highlightMaterial
  }
  
  /**
   * 生成高亮ID
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {number} faceIndex - 面索引
   * @returns {string} 高亮ID
   */
  generateHighlightId(mesh, faceIndex) {
    return `${mesh.uuid}_face_${faceIndex}`
  }
  
  /**
   * 更新高亮颜色配置
   * @param {Object} colors - 颜色配置对象
   */
  updateColors(colors) {
    Object.assign(this.colors, colors)
    
    // 清除材质缓存，强制重新创建
    this.materialCache.forEach(material => material.dispose())
    this.materialCache.clear()
  }
  
  /**
   * 获取高亮统计信息
   * @returns {Object} 统计信息
   */
  getHighlightStats() {
    return {
      selectionHighlights: this.highlightMeshes.size,
      hoverHighlights: this.hoverMeshes.size,
      totalHighlights: this.highlightMeshes.size + this.hoverMeshes.size,
      cachedMaterials: this.materialCache.size
    }
  }
  
  /**
   * 销毁高亮渲染器，清理所有资源
   */
  destroy() {
    // 清除所有高亮
    this.clearAllHighlights(true)
    
    // 移除高亮组
    this.scene.remove(this.highlightGroup)
    this.scene.remove(this.hoverGroup)
    
    // 清理材质缓存
    this.materialCache.forEach(material => material.dispose())
    this.materialCache.clear()
    
    // 清理引用
    this.highlightMeshes.clear()
    this.hoverMeshes.clear()
  }
}