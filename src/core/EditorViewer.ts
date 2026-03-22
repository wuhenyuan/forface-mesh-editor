/**
 * 缂栬緫鍣ㄤ笓鐢?Viewer
 * 鍦ㄥ熀纭€ Viewer 涓婇泦鎴愰潰鎷惧彇銆佹枃瀛楃郴缁熴€佺墿浣撻€夋嫨绛夊姛鑳? */
import * as THREE from 'three';
import { Viewer } from './Viewer';
import { FacePicker, FacePickingUtils } from './facePicking';
import { SurfaceTextManager } from './surfaceText';
import { ObjectSelectionManager } from './objectSelection';
import { LoaderManager } from './LoaderManager';
import { ExportManager } from './ExportManager';
import { ProjectManager } from './ProjectManager';
import { FeatureDetector } from './facePicking/FeatureDetector';

type PrimitiveValue = string | number | boolean | null | undefined;
type OptionValue = PrimitiveValue | PrimitiveValue[] | THREE.Material;
type LooseRecord = Record<string, OptionValue>;
type TextMode = 'raised' | 'engraved' | string;
type ModelSource = string | File | Blob;

type ProjectConfigLike = {
  models?: {
    origin?: { path?: string };
    base?: { path?: string };
  };
  originModelPath?: string;
  baseModelPath?: string;
  texts?: Array<Record<string, PrimitiveValue | number[]>>;
};

type ProjectDataLike = {
  config?: ProjectConfigLike;
};

type ViewerEventPayload =
  | PrimitiveValue
  | THREE.Object3D
  | THREE.Vector2
  | THREE.Vector3
  | THREE.Euler
  | THREE.Intersection
  | Record<string, PrimitiveValue | number[] | THREE.Object3D | object | null>
  | Array<Record<string, PrimitiveValue | number[]>>;

type DetectFeatureOptions = Record<string, PrimitiveValue>;

type FeatureLike = {
  id?: string;
  type?: string;
  [key: string]: PrimitiveValue | number[] | object | null | undefined;
};

type FeatureDetectionResult = {
  meshId?: string;
  triangleCount?: number;
  planes?: FeatureLike[];
  cylinders?: FeatureLike[];
  namedFeatures?: FeatureLike[];
  [key: string]:
    | PrimitiveValue
    | FeatureLike[]
    | Map<number, FeatureLike>
    | Record<string, PrimitiveValue>
    | undefined;
};

type LoadModelOptions = {
  addToScene?: boolean;
  detectFeatures?: boolean;
  modelId?: string;
  centerModel?: boolean;
  material?: THREE.Material | null;
  mtlUrl?: string;
  name?: string;
};

type AddMeshOptions = {
  selectable?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  group?: 'entity' | 'scene' | 'csg';
};

type ExportOptions = Parameters<ExportManager['export']>[2];

type CreateProjectOptions = {
  name?: string;
  originModelPath?: string;
};

type ProjectPackageOptions = {
  includeModels?: boolean | string[];
  format?: 'v3' | 'config2';
  projectFileName?: string;
  fetchOptions?: RequestInit;
};

type EditorViewerOptions = {
  backgroundColor?: number;
  enableShadow?: boolean;
  enableGrid?: boolean;
  events?: ViewerEventBus;
  [key: string]: PrimitiveValue | PrimitiveValue[] | object | undefined;
};

type ViewerEventBus = {
  emit: (event: string, payload?: ViewerEventPayload) => void;
  on: (event: string, callback: (payload?: ViewerEventPayload) => void) => () => void;
};

type FeatureDetectorLike = FeatureDetector & {
  detect?: (
    model: THREE.Object3D,
    modelId?: string,
    options?: DetectFeatureOptions
  ) => Promise<FeatureDetectionResult | null>;
  getFeatureAtIntersection?: (
    modelId: string,
    intersection: THREE.Intersection
  ) => FeatureLike | null;
  getModelFeatures?: (modelId: string) => FeatureDetectionResult | null;
  getTextableSurfaces?: (modelId: string, options?: DetectFeatureOptions) => FeatureLike[];
};

type TextObjectConfig = {
  font?: string;
  size?: number;
  thickness?: number;
  direction?: string;
  letterSpacing?: number;
  curvingStrength?: number;
  startAngle?: number;
  color?: string | number;
};

type EditorTextObject = {
  id?: string;
  displayName?: string;
  content?: string;
  config?: TextObjectConfig;
  mode?: TextMode;
  material?: {
    color?: {
      getHexString?: () => string;
    };
  };
  mesh?: {
    position?: { toArray?: () => number[] };
    rotation?: { toArray?: () => number[] };
  };
  featureName?: string;
};

type EditorViewerMesh = THREE.Object3D & {
  userData: Record<string, PrimitiveValue | number[] | object> & { isHelper?: boolean };
};

