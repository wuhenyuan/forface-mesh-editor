/**
 * 模型导出管理器
 * 支持 STL、OBJ、GLTF 等格式的导出
 */
import * as THREE from 'three';
import { STLExporter, type STLExporterOptions } from 'three/examples/jsm/exporters/STLExporter.js';
// import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { OBJExporter } from './export/ObjExport';
import {
  GLTFExporter,
  type GLTFExporterOptions,
} from 'three/examples/jsm/exporters/GLTFExporter.js';
import EditorTaskWorkerBridge from './tasks/EditorTaskWorkerBridge';
import {
  collectExportPayloadTransferables,
  serializeObjectTreeToMeshes,
  serializeTextureFilesFromObject,
} from './tasks/sceneSerialization';

type ExportFormat = 'stl' | 'obj' | 'obj-zip' | 'gltf' | 'glb';

type ExportOptions = GLTFExporterOptions & {
  filename?: string;
  includeHelpers?: boolean;
};

type ExportConfig = {
  stl: {
    binary: boolean;
  };
  gltf: {
    binary: boolean;
    includeCustomExtensions: boolean;
    trs: boolean;
    onlyVisible: boolean;
    truncateDrawRange: boolean;
    maxTextureSize: number;
  };
};

export class ExportManager {
  stlExporter: STLExporter;
  objExporter: OBJExporter;
  gltfExporter: GLTFExporter;
  workerBridge: EditorTaskWorkerBridge;
  config: ExportConfig;
  onProgress: ((...args: CoreValue[]) => void) | null;
  onError: ((error: CoreValue) => void) | null;

  constructor() {
    // 导出器实例
    this.stlExporter = new STLExporter();
    this.objExporter = new OBJExporter();
    this.gltfExporter = new GLTFExporter();
    this.workerBridge = EditorTaskWorkerBridge.getShared();

    // 导出配置
    this.config = {
      // STL 配置
      stl: {
        binary: true, // 默认使用二进制格式（文件更小）
      },
      // GLTF 配置
      gltf: {
        binary: true, // 使用 GLB 格式
        includeCustomExtensions: false,
        trs: false, // 使用矩阵而非 TRS
        onlyVisible: true, // 只导出可见对象
        truncateDrawRange: true,
        maxTextureSize: 4096,
      },
    };

    // 事件回调
    this.onProgress = null;
    this.onError = null;
  }

  /**
   * 导出模型（统一入口）
   * @param {THREE.Object3D|THREE.Object3D[]} objects - 要导出的对象
   * @param {string} format - 导出格式: 'stl' | 'obj' | 'obj-zip' | 'gltf' | 'glb'
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} 导出结果
   */
  public async export(
    objects: THREE.Object3D | THREE.Object3D[],
    format: ExportFormat | string,
    options: ExportOptions = {}
  ): Promise<Blob> {
    const objectsArray = Array.isArray(objects) ? objects : [objects];

    if (objectsArray.length === 0) {
      throw new Error('娌℃湁鍙鍑虹殑瀵硅薄');
    }

    console.log(`[ExportManager] 寮€濮嬪鍑?${objectsArray.length} 涓璞★紝鏍煎紡: ${format}`);

    try {
      let result: Blob;

      switch (format.toLowerCase()) {
        case 'stl':
          result = await this.exportSTL(objectsArray, options);
          break;
        case 'obj':
          result = await this.exportOBJ(objectsArray, options);
          break;
        case 'obj-zip':
          result = await this.exportOBJWithMaterials(objectsArray, options.filename || 'model');
          break;
        case 'gltf':
          result = await this.exportGLTF(objectsArray, { ...options, binary: false });
          break;
        case 'glb':
          result = await this.exportGLTF(objectsArray, { ...options, binary: true });
          break;
        default:
          throw new Error(`涓嶆敮鎸佺殑瀵煎嚭鏍煎紡: ${format}`);
      }

      console.log(`[ExportManager] 瀵煎嚭瀹屾垚`);
      return result;
    } catch (error: CoreValue) {
      console.error('[ExportManager] 瀵煎嚭澶辫触:', error);
      this.onError?.(error);
      throw error;
    }
  }

