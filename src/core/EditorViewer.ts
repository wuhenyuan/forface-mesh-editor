/**
 * 编辑器专用 Viewer
 * 简化版本 - 基于新架构
 */
import * as THREE from 'three';
import { Viewer } from './Viewer';
import { LoaderManager } from './LoaderManager';
import { ExportManager } from './ExportManager';
import { ProjectManager } from './ProjectManager';

export class EditorViewer extends Viewer {
  _loaderManager: LoaderManager | null = null;
  _exportManager: ExportManager | null = null;
  _projectManager: ProjectManager | null = null;
  _meshes: THREE.Mesh[] = [];

  constructor(container: HTMLElement, options: Record<string, any> = {}) {
    super(container, options);

    // 初始化核心子系统
    this._initCoreSubsystems();
  }

  /**
   * 初始化核心子系统
   */
  _initCoreSubsystems() {
    // 加载管理器
    this._loaderManager = new LoaderManager();

    // 导出管理器
    this._exportManager = new ExportManager();

    // 项目管理器
    this._projectManager = new ProjectManager();

    // 设置加载事件
    this._loaderManager.onProgress = (progress: any) => {
      this.events.emit('loadProgress', progress);
    };
    this._loaderManager.onError = (error: any) => {
      this.events.emit('loadError', { error });
    };

    // 设置导出事件
    this._exportManager.onProgress = (progress: any) => {
      this.events.emit('exportProgress', progress);
    };
    this._exportManager.onError = (error: any) => {
      this.events.emit('exportError', { error });
    };

    // 设置项目管理事件
    this._projectManager.onChange = (event: any) => {
      this.events.emit('projectChanged', event);
    };
    this._projectManager.onSave = (event: any) => {
      this.events.emit('projectSaved', event);
    };
    this._projectManager.onLoad = (event: any) => {
      this.events.emit('projectLoaded', event);
    };
  }

  // ==================== 模型加载 ====================

  /**
   * 加载模型（统一入口）
   */
  async loadModel(source: any, options: Record<string, any> = {}) {
    const { addToScene = true, ...loaderOptions } = options;

    try {
      const result = await this._loaderManager!.load(source, loaderOptions);

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
      });

      return result;
    } catch (error) {
      console.error('[EditorViewer] 模型加载失败:', error);
      throw error;
    }
  }

  getLoaderManager() {
    return this._loaderManager;
  }

  // ==================== 模型导出 ====================

  async exportModel(objects: any, format: string, options: Record<string, any> = {}) {
    return this._exportManager!.export(objects, format, options);
  }

  async exportAndDownload(
    objects: any,
    format: string,
    filename: string = 'model',
    options: Record<string, any> = {}
  ) {
    await this._exportManager!.exportAndDownload(objects, format, filename, options);
    this.events.emit('modelExported', { format, filename });
  }

  async exportScene(
    format: string,
    filename: string = 'scene',
    model = undefined,
    options: Record<string, any> = {}
  ) {
    const targetModel = model ?? this.scene;
    const blob = await this._exportManager!.exportScene(targetModel, format, {
      ...options,
      filename,
    });
    this._exportManager!._downloadBlob(
      blob,
      `${filename}.${this._exportManager!._getExtension(format)}`
    );
    this.events.emit('sceneExported', { format, filename });
  }

  getSupportedExportFormats() {
    return this._exportManager!.getSupportedFormats();
  }

  getExportManager() {
    return this._exportManager;
  }

  // ==================== 项目管理 ====================

  createProject(options: Record<string, any> = {}) {
    this._clearScene();
    const project = this._projectManager!.createProject(options);
    this.events.emit('projectCreated', project);
    return project;
  }

  saveProject(key: string) {
    const storageKey = key || `editor_project_${this._projectManager!.projectInfo.id}`;
    return this._projectManager!.saveToLocal(storageKey);
  }

  async loadProject(key = 'editor_project') {
    const data = this._projectManager!.loadFromLocal(key);
    if (!data) return null;
    await this._restoreProjectState(data);
    return data;
  }

  exportProjectFile(filename: string) {
    this._projectManager!.exportProjectFile(filename || this._projectManager!.getProjectName());
  }

  async importProjectFile(file: File) {
    const data = await this._projectManager!.importProjectFile(file);
    await this._restoreProjectState(data);
    return data;
  }

  getLocalProjectList() {
    return this._projectManager!.getLocalProjectList();
  }

  deleteLocalProject(key: string) {
    this._projectManager!.deleteLocalProject(key);
  }

  getProjectName() {
    return this._projectManager!.getProjectName();
  }

  setProjectName(name: string) {
    this._projectManager!.setProjectName(name);
  }

  isProjectDirty() {
    return this._projectManager!.isDirty();
  }

  getProjectManager() {
    return this._projectManager;
  }

  async _restoreProjectState(projectData: any) {
    const config = projectData.config;
    this._clearScene();

    const originPath = config?.models?.origin?.path || config?.originModelPath;
    if (originPath) {
      try {
        await this.loadModel(originPath);
      } catch (error) {
        console.warn('[EditorViewer] 加载原始模型失败:', error);
      }
    }
  }

  _clearScene() {
    const meshesToRemove = this._meshes.filter((m) => !m.userData.isHelper);
    meshesToRemove.forEach((mesh) => this.removeMesh(mesh));
  }

  // ==================== 网格管理 ====================

  addMesh(mesh: any, options: Record<string, any> = {}) {
    const result = super.addMesh(mesh, options);
    this._meshes.push(mesh);
    return result;
  }

  removeMesh(mesh: any) {
    const index = this._meshes.indexOf(mesh);
    if (index !== -1) {
      this._meshes.splice(index, 1);
    }
    super.removeMesh(mesh);
  }

  // ==================== 销毁 ====================

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

    this._meshes = [];
    super.dispose();
  }
}

export default EditorViewer;