export class EditorViewer extends Viewer {
  _loaderManager: LoaderManager | null;
  _exportManager: ExportManager | null;
  _projectManager: ProjectManager | null;
  declare _featureDetector: FeatureDetectorLike | null;
  declare _facePicker: Viewer['_facePicker'];
  declare _surfaceTextManager: SurfaceTextManager | null;
  declare _objectSelectionManager: ObjectSelectionManager | null;
  _textObjects: EditorTextObject[];
  _selectedTextId: string | null;
  _textModeEnabled: boolean;
  _facePickingEnabled: boolean;
  _objectSelectionEnabled: boolean;

  constructor(container: HTMLElement, options: EditorViewerOptions = {}) {
    super(container, options);

    this._loaderManager = null;
    this._exportManager = null;
    this._projectManager = null;
    this._featureDetector = null;

    this._facePicker = null;
    this._surfaceTextManager = null;
    this._objectSelectionManager = null;

    // 鏂囧瓧瀵硅薄鍒楄〃
    this._textObjects = [];
    this._selectedTextId = null;

    this._textModeEnabled = false;
    this._facePickingEnabled = false;
    this._objectSelectionEnabled = false;

    // 鍒濆鍖栨牳蹇冨瓙绯荤粺
    this._initCoreSubsystems();
  }

  // ==================== 鏍稿績瀛愮郴缁?====================

  /**
   * 鍒濆鍖栨牳蹇冨瓙绯荤粺
   */
  _initCoreSubsystems() {
    // 鐗瑰緛妫€娴嬪櫒
    this._featureDetector = new FeatureDetector();

    this._loaderManager = new LoaderManager();
    this._loaderManager.setFeatureDetector(this._featureDetector);

    this._exportManager = new ExportManager();

    this._projectManager = new ProjectManager();

    // 璁剧疆鍔犺浇浜嬩欢
    this._loaderManager.onProgress = (progress) => {
      this.events.emit('loadProgress', progress);
    };
    this._loaderManager.onError = (error) => {
      this.events.emit('loadError', { error });
    };

    // 璁剧疆瀵煎嚭浜嬩欢
    this._exportManager.onProgress = (progress) => {
      this.events.emit('exportProgress', progress);
    };
    this._exportManager.onError = (error) => {
      this.events.emit('exportError', { error });
    };

    // 璁剧疆椤圭洰绠＄悊浜嬩欢
    this._projectManager.onChange = (event) => {
      this.events.emit('projectChanged', event);
    };
    this._projectManager.onSave = (event) => {
      this.events.emit('projectSaved', event);
    };
    this._projectManager.onLoad = (event) => {
      this.events.emit('projectLoaded', event);
    };

    this._featureDetector.onDetectionStart = (modelId) => {
      this.events.emit('featureDetectionStart', { modelId });
    };
    this._featureDetector.onDetectionProgress = (modelId, progress) => {
      this.events.emit('featureDetectionProgress', { modelId, progress });
    };
    this._featureDetector.onDetectionComplete = (result) => {
      this.events.emit('featureDetectionComplete', result);
    };
  }

  // ==================== 妯″瀷鍔犺浇 ====================

  /**
   * 鍔犺浇妯″瀷锛堢粺涓€鍏ュ彛锛?   * @param {string|File|Blob} source - 鏂囦欢璺緞鎴栨枃浠跺璞?   * @param {Object} options - 鍔犺浇閫夐」
   * @returns {Promise<Object>} 鍔犺浇缁撴灉
   */
  async loadModel(source: ModelSource, options: LoadModelOptions = {}) {
    const { addToScene = true, detectFeatures = false, ...loaderOptions } = options;

    try {
      // 浣跨敤 LoaderManager 鍔犺浇
      const result = await this._loaderManager.load(source, {
        detectFeatures,
        ...loaderOptions,
      });

      if (addToScene) {
        this.addMesh(result.model, {
          selectable: true,
          castShadow: true,
          receiveShadow: true,
        });
      }

      this.events.emit('modelLoaded', {
        model: result.model,
        modelId: result.modelId,
        format: result.format,
        metadata: result.metadata,
        features: this._featureDetector?.getModelFeatures?.(result.modelId) ?? null,
      });

      return result;
    } catch (error) {
      console.error('[EditorViewer] 妯″瀷鍔犺浇澶辫触:', error);
      throw error;
    }
  }

  /**
   * 鑾峰彇鍔犺浇绠＄悊鍣?   */
  getLoaderManager() {
    return this._loaderManager;
  }

  // ==================== 妯″瀷瀵煎嚭 ====================

  /**
   * 瀵煎嚭妯″瀷
   * @param {THREE.Object3D|THREE.Object3D[]} objects - 瑕佸鍑虹殑瀵硅薄
   * @param {string} format - 瀵煎嚭鏍煎紡: 'stl' | 'obj' | 'gltf' | 'glb'
   * @param {Object} options - 瀵煎嚭閫夐」
   * @returns {Promise<Blob>} 瀵煎嚭缁撴灉
   */
  async exportModel(
    objects: THREE.Object3D | THREE.Object3D[],
    format: string,
    options: ExportOptions = {}
  ) {
    return this._exportManager.export(objects, format, options);
  }

