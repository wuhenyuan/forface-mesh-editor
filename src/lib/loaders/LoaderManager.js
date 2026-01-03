/**
 * 模型加载管理器（纯净版）
 * 支持 STL、OBJ 等格式的加载
 * 不包含业务逻辑（如特征检测）
 */
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

export class LoaderManager {
  constructor() {
    // Loaders
    this.stlLoader = new STLLoader()
    this.objLoader = new OBJLoader()
    
    // 加载计数器（用于生成 ID）
    this.loadCounter = 0
    
    // 已加载模型缓存
    this.loadedModels = new Map() // modelId -> LoadResult
    
    // 事件回调
    this.onProgress = null
    this.onError = null
  }

  /**
   * 加载模型（统一入口）
   * @param {string|File|Blob} source - 文件路径、File 对象或 Blob
   * @param {Object} options - 加载选项
   * @returns {Promise<Object>} 加载结果
   */
  async load(source, options = {}) {
    const {
      modelId = this._generateModelId(),
      centerModel = true,
      material = null
    } = options

    // 判断文件格式
    const format = this._detectFormat(source)
    
    console.log(`[LoaderManager] 加载模型: ${modelId}, 格式: ${format}`)

    let model
    try {
      switch (format) {
        case 'stl':
          model = await this._loadSTL(source, material)
          break
        case 'obj':
          model = await this._loadOBJ(source, material)
          break
        case 'zip':
          model = await this._loadZipModel(source, material)
          break
        default:
          throw new Error(`不支持的文件格式: ${format}`)
      }
    } catch (error) {
      this.onError?.(error)
      throw error
    }

    // 居中模型
    if (centerModel) {
      this._centerModel(model)
    }

    // 生成元数据
    const metadata = this._extractMetadata(model)

    // 构建结果
    const result = {
      model,
      modelId,
      format,
      metadata
    }

    // 缓存
    this.loadedModels.set(modelId, result)

    return result
  }

  /**
   * 加载 STL 文件
   * @private
   */
  async _loadSTL(source, material) {
    return new Promise((resolve, reject) => {
      const onLoad = (geometry) => {
        geometry.computeVertexNormals()
        
        const mat = material || new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          metalness: 0.3,
          roughness: 0.6
        })
        
        const mesh = new THREE.Mesh(geometry, mat)
        resolve(mesh)
      }

      if (source instanceof Blob || source instanceof File) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const geometry = this.stlLoader.parse(e.target.result)
          onLoad(geometry)
        }
        reader.onerror = reject
        reader.readAsArrayBuffer(source)
      } else {
        this.stlLoader.load(source, onLoad, this.onProgress, reject)
      }
    })
  }

  /**
   * 加载 OBJ 文件
   * @private
   */
  async _loadOBJ(source, material) {
    return new Promise((resolve, reject) => {
      const onLoad = (group) => {
        if (material) {
          group.traverse((child) => {
            if (child.isMesh) {
              child.material = material
            }
          })
        }
        resolve(group)
      }

      if (source instanceof Blob || source instanceof File) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const group = this.objLoader.parse(e.target.result)
          onLoad(group)
        }
        reader.onerror = reject
        reader.readAsText(source)
      } else {
        this.objLoader.load(source, onLoad, this.onProgress, reject)
      }
    })
  }

  /**
   * 加载 ZIP（内含 OBJ 或 STL）
   * - 典型用途：models[].url 指向 *.zip（线上或 zip 包内资源）
   * - 约定：zip 内至少包含一个 .obj 或 .stl（若两者都有，优先 obj）
   * @private
   */
  async _loadZipModel(source, material) {
    const { default: JSZip } = await import('jszip')

    const zipInput =
      typeof source === 'string'
        ? await this._fetchArrayBuffer(source)
        : source

    const zip = await JSZip.loadAsync(zipInput)
    const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir)

    const objName = fileNames.find((n) => n.toLowerCase().endsWith('.obj'))
    const stlName = fileNames.find((n) => n.toLowerCase().endsWith('.stl'))
    const targetName = objName || stlName

    if (!targetName) {
      throw new Error('ZIP 中未找到 .obj 或 .stl 文件')
    }

    if (targetName.toLowerCase().endsWith('.stl')) {
      const buffer = await zip.file(targetName).async('arraybuffer')
      const geometry = this.stlLoader.parse(buffer)
      geometry.computeVertexNormals()

      const mat = material || new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.3,
        roughness: 0.6
      })
      return new THREE.Mesh(geometry, mat)
    }

    const objText = await zip.file(targetName).async('text')
    const group = this.objLoader.parse(objText)
    if (material) {
      group.traverse((child) => {
        if (child.isMesh) child.material = material
      })
    }
    return group
  }

  async _fetchArrayBuffer(url) {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    return await res.arrayBuffer()
  }

  /**
   * 检测文件格式
   * @private
   */
  _detectFormat(source) {
    let filename = ''
    
    if (typeof source === 'string') {
      filename = source.toLowerCase()
    } else if (source instanceof File) {
      filename = source.name.toLowerCase()
    } else if (source instanceof Blob) {
      const type = (source.type || '').toLowerCase()
      if (type.includes('zip')) return 'zip'
      if (type.includes('stl')) return 'stl'
      if (type.includes('obj')) return 'obj'
      return 'unknown'
    }

    if (filename.endsWith('.stl')) return 'stl'
    if (filename.endsWith('.obj')) return 'obj'
    if (filename.endsWith('.zip')) return 'zip'
    
    return 'unknown'
  }

  /**
   * 居中模型
   * @private
   */
  _centerModel(model) {
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    
    model.position.sub(center)
    
    const newBox = new THREE.Box3().setFromObject(model)
    model.position.y -= newBox.min.y
  }

  /**
   * 提取模型元数据
   * @private
   */
  _extractMetadata(model) {
    let vertexCount = 0
    let faceCount = 0
    const boundingBox = new THREE.Box3().setFromObject(model)
    const size = boundingBox.getSize(new THREE.Vector3())

    model.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const geo = child.geometry
        const positions = geo.getAttribute('position')
        if (positions) {
          vertexCount += positions.count
          faceCount += geo.index ? geo.index.count / 3 : positions.count / 3
        }
      }
    })

    return {
      vertexCount,
      faceCount,
      boundingBox: {
        min: boundingBox.min.toArray(),
        max: boundingBox.max.toArray()
      },
      size: size.toArray()
    }
  }

  /**
   * 生成模型 ID
   * @private
   */
  _generateModelId() {
    return `model_${++this.loadCounter}_${Date.now()}`
  }

  /**
   * 获取已加载的模型
   */
  getModel(modelId) {
    return this.loadedModels.get(modelId) || null
  }

  /**
   * 移除模型
   */
  removeModel(modelId) {
    this.loadedModels.delete(modelId)
  }

  /**
   * 清理所有
   */
  dispose() {
    this.loadedModels.clear()
  }
}

export default LoaderManager
