import * as THREE from 'three';
import EditorViewer from './EditorViewer';
import Document, { DocumentModelSource } from './Document';
import AssetsManager from './AssetsManager';
import ExportManager from './ExportManager';
import ProjectManager from './ProjectManager';
import { ADDITION, SUBTRACTION, Evaluator } from 'three-bvh-csg';
import { createBrushFromObject, normalizeModelBooleanOp } from './csg/ModelCSG';

export class EditorDocumentVisual extends EditorViewer {
  document: Document;
  assetsManager: AssetsManager;
  viewMode: 'construct' | 'result';
  private _loadedModels: Map<string, any>;
  private _loadTokens: Map<string, number>;
  private _loadTokenCounter: number;
  private _documentSubscriptions: Array<() => void>;
  private _viewModeBusy: boolean;
  private _csgUpdateToken: number;
  private _csgScheduledToken: any;
  private _csgResultMesh: THREE.Mesh | null;
  private _csgBusy: boolean;
  private _entityHandler: {
    addEntity?: (entity: any, options?: Record<string, any>) => any;
    updateEntity?: (id: string, patch: Record<string, any>, options?: Record<string, any>) => any;
    delEntity?: (id: string, options?: Record<string, any>) => any;
  } | null;

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
    this._loadedModels = new Map();
    this._loadTokens = new Map();
    this._loadTokenCounter = 0;
    this._documentSubscriptions = [];
    this._viewModeBusy = false;
    this._csgUpdateToken = 0;
    this._csgScheduledToken = null;
    this._csgResultMesh = null;
    this._csgBusy = false;
    this._entityHandler = options?.entityHandler || null;

    this.assetsManager.onProgress = (progress: any) => {
      this.events.emit('loadProgress', progress);
    };
    this.assetsManager.onError = (error: any) => {
      this.events.emit('loadError', { error });
    };