  /**
   * 瀵煎嚭骞朵笅杞芥ā鍨?   * @param {THREE.Object3D|THREE.Object3D[]} objects - 瑕佸鍑虹殑瀵硅薄
   * @param {string} format - 瀵煎嚭鏍煎紡
   * @param {string} filename - 鏂囦欢鍚嶏紙涓嶅惈鎵╁睍鍚嶏級
   * @param {Object} options - 瀵煎嚭閫夐」
   */
  async exportAndDownload(
    objects: THREE.Object3D | THREE.Object3D[],
    format: string,
    filename: string = 'model',
    options: ExportOptions = {}
  ) {
    await this._exportManager.exportAndDownload(objects, format, filename, options);
    this.events.emit('modelExported', { format, filename });
  }

  /**
   * 瀵煎嚭鍦烘櫙涓殑鎵€鏈夌綉鏍?   * @param {string} format - 瀵煎嚭鏍煎紡
   * @param {string} filename - 鏂囦欢鍚?   * @param {Object} options - 瀵煎嚭閫夐」
   */
  async exportScene(
    format: string,
    filename: string = 'scene',
    model: THREE.Object3D | THREE.Object3D[] | undefined = undefined,
    options: ExportOptions = {}
  ) {
    const target = model ?? this.scene;
    const exportOptions = {
      ...options,
      filename,
    };
    const blob = (target as THREE.Scene).isScene
      ? await this._exportManager.exportScene(target as THREE.Scene, format, exportOptions)
      : await this._exportManager.export(
          target as THREE.Object3D | THREE.Object3D[],
          format,
          exportOptions
        );
    this._exportManager._downloadBlob(
      blob,
      `${filename}.${this._exportManager._getExtension(format)}`
    );
    this.events.emit('sceneExported', { format, filename });
  }

  /**
   * 瀵煎嚭閫変腑鐨勫璞?   * @param {string} format - 瀵煎嚭鏍煎紡
   * @param {string} filename - 鏂囦欢鍚?   * @param {Object} options - 瀵煎嚭閫夐」
   */
  async exportSelected(
    format: string,
    filename: string = 'selected',
    options: ExportOptions = {}
  ) {
    const selected = this.getSelectedObject();
    if (!selected) {
      throw new Error('No selected object');
    }

    await this._exportManager.exportAndDownload(selected, format, filename, options);
    this.events.emit('selectedExported', { format, filename, object: selected });
  }

  /**
   * 瀵煎嚭鎵€鏈夌綉鏍硷紙鍚堝苟鍚庯級
   * @param {string} format - 瀵煎嚭鏍煎紡
   * @param {string} filename - 鏂囦欢鍚?   * @param {Object} options - 瀵煎嚭閫夐」
   */
  async exportMerged(
    format: string,
    filename: string = 'merged',
    options: ExportOptions = {}
  ) {
    const meshes = this._meshes.filter(
      (m): m is THREE.Mesh => (m as THREE.Mesh).isMesh && !m.userData.isHelper
    );
    if (meshes.length === 0) {
      throw new Error('娌℃湁鍙鍑虹殑缃戞牸');
    }

    const blob = await this._exportManager.exportMerged(meshes, format, options);
    this._exportManager._downloadBlob(
      blob,
      `${filename}.${this._exportManager._getExtension(format)}`
    );
    this.events.emit('mergedExported', { format, filename, meshCount: meshes.length });
  }

  /**
   * 鑾峰彇鏀寔鐨勫鍑烘牸寮?   * @returns {Object[]} 鏍煎紡鍒楄〃
   */
  getSupportedExportFormats() {
    return this._exportManager.getSupportedFormats();
  }

  /**
   * 浼扮畻瀵煎嚭鏂囦欢澶у皬
   * @param {THREE.Object3D|THREE.Object3D[]} objects - 瑕佸鍑虹殑瀵硅薄
   * @param {string} format - 瀵煎嚭鏍煎紡
   * @returns {Object} 浼扮畻淇℃伅
   */
  estimateExportSize(objects: THREE.Object3D | THREE.Object3D[], format: string) {
    return this._exportManager.estimateExportSize(objects, format);
  }

  /**
   * 鑾峰彇瀵煎嚭绠＄悊鍣?   */
  getExportManager() {
    return this._exportManager;
  }

  // ==================== 椤圭洰绠＄悊 ====================

  /**
   * 鍒涘缓鏂伴」鐩?   * @param {Object} options - 椤圭洰閫夐」
   * @returns {Object} 椤圭洰鏁版嵁
   */
  createProject(options: CreateProjectOptions = {}) {
    // 娓呯悊褰撳墠鍦烘櫙
    this._clearScene();

    const project = this._projectManager.createProject(options);

    this.events.emit('projectCreated', project);
    return project;
  }

