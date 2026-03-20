/**
 * 模型加载管理�? * 支持多种格式：STL, OBJ, ZIP(OBJ+MTL)
 *
 * 职责�? * 1. 根据文件类型选择合适的 Loader
 * 2. 加载完成后触发特征检�? * 3. 返回标准化的模型数据
 */
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { IndexedOBJLoader } from './loaders/IndexedOBJLoader';
// import JSZip from 'jszip'  // 需要时再引�?
/**
 * @typedef {Object} LoadResult
 * @property {THREE.Mesh|THREE.Group} model - 加载的模�? * @property {string} modelId - 模型唯一标识
 * @property {string} format - 文件格式
 * @property {Object} metadata - 元数据（顶点数、面数等�? */

/**
 * @typedef {Object} LoadOptions
 * @property {string} [modelId] - 自定义模型ID，不传则自动生成
 * @property {boolean} [detectFeatures=true] - 是否自动检测特�? * @property {boolean} [centerModel=true] - 是否居中模型
 * @property {THREE.Material} [material] - optional material override
 * @property {string} [mtlUrl] - optional MTL file URL for OBJ
 */

export class LoaderManager {
  stlLoader: any;
  indexedObjLoader: any;
  gltfLoader: any;
  mtlLoader: any;
  featureDetector: any;
  loadCounter: number;
  loadedModels: Map<string, any> = new Map();
  onProgress: ((...args: any[]) => void) | null;
  onError: ((error: any) => void) | null;

  constructor() {
    // Loaders
    this.stlLoader = new STLLoader();
    this.indexedObjLoader = new IndexedOBJLoader();
    this.gltfLoader = new GLTFLoader();
    this.mtlLoader = new MTLLoader();

    // 特征检测器（由 Viewer 注入�?    this.featureDetector = null;

    // 加载计数器（用于生成 ID�?    this.loadCounter = 0;

    // 已加载模型缓�?    this.loadedModels = new Map(); // modelId -> LoadResult

    // 事件回调
    this.onProgress = null;
    this.onError = null;
  }

  /**
   * 设置特征检测器（由 Viewer 调用�?   * @param {FeatureDetector} detector
   */
  setFeatureDetector(detector: any) {
    this.featureDetector = detector;
  }

  /**
   * 加载模型（统一入口�?   * @param {string|File|Blob} source - 文件路径、File 对象�?Blob
   * @param {LoadOptions} options - 加载选项
   * @returns {Promise<LoadResult>}
   */
  async load(source: any, options: Record<string, any> = {}) {
    const {
      modelId = this._generateModelId(),
      detectFeatures = false,
      centerModel = true,
      material = null,
    } = options;

    // 判断文件格式
    const format = this._detectFormat(source);

    console.log(`[LoaderManager] 加载模型: ${modelId}, 格式: ${format}`);

    let model;
    try {
      switch (format) {
        case 'stl':
          model = await this._loadSTL(source, material);
          break;
        case 'obj':
          model = await this._loadOBJ(source, material, options);
          break;
        case 'glb':
        case 'gltf':
          model = await this._loadGLTF(source, material);
          break;
        case 'zip':
          model = await this._loadZipOBJ(source);
          break;
        default:
          throw new Error(`不支持的文件格式: ${format}`);
      }
    } catch (error) {
      this.onError?.(error);
      throw error;
    }

    // 居中模型
    if (centerModel) {
      this._centerModel(model);
    }

    // 生成元数�?
    const metadata = this._extractMetadata(model);

    // 构建结果
    const result = {
      model,
      modelId,
      format,
      metadata,
    };

    // 缓存
    this.loadedModels.set(modelId, result);

    // 特征检�?
    if (detectFeatures && this.featureDetector) {
      console.log(`[LoaderManager] 开始特征检�? ${modelId}`);
      const detector: any = this.featureDetector;
      if (typeof detector.detect === 'function') {
        await detector.detect(model, modelId);
      } else if (typeof detector.preprocessMesh === 'function') {
        await detector.preprocessMesh(model);
      }
    }

    return result;
  }