  /**
   * 导出STL 格式
   * @param {THREE.Object3D[]} objects - 要导出的对象
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} STL Blob
   */
  private async exportSTL(objects: THREE.Object3D[], options: ExportOptions = {}): Promise<Blob> {
    const { binary = this.config.stl.binary } = options;

    // 创建临时场景，包含所有对象
    const exportScene = this._createExportScene(objects);

    try {
      const result = this.stlExporter.parse(exportScene, { binary } as STLExporterOptions);

      if (binary) {
        // 二进制格式返DataView
        const view = result as DataView;
        const bytes = new Uint8Array(view.byteLength);
        bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
        return new Blob([bytes], { type: 'application/octet-stream' });
      }
      // ASCII 格式返回字符串
      return new Blob([result as string], { type: 'text/plain' });
    } finally {
      this._disposeExportScene(exportScene);
    }
  }

  /**
   * 导出OBJ 格式
   * @param {THREE.Object3D[]} objects - 要导出的对象
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} OBJ Blob
   */
  private async exportOBJ(objects: THREE.Object3D[], options: ExportOptions = {}): Promise<Blob> {
    const exportScene = this._createExportScene(objects);

    try {
      const result = this.objExporter.parse(exportScene);
      return new Blob([result], { type: 'text/plain' });
    } finally {
      this._disposeExportScene(exportScene);
    }
  }

  /**
   * 导出 OBJ + MTL + 贴图 ZIP
   */
  private async exportOBJWithMaterials(
    objects: THREE.Object3D[],
    filename: string = 'model'
  ): Promise<Blob> {
    const exportScene = this._createExportScene(objects);

    try {
      const meshes = serializeObjectTreeToMeshes(exportScene);
      const textureFiles = await serializeTextureFilesFromObject(exportScene);
      const transferables = collectExportPayloadTransferables(meshes, textureFiles);
      const taskId = this.workerBridge.createTaskId('exportZip');

      const result = await this.workerBridge.runExportZipTask(
        {
          filename,
          objects: meshes,
          textureFiles,
          compressionLevel: 6,
        },
        {
          taskId,
          transferables,
          onProgress: (progress) => {
            this.onProgress?.(progress);
          },
        }
      );

      return new Blob([result.buffer], { type: result.mimeType || 'application/zip' });
    } finally {
      this._disposeExportScene(exportScene);
    }
  }

  /**
   * 导出GLTF/GLB 格式
   * @param {THREE.Object3D[]} objects - 要导出的对象
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} GLTF/GLB Blob
   */
  async exportGLTF(objects: THREE.Object3D[], options: ExportOptions = {}): Promise<Blob> {
    const { filename: _filename, includeHelpers: _includeHelpers, ...gltfOptions } = options;
    const exportOptions: GLTFExporterOptions = {
      ...this.config.gltf,
      ...gltfOptions,
    };

    const exportScene = this._createExportScene(objects);

    return new Promise((resolve, reject) => {
      this.gltfExporter.parse(
        exportScene,
        (result) => {
          this._disposeExportScene(exportScene);

          if (exportOptions.binary) {
            // GLB 格式
            resolve(new Blob([result as ArrayBuffer], { type: 'application/octet-stream' }));
          } else {
            // GLTF 格式（JSON
            const json = JSON.stringify(result, null, 2);
            resolve(new Blob([json], { type: 'application/json' }));
          }
        },
        (error) => {
          this._disposeExportScene(exportScene);
          reject(error);
        },
        exportOptions
      );
    });
  }

  /**
   * 导出并下载文件
   * @param {THREE.Object3D|THREE.Object3D[]} objects - 要导出的对象
   * @param {string} format - 导出格式
   * @param {string} filename - 文件名（不含扩展名）
   * @param {Object} options - 导出选项
   */
  async exportAndDownload(
    objects: THREE.Object3D | THREE.Object3D[],
    format: ExportFormat | string,
    filename: string = 'model',
    options: ExportOptions = {}
  ): Promise<void> {
    const blob = await this.export(objects, format, options);

    const extension = this._getExtension(format);
    const fullFilename = `${filename}.${extension}`;

    this._downloadBlob(blob, fullFilename);

    console.log(`[ExportManager] 鏂囦欢宸蹭笅杞? ${fullFilename}`);
  }