  /**
   * 淇濆瓨椤圭洰鍒版湰鍦?   * @param {string} key - 瀛樺偍閿悕锛堝彲閫夛級
   * @returns {boolean} 鏄惁鎴愬姛
   */
  saveProject(key?: string) {
    // 鍚屾褰撳墠鐘舵€佸埌椤圭洰閰嶇疆
    this._syncStateToProject();

    const storageKey = key || `editor_project_${this._projectManager.projectInfo.id}`;
    return this._projectManager.saveToLocal(storageKey);
  }

  /**
   * 浠庢湰鍦板姞杞介」鐩?   * @param {string} key - 瀛樺偍閿悕
   * @returns {Promise<Object>} 椤圭洰鏁版嵁
   */
  async loadProject(key = 'editor_project') {
    const data = this._projectManager.loadFromLocal(key);
    if (!data) return null;

    await this._restoreProjectState(data);

    return data;
  }

  /**
   * 瀵煎嚭椤圭洰鏂囦欢
   * @param {string} filename - 鏂囦欢鍚?   */
  exportProjectFile(filename?: string) {
    this._syncStateToProject();
    this._projectManager.exportProjectFile(filename || this._projectManager.getProjectName());
  }

  /**
   * 瀵煎嚭椤圭洰 ZIP 鍖咃紙project.json + models/*锛?   * @param {string} filename
   * @param {Object} options 閫忎紶鍒?ProjectManager.exportProjectPackage
   */
  async exportProjectPackage(filename: string, options: ProjectPackageOptions = {}) {
    this._syncStateToProject();
    return await this._projectManager.exportProjectPackage({
      filename: filename || this._projectManager.getProjectName(),
      ...options,
    });
  }

  /**
   * 瀵煎嚭鈥滄湰鍦板叏閲忓寘鈥?ZIP)锛歱roject.json + model/*
   * @param {string} filename
   * @param {Object} options 閫忎紶鍒?ProjectManager.exportLocalFullPackage
   */
  async exportLocalFullPackage(filename: string, options: ProjectPackageOptions = {}) {
    this._syncStateToProject();
    return await this._projectManager.exportLocalFullPackage({
      filename: filename || this._projectManager.getProjectName(),
      ...options,
    });
  }

  /**
   * 瀵煎叆椤圭洰鏂囦欢
   * @param {File} file - JSON 鏂囦欢
   * @returns {Promise<Object>} 椤圭洰鏁版嵁
   */
  async importProjectFile(file: File) {
    const data = await this._projectManager.importProjectFile(file);
    await this._restoreProjectState(data);
    return data;
  }

  /**
   * 鑾峰彇鏈湴椤圭洰鍒楄〃
   * @returns {Array} 椤圭洰鍒楄〃
   */
  getLocalProjectList() {
    return this._projectManager.getLocalProjectList();
  }

  /**
   * 鍒犻櫎鏈湴椤圭洰
   * @param {string} key - 瀛樺偍閿悕
   */
  deleteLocalProject(key: string) {
    this._projectManager.deleteLocalProject(key);
  }

  /**
   * 鑾峰彇椤圭洰鍚嶇О
   * @returns {string}
   */
  getProjectName() {
    return this._projectManager.getProjectName();
  }

  /**
   * 璁剧疆椤圭洰鍚嶇О
   * @param {string} name
   */
  setProjectName(name: string) {
    this._projectManager.setProjectName(name);
  }

  /**
   * 椤圭洰鏄惁鏈夋湭淇濆瓨鐨勪慨鏀?   * @returns {boolean}
   */
  isProjectDirty() {
    return this._projectManager.isDirty();
  }

  /**
   * 鑾峰彇椤圭洰绠＄悊鍣?   */
  getProjectManager() {
    return this._projectManager;
  }

  /**
   * 鍚屾褰撳墠鐘舵€佸埌椤圭洰閰嶇疆
   * @private
   */
  _syncStateToProject() {
    // 鍚屾妯″瀷閰嶇疆
    const meshes = this._meshes.filter((m) => !m.userData.isHelper);
    if (meshes.length > 0) {
      const mainMesh = meshes[0];
      const box = new THREE.Box3().setFromObject(mainMesh);
      const size = box.getSize(new THREE.Vector3());

      this._projectManager.updateFinalModelConfig({
        scale: mainMesh.scale.toArray(),
        boundingBox: size.toArray(),
      });
    }

    // 鍚屾鏂囧瓧閰嶇疆
    const projectConfig = this._projectManager.config as { texts: Array<Record<string, PrimitiveValue | number[]>> };
    projectConfig.texts = [];
    this._textObjects.forEach((textObj) => {
      const textColor = textObj.material?.color?.getHexString?.();
      this._projectManager.addTextConfig({
        id: textObj.id,
        displayName: textObj.displayName,
        content: textObj.content,
        font: textObj.config?.font,
        size: textObj.config?.size,
        thickness: textObj.config?.thickness,
        mode: textObj.mode,
        color: textColor ? `#${textColor}` : '#333333',
        position: textObj.mesh?.position?.toArray() || [0, 0, 0],
        rotation: textObj.mesh?.rotation?.toArray() || [0, 0, 0],
        featureName: textObj.featureName,
      });
    });

    // 鏇存柊灞炴€ф爣璇嗙
    this._projectManager.updatePropIdentifier();
  }

