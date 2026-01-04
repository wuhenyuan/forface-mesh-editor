/**
 * 模型导出管理器
 * 支持 STL、OBJ、GLTF 等格式的导出
 */
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

export interface STLExportOptions {
  binary?: boolean
}

export interface GLTFExportOptions {
  binary?: boolean
  includeCustomExtensions?: boolean
  trs?: boolean
  onlyVisible?: boolean
  truncateDrawRange?: boolean
  maxTextureSize?: number
}

export interface ExportOptions extends STLExportOptions, GLTFExportOptions {}

export interface ExportFormat {
  id: string
  name: string
  extension: string
  description: string
}

export class ExportManager {
  stlExporter: STLExporter | null
  objExporter: OBJExporter | null
  gltfExporter: GLTFExporter | null
  config: {
    stl: STLExportOptions
    gltf: GLTFExportOptions
  }
  onProgress: ((event: ProgressEvent) => void) | null
  onError: ((error: Error) => void) | null

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

  async export(objects: THREE.Object3D | THREE.Object3D[], format: string, options: ExportOptions = {}): Promise<Blob> {
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
      this.onError?.(error as Error)
      throw error
    }
  }

  async exportSTL(objects: THREE.Object3D[], options: STLExportOptions = {}): Promise<Blob> {
    const { binary = this.config.stl.binary } = options
    const exportScene = this._createExportScene(objects)
    
    try {
      const result = this.stlExporter!.parse(exportScene, { binary })
      if (binary) {
        // Binary mode returns DataView
        return new Blob([result as unknown as BlobPart], { type: 'application/octet-stream' })
      } else {
        return new Blob([result as string], { type: 'text/plain' })
      }
    } finally {
      this._disposeExportScene(exportScene)
    }
  }

  async exportOBJ(objects: THREE.Object3D[], _options: ExportOptions = {}): Promise<Blob> {
    const exportScene = this._createExportScene(objects)
    
    try {
      const result = this.objExporter!.parse(exportScene)
      return new Blob([result], { type: 'text/plain' })
    } finally {
      this._disposeExportScene(exportScene)
    }
  }

  async exportGLTF(objects: THREE.Object3D[], options: GLTFExportOptions = {}): Promise<Blob> {
    const exportOptions = { ...this.config.gltf, ...options }
    const exportScene = this._createExportScene(objects)
    
    return new Promise((resolve, reject) => {
      this.gltfExporter!.parse(
        exportScene,
        (result: ArrayBuffer | object) => {
          this._disposeExportScene(exportScene)
          if (exportOptions.binary) {
            resolve(new Blob([result as ArrayBuffer], { type: 'application/octet-stream' }))
          } else {
            resolve(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
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

  async exportAndDownload(objects: THREE.Object3D | THREE.Object3D[], format: string, filename: string = 'model', options: ExportOptions = {}): Promise<void> {
    const blob = await this.export(objects, format, options)
    const extension = this._getExtension(format)
    this._downloadBlob(blob, `${filename}.${extension}`)
  }

  getSupportedFormats(): ExportFormat[] {
    return [
      { id: 'stl', name: 'STL', extension: '.stl', description: '立体光刻格式' },
      { id: 'obj', name: 'OBJ', extension: '.obj', description: 'Wavefront OBJ' },
      { id: 'gltf', name: 'GLTF', extension: '.gltf', description: 'GL 传输格式' },
      { id: 'glb', name: 'GLB', extension: '.glb', description: 'GL 二进制格式' }
    ]
  }

  private _createExportScene(objects: THREE.Object3D[]): THREE.Scene {
    const scene = new THREE.Scene()
    objects.forEach(obj => scene.add(obj.clone()))
    return scene
  }

  private _disposeExportScene(scene: THREE.Scene): void {
    scene.clear()
  }

  private _getExtension(format: string): string {
    const extensions: Record<string, string> = { stl: 'stl', obj: 'obj', gltf: 'gltf', glb: 'glb' }
    return extensions[format.toLowerCase()] || format
  }

  private _downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  dispose(): void {
    this.stlExporter = null
    this.objExporter = null
    this.gltfExporter = null
  }
}

export default ExportManager
