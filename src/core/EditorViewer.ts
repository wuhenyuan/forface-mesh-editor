/**
 * 编辑器专Viewer
 * 在基硢 Viewer 上集成面拾取、文字系统物体择等功 */
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
  entityObject?: {
    position?: { toArray?: () => number[] };
    rotation?: { toArray?: () => number[] };
  };
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

type ViewerClickPayload = {
  event?: MouseEvent;
  [key: string]: PrimitiveValue | number[] | object | null | undefined;
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
  _viewerClickUnsubscribe: (() => void) | null;

  constructor(container: HTMLElement, options: EditorViewerOptions = {}) {
    super(container, options);

    this._loaderManager = null;
    this._exportManager = null;
    this._projectManager = null;
    this._featureDetector = null;

    this._facePicker = null;
    this._surfaceTextManager = null;
    this._objectSelectionManager = null;

    // 文字对象列表
    this._textObjects = [];
    this._selectedTextId = null;

    this._textModeEnabled = false;
    this._facePickingEnabled = false;
    this._objectSelectionEnabled = false;
    this._viewerClickUnsubscribe = null;

    // 初始化核心子系统
    this._initCoreSubsystems();
    this._setupViewerClickRouting();
  }

  // ==================== 核心子系统 ====================

  /**
   * 初始化核心子系统
   */
  _initCoreSubsystems() {
    // 特征检测器
    this._featureDetector = new FeatureDetector();

    this._loaderManager = new LoaderManager();
    this._loaderManager.setFeatureDetector(this._featureDetector);

    this._exportManager = new ExportManager();

    this._projectManager = new ProjectManager();

    // 设置加载事件
    this._loaderManager.onProgress = (progress) => {
      this.events.emit('loadProgress', progress);
    };
    this._loaderManager.onError = (error) => {
      this.events.emit('loadError', { error });
    };

    // 设置导出事件
    this._exportManager.onProgress = (progress) => {
      this.events.emit('exportProgress', progress);
    };
    this._exportManager.onError = (error) => {
      this.events.emit('exportError', { error });
    };

    // 设置项目管理事件
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

  _setupViewerClickRouting() {
    if (this._viewerClickUnsubscribe) {
      this._viewerClickUnsubscribe();
    }

    this._viewerClickUnsubscribe = this.events.on('click', async (payload?: ViewerEventPayload) => {
      const clickPayload = (payload || {}) as ViewerClickPayload;
      const event = clickPayload.event;
      if (!event) return;

      const surfaceTextManager = this._surfaceTextManager as {
        _onCanvasClick?: (mouseEvent: MouseEvent) => Promise<void> | void;
      } | null;
      try {
        await Promise.resolve(surfaceTextManager?._onCanvasClick?.(event));
      } catch (error) {
        console.error('[EditorViewer] surface text click handling failed', error);
      }

      if ((event as CoreValue)?.__surfaceTextHandled) {
        return;
      }

      const objectSelectionManager = this._objectSelectionManager as {
        objectSelector?: {
          handleClick?: (mouseEvent: MouseEvent) => void;
        };
      } | null;
      objectSelectionManager?.objectSelector?.handleClick?.(event);
    });
  }

  // ==================== 模型加载 ====================

  /**
   * 加载模型（统一入口）
   * @param {string|File|Blob} source - 文件路径或文件对象
   * @param {Object} options - 加载选项
   * @returns {Promise<Object>} 加载结果
   */
  async loadModel(source: ModelSource, options: LoadModelOptions = {}) {
    const { addToScene = true, detectFeatures = false, ...loaderOptions } = options;

    try {
      // 使用 LoaderManager 加载
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
   * 获取加载管理器
   */
  getLoaderManager() {
    return this._loaderManager;
  }

  // ==================== 模型导出 ====================

  /**
   * 导出模型
   * @param {THREE.Object3D|THREE.Object3D[]} objects - 要导出的对象
   * @param {string} format - 导出格式: 'stl' | 'obj' | 'gltf' | 'glb'
   * @param {Object} options - 导出选项
   * @returns {Promise<Blob>} 导出结果
   */
  async exportModel(
    objects: THREE.Object3D | THREE.Object3D[],
    format: string,
    options: ExportOptions = {}
  ) {
    return this._exportManager.export(objects, format, options);
  }

  /**
   * 导出并下载模型
   * @param {THREE.Object3D|THREE.Object3D[]} objects - 要导出的对象
   * @param {string} format - 导出格式
   * @param {string} filename - 文件名（不含扩展名）
   * @param {Object} options - 导出选项
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
   * 导出场景中的所有网格
   * @param {string} format - 导出格式
   * @param {string} filename - 文件
   * @param {Object} options - 导出选项
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
   * 导出选中的对象
   * @param {string} format - 导出格式
   * @param {string} filename - 文件
   * @param {Object} options - 导出选项
   */
  async exportSelected(format: string, filename: string = 'selected', options: ExportOptions = {}) {
    const selected = this.getSelectedObject();
    if (!selected) {
      throw new Error('No selected object');
    }

    await this._exportManager.exportAndDownload(selected, format, filename, options);
    this.events.emit('selectedExported', { format, filename, object: selected });
  }

  /**
   * 导出所有网格（合并后）
   * @param {string} format - 导出格式
   * @param {string} filename - 文件
   * @param {Object} options - 导出选项
   */
  async exportMerged(format: string, filename: string = 'merged', options: ExportOptions = {}) {
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
   * 获取支持的导出格式
   * @returns {Object[]} 格式列表
   */
  getSupportedExportFormats() {
    return this._exportManager.getSupportedFormats();
  }

  /**
   * 估算导出文件大小
   * @param {THREE.Object3D|THREE.Object3D[]} objects - 要导出的对象
   * @param {string} format - 导出格式
   * @returns {Object} 估算信息
   */
  estimateExportSize(objects: THREE.Object3D | THREE.Object3D[], format: string) {
    return this._exportManager.estimateExportSize(objects, format);
  }

  /**
   * 获取导出管理
   */
  getExportManager() {
    return this._exportManager;
  }

  // ==================== 项目管理 ====================

  /**
   * 创建新项目
   * @param {Object} options - 项目选项
   * @returns {Object} 项目数据
   */
  createProject(options: CreateProjectOptions = {}) {
    // 清理当前场景
    this._clearScene();

    const project = this._projectManager.createProject(options);

    this.events.emit('projectCreated', project);
    return project;
  }

  /**
   * 保存项目到本地
   * @param {string} key - 存储键名（可选）
   * @returns {boolean} 是否成功
   */
  saveProject(key?: string) {
    // 同步当前状态到项目配置
    this._syncStateToProject();

    const storageKey = key || `editor_project_${this._projectManager.projectInfo.id}`;
    return this._projectManager.saveToLocal(storageKey);
  }

  /**
   * 从本地加载项目
   * @param {string} key - 存储键名
   * @returns {Promise<Object>} 项目数据
   */
  async loadProject(key = 'editor_project') {
    const data = this._projectManager.loadFromLocal(key);
    if (!data) return null;

    await this._restoreProjectState(data);

    return data;
  }

  /**
   * 导出项目文件
   * @param {string} filename - 文件
   */
  exportProjectFile(filename?: string) {
    this._syncStateToProject();
    this._projectManager.exportProjectFile(filename || this._projectManager.getProjectName());
  }

  /**
   * 导出项目 ZIP 包（project.json + models/*）
   * @param {string} filename
   * @param {Object} options 透传ProjectManager.exportProjectPackage
   */
  async exportProjectPackage(filename: string, options: ProjectPackageOptions = {}) {
    this._syncStateToProject();
    return await this._projectManager.exportProjectPackage({
      filename: filename || this._projectManager.getProjectName(),
      ...options,
    });
  }

  /**
   * 导出本地全量包 ZIP（project.json + model/*）
   * @param {string} filename
   * @param {Object} options 透传ProjectManager.exportLocalFullPackage
   */
  async exportLocalFullPackage(filename: string, options: ProjectPackageOptions = {}) {
    this._syncStateToProject();
    return await this._projectManager.exportLocalFullPackage({
      filename: filename || this._projectManager.getProjectName(),
      ...options,
    });
  }

  /**
   * 导入项目文件
   * @param {File} file - JSON 文件
   * @returns {Promise<Object>} 项目数据
   */
  async importProjectFile(file: File) {
    const data = await this._projectManager.importProjectFile(file);
    await this._restoreProjectState(data);
    return data;
  }

  /**
   * 获取本地项目列表
   * @returns {Array} 项目列表
   */
  getLocalProjectList() {
    return this._projectManager.getLocalProjectList();
  }

  /**
   * 删除本地项目
   * @param {string} key - 存储键名
   */
  deleteLocalProject(key: string) {
    this._projectManager.deleteLocalProject(key);
  }

  /**
   * 获取项目名称
   * @returns {string}
   */
  getProjectName() {
    return this._projectManager.getProjectName();
  }

  /**
   * 设置项目名称
   * @param {string} name
   */
  setProjectName(name: string) {
    this._projectManager.setProjectName(name);
  }

  /**
   * 项目是否有未保存的修改
   * @returns {boolean}
   */
  isProjectDirty() {
    return this._projectManager.isDirty();
  }

  /**
   * 获取项目管理
   */
  getProjectManager() {
    return this._projectManager;
  }

  /**
   * 同步当前状态到项目配置
   * @private
   */
  _syncStateToProject() {
    // 同步模型配置
    const meshes = this._meshes.filter((m) => !m.userData.isHelper && !m.userData.isTextObject);
    if (meshes.length > 0) {
      const mainMesh = meshes[0];
      const box = new THREE.Box3().setFromObject(mainMesh);
      const size = box.getSize(new THREE.Vector3());

      this._projectManager.updateFinalModelConfig({
        scale: mainMesh.scale.toArray(),
        boundingBox: size.toArray(),
      });
    }

    // 同步文字配置
    const projectConfig = this._projectManager.config as {
      texts: Array<Record<string, PrimitiveValue | number[]>>;
    };
    projectConfig.texts = [];
    this._textObjects.forEach((textObj) => {
      const textColor = textObj.material?.color?.getHexString?.();
      const transformSource = textObj.entityObject || textObj.mesh;
      this._projectManager.addTextConfig({
        id: textObj.id,
        displayName: textObj.displayName,
        content: textObj.content,
        font: textObj.config?.font,
        size: textObj.config?.size,
        thickness: textObj.config?.thickness,
        mode: textObj.mode,
        color: textColor ? `#${textColor}` : '#333333',
        position: transformSource?.position?.toArray?.() || [0, 0, 0],
        rotation: transformSource?.rotation?.toArray?.() || [0, 0, 0],
        featureName: textObj.featureName,
      });
    });

    // 更新属性标识符
    this._projectManager.updatePropIdentifier();
  }

  /**
   * 从项目数据恢复场景状态
   * @private
   */
  async _restoreProjectState(projectData: ProjectDataLike) {
    const config = projectData.config;

    // 清理当前场景
    this._clearScene();

    // 加载原始模型
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

    // 加载底座模型
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

    // 恢复文字
    // 注意：文字恢复需要先完成模型和特征检测
    // 这里只是示例，实际实现可能需要更复杂的逻辑
    const textCount = Array.isArray(config?.texts) ? config.texts.length : 0;
    console.log('[EditorViewer] pending text restore count: ' + textCount);
  }

  /**
   * 清理场景
   * @private
   */
  _clearScene() {
    // 清理文字
    this._textObjects.forEach((textObj) => {
      this._surfaceTextManager?.deleteText(textObj.id);
    });
    this._textObjects = [];

    // 清理网格（保留辅助对象）
    const meshesToRemove = this._meshes.filter((m) => !m.userData.isHelper && !m.userData.isTextObject);
    meshesToRemove.forEach((mesh) => this.removeMesh(mesh));

    // 清理特征缓存
    this._featureDetector?.clearCache();
  }

  // ==================== 特征检测 ====================

  /**
   * 手动触发特征检测
   * @param {THREE.Mesh|THREE.Group} model - 模型
   * @param {string} modelId - 模型ID
   * @param {Object} options - 检测选项
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
   * 根据点击获取特征
   * @param {string} modelId - 模型ID
   * @param {THREE.Intersection} intersection - 射线交点
   */
  getFeatureAtIntersection(modelId: string, intersection: THREE.Intersection) {
    const detector = this._featureDetector as FeatureDetectorLike | null;
    return detector?.getFeatureAtIntersection?.(modelId, intersection) ?? null;
  }

  /**
   * 获取模型的所有特征
   * @param {string} modelId - 模型ID
   */
  getModelFeatures(modelId: string) {
    const detector = this._featureDetector as FeatureDetectorLike | null;
    return detector?.getModelFeatures?.(modelId) ?? null;
  }

  /**
   * 获取适合添加文字的表面
   * @param {string} modelId - 模型ID
   * @param {Object} options - 选项
   */
  getTextableSurfaces(modelId: string, options: DetectFeatureOptions = {}) {
    const detector = this._featureDetector as FeatureDetectorLike | null;
    return detector?.getTextableSurfaces?.(modelId, options) ?? [];
  }

  /**
   * 获取特征检测器
   */
  getFeatureDetector() {
    return this._featureDetector;
  }

  // ==================== 面拾取系统 ====================

  /**
   * 初始化面拾取
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

      // 如果文字模式启用，转发给文字系统
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
   * 启用面拾取
   */
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
   * 禁用面拾取
   */
  disableFacePicking() {
    if (this._facePicker) {
      this._facePicker.disable();
      this._facePickingEnabled = false;
      this.events.emit('facePickingDisabled');
    }
  }

  /**
   * 获取面拾取器
   */
  getFacePicker() {
    return this._facePicker;
  }

  // ==================== 文字系统 ====================

  /**
   * 初始化文字系统
   */
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
        null // 不依赖 facePicker
      );

      this._surfaceTextManager.setTargetMeshes(this._getTextTargetMeshes());
      this._surfaceTextManager.setEntitySelectionBridge?.({
        addEntityObject: (entityObject: THREE.Object3D) => {
          this.addMesh(entityObject as EditorViewerMesh, {
            selectable: true,
            castShadow: false,
            receiveShadow: false,
          });
        },
        removeEntityObject: (entityObject: THREE.Object3D) => {
          this.removeMesh(entityObject as EditorViewerMesh);
        },
        selectEntityObject: (entityObject: THREE.Object3D | null) => {
          if (!entityObject) return;
          if (!this._objectSelectionManager) {
            this.initObjectSelection();
          }
          if (!this._objectSelectionEnabled) {
            this.enableObjectSelection();
          }
          this._objectSelectionManager?.selectObject?.(entityObject);
        },
        clearEntitySelection: () => {
          this._objectSelectionManager?.clearSelection?.();
        },
        refreshEntityObjectSession: (entityObject: THREE.Object3D | null) => {
          if (!entityObject || !this._objectSelectionManager) return;
          if (this._objectSelectionManager.getSelectedObject?.() !== entityObject) return;
          this._objectSelectionManager.beginTransformSession?.([entityObject]);
        },
      });

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
   * 启用文字添加模式
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
   * 禁用文字添加模式
   */
  disableTextMode() {
    if (this._surfaceTextManager) {
      this._surfaceTextManager.disableTextMode();
    }
  }

  /**
   * 创建文字
   */
  async createText(content: string, faceInfo: Record<string, PrimitiveValue | object>) {
    if (!this._surfaceTextManager) {
      this.initTextSystem();
    }
    return this._surfaceTextManager?.createTextObject(content, faceInfo);
  }

  /**
   * 更新文字内容
   */
  async updateTextContent(textId: string, content: string) {
    return this._surfaceTextManager?.updateTextContent(textId, content);
  }

  /**
   * 更新文字颜色
   */
  updateTextColor(textId: string, color: string | number) {
    const colorHex = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
    this._surfaceTextManager?.updateTextColor(textId, colorHex);
  }

  /**
   * 更新文字配置
   */
  async updateTextConfig(textId: string, config: TextObjectConfig) {
    return this._surfaceTextManager?.updateTextConfig(textId, config);
  }

  /**
   * 切换文字模式（凸起/内嵌）
   */
  async switchTextMode(textId: string, mode: TextMode) {
    return this._surfaceTextManager?.switchTextMode(textId, mode);
  }

  /**
   * 删除文字
   */
  async deleteText(textId: string) {
    return await this._surfaceTextManager?.deleteText(textId);
  }

  /**
   * 获取文字快照（用于撤销/重做）
   */
  getTextSnapshot(textId: string) {
    return this._surfaceTextManager?.getTextSnapshot?.(textId) || null;
  }

  /**
   * 从快照恢复文字（用于撤销/重做
   */
  async restoreText(snapshot: Record<string, PrimitiveValue | number[] | object>) {
    if (!this._surfaceTextManager) {
      this.initTextSystem();
    }
    return await this._surfaceTextManager?.restoreText?.(snapshot);
  }

  /**
   * 选择文字
   */
  selectText(textId: string) {
    this._surfaceTextManager?.selectText(textId);
  }

  /**
   * 获取文字对象列表
   */
  getTextObjects() {
    return [...this._textObjects];
  }

  /**
   * 获取选中的文字对象
   */
  getSelectedTextObject() {
    return this._surfaceTextManager?.getSelectedTextObject();
  }

  /**
   * 获取文字管理器
   */
  getTextManager() {
    return this._surfaceTextManager;
  }

  // ==================== 物体选择系统 ====================

  /**
   * 初始化物体选择
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

  _resolveTextIdFromObject(target: THREE.Object3D | null) {
    if (!target) return null;
    const directTextId = target.userData?.textId;
    if (typeof directTextId === 'string' && directTextId) {
      return directTextId;
    }

    let matchedTextId: string | null = null;
    target.traverse?.((child: THREE.Object3D) => {
      if (matchedTextId) return;
      const childTextId = child.userData?.textId;
      if (typeof childTextId === 'string' && childTextId) {
        matchedTextId = childTextId;
      }
    });
    return matchedTextId;
  }

  _setupObjectSelectionEvents() {
    if (!this._objectSelectionManager) return;
    const outlineHelpers = this as {
      setOutlineSelection?: (object: THREE.Object3D) => void;
      clearOutlineSelection?: () => void;
    };

    this._objectSelectionManager.on('objectSelected', (object) => {
      const textId = this._resolveTextIdFromObject(object);
      if (textId && this._selectedTextId !== textId) {
        this._surfaceTextManager?.selectText?.(textId, { syncEntitySelection: false });
      } else if (!textId && this._selectedTextId) {
        this._surfaceTextManager?.deselectText?.(true, { syncEntitySelection: false });
      }

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

    this._objectSelectionManager.on('transform:start', (payload) => {
      this.events.emit('transform:start', payload);
    });

    this._objectSelectionManager.on('transform:preview', (payload) => {
      this.events.emit('transform:preview', payload);
    });

    this._objectSelectionManager.on('transform:commit', (payload) => {
      this.events.emit('transform:commit', payload);
    });

    this._objectSelectionManager.on('transform:cancel', (payload) => {
      this.events.emit('transform:cancel', payload);
    });

    this._objectSelectionManager.on('bbox:updated', (payload) => {
      this.events.emit('bbox:updated', payload);
    });
  }

  _disableObjectSelectorNativeClick() {
    const objectSelectionManager = this._objectSelectionManager as {
      objectSelector?: {
        domElement?: HTMLElement;
        handleClick?: (mouseEvent: MouseEvent) => void;
      };
    } | null;

    const objectSelector = objectSelectionManager?.objectSelector;
    const domElement = objectSelector?.domElement;
    const handleClick = objectSelector?.handleClick;
    if (domElement && typeof handleClick === 'function') {
      domElement.removeEventListener('click', handleClick);
    }
  }

  /**
   * 启用物体选择
   */
  enableObjectSelection() {
    if (!this._objectSelectionManager) {
      this.initObjectSelection();
    }
    if (this._objectSelectionManager) {
      this._objectSelectionManager.enable();
      this._disableObjectSelectorNativeClick();
      this._objectSelectionEnabled = true;
      this.events.emit('objectSelectionEnabled');
    }
  }

  /**
   * 禁用物体选择
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
   * 设置变换模式
   */
  setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
    this._objectSelectionManager?.setTransformMode(mode);
  }

  /**
   * 获取物体选择管理
   */
  getObjectSelectionManager() {
    return this._objectSelectionManager;
  }

  // ==================== 重写父类方法 ====================

  /**
   * 添加网格时同步到子系统
   */
  addMesh(mesh: EditorViewerMesh, options: AddMeshOptions = {}) {
    const result = super.addMesh(mesh, options);

    // 同步到面拾取
    if (this._facePicker && FacePickingUtils.validateMesh(mesh)) {
      this._facePicker.addMesh?.(mesh);
    }

    if (this._surfaceTextManager) {
      this._surfaceTextManager.setTargetMeshes(this._getTextTargetMeshes());
    }

    // 同步到物体选择
    if (this._objectSelectionManager && !mesh.userData.isHelper) {
      this._objectSelectionManager.addSelectableObject(mesh);
    }

    return result;
  }

  /**
   * 移除网格时同步到子系统
   */
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
   * 销毁时清理子系统
   */
  dispose() {
    if (this._viewerClickUnsubscribe) {
      this._viewerClickUnsubscribe();
      this._viewerClickUnsubscribe = null;
    }

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