  /**
   * 浠庨」鐩暟鎹仮澶嶅満鏅姸鎬?   * @private
   */
  async _restoreProjectState(projectData: ProjectDataLike) {
    const config = projectData.config;

    // 娓呯悊褰撳墠鍦烘櫙
    this._clearScene();

    // 鍔犺浇鍘熷妯″瀷
    const originPath =
      this._projectManager?.resolveModelPath?.('origin') ||
      config?.models?.origin?.path ||
      config?.originModelPath;
    if (originPath) {
      try {
        await this.loadModel(originPath);
      } catch (error) {
        console.warn('[EditorViewer] 鍔犺浇鍘熷妯″瀷澶辫触:', error);
      }
    }

    // 鍔犺浇搴曞骇妯″瀷
    const basePath =
      this._projectManager?.resolveModelPath?.('base') ||
      config?.models?.base?.path ||
      config?.baseModelPath;
    if (basePath) {
      try {
        await this.loadModel(basePath, { name: 'base' });
      } catch (error) {
        console.warn('[EditorViewer] 鍔犺浇搴曞骇妯″瀷澶辫触:', error);
      }
    }

    // 鎭㈠鏂囧瓧
    // 娉ㄦ剰锛氭枃瀛楁仮澶嶉渶瑕佸厛鏈夋ā鍨嬪拰鐗瑰緛妫€娴嬪畬鎴?    // 杩欓噷鍙槸绀轰緥锛屽疄闄呭疄鐜板彲鑳介渶瑕佹洿澶嶆潅鐨勯€昏緫
    const textCount = Array.isArray(config?.texts) ? config.texts.length : 0;
    console.log('[EditorViewer] pending text restore count: ' + textCount);
  }

  /**
   * 娓呯悊鍦烘櫙
   * @private
   */
  _clearScene() {
    // 娓呯悊鏂囧瓧
    this._textObjects.forEach((textObj) => {
      this._surfaceTextManager?.deleteText(textObj.id);
    });
    this._textObjects = [];

    // 娓呯悊缃戞牸锛堜繚鐣欒緟鍔╁璞★級
    const meshesToRemove = this._meshes.filter((m) => !m.userData.isHelper);
    meshesToRemove.forEach((mesh) => this.removeMesh(mesh));

    // 娓呯悊鐗瑰緛缂撳瓨
    this._featureDetector?.clearCache();
  }

  // ==================== 鐗瑰緛妫€娴?====================

  /**
   * 鎵嬪姩瑙﹀彂鐗瑰緛妫€娴?   * @param {THREE.Mesh|THREE.Group} model - 妯″瀷
   * @param {string} modelId - 妯″瀷ID
   * @param {Object} options - 妫€娴嬮€夐」
   */
  async detectFeatures(
    model: THREE.Object3D,
    modelId?: string,
    options: DetectFeatureOptions = {}
  ) {
    const detector = this._featureDetector as FeatureDetectorLike | null;
    if (detector?.detect) {
      return await detector.detect(model, modelId, options);
    }

    return await super.detectFeatures(model);
  }

  /**
   * 鏍规嵁鐐瑰嚮鑾峰彇鐗瑰緛
   * @param {string} modelId - 妯″瀷ID
   * @param {THREE.Intersection} intersection - 灏勭嚎浜ょ偣
   */
  getFeatureAtIntersection(modelId: string, intersection: THREE.Intersection) {
    const detector = this._featureDetector as FeatureDetectorLike | null;
    return detector?.getFeatureAtIntersection?.(modelId, intersection) ?? null;
  }

  /**
   * 鑾峰彇妯″瀷鐨勬墍鏈夌壒寰?   * @param {string} modelId - 妯″瀷ID
   */
  getModelFeatures(modelId: string) {
    const detector = this._featureDetector as FeatureDetectorLike | null;
    return detector?.getModelFeatures?.(modelId) ?? null;
  }

  /**
   * 鑾峰彇閫傚悎娣诲姞鏂囧瓧鐨勮〃闈?   * @param {string} modelId - 妯″瀷ID
   * @param {Object} options - 绛涢€夐€夐」
   */
  getTextableSurfaces(modelId: string, options: DetectFeatureOptions = {}) {
    const detector = this._featureDetector as FeatureDetectorLike | null;
    return detector?.getTextableSurfaces?.(modelId, options) ?? [];
  }

  /**
   * 鑾峰彇鐗瑰緛妫€娴嬪櫒
   */
  getFeatureDetector() {
    return this._featureDetector;
  }

  // ==================== 闈㈡嬀鍙栫郴缁?====================

