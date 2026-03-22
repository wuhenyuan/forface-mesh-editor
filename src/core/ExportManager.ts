/**
 * 妯″瀷瀵煎嚭绠＄悊鍣? * 鏀寔 STL銆丱BJ銆丟LTF 绛夋牸寮忕殑瀵煎嚭
 */
import * as THREE from 'three';
import { STLExporter, type STLExporterOptions } from 'three/examples/jsm/exporters/STLExporter.js';
// import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { OBJExporter } from './export/ObjExport';
import { collectMaterialsAndTextures, generateMTL } from './export/ObjMtl';
import {
  GLTFExporter,
  type GLTFExporterOptions,
} from 'three/examples/jsm/exporters/GLTFExporter.js';

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
  config: ExportConfig;
  onProgress: ((...args: CoreValue[]) => void) | null;
  onError: ((error: CoreValue) => void) | null;

  constructor() {
    // 瀵煎嚭鍣ㄥ疄渚?
    this.stlExporter = new STLExporter();
    this.objExporter = new OBJExporter();
    this.gltfExporter = new GLTFExporter();

    // 瀵煎嚭閰嶇疆
    this.config = {
      // STL 閰嶇疆
      stl: {
        binary: true, // 榛樿浣跨敤浜岃繘鍒舵牸寮忥紙鏂囦欢鏇村皬锛?
      },
      // GLTF 閰嶇疆
      gltf: {
        binary: true, // 浣跨敤 GLB 鏍煎紡
        includeCustomExtensions: false,
        trs: false, // 浣跨敤鐭╅樀鑰岄潪 TRS
        onlyVisible: true, // 鍙鍑哄彲瑙佸璞?
        truncateDrawRange: true,
        maxTextureSize: 4096,
      },
    };

    // 浜嬩欢鍥炶皟
    this.onProgress = null;
    this.onError = null;
  }

  /**
   * 瀵煎嚭妯″瀷锛堢粺涓€鍏ュ彛锛?   * @param {THREE.Object3D|THREE.Object3D[]} objects - 瑕佸鍑虹殑瀵硅薄
   * @param {string} format - 瀵煎嚭鏍煎紡: 'stl' | 'obj' | 'obj-zip' | 'gltf' | 'glb'
   * @param {Object} options - 瀵煎嚭閫夐」
   * @returns {Promise<Blob>} 瀵煎嚭缁撴灉
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
   * 瀵煎嚭涓?STL 鏍煎紡
   * @param {THREE.Object3D[]} objects - 瑕佸鍑虹殑瀵硅薄
   * @param {Object} options - 瀵煎嚭閫夐」
   * @returns {Promise<Blob>} STL Blob
   */
  private async exportSTL(objects: THREE.Object3D[], options: ExportOptions = {}): Promise<Blob> {
    const { binary = this.config.stl.binary } = options;

    // 鍒涘缓涓存椂鍦烘櫙鍖呭惈鎵€鏈夊璞?
    const exportScene = this._createExportScene(objects);

    try {
      const result = this.stlExporter.parse(exportScene, { binary } as STLExporterOptions);

      if (binary) {
        // 浜岃繘鍒舵牸寮忚繑鍥?DataView
        const view = result as DataView;
        const bytes = new Uint8Array(view.byteLength);
        bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
        return new Blob([bytes], { type: 'application/octet-stream' });
      }
      // ASCII 鏍煎紡杩斿洖瀛楃涓?
      return new Blob([result as string], { type: 'text/plain' });
    } finally {
      this._disposeExportScene(exportScene);
    }
  }

  /**
   * 瀵煎嚭涓?OBJ 鏍煎紡
   * @param {THREE.Object3D[]} objects - 瑕佸鍑虹殑瀵硅薄
   * @param {Object} options - 瀵煎嚭閫夐」
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
   * 瀵煎嚭 OBJ + MTL + 璐村浘 ZIP 鍖?   */
  private async exportOBJWithMaterials(
    objects: THREE.Object3D[],
    filename: string = 'model'
  ): Promise<Blob> {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    const exportScene = this._createExportScene(objects);

    try {
      const { materials, textures } = collectMaterialsAndTextures(exportScene);

      const objContent = this.objExporter.parse(exportScene);
      const objWithMtl = `mtllib ${filename}.mtl\n${objContent}`;
      zip.file(`${filename}.obj`, objWithMtl);

      const mtlContent = generateMTL(materials);
      zip.file(`${filename}.mtl`, mtlContent);

      for (const [textureName, textureData] of textures) {
        zip.file(textureName, textureData);
      }

      return await zip.generateAsync({ type: 'blob' });
    } finally {
      this._disposeExportScene(exportScene);
    }
  }

  /**
   * 瀵煎嚭涓?GLTF/GLB 鏍煎紡
   * @param {THREE.Object3D[]} objects - 瑕佸鍑虹殑瀵硅薄
   * @param {Object} options - 瀵煎嚭閫夐」
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
            // GLB 鏍煎紡
            resolve(new Blob([result as ArrayBuffer], { type: 'application/octet-stream' }));
          } else {
            // GLTF 鏍煎紡锛圝SON锛?
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
   * 瀵煎嚭骞朵笅杞芥枃浠?   * @param {THREE.Object3D|THREE.Object3D[]} objects - 瑕佸鍑虹殑瀵硅薄
   * @param {string} format - 瀵煎嚭鏍煎紡
   * @param {string} filename - 鏂囦欢鍚嶏紙涓嶅惈鎵╁睍鍚嶏級
   * @param {Object} options - 瀵煎嚭閫夐」
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
   * 瀵煎嚭鍦烘櫙涓殑鎵€鏈夌綉鏍?   * @param {THREE.Scene} scene - 鍦烘櫙
   * @param {string} format - 瀵煎嚭鏍煎紡
   * @param {Object} options - 瀵煎嚭閫夐」
   * @returns {Promise<Blob>} 瀵煎嚭缁撴灉
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
        // 杩囨护杈呭姪瀵硅薄
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
   * 瀵煎嚭閫変腑鐨勫璞?   * @param {THREE.Object3D} selectedObject - 閫変腑鐨勫璞?   * @param {string} format - 瀵煎嚭鏍煎紡
   * @param {Object} options - 瀵煎嚭閫夐」
   * @returns {Promise<Blob>} 瀵煎嚭缁撴灉
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
   * 鍚堝苟澶氫釜缃戞牸鍚庡鍑?   * @param {THREE.Mesh[]} meshes - 瑕佸悎骞剁殑缃戞牸
   * @param {string} format - 瀵煎嚭鏍煎紡
   * @param {Object} options - 瀵煎嚭閫夐」
   * @returns {Promise<Blob>} 瀵煎嚭缁撴灉
   */
  async exportMerged(
    meshes: THREE.Mesh[],
    format: ExportFormat | string,
    options: ExportOptions = {}
  ): Promise<Blob> {
    if (meshes.length === 0) {
      throw new Error('娌℃湁鍙悎骞剁殑缃戞牸');
    }

    // 鍚堝苟鍑犱綍浣?
    const mergedMesh = this._mergeMeshes(meshes);

    try {
      return await this.export(mergedMesh, format, options);
    } finally {
      // 娓呯悊鍚堝苟鍚庣殑涓存椂缃戞牸
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
   * 鍒涘缓瀵煎嚭鐢ㄧ殑涓存椂鍦烘櫙
   * @private
   */
  _createExportScene(objects: THREE.Object3D[]): THREE.Scene {
    const scene = new THREE.Scene();
    const materialCache = new Map<string, THREE.Material>();
    const materialNames = new Map<string, string>();

    objects.forEach((obj) => {
      // 鍏嬮殕瀵硅薄浠ラ伩鍏嶄慨鏀瑰師濮嬪璞?
      const clone = obj.clone();
      // 涓哄鍑哄璞″厠闅嗘潗璐ㄥ苟琛ラ綈鍚嶇О锛岀‘淇?OBJ/MTL 鍖归厤
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
   * 娓呯悊瀵煎嚭鍦烘櫙
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
   * 鍚堝苟澶氫釜缃戞牸
   * @private
   */
  _mergeMeshes(meshes: THREE.Mesh[]): THREE.Mesh {
    const geometries: THREE.BufferGeometry[] = [];

    meshes.forEach((mesh) => {
      if (!mesh.isMesh || !mesh.geometry) return;

      // 鍏嬮殕鍑犱綍浣撳苟搴旂敤涓栫晫鍙樻崲
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      geometries.push(geometry);
    });

    if (geometries.length === 0) {
      throw new Error('No valid geometry to merge');
    }

    // 浣跨敤 BufferGeometryUtils 鍚堝苟锛堝鏋滃彲鐢級
    // 杩欓噷浣跨敤绠€鍗曠殑鏂瑰紡锛氬彧鍙栫涓€涓嚑浣曚綋
    // 瀹屾暣瀹炵幇闇€瑕?import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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
   * 鑾峰彇鏂囦欢鎵╁睍鍚?   * @private
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
   * 涓嬭浇 Blob 鏂囦欢
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

    // 寤惰繜閲婃斁 URL
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  /**
   * 鑾峰彇瀵煎嚭鏍煎紡淇℃伅
   * @returns {Object[]} 鏀寔鐨勬牸寮忓垪琛?   */
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
   * 浼扮畻瀵煎嚭鏂囦欢澶у皬
   * @param {THREE.Object3D[]} objects - 瑕佸鍑虹殑瀵硅薄
   * @param {string} format - 瀵煎嚭鏍煎紡
   * @returns {Object} 浼扮畻淇℃伅
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

    // 浼扮畻鏂囦欢澶у皬锛堢矖鐣ワ級
    let estimatedSize = 0;
    switch (format.toLowerCase()) {
      case 'stl':
        // 浜岃繘鍒?STL: 84 瀛楄妭澶?+ 姣忎釜涓夎褰?50 瀛楄妭
        estimatedSize = 84 + faceCount * 50;
        break;
      case 'obj':
        // OBJ: 姣忎釜椤剁偣绾?30 瀛楄妭锛屾瘡涓潰绾?20 瀛楄妭
        estimatedSize = vertexCount * 30 + faceCount * 20;
        break;
      case 'gltf':
      case 'glb':
        // GLTF: 姣忎釜椤剁偣绾?24 瀛楄妭锛堜綅缃?娉曠嚎锛夛紝鍔犱笂 JSON 寮€閿€
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
   * 鏍煎紡鍖栨枃浠跺ぇ灏?   * @private
   */
  _formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * 鏇存柊閰嶇疆
   * @param {Object} config - 閰嶇疆鏇存柊
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
   * 閿€姣?   */
  dispose() {
    this.stlExporter = null;
    this.objExporter = null;
    this.gltfExporter = null;
    this.onProgress = null;
    this.onError = null;
  }
}

export default ExportManager;
