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

  /**
   * 导出 OBJ + MTL + 贴图为 ZIP 包
   */
  async exportOBJWithMaterials(objects: THREE.Object3D[], filename: string = 'model'): Promise<Blob> {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    
    const exportScene = this._createExportScene(objects)
    
    try {
      // 收集材质和贴图信息
      const { materials, textures } = this._collectMaterialsAndTextures(exportScene)
      
      // 导出 OBJ（带 mtllib 引用）
      const objContent = this.objExporter!.parse(exportScene)
      const objWithMtl = `mtllib ${filename}.mtl\n${objContent}`
      zip.file(`${filename}.obj`, objWithMtl)
      
      // 生成并导出 MTL
      const mtlContent = this._generateMTL(materials)
      zip.file(`${filename}.mtl`, mtlContent)
      
      // 导出贴图
      for (const [textureName, textureData] of textures) {
        zip.file(textureName, textureData)
      }
      
      return await zip.generateAsync({ type: 'blob' })
    } finally {
      this._disposeExportScene(exportScene)
    }
  }

  /**
   * 收集场景中的所有材质和贴图
   */
  private _collectMaterialsAndTextures(scene: THREE.Scene): { 
    materials: Map<string, THREE.Material>, 
    textures: Map<string, Blob> 
  } {
    const materials = new Map<string, THREE.Material>()
    const textures = new Map<string, Blob>()
    
    scene.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh
        const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        
        for (const material of meshMaterials) {
          if (!material) continue
          
          const matName = material.name || `material_${material.uuid.substring(0, 8)}`
          materials.set(matName, material)
          
          // 收集贴图
          const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']
          for (const prop of textureProps) {
            const texture = (material as any)[prop] as THREE.Texture | undefined
            if (texture?.image) {
              const textureName = this._getTextureName(texture, prop)
              const textureBlob = this._textureToBlob(texture)
              if (textureBlob) {
                textures.set(textureName, textureBlob)
              }
            }
          }
        }
      }
    })
    
    return { materials, textures }
  }

  /**
   * 生成 MTL 文件内容
   */
  private _generateMTL(materials: Map<string, THREE.Material>): string {
    const lines: string[] = ['# MTL file exported by ExportManager']
    
    for (const [name, material] of materials) {
      lines.push('')
      lines.push(`newmtl ${name}`)
      
      const mat = material as THREE.MeshStandardMaterial
      
      // 漫反射颜色
      if (mat.color) {
        const c = mat.color
        lines.push(`Kd ${c.r.toFixed(6)} ${c.g.toFixed(6)} ${c.b.toFixed(6)}`)
      }
      
      // 环境光颜色
      if (mat.color) {
        const c = mat.color
        lines.push(`Ka ${(c.r * 0.2).toFixed(6)} ${(c.g * 0.2).toFixed(6)} ${(c.b * 0.2).toFixed(6)}`)
      }
      
      // 高光颜色
      lines.push('Ks 0.500000 0.500000 0.500000')
      
      // 高光指数
      const shininess = mat.roughness !== undefined ? (1 - mat.roughness) * 100 : 30
      lines.push(`Ns ${shininess.toFixed(6)}`)
      
      // 透明度
      const opacity = mat.opacity !== undefined ? mat.opacity : 1
      lines.push(`d ${opacity.toFixed(6)}`)
      
      // 光照模型
      lines.push('illum 2')
      
      // 漫反射贴图
      if (mat.map?.image) {
        const texName = this._getTextureName(mat.map, 'map')
        lines.push(`map_Kd ${texName}`)
      }
      
      // 法线贴图
      if (mat.normalMap?.image) {
        const texName = this._getTextureName(mat.normalMap, 'normalMap')
        lines.push(`map_Bump ${texName}`)
      }
    }
    
    return lines.join('\n')
  }

  /**
   * 收集场景中的所有贴图
   */
  private _collectTextures(scene: THREE.Scene): Map<string, Blob> {
    const textures = new Map<string, Blob>()
    
    scene.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        
        for (const material of materials) {
          if (!material) continue
          
          // 检查常见的贴图属性
          const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']
          
          for (const prop of textureProps) {
            const texture = (material as any)[prop] as THREE.Texture | undefined
            if (texture?.image) {
              const textureName = this._getTextureName(texture, prop)
              const textureBlob = this._textureToBlob(texture)
              if (textureBlob) {
                textures.set(textureName, textureBlob)
              }
            }
          }
        }
      }
    })
    
    return textures
  }

  /**
   * 获取贴图文件名
   */
  private _getTextureName(texture: THREE.Texture, propName: string): string {
    if (texture.name) {
      return texture.name.includes('.') ? texture.name : `${texture.name}.png`
    }
    return `${propName}_${texture.uuid.substring(0, 8)}.png`
  }

  /**
   * 将贴图转换为 Blob
   */
  private _textureToBlob(texture: THREE.Texture): Blob | null {
    const image = texture.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap
    if (!image) return null
    
    try {
      // 如果是 ImageBitmap 或 HTMLImageElement，绘制到 canvas
      const canvas = document.createElement('canvas')
      canvas.width = (image as any).width || 256
      canvas.height = (image as any).height || 256
      
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      
      ctx.drawImage(image as CanvasImageSource, 0, 0)
      
      // 转换为 Blob
      const dataUrl = canvas.toDataURL('image/png')
      const base64 = dataUrl.split(',')[1]
      const binary = atob(base64)
      const array = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i)
      }
      
      return new Blob([array], { type: 'image/png' })
    } catch (e) {
      console.warn('无法导出贴图:', e)
      return null
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
    if (format.toLowerCase() === 'obj-zip') {
      // OBJ + MTL + 贴图 ZIP 包
      const objectsArray = Array.isArray(objects) ? objects : [objects]
      const blob = await this.exportOBJWithMaterials(objectsArray, filename)
      this._downloadBlob(blob, `${filename}.zip`)
      return
    }
    
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
    objects.forEach(obj => scene.add(obj.clone() as THREE.Object3D))
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
