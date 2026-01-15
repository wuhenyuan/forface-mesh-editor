import * as THREE from 'three';
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
  private _textEntitySubscriptions: Array<() => void>;
  private _textEntityBound: boolean;
  private _textEntitySyncDepth: number;
  private _textAnchorMesh: any;
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
    this._textEntitySubscriptions = [];
    this._textEntityBound = false;
    this._textEntitySyncDepth = 0;
    this._textAnchorMesh = null;
    this._entityHandler = options?.entityHandler || null;

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
    const shouldForward = this.document.events !== this.events;
    const entityEvents = this.document.entityManager;

    this._documentSubscriptions.push(
      this.document.events.on('documentLoaded', (payload) => this._onDocumentLoaded(payload))
    );
    this._documentSubscriptions.push(
      this.document.events.on('documentCleared', () => this._clearLoadedModels())
    );
    this._documentSubscriptions.push(
      entityEvents.on('entityAdded', (payload) => {
        this._handleEntityAdded(payload);
      })
    );
    this._documentSubscriptions.push(
      entityEvents.on('entityRemoved', (payload) => {
        this._handleEntityRemoved(payload);
      })
    );
    this._documentSubscriptions.push(
      entityEvents.on('entityUpdated', (payload) => {
        this._handleEntityUpdated(payload);
      })
    );

    if (shouldForward) {
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
  }

  private _bindTextEntityEvents(manager: any) {
    if (this._textEntityBound || !manager) return;
    this._textEntityBound = true;

    const bind = (event: string, handler: (...args: any[]) => void) => {
      manager.on(event, handler);
      this._textEntitySubscriptions.push(() => manager.off(event, handler));
    };

    bind('textCreated', (textObject: any) => {
      if (this._isTextEntitySyncSuppressed()) return;
      if (!textObject?.id) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._emitEntityAdd(this._buildTextEntity(textObject), {
          description: '创建文字',
        });
        this._trackTextEntitySync(result);
      });
    });

    bind('textDeleted', ({ id, textObject }: { id?: string; textObject?: any }) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const textId = id || textObject?.id;
      if (!textId) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._emitEntityRemove(textId, { description: '删除文字' });
        this._trackTextEntitySync(result);
      });
    });

    bind(
      'textContentUpdated',
      ({ textObject, newContent }: { textObject?: any; newContent?: any }) => {
        if (this._isTextEntitySyncSuppressed()) return;
        const textId = textObject?.id;
        if (!textId || newContent === undefined) return;
        this._withTextEntitySyncSuppressed(() => {
          const result = this._emitEntityUpdate(
            textId,
            { content: newContent },
            { description: '更新文字内容' }
          );
          this._trackTextEntitySync(result);
        });
      }
    );

    bind(
      'textConfigUpdated',
      ({ textObject, newConfig }: { textObject?: any; newConfig?: Record<string, any> }) => {
        if (this._isTextEntitySyncSuppressed()) return;
        const textId = textObject?.id;
        if (!textId || !newConfig) return;
        const patch = this._buildTextPatchFromConfig(newConfig, textObject);
        if (!patch) return;
        this._withTextEntitySyncSuppressed(() => {
          const result = this._emitEntityUpdate(textId, patch, { description: '更新文字配置' });
          this._trackTextEntitySync(result);
        });
      }
    );

    bind('textColorUpdated', ({ textObject, newColor }: { textObject?: any; newColor?: any }) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const textId = textObject?.id;
      if (!textId) return;
      const color = this._getTextColor(textObject, newColor);
      if (color === undefined) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._emitEntityUpdate(textId, { color }, { description: '更新文字颜色' });
        this._trackTextEntitySync(result);
      });
    });

    bind('textModeChanged', ({ textObject, newMode }: { textObject?: any; newMode?: any }) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const textId = textObject?.id;
      if (!textId || newMode === undefined) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._emitEntityUpdate(
          textId,
          { textType: newMode },
          { description: '更新文字模式' }
        );
        this._trackTextEntitySync(result);
      });
    });

    bind('dragEnd', (textObject: any) => {
      if (this._isTextEntitySyncSuppressed()) return;
      if (!textObject?.id) return;
      const transformPatch = this._getTextTransform(textObject);
      this._withTextEntitySyncSuppressed(() => {
        const result = this._emitEntityUpdate(textObject.id, transformPatch, {
          description: '更新文字变换',
        });
        this._trackTextEntitySync(result);
      });
    });
  }

  private _withTextEntitySyncSuppressed(callback: () => void) {
    this._pushTextEntitySyncSuppression();
    try {
      callback();
    } finally {
      this._popTextEntitySyncSuppression();
    }
  }

  private _trackTextEntitySync<T>(promise?: Promise<T>) {
    if (!promise) return;
    this._pushTextEntitySyncSuppression();
    promise.finally(() => {
      this._popTextEntitySyncSuppression();
    });
  }

  private _emitEntityAdd(entity: any, options: Record<string, any> = {}) {
    if (this._entityHandler?.addEntity) {
      return this._entityHandler.addEntity(entity, options);
    }
    return this.document.entityManager.addEntity(entity);
  }

  private _emitEntityUpdate(
    id: string,
    patch: Record<string, any>,
    options: Record<string, any> = {}
  ) {
    if (this._entityHandler?.updateEntity) {
      return this._entityHandler.updateEntity(id, patch, options);
    }
    return this.document.entityManager.updateEntity(id, patch, options);
  }

  private _emitEntityRemove(id: string, options: Record<string, any> = {}) {
    if (this._entityHandler?.delEntity) {
      return this._entityHandler.delEntity(id, options);
    }
    return this.document.entityManager.removeEntity(id, options);
  }

  private _pushTextEntitySyncSuppression() {
    this._textEntitySyncDepth += 1;
  }

  private _popTextEntitySyncSuppression() {
    this._textEntitySyncDepth = Math.max(0, this._textEntitySyncDepth - 1);
  }

  private _isTextEntitySyncSuppressed() {
    return this._textEntitySyncDepth > 0;
  }

  private _buildTextEntity(textObject: any) {
    const config = textObject?.config || {};
    return {
      id: textObject.id,
      type: 'text',
      resource: config.font,
      textType: textObject.mode,
      content: textObject.content,
      size: config.size,
      depth: config.thickness,
      direction: config.direction,
      letterSpacing: config.letterSpacing,
      curvingStrength: config.curvingStrength,
      startAngle: config.startAngle,
      color: this._getTextColor(textObject),
      ...this._getTextTransform(textObject),
    };
  }

  private _buildTextPatchFromConfig(config: Record<string, any>, textObject?: any) {
    if (!config) return null;
    const patch: Record<string, any> = {};
    if (config.font !== undefined) patch.resource = config.font;
    if (config.size !== undefined) patch.size = config.size;
    if (config.thickness !== undefined) patch.depth = config.thickness;
    if (config.color !== undefined) patch.color = this._getTextColor(textObject, config.color);
    if (config.direction !== undefined) patch.direction = config.direction;
    if (config.letterSpacing !== undefined) patch.letterSpacing = config.letterSpacing;
    if (config.curvingStrength !== undefined) patch.curvingStrength = config.curvingStrength;
    if (config.startAngle !== undefined) patch.startAngle = config.startAngle;
    return Object.keys(patch).length > 0 ? patch : null;
  }

  private _getTextTransform(textObject: any) {
    const mesh = textObject?.mesh;
    if (!mesh) return {};
    return {
      position: [mesh.position.x, mesh.position.y, mesh.position.z],
      rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
      scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
    };
  }

  private _getTextColor(textObject?: any, override?: any) {
    if (override !== undefined) return override;
    const materialColor = textObject?.material?.color?.getHex?.();
    if (typeof materialColor === 'number') return materialColor;
    const configColor = textObject?.config?.color;
    if (configColor !== undefined) return configColor;
    return undefined;
  }

  private _onDocumentLoaded(payload: any) {
    const models = payload?.models instanceof Map ? payload.models : this.document.models;
    this._clearLoadedModels();
    for (const [key, entry] of models.entries()) {
      if (this._loadedModels.has(key) || this._loadTokens.has(key)) continue;
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
        ...loaderOptions,
      });

      if (this._loadTokens.get(key) !== token || this._isDisposed) return;

      result.model.userData = result.model.userData || {};
      result.model.userData.entityKey = key;

      this._loadedModels.set(key, result.model);
      this._applyTransform(result.model, entry.transform);
      const entity = this.document?.entityManager?.getEntity?.(key);
      if (entity?.color !== undefined) {
        this._applyModelColor(result.model, entity.color);
      }
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
    }
  }

  private _handleEntityUpdated(
    payload: {
      key?: string;
      id?: string;
      entity?: any;
      patch?: Record<string, any>;
      reload?: boolean;
    } = {}
  ) {
    const key = payload.key || payload.id || payload.entity?.id;
    const entity = payload.entity;
    if (!key) return;
    if (entity?.type === 'text') {
      this._handleTextEntityUpdated(payload);
      return;
    }
    if (entity && entity.type && entity.type !== 'model') return;

    const entry = this.document.models.get(key);
    if (!entry) return;

    const patch = payload.patch || {};
    const reload = !!payload.reload;

    if (reload) {
      this._reloadModelSource(key, entry);
      return;
    }

    const model = this._loadedModels.get(key);
    if (!model) return;

    const nextTransform = this._resolveNextTransform(entry, patch, entity);
    if (nextTransform) {
      this._applyTransform(model, nextTransform);
    }

    if (patch.color !== undefined) {
      this._applyModelColor(model, patch.color);
    }
  }

  private _handleEntityAdded(payload: { key?: string; id?: string; entity?: any } = {}) {
    const key = payload.key || payload.id || payload.entity?.id;
    const entity = payload.entity;
    if (!key) return;
    if (this._loadedModels.has(key) || this._loadTokens.has(key)) return;
    if (entity?.type === 'text') {
      this._handleTextEntityAdded(payload);
      return;
    }
    if (entity && entity.type && entity.type !== 'model') return;

    const entry = this.document.models.get(key);
    if (!entry) return;
    this._loadModelSource(key, entry);
  }

  private _handleEntityRemoved(payload: { key?: string; id?: string; entity?: any } = {}) {
    const key = payload.key || payload.id || payload.entity?.id;
    const entity = payload.entity;
    if (!key) return;
    if (entity?.type === 'text') {
      this._handleTextEntityRemoved(payload);
      return;
    }
    if (entity && entity.type && entity.type !== 'model') return;
    this._removeLoadedModel(key);
  }

  private _handleTextEntityAdded(payload: { key?: string; id?: string; entity?: any } = {}) {
    if (this._isTextEntitySyncSuppressed()) return;
    const entity = payload.entity;
    const textId = payload.key || payload.id || entity?.id;
    if (!textId || !entity) return;

    this.initTextSystem();

    const existing = this._getTextObjectById(textId);
    if (existing) {
      this._applyTextEntityPatch(textId, entity);
      return;
    }

    const snapshot = this._getTextSnapshotFromEntity(entity);
    if (snapshot) {
      this._withTextEntitySyncSuppressed(() => {
        const promise = this.restoreText(snapshot)
          .then((restoredId) => {
            if (!restoredId) return;
            const patch = this._buildTextTransformPatch(entity);
            if (patch) {
              this._applyTextEntityPatch(restoredId, patch);
            }
          })
          .catch(() => this._createTextObjectFromEntity(entity));
        this._trackTextEntitySync(promise);
      });
      return;
    }

    this._withTextEntitySyncSuppressed(() => {
      const promise = this._createTextObjectFromEntity(entity).catch(() => {});
      this._trackTextEntitySync(promise);
    });
  }

  private _handleTextEntityUpdated(
    payload: { key?: string; id?: string; entity?: any; patch?: Record<string, any> } = {}
  ) {
    if (this._isTextEntitySyncSuppressed()) return;
    const entity = payload.entity;
    const textId = payload.key || payload.id || entity?.id;
    if (!textId) return;

    const patch = payload.patch && Object.keys(payload.patch).length > 0 ? payload.patch : entity;
    if (!patch) return;

    this._applyTextEntityPatch(textId, patch);
  }

  private _handleTextEntityRemoved(payload: { key?: string; id?: string; entity?: any } = {}) {
    if (this._isTextEntitySyncSuppressed()) return;
    const entity = payload.entity;
    const textId = payload.key || payload.id || entity?.id;
    if (!textId) return;

    const existing = this._getTextObjectById(textId);
    if (!existing) return;

    this._withTextEntitySyncSuppressed(() => {
      const promise = this.deleteText(textId).catch(() => {});
      this._trackTextEntitySync(promise);
    });
  }

  private _applyTextEntityPatch(textId: string, patch: Record<string, any>) {
    const textObject = this._getTextObjectById(textId);
    if (!textObject) return;

    const configPatch: Record<string, any> = {};
    if (patch.resource !== undefined) configPatch.font = patch.resource;
    if (patch.font !== undefined) configPatch.font = patch.font;
    if (patch.size !== undefined) configPatch.size = patch.size;
    if (patch.depth !== undefined) configPatch.thickness = patch.depth;
    if (patch.thickness !== undefined) configPatch.thickness = patch.thickness;
    if (patch.direction !== undefined) configPatch.direction = patch.direction;
    if (patch.letterSpacing !== undefined) configPatch.letterSpacing = patch.letterSpacing;
    if (patch.curvingStrength !== undefined) configPatch.curvingStrength = patch.curvingStrength;
    if (patch.startAngle !== undefined) configPatch.startAngle = patch.startAngle;

    this._withTextEntitySyncSuppressed(() => {
      if (Object.keys(configPatch).length > 0) {
        const promise = this.updateTextConfig(textId, configPatch).catch(() => {});
        this._trackTextEntitySync(promise);
      }

      if (patch.color !== undefined) {
        this.updateTextColor(textId, patch.color);
      }

      if (patch.content !== undefined) {
        const promise = this.updateTextContent(textId, patch.content).catch(() => {});
        this._trackTextEntitySync(promise);
      }

      if (patch.textType !== undefined) {
        const promise = this.switchTextMode(textId, patch.textType).catch(() => {});
        this._trackTextEntitySync(promise);
      }

      if (patch.position || patch.rotation || patch.scale) {
        const mesh = textObject.mesh;
        if (mesh && patch.position) {
          const [x = 0, y = 0, z = 0] = patch.position;
          mesh.position.set(x, y, z);
        }
        if (mesh && patch.rotation) {
          const [x = 0, y = 0, z = 0] = patch.rotation;
          mesh.rotation.set(x, y, z);
        }
        if (mesh && patch.scale) {
          const [x = 1, y = 1, z = 1] = patch.scale;
          mesh.scale.set(x, y, z);
        }
        mesh?.updateMatrixWorld?.(true);
      }
    });
  }

  private _getTextObjectById(textId: string) {
    const manager = this.getTextManager?.();
    const fromManager = manager?.textObjects?.get?.(textId);
    if (fromManager) return fromManager;
    const list = this.getTextObjects?.() || [];
    return list.find((item: any) => item?.id === textId) || null;
  }

  private _getTextSnapshotFromEntity(entity: any) {
    if (entity?.snapshot?.id) return entity.snapshot;
    return null;
  }

  private _getTextAnchorMesh() {
    if (this._textAnchorMesh) return this._textAnchorMesh;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({ visible: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.name = '__text_anchor__';
    mesh.userData.isHelper = true;
    this.scene.add(mesh);
    mesh.updateMatrixWorld?.(true);
    this._textAnchorMesh = mesh;
    return mesh;
  }

  private _buildTextAnchorFaceInfo() {
    const mesh = this._getTextAnchorMesh();
    return {
      mesh,
      faceIndex: 0,
      face: { normal: new THREE.Vector3(0, 1, 0) },
      point: new THREE.Vector3(0, 0, 0),
      distance: 0,
      uv: new THREE.Vector2(0, 0),
    };
  }

  private _buildTextTransformPatch(entity: any) {
    if (!entity) return null;
    const patch: Record<string, any> = {};
    if (entity.position) patch.position = entity.position;
    if (entity.rotation) patch.rotation = entity.rotation;
    if (entity.scale) patch.scale = entity.scale;
    if (entity.textType !== undefined) patch.textType = entity.textType;
    return Object.keys(patch).length > 0 ? patch : null;
  }

  private async _createTextObjectFromEntity(entity: any) {
    if (!entity) return null;
    const content = typeof entity.content === 'string' ? entity.content : '';
    if (!content) return null;

    const manager = this.initTextSystem();
    if (!manager?.createTextObject) return null;

    const config: Record<string, any> = {};
    if (entity.resource !== undefined) config.font = entity.resource;
    if (entity.size !== undefined) config.size = entity.size;
    if (entity.depth !== undefined) config.thickness = entity.depth;
    if (entity.color !== undefined) config.color = entity.color;
    if (entity.direction !== undefined) config.direction = entity.direction;
    if (entity.letterSpacing !== undefined) config.letterSpacing = entity.letterSpacing;
    if (entity.curvingStrength !== undefined) config.curvingStrength = entity.curvingStrength;
    if (entity.startAngle !== undefined) config.startAngle = entity.startAngle;

    const options: Record<string, any> = { id: entity.id };
    if (Object.keys(config).length > 0) {
      options.config = config;
    }

    const faceInfo = this._buildTextAnchorFaceInfo();
    const textId = await manager.createTextObject(content, faceInfo, options);
    if (!textId) return null;

    const patch = this._buildTextTransformPatch(entity);
    if (patch) {
      this._applyTextEntityPatch(textId, patch);
    }

    return textId;
  }

  private _resolveNextTransform(
    entry: DocumentModelSource,
    patch: Record<string, any>,
    entity?: any
  ) {
    const baseTransform = entry?.transform || this._transformFromEntity(entity);
    const patchTransform = this._transformFromPatch(patch);
    if (!patchTransform) return baseTransform;
    return { ...(baseTransform || {}), ...patchTransform };
  }

  private _transformFromPatch(patch: Record<string, any>) {
    if (!patch) return null;
    if (patch.transform) return patch.transform;

    const transform: Record<string, any> = {};
    if (patch.position) transform.position = patch.position;
    if (patch.rotation) transform.rotation = patch.rotation;
    if (patch.scale) transform.scale = patch.scale;

    return Object.keys(transform).length > 0 ? transform : null;
  }

  private _transformFromEntity(entity: any) {
    if (!entity) return null;
    const transform: Record<string, any> = {};
    if (entity.position) transform.position = entity.position;
    if (entity.rotation) transform.rotation = entity.rotation;
    if (entity.scale) transform.scale = entity.scale;
    return Object.keys(transform).length > 0 ? transform : null;
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
    this._loadTokens.clear();
  }

  initTextSystem() {
    const manager = super.initTextSystem();
    if (manager && !this._textEntityBound) {
      this._bindTextEntityEvents(manager);
    }
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
    this._textEntitySubscriptions.forEach((off) => off());
    this._textEntitySubscriptions = [];
    this._textEntityBound = false;
    if (this._textAnchorMesh) {
      this._textAnchorMesh.parent?.remove?.(this._textAnchorMesh);
      this._textAnchorMesh.geometry?.dispose?.();
      this._textAnchorMesh.material?.dispose?.();
      this._textAnchorMesh = null;
    }
    this._clearLoadedModels();
    super.dispose();
  }
}

export default EditorDocumentVisual;
