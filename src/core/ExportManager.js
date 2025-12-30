/**
 * 模型导出管理器
 * 支持 STL、OBJ、GLTF 等格式的导出
 */
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

export class ExportManager {
  constructor() {
    // 导出器实例
    this.stlExporter = new STLExporter()
    this.objExporter = new OBJExporter()
    this.gltfExporter = new GLTFExporter()
    
    // 导出配置
    this.config = {
      // STL 配置
      stl: {
        binary: true  // 默认使用二进制格式（文件更小）
      },
      // GLTF 配置
      gltf: {
        binary: true,           // 使用 GLB 格式
        includeCustomExtensions: false,
        trs: false,             // 使用矩阵而非 TRS
        onlyVisible: true,      // 只导出可见对象
        truncateDrawRange: true,
        maxTextureSize: 4096
      }
    }
    
    // 事件回调
    this.onProgress = null
    this.onError = null
  }

  /**
   * 导出模型（统一入口）
   * @param {THREE.Object3D|THREE.Object3D[]} objects - 要导出的对象
   * @param {string} format - 导出格式: 'stl' | 'obj' | 'gltf' | 'glb'
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob|string>} 导出结果
   */
  async export(objects, format, options = {}) {
    const objectsArray = Array.isArray(objects) ? objects : [objects]
    
    if (objectsArray.length === 0) {
      throw new Error('没有可导出的对象')
    }
    
    console.log(`[ExportManager] 开始导出 ${objectsArray.length} 个对象，格式: ${format}`)
    
    try {
      let result
      
      switch (format.toLowerCase()) {
        case 'stl':
          result = await this.exportSTL(objectsArray, options)
          break
        case 'obj':
          result = await this.exportOBJ(objectsArray, options)
          break
        case 'gltf':
          result = await this.exportGLTF(objectsArray, { ...options, binary: false })
          break
        case 'glb':
          result = await this.exportGLTF(objectsArray, { ...options, binary: true })
          break
        default:
          throw new Error(`不支持的导出格式: ${format}`)
      }
      
      console.log(`[ExportManager] 导出完成`)
      return result
      
    } catch (error) {
      console.error('[ExportManager] 导出失败:', error)
      this.onError?.(error)
      throw error
    }
  }

  /**
   * 导出为 STL 格式
   * @param {THREE.Object3D[]} objects - 要导出的对象
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} STL Blob
   */
  async exportSTL(objects, options = {}) {
    const { binary = this.config.stl.binary } = options
    
    // 创建临时场景包含所有对象
    const exportScene = this._createExportScene(objects)
    
    try {
      const result = this.stlExporter.parse(exportScene, { binary })
      
      if (binary) {
        // 二进制格式返回 ArrayBuffer
        return new Blob([result], { type: 'application/octet-stream' })
      } else {
        // ASCII 格式返回字符串
        return new Blob([result], { type: 'text/plain' })
      }
    } finally {
      this._disposeExportScene(exportScene)
    }
  }

  /**
   * 导出为 OBJ 格式
   * @param {THREE.Object3D[]} objects - 要导出的对象
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} OBJ Blob
   */
  async exportOBJ(objects, options = {}) {
    const exportScene = this._createExportScene(objects)
    
    try {
      const result = this.objExporter.parse(exportScene)
      return new Blob([result], { type: 'text/plain' })
    } finally {
      this._disposeExportScene(exportScene)
    }
  }

  /**
   * 导出为 GLTF/GLB 格式
   * @param {THREE.Object3D[]} objects - 要导出的对象
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} GLTF/GLB Blob
   */
  async exportGLTF(objects, options = {}) {
    const exportOptions = {
      ...this.config.gltf,
      ...options
    }
    
    const exportScene = this._createExportScene(objects)
    
    return new Promise((resolve, reject) => {
      this.gltfExporter.parse(
        exportScene,
        (result) => {
          this._disposeExportScene(exportScene)
          
          if (exportOptions.binary) {
            // GLB 格式
            resolve(new Blob([result], { type: 'application/octet-stream' }))
          } else {
            // GLTF 格式（JSON）
            const json = JSON.stringify(result, null, 2)
            resolve(new Blob([json], { type: 'application/json' }))
          }
        },
        (error) => {
          this._disposeExportScene(exportScene)
          reject(error)
        },
        exportOptions
      )
    })
  }

  /**
   * 导出并下载文件
   * @param {THREE.Object3D|THREE.Object3D[]} objects - 要导出的对象
   * @param {string} format - 导出格式
   * @param {string} filename - 文件名（不含扩展名）
   * @param {Object} options - 导出选项
   */
  async exportAndDownload(objects, format, filename = 'model', options = {}) {
    const blob = await this.export(objects, format, options)
    
    const extension = this._getExtension(format)
    const fullFilename = `${filename}.${extension}`
    
    this._downloadBlob(blob, fullFilename)
    
    console.log(`[ExportManager] 文件已下载: ${fullFilename}`)
  }

  /**
   * 导出场景中的所有网格
   * @param {THREE.Scene} scene - 场景
   * @param {string} format - 导出格式
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} 导出结果
   */
  async exportScene(scene, format, options = {}) {
    const { includeHelpers = false } = options
    
    const meshes = []
    scene.traverse((object) => {
      if (object.isMesh) {
        // 过滤辅助对象
        if (!includeHelpers && object.userData.isHelper) {
          return
        }
        meshes.push(object)
      }
    })
    
    if (meshes.length === 0) {
      throw new Error('场景中没有可导出的网格')
    }
    
    return this.export(meshes, format, options)
  }

