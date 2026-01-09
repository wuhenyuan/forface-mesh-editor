/**
 * 模型加载管理器（纯净版）
 * 支持 STL、OBJ、GLB/GLTF 等格式的加载
 * 不包含业务逻辑（如特征检测）
 */
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface LoadOptions {
  modelId?: string
  centerModel?: boolean
  material?: THREE.Material | null
}

export interface ModelMetadata {
  vertexCount: number
  faceCount: number
  boundingBox: {
    min: number[]
    max: number[]
  }
  size: number[]
}

export interface LoadResult {
  model: THREE.Object3D
  modelId: string
  format: string
  metadata: ModelMetadata
}

export type FileSource = string | File | Blob

export class LoaderManager {
  stlLoader: STLLoader
  objLoader: OBJLoader
  gltfLoader: GLTFLoader
  loadCounter: number
  loadedModels: Map<string, LoadResult>
  onProgress: ((event: ProgressEvent) => void) | null
  onError: ((error: Error) => void) | null

  constructor() {
    this.stlLoader = new STLLoader()
    this.objLoader = new OBJLoader()
    this.gltfLoader = new GLTFLoader()
    this.loadCounter = 0
    this.loadedModels = new Map()
    this.onProgress = null
    this.onError = null
  }

  async load(source: FileSource, options: LoadOptions = {}): Promise<LoadResult> {
    const {
      modelId = this._generateModelId(),
      centerModel = true,
      material = null
    } = options

    const format = this._detectFormat(source)
    
    console.log(`[LoaderManager] 加载模型: ${modelId}, 格式: ${format}`)

    let model: THREE.Object3D
    try {
      switch (format) {
        case 'stl':
          model = await this._loadSTL(source, material)
          break
        case 'obj':
          model = await this._loadOBJ(source, material)
          break
        case 'glb':
        case 'gltf':
          model = await this._loadGLTF(source)
          break
        case 'zip':
          model = await this._loadZipModel(source, material)
          break
        default:
          throw new Error(`不支持的文件格式: ${format}`)
      }
    } catch (error) {
      this.onError?.(error as Error)
      throw error
    }

    if (centerModel) {
      this._centerModel(model)
    }

    const metadata = this._extractMetadata(model)

    const result: LoadResult = {
      model,
      modelId,
      format,
      metadata
    }

    this.loadedModels.set(modelId, result)

    return result
  }

  private async _loadSTL(source: FileSource, material: THREE.Material | null): Promise<THREE.Mesh> {
    return new Promise((resolve, reject) => {
      const onLoad = (geometry: THREE.BufferGeometry) => {
        geometry.computeVertexNormals()
        
        const mat = material || new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          metalness: 0.3,
          roughness: 0.6
        })
        
        const mesh = new THREE.Mesh(geometry, mat)
        resolve(mesh)
      }

      if (typeof source !== 'string') {
        const reader = new FileReader()
        reader.onload = (e) => {
          const geometry = this.stlLoader.parse(e.target!.result as ArrayBuffer)
          onLoad(geometry)
        }
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(source as Blob)
      } else {
        this.stlLoader.load(
          source, 
          onLoad, 
          this.onProgress || undefined, 
          (error) => reject(error)
        )
      }
    })
  }

  private async _loadOBJ(source: FileSource, material: THREE.Material | null): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      const onLoad = (group: THREE.Group) => {
        if (material) {
          group.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).material = material
            }
          })
        }
        resolve(group)
      }

      if (typeof source !== 'string') {
        const reader = new FileReader()
        reader.onload = (e) => {
          const group = this.objLoader.parse(e.target!.result as string)
          onLoad(group)
        }
        reader.onerror = () => reject(reader.error)
        reader.readAsText(source as Blob)
      } else {
        this.objLoader.load(
          source, 
          onLoad, 
          this.onProgress || undefined, 
          (error) => reject(error)
        )
      }
    })
  }

  private async _loadGLTF(source: FileSource): Promise<THREE.Object3D> {
    return new Promise((resolve, reject) => {
      const onLoad = (gltf: any) => {
        const model = gltf.scene || gltf.scenes?.[0]
        if (!model) {
          reject(new Error('GLTF 文件中未找到场景'))
          return
        }
        resolve(model)
      }

      if (typeof source !== 'string') {
        const reader = new FileReader()
        reader.onload = (e) => {
          const arrayBuffer = e.target!.result as ArrayBuffer
          this.gltfLoader.parse(
            arrayBuffer,
            '',
            onLoad,
            (error) => reject(error)
          )
        }
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(source as Blob)
      } else {
        this.gltfLoader.load(
          source,
          onLoad,
          this.onProgress || undefined,
          (error) => reject(error)
        )
      }
    })
  }

  private async _loadZipModel(source: FileSource, material: THREE.Material | null): Promise<THREE.Object3D> {
    const { default: JSZip } = await import('jszip')

    const zipInput = typeof source === 'string'
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
      const buffer = await zip.file(targetName)!.async('arraybuffer')
      const geometry = this.stlLoader.parse(buffer)
      geometry.computeVertexNormals()

      const mat = material || new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.3,
        roughness: 0.6
      })
      return new THREE.Mesh(geometry, mat)
    }

    const objText = await zip.file(targetName)!.async('text')
    const group = this.objLoader.parse(objText)
    if (material) {
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = material
        }
      })
    }
    return group
  }

  private async _fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    return await res.arrayBuffer()
  }

  private _detectFormat(source: FileSource): string {
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
    if (filename.endsWith('.glb')) return 'glb'
    if (filename.endsWith('.gltf')) return 'gltf'
    if (filename.endsWith('.zip')) return 'zip'
    
    return 'unknown'
  }

  private _centerModel(model: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    
    model.position.sub(center)
    
    const newBox = new THREE.Box3().setFromObject(model)
    model.position.y -= newBox.min.y
  }

  private _extractMetadata(model: THREE.Object3D): ModelMetadata {
    let vertexCount = 0
    let faceCount = 0
    const boundingBox = new THREE.Box3().setFromObject(model)
    const size = boundingBox.getSize(new THREE.Vector3())

    model.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && mesh.geometry) {
        const geo = mesh.geometry
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

  private _generateModelId(): string {
    return `model_${++this.loadCounter}_${Date.now()}`
  }

  getModel(modelId: string): LoadResult | null {
    return this.loadedModels.get(modelId) || null
  }

  removeModel(modelId: string): void {
    this.loadedModels.delete(modelId)
  }

  dispose(): void {
    this.loadedModels.clear()
  }
}

export default LoaderManager
