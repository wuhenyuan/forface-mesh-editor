/**
 * 模型加载管理器
 * 支持多种格式：STL, OBJ, ZIP(OBJ+MTL)
 * 
 * 职责：
 * 1. 根据文件类型选择合适的 Loader
 * 2. 加载完成后触发特征检测
 * 3. 返回标准化的模型数据
 */
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
// import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader'
// import JSZip from 'jszip'  // 需要时再引入

/**
 * @typedef {Object} LoadResult
 * @property {THREE.Mesh|THREE.Group} model - 加载的模型
 * @property {string} modelId - 模型唯一标识
 * @property {string} format - 文件格式
 * @property {Object} metadata - 元数据（顶点数、面数等）
 */

/**
 * @typedef {Object} LoadOptions
 * @property {string} [modelId] - 自定义模型ID，不传则自动生成
 * @property {boolean} [detectFeatures=true] - 是否自动检测特征
 * @property {boolean} [centerModel=true] - 是否居中模型
 * @property {THREE.Material} [material] - 自定义材质
 */

export class LoaderManager {
  stlLoader: any
  objLoader: any
  featureDetector: any
  loadCounter: number
  loadedModels: Map<string, any>
  onProgress: ((...args: any[]) => void) | null
  onError: ((error: any) => void) | null

  constructor() {
    // Loaders
    this.stlLoader = new STLLoader()
    this.objLoader = new OBJLoader()
    
    // 特征检测器（由 Viewer 注入）
    this.featureDetector = null
    
    // 加载计数器（用于生成 ID）
    this.loadCounter = 0
    
    // 已加载模型缓存
    this.loadedModels = new Map() // modelId -> LoadResult
    
    // 事件回调
    this.onProgress = null
    this.onError = null
  }

  /**
   * 设置特征检测器（由 Viewer 调用）
   * @param {FeatureDetector} detector 
   */
  setFeatureDetector(detector: any) {
    this.featureDetector = detector
  }

  /**
   * 加载模型（统一入口）
   * @param {string|File|Blob} source - 文件路径、File 对象或 Blob
   * @param {LoadOptions} options - 加载选项
   * @returns {Promise<LoadResult>}
   */
  async load(source: any, options: Record<string, any> = {}) {
    const {
      modelId = this._generateModelId(),
      detectFeatures = true,
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
          model = await this._loadZipOBJ(source, material)
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

    // 特征检测
    if (detectFeatures && this.featureDetector) {
      console.log(`[LoaderManager] 开始特征检测: ${modelId}`)
      await this.featureDetector.detect(model, modelId)
    }

    return result
  }

  /**
   * 加载 STL 文件
   * @private
   */
  async _loadSTL(source: any, material: any) {
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
          const geometry = this.stlLoader.parse((e as any)?.target?.result)
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
  async _loadOBJ(source: any, material: any) {
    return new Promise((resolve, reject) => {
      const onLoad = (group) => {
        // 如果有自定义材质，应用到所有子网格
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
          const group = this.objLoader.parse((e as any)?.target?.result)
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
   * 加载 ZIP 格式的 OBJ（包含 MTL 和贴图）
   * @private
   */
  async _loadZipOBJ(source: any, material: any) {
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
    
    /*
    const zip = await JSZip.loadAsync(source)
    
    // 查找文件
    let objFile = null
    let mtlFile = null
    const textures = {}
    
    zip.forEach((path, file) => {
      if (path.endsWith('.obj')) objFile = file
      if (path.endsWith('.mtl')) mtlFile = file
      if (/\.(jpg|jpeg|png)$/i.test(path)) {
        textures[path] = file
      }
    })
    
    if (!objFile) throw new Error('ZIP 中未找到 OBJ 文件')
    
    // 加载 MTL
    if (mtlFile) {
      const mtlContent = await mtlFile.async('text')
      // ... 解析 MTL
    }
    
    // 加载 OBJ
    const objContent = await objFile.async('text')
    const group = this.objLoader.parse(objContent)
    
    return group
    */
  }

  async _fetchArrayBuffer(url: string) {
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
  _detectFormat(source: any) {
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
  _centerModel(model: any) {
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    
    model.position.sub(center)
    
    // 将模型底部放在 y=0
    const newBox = new THREE.Box3().setFromObject(model)
    model.position.y -= newBox.min.y
  }

  /**
   * 提取模型元数据
   * @private
   */
  _extractMetadata(model: any) {
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
   * @param {string} modelId 
   * @returns {LoadResult|null}
   */
  getModel(modelId: string) {
    return this.loadedModels.get(modelId) || null
  }

  /**
   * 移除模型
   * @param {string} modelId 
   */
  removeModel(modelId: string) {
    const result = this.loadedModels.get(modelId)
    if (result) {
      // 清理特征数据
      this.featureDetector?.clearFeatures(modelId)
      this.loadedModels.delete(modelId)
    }
  }

  /**
   * 清理所有
   */
  dispose() {
    this.loadedModels.clear()
    this.featureDetector = null
  }
}

export default LoaderManager
