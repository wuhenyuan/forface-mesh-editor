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
    this.stlExporter = new STLExporter()
    this.objExporter = new OBJExporter()
    this.gltfExporter = new GLTFExporter()
    
    this.config = {
      stl: { binary: true },
      gltf: {
        binary: true,
        includeCustomExtensions: false,
        trs: false,
        onlyVisible: true,
        truncateDrawRange: true,
        maxTextureSize: 4096
      }
    }
    
    this.onProgress = null
    this.onError = null
  }

  /**
   * 导出模型
   */
  async export(objects, format, options = {}) {
    const objectsArray = Array.isArray(objects) ? objects : [objects]
    
    if (objectsArray.length === 0) {
      throw new Error('没有可导出的对象')
    }
    
    try {
      switch (format.toLowerCase()) {
        case 'stl':
          return await this.exportSTL(objectsArray, options)
        case 'obj':
          return await this.exportOBJ(objectsArray, options)
        case 'gltf':
          return await this.exportGLTF(objectsArray, { ...options, binary: false })
        case 'glb':
          return await this.exportGLTF(objectsArray, { ...options, binary: true })
        default:
          throw new Error(`不支持的导出格式: ${format}`)
      }
    } catch (error) {
      this.onError?.(error)
      throw error
    }
  }

  async exportSTL(objects, options = {}) {
    const { binary = this.config.stl.binary } = options
    const exportScene = this._createExportScene(objects)
    
    try {
      const result = this.stlExporter.parse(exportScene, { binary })
      return binary 
        ? new Blob([result], { type: 'application/octet-stream' })
        : new Blob([result], { type: 'text/plain' })
    } finally {
      this._disposeExportScene(exportScene)
    }
  }

  async exportOBJ(objects, options = {}) {
    const exportScene = this._createExportScene(objects)
    
    try {
      const result = this.objExporter.parse(exportScene)
      return new Blob([result], { type: 'text/plain' })
    } finally {
      this._disposeExportScene(exportScene)
    }
  }

  async exportGLTF(objects, options = {}) {
    const exportOptions = { ...this.config.gltf, ...options }
    const exportScene = this._createExportScene(objects)
    
    return new Promise((resolve, reject) => {
      this.gltfExporter.parse(
        exportScene,
        (result) => {
          this._disposeExportScene(exportScene)
          resolve(exportOptions.binary
            ? new Blob([result], { type: 'application/octet-stream' })
            : new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
          )
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
   * 导出并下载
   */
  async exportAndDownload(objects, format, filename = 'model', options = {}) {
    const blob = await this.export(objects, format, options)
    const extension = this._getExtension(format)
    this._downloadBlob(blob, `${filename}.${extension}`)
  }

  /**
   * 获取支持的格式
   */
  getSupportedFormats() {
    return [
      { id: 'stl', name: 'STL', extension: '.stl', description: '立体光刻格式' },
      { id: 'obj', name: 'OBJ', extension: '.obj', description: 'Wavefront OBJ' },
      { id: 'gltf', name: 'GLTF', extension: '.gltf', description: 'GL 传输格式' },
      { id: 'glb', name: 'GLB', extension: '.glb', description: 'GL 二进制格式' }
    ]
  }

  _createExportScene(objects) {
    const scene = new THREE.Scene()
    objects.forEach(obj => scene.add(obj.clone()))
    return scene
  }

  _disposeExportScene(scene) {
    scene.clear()
  }

  _getExtension(format) {
    return { stl: 'stl', obj: 'obj', gltf: 'gltf', glb: 'glb' }[format.toLowerCase()] || format
  }

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  dispose() {
    this.stlExporter = null
    this.objExporter = null
    this.gltfExporter = null
  }
}

export default ExportManager