    this._bindDocumentEvents();
  }

  _initCoreSubsystems() {
    const doc = this.options?.document as Document | undefined;
    const assetsManager = this.options?.assetsManager as AssetsManager | undefined;

    this._loaderManager = assetsManager || new AssetsManager();
    this._exportManager = doc?.exportManager || new ExportManager();
    this._projectManager = doc?.projectManager || new ProjectManager();

    if (this._loaderManager) {
      this._loaderManager.onProgress = (progress: any) => {
        this.events.emit('loadProgress', progress);
      };
      this._loaderManager.onError = (error: any) => {
        this.events.emit('loadError', { error });
      };
    }
  }

  private _bindDocumentEvents() {
    const entityEvents = this.document.entityManager;

    const off1 = () => {};
    entityEvents.on('entityAdded', (payload: any) => {
      this._handleEntityAdded(payload);
    });
    this._documentSubscriptions.push(off1);

    const off2 = () => {};
    entityEvents.on('entityRemoved', (payload: any) => {
      this._handleEntityRemoved(payload);
    });
    this._documentSubscriptions.push(off2);

    const off3 = () => {};
    entityEvents.on('entityUpdated', (payload: any) => {
      this._handleEntityUpdated(payload);
    });
    this._documentSubscriptions.push(off3);
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
        ...loaderOptions,
      });

      if (this._loadTokens.get(key) !== token || this._isDisposed) return;

      result.model.userData = result.model.userData || {};
      result.model.userData.entityKey = key;

      this._loadedModels.set(key, result.model);
      this._applyTransform(result.model, entry.transform);

      if (addToScene) {
        this.addMesh(result.model, meshOptions);
      }

      this.events.emit('modelLoaded', {
        model: result.model,
        modelId: key,
        format: result.format,
        metadata: result.metadata,
      });
    } catch (error) {
      console.log(error);
      this.events.emit('loadError', { error, modelId: key });
    } finally {
      if (this._loadTokens.get(key) === token) {
        this._loadTokens.delete(key);
      }
      this._scheduleCSGUpdate();
    }
  }

  private _handleEntityUpdated(payload: any = {}) {
    const key = payload.key || payload.id || payload.entity?.id;
    const entity = payload.entity;
    if (!key) return;
    if (entity?.type === 'text') return;
    if (entity && entity.type && entity.type !== 'model') return;

    const entry = this.document.models.get(key);
    if (!entry) return;

    const patch = payload.patch || {};
    const model = this._loadedModels.get(key);
    if (!model) return;

    if (patch.position || patch.rotation || patch.scale) {
      this._applyTransform(model, patch);
    }

    if (patch.color !== undefined) {
      this._applyModelColor(model, patch.color);
    }

    this._scheduleCSGUpdate();
  }

  private _handleEntityAdded(payload: any = {}) {
    const key = payload.key || payload.id || payload.entity?.id;
    const entity = payload.entity;
    if (!key) return;
    if (this._loadedModels.has(key) || this._loadTokens.has(key)) return;
    if (entity?.type === 'text') return;
    if (entity && entity.type && entity.type !== 'model') return;

    const entry = this.document.models.get(key);
    if (!entry) return;
    this._loadModelSource(key, entry);
  }

  private _handleEntityRemoved(payload: any = {}) {
    const key = payload.key || payload.id || payload.entity?.id;
    const entity = payload.entity;
    if (!key) return;
    if (entity?.type === 'text') return;
    if (entity && entity.type && entity.type !== 'model') return;
    this._removeLoadedModel(key);
  }

  private _applyTransform(
    target: any,
    transform?: { position?: number[]; rotation?: number[]; scale?: number[] }
  ) {
    if (!target || !transform) return;

    const { position, rotation, scale } = transform;
    if (Array.isArray(position)) {
      const [x = 0, y = 0, z = 0] = position;
      target.position.set(x, y, z);
    }
    if (Array.isArray(rotation)) {
      const [x = 0, y = 0, z = 0] = rotation;
      target.rotation.set(x, y, z);
    }
    if (Array.isArray(scale)) {
      const [x = 1, y = 1, z = 1] = scale;
      target.scale.set(x, y, z);
    }

    target.updateMatrixWorld?.(true);
  }

  private _applyModelColor(model: any, color: string | number) {
    if (!model || color === undefined) return;
    const nextColor = new THREE.Color(color as any);
    model.traverse?.((child: any) => {
      if (!child?.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material: any) => {
        if (material?.color) {
          material.color.set(nextColor);
          material.needsUpdate = true;
        }
      });
    });
  }

  private _syncCSGVisibilityAndSelection() {
    const hasCSG = !!this._csgResultMesh && (this.csgGroup?.children?.length || 0) > 0;

    if (this.viewMode === 'result') {
      if (this.entityGroup) this.entityGroup.visible = !hasCSG;
      if (this.csgGroup) this.csgGroup.visible = hasCSG;
    } else {
      if (this.entityGroup) this.entityGroup.visible = true;
      if (this.csgGroup) this.csgGroup.visible = false;
    }
  }

  private _clearCSGResult() {
    if (this.csgGroup) {
      const children = [...this.csgGroup.children];
      children.forEach((child: any) => {
        child.parent?.remove?.(child);
        child.geometry?.dispose?.();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m: any) => m?.dispose?.());
        }
      });
    }
    this._csgResultMesh = null;
    this._syncCSGVisibilityAndSelection();
  }

  private _scheduleCSGUpdate() {
    if (this._isDisposed) return;
    if (this._csgScheduledToken) {
      clearTimeout(this._csgScheduledToken);
      this._csgScheduledToken = null;
    }
    const token = ++this._csgUpdateToken;
    this._csgScheduledToken = setTimeout(() => {
      this._csgScheduledToken = null;
      this._updateCSG(token).catch((error: any) => {
        console.warn('[CSG] update failed:', error);
      });
    }, 0);
  }

  private async _updateCSG(token: number) {
    if (this._isDisposed) return;
    if (this._loadTokens.size > 0) return;
    if (this._csgBusy) return;

    this._csgBusy = true;
    try {
      if (token !== this._csgUpdateToken) return;

      const keysInOrder = Array.from(this.document?.models?.keys?.() || []) as string[];
      const loadedKeys = keysInOrder.filter((key) => this._loadedModels.has(key));
      const brushes: Array<{ key: string; brush: any; op: any }> = [];

      for (const key of loadedKeys) {
        const model = this._loadedModels.get(key);
        if (!model) continue;
        const brush = createBrushFromObject(model);
        if (!brush) continue;
        const entity = this.document?.entityManager?.getEntity?.(key) as any;
        const op = normalizeModelBooleanOp(entity?.booleanType) || 'union';
        brushes.push({ key, brush, op });
      }

      if (brushes.length < 2) {
        brushes.forEach((b) => b.brush?.geometry?.dispose?.());
        this._clearCSGResult();
        return;
      }

      const evaluator = new Evaluator();
      evaluator.useGroups = true;

      let current = brushes[0].brush;
      for (let i = 1; i < brushes.length; i++) {
        const next = brushes[i].brush;
        const op = brushes[i].op;
        const operation = op === 'subtract' ? SUBTRACTION : ADDITION;

        const result = evaluator.evaluate(current, next, operation);
        if (current && current !== brushes[0].brush) {
          current.geometry?.dispose?.();
        }
        current = result;
      }

      for (const b of brushes) {
        if (b.brush && b.brush !== current) {
          b.brush.geometry?.dispose?.();
        }
      }

      const rawMaterials = current?.material;
      const clonedMaterials = Array.isArray(rawMaterials)
        ? rawMaterials.map(
            (m: any) => (m?.clone ? m.clone() : m) || new THREE.MeshStandardMaterial()
          )
        : rawMaterials?.clone
          ? rawMaterials.clone()
          : rawMaterials || new THREE.MeshStandardMaterial();

      const resultMesh = new THREE.Mesh(current.geometry, clonedMaterials as any);
      resultMesh.name = 'csgResult';
      resultMesh.castShadow = true;
      resultMesh.receiveShadow = true;
      resultMesh.userData = {
        ...(resultMesh.userData || {}),
        isCSGResult: true,
      };
      resultMesh.geometry?.computeVertexNormals?.();
      resultMesh.geometry?.computeBoundingBox?.();
      resultMesh.geometry?.computeBoundingSphere?.();

      this._clearCSGResult();
      this.csgGroup?.add?.(resultMesh);
      this._csgResultMesh = resultMesh;
      this._syncCSGVisibilityAndSelection();
    } finally {
      this._csgBusy = false;
      if (!this._isDisposed && token !== this._csgUpdateToken) {
        this._scheduleCSGUpdate();
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
    this._scheduleCSGUpdate();
  }

  private _clearLoadedModels() {
    const keys = Array.from(this._loadedModels.keys());
    for (const key of keys) {
      this._removeLoadedModel(key);
    }
    this._loadTokens.clear();
    this._clearCSGResult();
  }

  getModelById(modelId: string) {
    return this._loadedModels.get(modelId) || null;
  }

  async setViewMode(mode: 'construct' | 'result') {
    if (mode !== 'construct' && mode !== 'result') return;
    if (this._viewModeBusy) return;
    if (this.viewMode === mode) return;

    this._viewModeBusy = true;
    try {
      this.viewMode = mode;
      this._syncCSGVisibilityAndSelection();
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
    if (this._csgScheduledToken) {
      clearTimeout(this._csgScheduledToken);
      this._csgScheduledToken = null;
    }
    super.dispose();
  }
}

export default EditorDocumentVisual;