  /**
   * 导出场景中的所有网格
   * @param {THREE.Scene} scene - 场景
   * @param {string} format - 导出格式
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} 导出结果
   */
  async exportScene(
    scene: THREE.Scene,
    format: ExportFormat | string,
    options: ExportOptions = {}
  ): Promise<Blob> {
    const { includeHelpers = false } = options;

    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        // 过滤辅助对象
        if (!includeHelpers && mesh.userData.isHelper) {
          return;
        }
        meshes.push(mesh);
      }
    });

    if (meshes.length === 0) {
      throw new Error('No exportable mesh in scene');
    }

    return this.export(meshes, format, options);
  }

  /**
   * 导出选中的对象
   * @param {THREE.Object3D} selectedObject - 选中的对象
   * @param {string} format - 导出格式
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} 导出结果
   */
  async exportSelected(
    selectedObject: THREE.Object3D | null | undefined,
    format: ExportFormat | string,
    options: ExportOptions = {}
  ): Promise<Blob> {
    if (!selectedObject) {
      throw new Error('No selected object to export');
    }

    return this.export(selectedObject, format, options);
  }

  /**
   * 合并多个网格后导出
   * @param {THREE.Mesh[]} meshes - 要合并的网格
   * @param {string} format - 导出格式
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} 导出结果
   */
  async exportMerged(
    meshes: THREE.Mesh[],
    format: ExportFormat | string,
    options: ExportOptions = {}
  ): Promise<Blob> {
    if (meshes.length === 0) {
      throw new Error('娌℃湁鍙悎骞剁殑缃戞牸');
    }

    // 合并几何
    const mergedMesh = this._mergeMeshes(meshes);

    try {
      return await this.export(mergedMesh, format, options);
    } finally {
      // 清理合并后的临时网格
      mergedMesh.geometry.dispose();
    }
  }

  _resolveMaterialName(material: THREE.Material, nameMap: Map<string, string>) {
    if (material.name) return material.name;
    const cached = nameMap.get(material.uuid);
    if (cached) return cached;
    const name = `material_${material.uuid.substring(0, 8)}`;
    nameMap.set(material.uuid, name);
    return name;
  }

  /**
   * 创建导出用的临时场景
   * @private
   */
  _createExportScene(objects: THREE.Object3D[]): THREE.Scene {
    const scene = new THREE.Scene();
    const materialCache = new Map<string, THREE.Material>();
    const materialNames = new Map<string, string>();

    objects.forEach((obj) => {
      // 克隆对象以避免修改原始对象
      const clone = obj.clone();
      // 为导出对象克隆材质并补齐名称，确保 OBJ/MTL 匹配
      clone.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((material) => {
            const name = this._resolveMaterialName(material, materialNames);
            const cached = materialCache.get(material.uuid);
            if (cached) return cached;
            const cloned = material.clone();
            cloned.name = name;
            materialCache.set(material.uuid, cloned);
            return cloned;
          });
        } else {
          const material = mesh.material as THREE.Material;
          const name = this._resolveMaterialName(material, materialNames);
          const cached = materialCache.get(material.uuid);
          if (cached) {
            mesh.material = cached;
            return;
          }
          const cloned = material.clone();
          cloned.name = name;
          materialCache.set(material.uuid, cloned);
          mesh.material = cloned;
        }
      });
      scene.add(clone);
    });

    return scene;
  }

  /**
   * 清理导出场景
   * @private
   */
  _disposeExportScene(scene: THREE.Scene) {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Keep shared geometries/materials alive; only detach scene nodes here.
      void mesh.geometry;
      void mesh.material;
    });
    scene.clear();
  }

  /**
   * 合并多个网格
   * @private
   */
  _mergeMeshes(meshes: THREE.Mesh[]): THREE.Mesh {
    const geometries: THREE.BufferGeometry[] = [];

    meshes.forEach((mesh) => {
      if (!mesh.isMesh || !mesh.geometry) return;

      // 克隆几何体并应用世界变换
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      geometries.push(geometry);
    });

    if (geometries.length === 0) {
      throw new Error('No valid geometry to merge');
    }

    // 使用 BufferGeometryUtils 合并（如果可用）
    // 这里使用简单的方式：只取第一个几何体
    // 完整实现可引入：import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

    const mergedGeometry = geometries[0];
    const baseMaterial = meshes[0].material;
    const material = Array.isArray(baseMaterial)
      ? baseMaterial[0]
        ? baseMaterial[0].clone()
        : new THREE.MeshStandardMaterial()
      : baseMaterial.clone();

    return new THREE.Mesh(mergedGeometry, material);
  }

  /**
   * 获取文件扩展
   * @private
   */
  _getExtension(format: string) {
    const extensions: Record<string, string> = {
      stl: 'stl',
      obj: 'obj',
      'obj-zip': 'zip',
      gltf: 'gltf',
      glb: 'glb',
    };
    return extensions[format.toLowerCase()] || format;
  }

  /**
   * 下载 Blob 文件
   * @private
   */
  _downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 延迟释放 URL
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  /**
   * 获取导出格式信息
   * @returns {Object[]} 支持的格式列
   */
  getSupportedFormats() {
    return [
      {
        id: 'stl',
        name: 'STL',
        extension: '.stl',
        description: '绔嬩綋鍏夊埢鏍煎紡锛岄€傜敤浜?3D 鎵撳嵃',
        binary: true,
      },
      {
        id: 'obj',
        name: 'OBJ',
        extension: '.obj',
        description: 'Wavefront OBJ format with broad support',
        binary: false,
      },
      {
        id: 'gltf',
        name: 'GLTF',
        extension: '.gltf',
        description: 'GLTF JSON format with materials and textures',
        binary: false,
      },
      {
        id: 'glb',
        name: 'GLB',
        extension: '.glb',
        description: 'GLB binary format in a single file',
        binary: true,
      },
    ];
  }

  /**
   * 估算导出文件大小
   * @param {THREE.Object3D[]} objects - 要导出的对象
   * @param {string} format - 导出格式
   * @returns {Object} 估算信息
   */
  estimateExportSize(objects: THREE.Object3D | THREE.Object3D[], format: ExportFormat | string) {
    let vertexCount = 0;
    let faceCount = 0;

    const objectsArray = Array.isArray(objects) ? objects : [objects];

    objectsArray.forEach((obj) => {
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry) {
          const geo = mesh.geometry;
          const positions = geo.getAttribute('position');
          if (positions) {
            vertexCount += positions.count;
            faceCount += geo.index ? geo.index.count / 3 : positions.count / 3;
          }
        }
      });
    });

    // 估算文件大小（粗略）
    let estimatedSize = 0;
    switch (format.toLowerCase()) {
      case 'stl':
        // 二进制 STL: 84 字节 + 每个三角形 50 字节
        estimatedSize = 84 + faceCount * 50;
        break;
      case 'obj':
        // OBJ: 每个顶点30 字节，每个面20 字节
        estimatedSize = vertexCount * 30 + faceCount * 20;
        break;
      case 'gltf':
      case 'glb':
        // GLTF: 每个顶点 24 字节（位置/法线），加上 JSON 开销
        estimatedSize = vertexCount * 24 + 1000;
        break;
    }

    return {
      vertexCount,
      faceCount,
      estimatedSize,
      estimatedSizeFormatted: this._formatFileSize(estimatedSize),
    };
  }

  /**
   * 格式化文件大小
   * @private
   */
  _formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * 更新配置
   * @param {Object} config - 配置更新
   */
  updateConfig(config: Partial<ExportConfig>) {
    if (config.stl) {
      Object.assign(this.config.stl, config.stl);
    }
    if (config.gltf) {
      Object.assign(this.config.gltf, config.gltf);
    }
  }

  /**
   * 销毁
   */
  dispose() {
    this.stlExporter = null;
    this.objExporter = null;
    this.gltfExporter = null;
    this.onProgress = null;
    this.onError = null;
  }
}

export default ExportManager;
