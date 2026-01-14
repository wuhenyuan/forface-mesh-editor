import EditorViewer from './EditorViewer';
import Document, { DocumentModelSource } from './Document';
import AssetsManager from './AssetsManager';
import ExportManager from './ExportManager';
import ProjectManager from './ProjectManager';
import { FeatureDetector } from './facePicking/FeatureDetector';

export class EditorDocumentVisual extends EditorViewer {
  document: Document;
  assetsManager: AssetsManager;
  viewMode: 'construct' | 'result';
  private _loadedModels: Map<string, any>;
  private _loadTokens: Map<string, number>;
  private _loadTokenCounter: number;
  private _documentSubscriptions: Array<() => void>;
  private _viewModeBusy: boolean;

  constructor(
    document: Document,
    assetsManager: AssetsManager,
    container: HTMLElement,
    options: Record<string, any> = {}
  ) {
    super(container, { ...options, document, assetsManager });

    this.document = document;
    this.assetsManager = assetsManager;
    this.viewMode = options?.viewMode === 'result' ? 'result' : 'construct';
    this.projectManager = this._projectManager;
    this.exportManager = this._exportManager;
    this.loaderManager = this._loaderManager;
    this._loadedModels = new Map();
    this._loadTokens = new Map();
    this._loadTokenCounter = 0;
    this._documentSubscriptions = [];
    this._viewModeBusy = false;

    this.assetsManager.onProgress = (progress) => {
      this.events.emit('loadProgress', progress);
    };
    this.assetsManager.onError = (error) => {
      this.events.emit('loadError', { error });
    };

    this._bindDocumentEvents();
  }

  _initCoreSubsystems() {
    const doc = this.options?.document as Document | undefined;
    const assetsManager = this.options?.assetsManager as AssetsManager | undefined;
    const useDocumentManagers = !!doc;

    this._featureDetector = new FeatureDetector();

    this._loaderManager = assetsManager || new AssetsManager();
    this._loaderManager?.setFeatureDetector?.(this._featureDetector);

    this._exportManager = doc?.exportManager || new ExportManager();
    this._projectManager = doc?.projectManager || new ProjectManager();

    if (this._loaderManager) {
      this._loaderManager.onProgress = (progress) => {
        this.events.emit('loadProgress', progress);
      };
      this._loaderManager.onError = (error) => {
        this.events.emit('loadError', { error });
      };
    }

    if (!useDocumentManagers) {
      this._exportManager.onProgress = (progress) => {
        this.events.emit('exportProgress', progress);
      };
      this._exportManager.onError = (error) => {
        this.events.emit('exportError', { error });
      };

      this._projectManager.onChange = (event) => {
        this.events.emit('projectChanged', event);
      };
      this._projectManager.onSave = (event) => {
        this.events.emit('projectSaved', event);
      };
      this._projectManager.onLoad = (event) => {
        this.events.emit('projectLoaded', event);
      };
    }

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

  private _bindDocumentEvents() {
    this._documentSubscriptions.push(
      this.document.events.on('documentLoaded', (payload) => this._onDocumentLoaded(payload))
    );
    this._documentSubscriptions.push(
      this.document.events.on('documentCleared', () => this._clearLoadedModels())
    );
    this._documentSubscriptions.push(
      this.document.events.on('modelSourceAdded', ({ key, entry }) => {
        this._reloadModelSource(key, entry);
      })
    );
    this._documentSubscriptions.push(
      this.document.events.on('modelSourceRemoved', ({ key }) => {
        this._removeLoadedModel(key);
      })
    );
    this._documentSubscriptions.push(
      this.document.events.on('exportProgress', (payload) => {
        this.events.emit('exportProgress', payload);
      })
    );
    this._documentSubscriptions.push(
      this.document.events.on('exportError', (payload) => {
        this.events.emit('exportError', payload);
      })
    );
    this._documentSubscriptions.push(
      this.document.events.on('projectChanged', (payload) => {
        this.events.emit('projectChanged', payload);
      })
    );
    this._documentSubscriptions.push(
      this.document.events.on('projectSaved', (payload) => {
        this.events.emit('projectSaved', payload);
      })
    );
    this._documentSubscriptions.push(
      this.document.events.on('projectLoaded', (payload) => {
        this.events.emit('projectLoaded', payload);
      })
    );
  }

  private _onDocumentLoaded(payload: any) {
    const models = payload?.models instanceof Map ? payload.models : this.document.models;
    this._clearLoadedModels();

    for (const [key, entry] of models.entries()) {
      this._loadModelSource(key, entry);
    }
  }

  private _reloadModelSource(key: string, entry: DocumentModelSource) {
    this._removeLoadedModel(key);
    this._loadModelSource(key, entry);
  }

  private async _loadModelSource(key: string, entry: DocumentModelSource) {
    if (!entry) return;

    const token = ++this._loadTokenCounter;
    this._loadTokens.set(key, token);

    try {
      const loaderOptions = entry.loaderOptions || {};
      const visualOptions = entry.visualOptions || {};
      const { addToScene = true, ...meshOptions } = visualOptions;

      const result = await this.assetsManager.load(entry.source, {
        modelId: key,
        ...loaderOptions
      });

      if (this._loadTokens.get(key) !== token || this._isDisposed) return;

      this._loadedModels.set(key, result.model);
      if (addToScene) {
        this.addMesh(result.model, meshOptions);
      }

      this.events.emit('modelLoaded', {
        model: result.model,
        modelId: key,
        format: result.format,
        metadata: result.metadata
      });
    } catch (error) {
      this.events.emit('loadError', { error, modelId: key });
    } finally {
      if (this._loadTokens.get(key) === token) {
        this._loadTokens.delete(key);
      }
    }
  }

  private _removeLoadedModel(key: string) {
    this._loadTokens.delete(key);
    const model = this._loadedModels.get(key);
    if (model) {
      this.removeMesh(model);
      this._loadedModels.delete(key);
    }
  }

  private _clearLoadedModels() {
    const keys = Array.from(this._loadedModels.keys());
    for (const key of keys) {
      this._removeLoadedModel(key);
    }
  }

  initTextSystem() {
    const manager = super.initTextSystem();
    manager?.setViewMode?.(this.viewMode).catch?.(() => {});
    return manager;
  }

  async setViewMode(mode: 'construct' | 'result') {
    if (mode !== 'construct' && mode !== 'result') return;
    if (this._viewModeBusy) return;
    if (this.viewMode === mode) return;

    this._viewModeBusy = true;
    try {
      if (mode === 'result') {
        this.disableTextMode();
        this.disableObjectSelection();
        await this._surfaceTextManager?.setViewMode?.('result');
      } else {
        await this._surfaceTextManager?.setViewMode?.('construct');
        this.enableObjectSelection();
      }

      this.viewMode = mode;
      this.events.emit('viewModeChanged', { mode });
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
    this._documentSubscriptions.forEach((off) => off());
    this._documentSubscriptions = [];
    this._clearLoadedModels();
    super.dispose();
  }
}

export default EditorDocumentVisual;