  /**
   * 加载 STL 文件
   * @private
   */
  async _loadSTL(source: any, material: any) {
    return new Promise((resolve, reject) => {
      const onLoad = (geometry) => {
        geometry.computeVertexNormals();

        const mat =
          material ||
          new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.3,
            roughness: 0.6,
          });

        const mesh = new THREE.Mesh(geometry, mat);
        resolve(mesh);
      };

      if (source instanceof Blob || source instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const geometry = this.stlLoader.parse((e as any)?.target?.result);
          onLoad(geometry);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(source);
      } else {
        this.stlLoader.load(source, onLoad, this.onProgress, reject);
      }
    });
  }

  /**
   * 加载 OBJ 文件
   * @private
   */
  async _loadOBJ(source: any, material: any, options: Record<string, any> = {}) {
    const splitUrl = (value: string) => {
      const match = value.match(/^[^?#]+/);
      const base = match ? match[0] : value;
      const suffix = value.slice(base.length);
      return { base, suffix };
    };

    const getBasePath = (url: string) => {
      const clean = splitUrl(url).base;
      const idx = clean.lastIndexOf('/');
      return idx >= 0 ? clean.slice(0, idx + 1) : '';
    };

    const inferMtlUrl = (objUrl: string) => {
      const parts = splitUrl(objUrl);
      const base = parts.base;
      const suffix = parts.suffix;
      if (!base.toLowerCase().endsWith('.obj')) return null;
      return base.slice(0, -4) + '.mtl' + suffix;
    };

    const loadMtl = (mtlUrl: string) => {
      return new Promise((resolve, reject) => {
        const basePath = getBasePath(mtlUrl);
        this.mtlLoader.setPath(basePath);
        this.mtlLoader.setResourcePath(basePath);
        this.mtlLoader.load(
          mtlUrl,
          (materials: any) => {
            materials.preload();
            resolve(materials);
          },
          this.onProgress,
          reject
        );
      });
    };

    let resolvedMtlUrl = options?.mtlUrl || null;

    if (!resolvedMtlUrl && typeof source === 'string') {
      resolvedMtlUrl = inferMtlUrl(source);
    }

    let resolvedMaterial = material;
    if (resolvedMtlUrl && !resolvedMaterial) {
      try {
        const materials = await loadMtl(resolvedMtlUrl);
        resolvedMaterial = this._pickFirstMaterial(materials);
      } catch (error) {
        resolvedMaterial = null;
      }
    }

    const parseFromText = (objText: string) =>
      this.indexedObjLoader.parse(objText, {
        material: resolvedMaterial,
      });

    if (source instanceof Blob || source instanceof File) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const objText = String((e as any)?.target?.result || '');
            resolve(parseFromText(objText));
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsText(source);
      });
    }

    if (typeof source === 'string') {
      const objText = await this._fetchText(source);
      return parseFromText(objText);
    }

    throw new Error('Unsupported OBJ source type');
  }

  /**
   * Load GLTF/GLB files
   * @private
   */
  async _loadGLTF(source: any, material: any) {
    return new Promise((resolve, reject) => {
      const onLoad = (gltf: any) => {
        const model = gltf?.scene || (Array.isArray(gltf?.scenes) ? gltf.scenes[0] : null);
        const root = model || new THREE.Group();

        if (material) {
          root.traverse((child) => {
            if (child.isMesh) {
              child.material = material;
            }
          });
        }

        resolve(root);
      };

      if (source instanceof Blob || source instanceof File) {
        const isGltf =
          source instanceof File
            ? source.name.toLowerCase().endsWith('.gltf')
            : (source.type || '').toLowerCase().includes('gltf+json');
        const reader = new FileReader();

        reader.onload = (e) => {
          const result = (e as any)?.target?.result;
          if (isGltf && typeof result === 'string') {
            this.gltfLoader.parse(result, '', onLoad, reject);
          } else {
            this.gltfLoader.parse(result as ArrayBuffer, '', onLoad, reject);
          }
        };
        reader.onerror = reject;

        if (isGltf) {
          reader.readAsText(source);
        } else {
          reader.readAsArrayBuffer(source);
        }
      } else {
        this.gltfLoader.load(source, onLoad, this.onProgress, reject);
      }
    });
  }
  /**
   * 加载 ZIP 格式�?OBJ（包�?MTL 和贴图）
   * @private
   */
  async _loadZipOBJ(source: string) {
    const JSZipModule: any = await import('jszip');
    const JSZip = JSZipModule?.default || JSZipModule;

    const zipInput = await this._fetchArrayBuffer(source);

    const zip = await JSZip.loadAsync(zipInput);
    const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

    const normalizeZipPath = (value: string) => {
      const cleaned = value.replace(/\\/g, '/').replace(/^\.?\//, '');
      const parts: string[] = [];
      cleaned.split('/').forEach((part) => {
        if (!part || part === '.') return;
        if (part === '..') {
          parts.pop();
          return;
        }
        parts.push(part);
      });
      return parts.join('/');
    };

    const stripQuery = (value: string) => value.split('?')[0].split('#')[0];

    const findEntryByExact = (name: string) => {
      const target = normalizeZipPath(name).toLowerCase();
      return fileNames.find((entry) => normalizeZipPath(entry).toLowerCase() === target) || null;
    };

    const findEntryByBaseName = (name: string) => {
      const base = normalizeZipPath(name).split('/').pop();
      if (!base) return null;
      const lowerBase = base.toLowerCase();
      return (
        fileNames.find((entry) => {
          const normalized = normalizeZipPath(entry).toLowerCase();
          return normalized === lowerBase || normalized.endsWith(`/${lowerBase}`);
        }) || null
      );
    };

    const getBasePath = (value: string) => {
      const clean = normalizeZipPath(stripQuery(value));
      const idx = clean.lastIndexOf('/');
      return idx >= 0 ? clean.slice(0, idx + 1) : '';
    };

    const extractMtlLibraries = (objText: string) => {
      const libs: string[] = [];
      const regex = /^mtllib\s+(.+)$/gim;
      let match = null;
      while ((match = regex.exec(objText))) {
        const names = match[1].trim().split(/\s+/).filter(Boolean);
        libs.push(...names);
      }
      return libs;
    };

    const textureExtensions = new Set([
      '.png',
      '.jpg',
      '.jpeg',
      '.bmp',
      '.gif',
      '.webp',
      '.tga',
      '.dds',
      '.ktx',
      '.ktx2',
      '.hdr',
      '.exr',
      '.tif',
      '.tiff',
    ]);

    const isTextureFile = (name: string) => {
      const clean = stripQuery(name).toLowerCase();
      const idx = clean.lastIndexOf('.');
      if (idx < 0) return false;
      return textureExtensions.has(clean.slice(idx));
    };

    const buildTextureUrlMap = async () => {
      const map = new Map<string, string>();
      const targets = fileNames.filter((name) => isTextureFile(name));
      await Promise.all(
        targets.map(async (name) => {
          const file = zip.file(name);
          if (!file) return;
          const blob = await file.async('blob');
          const url = URL.createObjectURL(blob);
          const normalized = normalizeZipPath(name);
          map.set(normalized, url);
          map.set(normalized.toLowerCase(), url);
        })
      );
      return map;
    };

    const resolveTextureUrl = (url: string, map: Map<string, string>) => {
      if (/^(blob:|data:|https?:)/i.test(url)) return url;
      const normalized = normalizeZipPath(stripQuery(url));
      const direct = map.get(normalized) || map.get(normalized.toLowerCase());
      if (direct) return direct;
      const match = Array.from(map.keys()).find(
        (key) => key.endsWith(`/${normalized}`) || key.endsWith(normalized)
      );
      if (match) {
        return map.get(match) || map.get(match.toLowerCase()) || url;
      }
      return url;
    };

    const objName = fileNames.find((name) => name.toLowerCase().endsWith('.obj'));

    if (!objName) {
      throw new Error('ZIP does not contain .obj file');
    }

    const objText = await zip.file(objName).async('text');

    let mtlEntryName: string | null = null;

    if (!mtlEntryName) {
      const libs = extractMtlLibraries(objText);
      for (const lib of libs) {
        const entry = findEntryByExact(lib) || findEntryByBaseName(lib);
        if (entry) {
          mtlEntryName = entry;
          break;
        }
      }
    }

    if (!mtlEntryName) {
      const fallback = fileNames.find((name) => name.toLowerCase().endsWith('.mtl'));
      mtlEntryName = fallback || null;
    }

    let resolvedMaterial: THREE.Material | null = null;

    if (mtlEntryName) {
      const mtlText = await zip.file(mtlEntryName).async('text');
      const textureUrlMap = await buildTextureUrlMap();
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => resolveTextureUrl(url, textureUrlMap));
      const mtlLoader = new MTLLoader(manager);
      const basePath = getBasePath(mtlEntryName);
      const materials = mtlLoader.parse(mtlText, basePath);
      materials.preload();
      resolvedMaterial = this._pickFirstMaterial(materials);
    }

    return this.indexedObjLoader.parse(objText, {
      material: resolvedMaterial,
    });
  }

  _pickFirstMaterial(materialCreator: any) {
    if (!materialCreator) return null;

    const existingMaterials = materialCreator.materials;
    if (existingMaterials && typeof existingMaterials === 'object') {
      const firstName = Object.keys(existingMaterials).find((name) => !!existingMaterials[name]);
      if (firstName) {
        return existingMaterials[firstName] as THREE.Material;
      }
    }

    if (typeof materialCreator.create === 'function') {
      const infos = materialCreator.materialsInfo;
      if (infos && typeof infos === 'object') {
        const firstName = Object.keys(infos)[0];
        if (firstName) {
          return materialCreator.create(firstName) as THREE.Material;
        }
      }
    }

    return null;
  }

  async _fetchText(url: string) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  }

  async _fetchArrayBuffer(url: string) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.arrayBuffer();
  }

  /**
   * 检测文件格�?   * @private
   */
  _detectFormat(source: any) {
    let filename = '';

    if (typeof source === 'string') {
      filename = source.toLowerCase();
    } else if (source instanceof File) {
      filename = source.name.toLowerCase();
    } else if (source instanceof Blob) {
      const type = (source.type || '').toLowerCase();
      if (type.includes('zip')) return 'zip';
      if (type.includes('stl')) return 'stl';
      if (type.includes('obj')) return 'obj';
      if (type.includes('gltf')) {
        return type.includes('json') ? 'gltf' : 'glb';
      }
      return 'unknown';
    }

    if (filename.endsWith('.stl')) return 'stl';
    if (filename.endsWith('.obj')) return 'obj';
    if (filename.endsWith('.glb')) return 'glb';
    if (filename.endsWith('.gltf')) return 'gltf';
    if (filename.endsWith('.zip')) return 'zip';

    return 'unknown';
  }

  /**
   * 居中模型
   * @private
   */
  _centerModel(model: any) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());

    model.position.sub(center);

    // 将模型底部放�?y=0
    const newBox = new THREE.Box3().setFromObject(model);
    model.position.y -= newBox.min.y;
  }

  /**
   * 提取模型元数�?   * @private
   */
  _extractMetadata(model: any) {
    let vertexCount = 0;
    let faceCount = 0;
    const boundingBox = new THREE.Box3().setFromObject(model);
    const size = boundingBox.getSize(new THREE.Vector3());

    model.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const geo = child.geometry;
        const positions = geo.getAttribute('position');
        if (positions) {
          vertexCount += positions.count;
          faceCount += geo.index ? geo.index.count / 3 : positions.count / 3;
        }
      }
    });

    return {
      vertexCount,
      faceCount,
      boundingBox: {
        min: boundingBox.min.toArray(),
        max: boundingBox.max.toArray(),
      },
      size: size.toArray(),
    };
  }

  /**
   * 生成模型 ID
   * @private
   */
  _generateModelId() {
    return `model_${++this.loadCounter}_${Date.now()}`;
  }

  /**
   * 获取已加载的模型
   * @param {string} modelId
   * @returns {LoadResult|null}
   */
  getModel(modelId: string) {
    return this.loadedModels.get(modelId) || null;
  }

  /**
   * 移除模型
   * @param {string} modelId
   */
  removeModel(modelId: string) {
    const result = this.loadedModels.get(modelId);
    if (result) {
      // 清理特征数据
      const detector: any = this.featureDetector;
      if (detector?.clearFeatures) {
        detector.clearFeatures(modelId);
      } else if (detector?.clearCache) {
        detector.clearCache(modelId);
      }
      this.loadedModels.delete(modelId);
    }
  }

  /**
   * 清理所�?   */
  dispose() {
    this.loadedModels.clear();
    this.featureDetector = null;
  }
}

export default LoaderManager;