  /**
   * 鍒濆鍖栭潰鎷惧彇
   */
  initFacePicking() {
    if (this._facePicker) return this._facePicker;

    try {
      this._facePicker = new FacePicker(this.scene, this.camera, this.renderer, this.container);

      const validMeshes = this._meshes.filter((mesh) => FacePickingUtils.validateMesh(mesh));
      this._facePicker.setMeshes(validMeshes);

      this._setupFacePickingEvents();

      console.log('Face picking system initialized');
      return this._facePicker;
    } catch (error) {
      console.error('闈㈡嬀鍙栧垵濮嬪寲澶辫触:', error);
      return null;
    }
  }

  _setupFacePickingEvents() {
    if (!this._facePicker) return;

    this._facePicker.on('faceSelected', (faceInfo, originalEvent) => {
      this.events.emit('faceSelected', { faceInfo, originalEvent });

      // 濡傛灉鏂囧瓧妯″紡鍚敤锛岃浆鍙戠粰鏂囧瓧绯荤粺
      if (this._textModeEnabled && this._surfaceTextManager) {
        this._surfaceTextManager.handleFaceSelected(faceInfo, originalEvent);
      }
    });

    this._facePicker.on('faceDeselected', (faceInfo) => {
      this.events.emit('faceDeselected', { faceInfo });
    });

    this._facePicker.on('selectionCleared', () => {
      this.events.emit('faceSelectionCleared');
    });

    this._facePicker.on('faceHover', (faceInfo) => {
      this.events.emit('faceHover', { faceInfo });
    });

    this._facePicker.on('faceHoverEnd', () => {
      this.events.emit('faceHoverEnd');
    });
  }

  /**
   * 鍚敤闈㈡嬀鍙?   */
  enableFacePicking() {
    if (!this._facePicker) {
      this.initFacePicking();
    }
    if (this._facePicker) {
      this._facePicker.enable();
      this._facePickingEnabled = true;
      this.events.emit('facePickingEnabled');
    }
  }

  /**
   * 绂佺敤闈㈡嬀鍙?   */
  disableFacePicking() {
    if (this._facePicker) {
      this._facePicker.disable();
      this._facePickingEnabled = false;
      this.events.emit('facePickingDisabled');
    }
  }

  /**
   * 鑾峰彇闈㈡嬀鍙栧櫒
   */
  getFacePicker() {
    return this._facePicker;
  }

  // ==================== 鏂囧瓧绯荤粺 ====================