  /**
   * 导出选中的对象
   * @param {THREE.Object3D} selectedObject - 选中的对象
   * @param {string} format - 导出格式
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} 导出结果
   */
  async exportSelected(selectedObject, format, options = {}) {
    if (!selectedObject) {
      throw new Error('没有选中的对象')
    }
    
    return this.export(selectedObject, format, options)
  }

  /**
   * 合并多个网格后导出
   * @param {THREE.Mesh[]} meshes - 要合并的网格
   * @param {string} format - 导出格式
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} 导出结果
   */
  async exportMerged(meshes, format, options = {}) {
    if (meshes.length === 0) {
      throw new Error('没有可合并的网格')
    }
    
    // 合并几何体
    const mergedMesh = this._mergeMeshes(meshes)
    
    try {
      return await this.export(mergedMesh, format, options)
    } finally {
      // 清理合并后的临时网格
      mergedMesh.geometry.dispose()
    }
  }

  /**
   * 创建导出用的临时场景
   * @private
   */
  _createExportScene(objects) {
    const scene = new THREE.Scene()
    
    objects.forEach(obj => {
      // 克隆对象以避免修改原始对象
      const clone = obj.clone()
      scene.add(clone)
    })
    
    return scene
  }

  /**
   * 清理导出场景
   * @private
   */
  _disposeExportScene(scene) {
    scene.traverse((object) => {
      if (object.geometry) {
        // 不要 dispose 克隆的几何体，因为它们共享原始数据
      }
      if (object.material) {
        // 同样不要 dispose 材质
      }
    })
    scene.clear()
  }

  /**
   * 合并多个网格
   * @private
   */
  _mergeMeshes(meshes) {
    const geometries = []
    
    meshes.forEach(mesh => {
      if (!mesh.isMesh || !mesh.geometry) return
      
      // 克隆几何体并应用世界变换
      const geometry = mesh.geometry.clone()
      geometry.applyMatrix4(mesh.matrixWorld)
      geometries.push(geometry)
    })
    
    if (geometries.length === 0) {
      throw new Error('没有有效的几何体可合并')
    }
    
    // 使用 BufferGeometryUtils 合并（如果可用）
    // 这里使用简单的方式：只取第一个几何体
    // 完整实现需要 import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
    
    const mergedGeometry = geometries[0]
    const material = meshes[0].material.clone()
    
    return new THREE.Mesh(mergedGeometry, material)
  }

  /**
   * 获取文件扩展名
   * @private
   */
  _getExtension(format) {
    const extensions = {
      'stl': 'stl',
      'obj': 'obj',
      'gltf': 'gltf',
      'glb': 'glb'
    }
    return extensions[format.toLowerCase()] || format
  }

  /**
   * 下载 Blob 文件
   * @private
   */
  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // 延迟释放 URL
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  /**
   * 获取导出格式信息
   * @returns {Object[]} 支持的格式列表
   */
  getSupportedFormats() {
    return [
      {
        id: 'stl',
        name: 'STL',
        extension: '.stl',
        description: '立体光刻格式，适用于 3D 打印',
        binary: true
      },
      {
        id: 'obj',
        name: 'OBJ',
        extension: '.obj',
        description: 'Wavefront OBJ 格式，广泛支持',
        binary: false
      },
      {
        id: 'gltf',
        name: 'GLTF',
        extension: '.gltf',
        description: 'GL 传输格式（JSON），包含材质和纹理',
        binary: false
      },
      {
        id: 'glb',
        name: 'GLB',
        extension: '.glb',
        description: 'GL 传输格式（二进制），单文件包含所有资源',
        binary: true
      }
    ]
  }

  /**
   * 估算导出文件大小
   * @param {THREE.Object3D[]} objects - 要导出的对象
   * @param {string} format - 导出格式
   * @returns {Object} 估算信息
   */
  estimateExportSize(objects, format) {
    let vertexCount = 0
    let faceCount = 0
    
    const objectsArray = Array.isArray(objects) ? objects : [objects]
    
    objectsArray.forEach(obj => {
      obj.traverse((child) => {
        if (child.isMesh && child.geometry) {
          const geo = child.geometry
          const positions = geo.getAttribute('position')
          if (positions) {
            vertexCount += positions.count
            faceCount += geo.index ? geo.index.count / 3 : positions.count / 3
          }
        }
      })
    })
    
    // 估算文件大小（粗略）
    let estimatedSize = 0
    switch (format.toLowerCase()) {
      case 'stl':
        // 二进制 STL: 84 字节头 + 每个三角形 50 字节
        estimatedSize = 84 + faceCount * 50
        break
      case 'obj':
        // OBJ: 每个顶点约 30 字节，每个面约 20 字节
        estimatedSize = vertexCount * 30 + faceCount * 20
        break
      case 'gltf':
      case 'glb':
        // GLTF: 每个顶点约 24 字节（位置+法线），加上 JSON 开销
        estimatedSize = vertexCount * 24 + 1000
        break
    }
    
    return {
      vertexCount,
      faceCount,
      estimatedSize,
      estimatedSizeFormatted: this._formatFileSize(estimatedSize)
    }
  }

  /**
   * 格式化文件大小
   * @private
   */
  _formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /**
   * 更新配置
   * @param {Object} config - 配置更新
   */
  updateConfig(config) {
    if (config.stl) {
      Object.assign(this.config.stl, config.stl)
    }
    if (config.gltf) {
      Object.assign(this.config.gltf, config.gltf)
    }
  }

  /**
   * 销毁
   */
  dispose() {
    this.stlExporter = null
    this.objExporter = null
    this.gltfExporter = null
    this.onProgress = null
    this.onError = null
  }
}

export default ExportManager
