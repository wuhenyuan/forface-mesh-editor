import EditorViewer from './EditorViewer';
import Document from './Document';
import AssetsManager from './AssetsManager';
import ExportManager from './ExportManager';
import ProjectManager from './ProjectManager';
import EntityVisualController from './controllers/EntityVisualController';
import { FeatureDetector } from './facePicking/FeatureDetector';
import * as THREE from 'three';

type EventEmitterLike = {
  emit: (event: string, payload?: unknown) => void;
};

type SelectableMeshLike = THREE.Object3D & {
  userData: Record<string, unknown> & { isHelper?: boolean };
};

type TextManagerLike = {
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
  setViewMode?: (mode: 'construct' | 'result') => Promise<unknown>;
};

export class EditorDocumentVisual extends EditorViewer {
  document: Document;
  assetsManager: AssetsManager;
  viewMode: 'construct' | 'result';
  private _viewModeBusy: boolean;
  private _entityVisual: EntityVisualController;

  constructor(
    document: Document,
    assetsManager: AssetsManager,
    container: HTMLElement,
    options: Record<string, any> = {}
  ) {
    super(container, {
      ...options,
      document,
      assetsManager,
      events: options?.events || document?.events,
    });

    this.document = document;
    this.assetsManager = assetsManager;
    this.viewMode = options?.viewMode === 'result' ? 'result' : 'construct';
    this.projectManager = this._projectManager;
    this.exportManager = this._exportManager;
    this.loaderManager = this._loaderManager;
    this._viewModeBusy = false;
    const events = this.events as EventEmitterLike;

    this.assetsManager.onProgress = (progress) => {
      events.emit('loadProgress', progress);
    };
    this.assetsManager.onError = (error) => {
      events.emit('loadError', { error });
    };

    this._entityVisual = new EntityVisualController({
      document: this.document,
      assetsManager: this.assetsManager,
      events: this.events as unknown,
      scene: this.scene as THREE.Scene,
      csgGroup: (this.csgGroup as THREE.Group | null) || null,
      entityGroup: (this.entityGroup as THREE.Group | null) || null,
      getViewMode: () => this.viewMode,
      isDisposed: () => !!this._isDisposed,
      getMeshes: () => ((this._meshes as SelectableMeshLike[]) || []),
      getObjectSelectionManager: () => (this._objectSelectionManager as unknown) || null,
      addMesh: (mesh, meshOptions = {}) => this.addMesh(mesh, meshOptions),
      removeMesh: (mesh) => this.removeMesh(mesh),
      ensureTextSystem: () => (this.initTextSystem() as unknown as TextManagerLike | null),
      getTextManager: () => (this.getTextManager?.() as unknown as TextManagerLike | null),
      getTextObjects: () => (this.getTextObjects?.() as unknown as Array<Record<string, unknown>>) || [],
      restoreText: (snapshot) => this.restoreText(snapshot),
      deleteText: (textId) => this.deleteText(textId),
      updateTextConfig: (textId, patch) => this.updateTextConfig(textId, patch),
      updateTextColor: (textId, color) => this.updateTextColor(textId, color),
      updateTextContent: (textId, content) => this.updateTextContent(textId, content),
      switchTextMode: (textId, mode) => this.switchTextMode(textId, mode),
      entityHandler: options?.entityHandler || null,
    });
  }

  _initCoreSubsystems() {
    const optionsRecord =
      this.options && typeof this.options === 'object' ? (this.options as Record<string, unknown>) : {};
    const doc = optionsRecord.document as Document | undefined;
    const assetsManager = optionsRecord.assetsManager as AssetsManager | undefined;
    const useDocumentManagers = !!doc;
    const events = this.events as EventEmitterLike;

    this._featureDetector = new FeatureDetector();

    this._loaderManager = assetsManager || new AssetsManager();
    const loaderManager = this._loaderManager as AssetsManager | null;
    loaderManager?.setFeatureDetector?.(this._featureDetector as FeatureDetector);

    this._exportManager = doc?.exportManager || new ExportManager();
    this._projectManager = doc?.projectManager || new ProjectManager();
    const exportManager = this._exportManager;
    const projectManager = this._projectManager;

    if (loaderManager) {
      loaderManager.onProgress = (progress) => {
        events.emit('loadProgress', progress);
      };
      loaderManager.onError = (error) => {
        events.emit('loadError', { error });
      };
    }

    if (!useDocumentManagers) {
      exportManager.onProgress = (progress) => {
        events.emit('exportProgress', progress);
      };
      exportManager.onError = (error) => {
        events.emit('exportError', { error });
      };

      projectManager.onChange = (event) => {
        events.emit('projectChanged', event);
      };
      projectManager.onSave = (event) => {
        events.emit('projectSaved', event);
      };
      projectManager.onLoad = (event) => {
        events.emit('projectLoaded', event);
      };
    }

    const featureDetector = this._featureDetector as FeatureDetector;
    featureDetector.onDetectionStart = (modelId) => {
      events.emit('featureDetectionStart', { modelId });
    };
    featureDetector.onDetectionProgress = (modelId, progress) => {
      events.emit('featureDetectionProgress', { modelId, progress });
    };
    featureDetector.onDetectionComplete = (result) => {
      events.emit('featureDetectionComplete', result);
    };
  }

  getModelById(modelId: string) {
    return this._entityVisual.getModelById(modelId);
  }

  initTextSystem() {
    const manager = super.initTextSystem();
    this._entityVisual.bindTextEntityEvents(manager as unknown as TextManagerLike | null);
    (manager as unknown as TextManagerLike | null)?.setViewMode?.(this.viewMode).catch?.(() => {});
    return manager;
  }

  async setViewMode(mode: 'construct' | 'result') {
    if (mode !== 'construct' && mode !== 'result') return;
    if (this._viewModeBusy) return;
    if (this.viewMode === mode) return;

    this._viewModeBusy = true;
    try {
      const surfaceTextManager = this._surfaceTextManager as
        | { setViewMode?: (nextMode: 'construct' | 'result') => Promise<unknown> }
        | null;
      if (mode === 'result') {
        this.disableTextMode();
        this.enableObjectSelection();
        await surfaceTextManager?.setViewMode?.('result');
      } else {
        await surfaceTextManager?.setViewMode?.('construct');
        this.enableObjectSelection();
      }

      this.viewMode = mode;
      this._entityVisual.syncCSGVisibilityAndSelection();
      (this.events as EventEmitterLike).emit('viewModeChanged', { mode });
    } finally {
      this._viewModeBusy = false;
    }
  }

  getViewMode() {
    return this.viewMode;
  }

  dispose() {
    this.assetsManager.onProgress = null;
    this.assetsManager.onError = null;
    this._entityVisual.dispose();
    super.dispose();
  }
}

export default EditorDocumentVisual;