  /**
   * 鍒濆鍖栨枃瀛楃郴缁?   */
  _getTextTargetMeshes() {
    const root = this.entityGroup || this.scene;
    const meshes: THREE.Mesh[] = [];
    root?.traverse?.((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData?.isHelper) return;
      if (mesh.userData?.isTextObject) return;
      meshes.push(mesh);
    });
    return meshes;
  }

  initTextSystem() {
    if (this._surfaceTextManager) return this._surfaceTextManager;

    try {
      this._surfaceTextManager = new SurfaceTextManager(
        this.entityGroup || this.scene,
        this.camera,
        this.renderer,
        this.container,
        null // 涓嶄緷璧?facePicker
      );

      this._surfaceTextManager.setTargetMeshes(this._getTextTargetMeshes());
      this._surfaceTextManager.enableClickListener();

      this._setupTextSystemEvents();

      console.log('鏂囧瓧绯荤粺宸插垵濮嬪寲');
      return this._surfaceTextManager;
    } catch (error) {
      console.error('鏂囧瓧绯荤粺鍒濆鍖栧け璐?', error);
      return null;
    }
  }

  _setupTextSystemEvents() {
    if (!this._surfaceTextManager) return;

    this._surfaceTextManager.on('textCreated', (textObject) => {
      this._textObjects.push(textObject);
      this.events.emit('textCreated', { textObject });
    });

    this._surfaceTextManager.on('textSelected', (textObject) => {
      this._selectedTextId = textObject.id;
      this.events.emit('textSelected', { textObject });
    });

    this._surfaceTextManager.on('textDeselected', (textObject) => {
      this._selectedTextId = null;
      this.events.emit('textDeselected', { textObject });
    });

    this._surfaceTextManager.on('textDeleted', ({ id, textObject }) => {
      const index = this._textObjects.findIndex((obj) => obj.id === id);
      if (index !== -1) {
        this._textObjects.splice(index, 1);
      }
      if (this._selectedTextId === id) {
        this._selectedTextId = null;
      }
      this.events.emit('textDeleted', { id, textObject });
    });

    this._surfaceTextManager.on('textContentUpdated', (data) => {
      this.events.emit('textContentUpdated', data);
    });

    this._surfaceTextManager.on('textConfigUpdated', (data) => {
      this.events.emit('textConfigUpdated', data);
    });

    this._surfaceTextManager.on('textColorUpdated', (data) => {
      this.events.emit('textColorUpdated', data);
    });

    this._surfaceTextManager.on('textModeChanged', (data) => {
      this.events.emit('textModeChanged', data);
    });

    this._surfaceTextManager.on('textModeEnabled', () => {
      this._textModeEnabled = true;
      this.events.emit('textModeEnabled');
    });

    this._surfaceTextManager.on('textModeDisabled', () => {
      this._textModeEnabled = false;
      this.events.emit('textModeDisabled');
    });

    const transformControls = this._surfaceTextManager.transformControls as {
      on?: (eventName: string, callback: (isDragging: boolean) => void) => void;
      addEventListener?: (eventName: string, callback: (event: { value: boolean }) => void) => void;
      controls?: {
        addEventListener?: (
          eventName: string,
          callback: (event: { value: boolean }) => void
        ) => void;
      };
    } | null;
    if (transformControls) {
      if (typeof transformControls.on === 'function') {
        transformControls.on('dragging-changed', (isDragging) => {
          this.setControlsEnabled(!isDragging);
        });
      } else if (typeof transformControls.addEventListener === 'function') {
        transformControls.addEventListener('dragging-changed', (event) => {
          this.setControlsEnabled(!event.value);
        });
      } else if (typeof transformControls.controls?.addEventListener === 'function') {
        transformControls.controls.addEventListener('dragging-changed', (event) => {
          this.setControlsEnabled(!event.value);
        });
      }
    }
  }

  /**
   * 鍚敤鏂囧瓧娣诲姞妯″紡
   */
  enableTextMode() {
    if (!this._surfaceTextManager) {
      this.initTextSystem();
    }
    if (this._surfaceTextManager) {
      this._surfaceTextManager.enableTextMode();
    }
  }

  /**
   * 绂佺敤鏂囧瓧娣诲姞妯″紡
   */
  disableTextMode() {
    if (this._surfaceTextManager) {
      this._surfaceTextManager.disableTextMode();
    }
  }

  /**
   * 鍒涘缓鏂囧瓧
   */
  async createText(content: string, faceInfo: Record<string, PrimitiveValue | object>) {
    if (!this._surfaceTextManager) {
      this.initTextSystem();
    }
    return this._surfaceTextManager?.createTextObject(content, faceInfo);
  }

  /**
   * 鏇存柊鏂囧瓧鍐呭
   */
  async updateTextContent(textId: string, content: string) {
    return this._surfaceTextManager?.updateTextContent(textId, content);
  }

  /**
   * 鏇存柊鏂囧瓧棰滆壊
   */
  updateTextColor(textId: string, color: string | number) {
    const colorHex = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
    this._surfaceTextManager?.updateTextColor(textId, colorHex);
  }

  /**
   * 鏇存柊鏂囧瓧閰嶇疆
   */
  async updateTextConfig(textId: string, config: TextObjectConfig) {
    return this._surfaceTextManager?.updateTextConfig(textId, config);
  }

  /**
   * 鍒囨崲鏂囧瓧妯″紡锛堝嚫璧?鍐呭祵锛?   */
  async switchTextMode(textId: string, mode: TextMode) {
    return this._surfaceTextManager?.switchTextMode(textId, mode);
  }

  /**
   * 鍒犻櫎鏂囧瓧
   */
  async deleteText(textId: string) {
    return await this._surfaceTextManager?.deleteText(textId);
  }

  /**
   * 鑾峰彇鏂囧瓧蹇収锛堢敤浜庢挙閿€/閲嶅仛锛?   */
  getTextSnapshot(textId: string) {
    return this._surfaceTextManager?.getTextSnapshot?.(textId) || null;
  }

  /**
   * 浠庡揩鐓ф仮澶嶆枃瀛楋紙鐢ㄤ簬鎾ら攢/閲嶅仛锛?   */
  async restoreText(snapshot: Record<string, PrimitiveValue | number[] | object>) {
    if (!this._surfaceTextManager) {
      this.initTextSystem();
    }
    return await this._surfaceTextManager?.restoreText?.(snapshot);
  }

  /**
   * 閫夋嫨鏂囧瓧
   */
  selectText(textId: string) {
    this._surfaceTextManager?.selectText(textId);
  }

  /**
   * 鑾峰彇鏂囧瓧瀵硅薄鍒楄〃
   */
  getTextObjects() {
    return [...this._textObjects];
  }

  /**
   * 鑾峰彇閫変腑鐨勬枃瀛楀璞?   */
  getSelectedTextObject() {
    return this._surfaceTextManager?.getSelectedTextObject();
  }

  /**
   * 鑾峰彇鏂囧瓧绠＄悊鍣?   */
  getTextManager() {
    return this._surfaceTextManager;
  }

  // ==================== 鐗╀綋閫夋嫨绯荤粺 ====================

  /**
   * 鍒濆鍖栫墿浣撻€夋嫨
   */
  initObjectSelection() {
    if (this._objectSelectionManager) return this._objectSelectionManager;

    try {
      this._objectSelectionManager = new ObjectSelectionManager(
        this.scene,
        this.camera,
        this.renderer,
        this.renderer.domElement
      );

      const selectableObjects = this._meshes.filter((mesh) => !mesh.userData.isHelper);
      this._objectSelectionManager.setSelectableObjects(selectableObjects);

      this._setupObjectSelectionEvents();

      console.log('鐗╀綋閫夋嫨绯荤粺宸插垵濮嬪寲');
      return this._objectSelectionManager;
    } catch (error) {
      console.error('鐗╀綋閫夋嫨绯荤粺鍒濆鍖栧け璐?', error);
      return null;
    }
  }

  _setupObjectSelectionEvents() {
    if (!this._objectSelectionManager) return;
    const outlineHelpers = this as {
      setOutlineSelection?: (object: THREE.Object3D) => void;
      clearOutlineSelection?: () => void;
    };

    this._objectSelectionManager.on('objectSelected', (object) => {
      this.events.emit('objectSelected', { object });
      outlineHelpers.setOutlineSelection?.(object);
    });

    this._objectSelectionManager.on('objectDeselected', (object) => {
      this.events.emit('objectDeselected', { object });
      outlineHelpers.clearOutlineSelection?.();
    });

    this._objectSelectionManager.on('selectionCleared', () => {
      this.events.emit('objectSelectionCleared');
      outlineHelpers.clearOutlineSelection?.();
    });

    this._objectSelectionManager.on('draggingChanged', (isDragging) => {
      this.setControlsEnabled(!isDragging);
      this.events.emit('objectDragging', { isDragging });
    });

    this._objectSelectionManager.on('objectTransformed', (data) => {
      this.events.emit('objectTransformed', data);
    });

    this._objectSelectionManager.on('transformModeChanged', (mode) => {
      this.events.emit('transformModeChanged', { mode });
    });
  }

  /**
   * 鍚敤鐗╀綋閫夋嫨
   */
  enableObjectSelection() {
    if (!this._objectSelectionManager) {
      this.initObjectSelection();
    }
    if (this._objectSelectionManager) {
      this._objectSelectionManager.enable();
      this._objectSelectionEnabled = true;
      this.events.emit('objectSelectionEnabled');
    }
  }

  /**
   * 绂佺敤鐗╀綋閫夋嫨
   */
  disableObjectSelection() {
    if (this._objectSelectionManager) {
      this._objectSelectionManager.disable();
      this._objectSelectionEnabled = false;
      const outlineHelpers = this as { clearOutlineSelection?: () => void };
      outlineHelpers.clearOutlineSelection?.();
      this.events.emit('objectSelectionDisabled');
    }
  }

  /**
   * 璁剧疆鍙樻崲妯″紡
   */
  setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
    this._objectSelectionManager?.setTransformMode(mode);
  }

  /**
   * 鑾峰彇鐗╀綋閫夋嫨绠＄悊鍣?   */
  getObjectSelectionManager() {
    return this._objectSelectionManager;
  }

  // ==================== 閲嶅啓鐖剁被鏂规硶 ====================

  /**
   * 娣诲姞缃戞牸鏃跺悓姝ュ埌瀛愮郴缁?   */
  addMesh(mesh: EditorViewerMesh, options: AddMeshOptions = {}) {
    const result = super.addMesh(mesh, options);

    // 鍚屾鍒伴潰鎷惧彇
    if (this._facePicker && FacePickingUtils.validateMesh(mesh)) {
      this._facePicker.addMesh?.(mesh);
    }

    if (this._surfaceTextManager) {
      this._surfaceTextManager.setTargetMeshes(this._getTextTargetMeshes());
    }

    // 鍚屾鍒扮墿浣撻€夋嫨
    if (this._objectSelectionManager && !mesh.userData.isHelper) {
      this._objectSelectionManager.addSelectableObject(mesh);
    }

    return result;
  }

  /**
   * 绉婚櫎缃戞牸鏃跺悓姝ュ埌瀛愮郴缁?   */
  removeMesh(mesh: EditorViewerMesh) {
    if (this._facePicker) {
      this._facePicker.removeMesh?.(mesh);
    }

    if (this._objectSelectionManager) {
      this._objectSelectionManager.removeSelectableObject(mesh);
    }

    super.removeMesh(mesh);
  }

  /**
   * 閿€姣佹椂娓呯悊瀛愮郴缁?   */
  dispose() {
    if (this._loaderManager) {
      this._loaderManager.dispose();
      this._loaderManager = null;
    }

    if (this._exportManager) {
      this._exportManager.dispose();
      this._exportManager = null;
    }

    if (this._projectManager) {
      this._projectManager.dispose();
      this._projectManager = null;
    }

    if (this._featureDetector) {
      this._featureDetector.clearCache();
      this._featureDetector = null;
    }

    if (this._facePicker) {
      this._facePicker.destroy();
      this._facePicker = null;
    }

    if (this._surfaceTextManager) {
      this._surfaceTextManager.destroy?.();
      this._surfaceTextManager = null;
    }

    if (this._objectSelectionManager) {
      this._objectSelectionManager.destroy();
      this._objectSelectionManager = null;
    }

    this._textObjects = [];

    super.dispose();
  }
}

export default EditorViewer;
