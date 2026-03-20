import * as THREE from 'three';
import type Document from '../Document';
import type AssetsManager from '../AssetsManager';
import type { DocumentModelSource } from '../Document';
import type { EntityLike as BaseEntityLike } from '../entities/EntityObject';
import ModelEntityObject from '../entities/ModelEntityObject';
import TextEntityObject from '../entities/TextEntityObject';
import ModelBooleanController from '../csg/ModelBooleanController';

type EntityLike = BaseEntityLike & {
  type?: string;
  snapshot?: Record<string, unknown> & { id?: string };
  rotate?: number[] | [number, number, number, string];
};

const EULER_ORDERS: THREE.EulerOrder[] = ['XYZ', 'YZX', 'ZXY', 'XZY', 'YXZ', 'ZYX'];

function isEulerOrder(value: string): value is THREE.EulerOrder {
  return EULER_ORDERS.includes(value as THREE.EulerOrder);
}

type TextMeshLike = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  updateMatrixWorld?: (force?: boolean) => void;
};

type TextObjectLike = {
  id?: string;
  config?: Record<string, unknown>;
  mode?: unknown;
  content?: unknown;
  mesh?: TextMeshLike;
  material?: { color?: { getHex?: () => number } };
  [key: string]: unknown;
};

type TextManagerLike = {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
  textObjects?: Map<string, TextObjectLike>;
  createTextObject?: (
    content: string,
    faceInfo: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<string | null>;
};

type EventEmitterLike = {
  emit: (event: string, payload?: unknown) => void;
};

type EventSourceLike = {
  on: (event: string, callback: (payload?: unknown) => void) => () => void;
};

type EntityManagerLike = EventSourceLike & {
  addEntity: (entity: EntityLike) => unknown;
  updateEntity: (
    id: string,
    patch: Record<string, any>,
    options?: Record<string, any>
  ) => unknown;
  removeEntity: (id: string, options?: Record<string, any>) => unknown;
  getEntity?: (id: string) => EntityLike | null;
};

type DocumentLike = {
  events: EventSourceLike;
  entityManager: EntityManagerLike;
  models: Map<string, DocumentModelSource>;
};

type SelectionManagerLike = {
  setSelectableObjects?: (objects: unknown[]) => void;
};

type SelectableMeshLike = THREE.Object3D & {
  userData: Record<string, unknown> & { isHelper?: boolean };
};

type EntityHandler = {
  addEntity?: (entity: EntityLike, options?: Record<string, any>) => unknown;
  updateEntity?: (id: string, patch: Record<string, any>, options?: Record<string, any>) => unknown;
  delEntity?: (id: string, options?: Record<string, any>) => unknown;
} | null;

export interface EntityVisualControllerOptions {
  document: Document;
  assetsManager: AssetsManager;
  events: unknown;
  scene: THREE.Scene;
  csgGroup: THREE.Group | null;
  entityGroup: THREE.Group | null;
  getViewMode: () => 'construct' | 'result';
  isDisposed: () => boolean;
  getMeshes: () => SelectableMeshLike[];
  getObjectSelectionManager: () => SelectionManagerLike | null;
  addMesh: (mesh: THREE.Object3D, options?: Record<string, any>) => unknown;
  removeMesh: (mesh: THREE.Object3D) => void;
  ensureTextSystem: () => TextManagerLike | null;
  getTextManager: () => TextManagerLike | null;
  getTextObjects: () => TextObjectLike[];
  restoreText: (snapshot: Record<string, unknown>) => Promise<string | null>;
  deleteText: (textId: string) => Promise<unknown>;
  updateTextConfig: (textId: string, patch: Record<string, any>) => Promise<unknown>;
  updateTextColor: (textId: string, color: string | number) => unknown;
  updateTextContent: (textId: string, content: unknown) => Promise<unknown>;
  switchTextMode: (textId: string, mode: unknown) => Promise<unknown>;
  entityHandler?: EntityHandler;
}

export class EntityVisualController {
  private _options: EntityVisualControllerOptions;
  private _loadedModels: Map<string, ModelEntityObject>;
  private _loadTokens: Map<string, number>;
  private _loadTokenCounter: number;
  private _documentSubscriptions: Array<() => void>;
  private _textEntitySubscriptions: Array<() => void>;
  private _textEntityBound: boolean;
  private _textEntitySyncDepth: number;
  private _textAnchorMesh: THREE.Mesh | null;
  private _booleanController: ModelBooleanController;
  private _entityHandler: EntityHandler;

  constructor(options: EntityVisualControllerOptions) {
    this._options = options;
    this._entityHandler = options.entityHandler || null;
    this._loadedModels = new Map();
    this._loadTokens = new Map();
    this._loadTokenCounter = 0;
    this._documentSubscriptions = [];
    this._textEntitySubscriptions = [];
    this._textEntityBound = false;
    this._textEntitySyncDepth = 0;
    this._textAnchorMesh = null;
    this._booleanController = new ModelBooleanController({
      csgGroup: this._options.csgGroup,
      entityGroup: this._options.entityGroup,
      getSources: () => this._getBooleanSources(),
      getViewMode: () => this._options.getViewMode(),
      getSelectableObjects: () => this._options.getMeshes().filter((mesh) => !mesh.userData?.isHelper),
      setSelectableObjects: (objects) =>
        this._options.getObjectSelectionManager()?.setSelectableObjects?.(objects),
      isBlocked: () => this._loadTokens.size > 0,
      isDisposed: () => this._options.isDisposed(),
      onError: (error) => {
        console.warn('[CSG] update failed:', error);
      },
    });

    this._bindDocumentEvents();
  }

  private _doc(): DocumentLike {
    return this._options.document as unknown as DocumentLike;
  }

  private _events(): EventEmitterLike {
    return this._options.events as EventEmitterLike;
  }

  private _toPromise(result?: unknown) {
    if (!result) return null;
    const maybePromise = result as Promise<unknown>;
    if (typeof maybePromise.then !== 'function') return null;
    return maybePromise;
  }

  private _asTextObject(value: unknown): TextObjectLike | null {
    if (!value || typeof value !== 'object') return null;
    return value as TextObjectLike;
  }

  private _asEntity(value: unknown): EntityLike | null {
    if (!value || typeof value !== 'object') return null;
    return value as EntityLike;
  }

  private _asString(value: unknown) {
    return typeof value === 'string' && value ? value : null;
  }

  bindTextEntityEvents(manager: TextManagerLike | null) {
    if (this._textEntityBound || !manager) return;
    this._textEntityBound = true;

    const bind = (event: string, handler: (...args: unknown[]) => void) => {
      manager.on(event, handler);
      this._textEntitySubscriptions.push(() => manager.off(event, handler));
    };

    bind('textCreated', (value: unknown) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const textObject = this._asTextObject(value);
      const textId = this._asString(textObject?.id);
      if (!textObject || !textId) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._emitEntityAdd(this._buildTextEntity(textObject), {
          description: '????',
        });
        this._trackTextEntitySync(result);
      });
    });

    bind('textDeleted', ({ id, textObject }: { id?: string; textObject?: TextObjectLike }) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const textId = id || this._asString(textObject?.id);
      if (!textId) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._emitEntityRemove(textId, { description: '????' });
        this._trackTextEntitySync(result);
      });
    });

    bind(
      'textContentUpdated',
      ({ textObject, newContent }: { textObject?: TextObjectLike; newContent?: unknown }) => {
        if (this._isTextEntitySyncSuppressed()) return;
        const textId = this._asString(textObject?.id);
        if (!textId || newContent === undefined) return;
        this._withTextEntitySyncSuppressed(() => {
          const result = this._emitEntityUpdate(
            textId,
            { content: newContent },
            { description: '??????' }
          );
          this._trackTextEntitySync(result);
        });
      }
    );

    bind(
      'textConfigUpdated',
      ({ textObject, newConfig }: { textObject?: TextObjectLike; newConfig?: Record<string, any> }) => {
        if (this._isTextEntitySyncSuppressed()) return;
        const textId = this._asString(textObject?.id);
        if (!textId || !newConfig) return;
        const patch = this._buildTextPatchFromConfig(newConfig, textObject);
        if (!patch) return;
        this._withTextEntitySyncSuppressed(() => {
          const result = this._emitEntityUpdate(textId, patch, { description: '??????' });
          this._trackTextEntitySync(result);
        });
      }
    );

    bind(
      'textColorUpdated',
      ({ textObject, newColor }: { textObject?: TextObjectLike; newColor?: unknown }) => {
        if (this._isTextEntitySyncSuppressed()) return;
        const textId = this._asString(textObject?.id);
        if (!textId) return;
        const color = this._getTextColor(textObject, newColor);
        if (color === undefined) return;
        this._withTextEntitySyncSuppressed(() => {
          const result = this._emitEntityUpdate(textId, { color }, { description: '??????' });
          this._trackTextEntitySync(result);
        });
      }
    );

    bind('textModeChanged', ({ textObject, newMode }: { textObject?: TextObjectLike; newMode?: unknown }) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const textId = this._asString(textObject?.id);
      if (!textId || newMode === undefined) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._emitEntityUpdate(
          textId,
          { textType: newMode },
          { description: '??????' }
        );
        this._trackTextEntitySync(result);
      });
    });

    bind('dragEnd', (value: unknown) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const textObject = this._asTextObject(value);
      const textId = this._asString(textObject?.id);
      if (!textObject || !textId) return;
      const transformPatch = this._getTextTransform(textObject);
      this._withTextEntitySyncSuppressed(() => {
        const result = this._emitEntityUpdate(textId, transformPatch, {
          description: '??????',
        });
        this._trackTextEntitySync(result);
      });
    });
  }

  syncCSGVisibilityAndSelection() {
    this._booleanController.syncVisibilityAndSelection();
  }

  getModelById(modelId: string) {
    return this._loadedModels.get(modelId) || null;
  }

  dispose() {
    this._documentSubscriptions.forEach((off) => off());
    this._documentSubscriptions = [];
    this._textEntitySubscriptions.forEach((off) => off());
    this._textEntitySubscriptions = [];
    this._textEntityBound = false;
    if (this._textAnchorMesh) {
      this._textAnchorMesh.parent?.remove?.(this._textAnchorMesh);
      this._textAnchorMesh.geometry?.dispose?.();
      const materials = Array.isArray(this._textAnchorMesh.material)
        ? this._textAnchorMesh.material
        : [this._textAnchorMesh.material];
      materials.forEach((material) => material?.dispose?.());
      this._textAnchorMesh = null;
    }
    this._clearLoadedModels();
    this._booleanController.dispose();
  }

  private _bindDocumentEvents() {
    const document = this._doc();
    const events = this._events();
    const shouldForward = document.events !== (this._options.events as unknown);
    const entityEvents = document.entityManager;

    this._documentSubscriptions.push(
      document.events.on('documentLoaded', (payload?: unknown) => this._onDocumentLoaded(payload))
    );
    this._documentSubscriptions.push(
      document.events.on('documentCleared', () => this._clearLoadedModels())
    );
    this._documentSubscriptions.push(
      entityEvents.on('entityAdded', (payload?: unknown) => {
        this._handleEntityAdded((payload || {}) as { key?: string; id?: string; entity?: EntityLike });
      })
    );
    this._documentSubscriptions.push(
      entityEvents.on('entityRemoved', (payload?: unknown) => {
        this._handleEntityRemoved((payload || {}) as { key?: string; id?: string; entity?: EntityLike });
      })
    );
    this._documentSubscriptions.push(
      entityEvents.on('entityUpdated', (payload?: unknown) => {
        this._handleEntityUpdated(
          (payload || {}) as {
            key?: string;
            id?: string;
            entity?: EntityLike;
            patch?: Record<string, any>;
            reload?: boolean;
          }
        );
      })
    );

    if (shouldForward) {
      this._documentSubscriptions.push(
        document.events.on('exportProgress', (payload?: unknown) => {
          events.emit('exportProgress', payload);
        })
      );
      this._documentSubscriptions.push(
        document.events.on('exportError', (payload?: unknown) => {
          events.emit('exportError', payload);
        })
      );
      this._documentSubscriptions.push(
        document.events.on('projectChanged', (payload?: unknown) => {
          events.emit('projectChanged', payload);
        })
      );
      this._documentSubscriptions.push(
        document.events.on('projectSaved', (payload?: unknown) => {
          events.emit('projectSaved', payload);
        })
      );
      this._documentSubscriptions.push(
        document.events.on('projectLoaded', (payload?: unknown) => {
          events.emit('projectLoaded', payload);
        })
      );
    }
  }

  private _onDocumentLoaded(payload: unknown) {
    const payloadRecord = payload as { models?: Map<string, DocumentModelSource> } | null;
    const models = payloadRecord?.models instanceof Map ? payloadRecord.models : this._doc().models;
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
    let entityObject: ModelEntityObject | null = null;

    try {
      const loaderOptions = entry.loaderOptions || {};
      const visualOptions = entry.visualOptions || {};
      const { addToScene = true, ...meshOptions } = visualOptions;

      const entity = this._doc().entityManager.getEntity?.(key) || null;
      entityObject = new ModelEntityObject(key, entity);

      const result = await entityObject.loadFromEntitySource(
        (source, options) => this._options.assetsManager.load(source, options),
        entry.source,
        {
          modelId: key,
          ...loaderOptions,
        }
      );

      if (this._loadTokens.get(key) !== token || this._options.isDisposed()) {
        entityObject.disposeNode();
        return;
      }

      this._loadedModels.set(key, entityObject);
      entityObject.applyEntityPatch(entity || {}, { baseTransform: entry.transform, entity });
      if (addToScene) {
        this._options.addMesh(entityObject, meshOptions);
      }

      this._events().emit('modelLoaded', {
        model: entityObject,
        node: entityObject.node,
        modelId: key,
        format: result.format,
        metadata: result.metadata,
      });
    } catch (error) {
      if (entityObject) {
        if (this._loadedModels.get(key) === entityObject) {
          this._options.removeMesh(entityObject);
          this._loadedModels.delete(key);
        }
        entityObject.disposeNode();
      }
      console.log(error);
      this._events().emit('loadError', { error, modelId: key });
    } finally {
      if (this._loadTokens.get(key) === token) {
        this._loadTokens.delete(key);
      }
      this._scheduleCSGUpdate();
    }
  }

  private _handleEntityUpdated(
    payload: {
      key?: string;
      id?: string;
      entity?: EntityLike;
      patch?: Record<string, any>;
      reload?: boolean;
    } = {}
  ) {
    const key = payload.key || payload.id || this._asString(payload.entity?.id) || undefined;
    const entity = payload.entity;
    if (!key) return;
    if (entity?.type === 'text') {
      this._handleTextEntityUpdated(payload);
      return;
    }
    if (entity && entity.type && entity.type !== 'model') return;

    const entry = this._doc().models.get(key);
    if (!entry) return;

    const patch = payload.patch || {};
    const reload = !!payload.reload;

    if (reload) {
      this._reloadModelSource(key, entry);
      return;
    }

    const modelObject = this._loadedModels.get(key);
    if (!modelObject) return;
    const { nextTransform } = modelObject.applyEntityPatch(patch, {
      baseTransform: entry.transform,
      entity,
    });

    if (nextTransform || patch.boolean !== undefined) {
      this._scheduleCSGUpdate();
    }
  }

  private _handleEntityAdded(payload: { key?: string; id?: string; entity?: EntityLike } = {}) {
    const key = payload.key || payload.id || this._asString(payload.entity?.id) || undefined;
    const entity = payload.entity;
    if (!key) return;
    if (this._loadedModels.has(key) || this._loadTokens.has(key)) return;
    if (entity?.type === 'text') {
      this._handleTextEntityAdded(payload);
      return;
    }
    if (entity && entity.type && entity.type !== 'model') return;

    const entry = this._doc().models.get(key);
    if (!entry) return;
    this._loadModelSource(key, entry);
  }

  private _handleEntityRemoved(payload: { key?: string; id?: string; entity?: EntityLike } = {}) {
    const key = payload.key || payload.id || this._asString(payload.entity?.id) || undefined;
    const entity = payload.entity;
    if (!key) return;
    if (entity?.type === 'text') {
      this._handleTextEntityRemoved(payload);
      return;
    }
    if (entity && entity.type && entity.type !== 'model') return;
    this._removeLoadedModel(key);
  }

  private _handleTextEntityAdded(payload: { key?: string; id?: string; entity?: EntityLike } = {}) {
    if (this._isTextEntitySyncSuppressed()) return;
    const entity = payload.entity;
    const textId = payload.key || payload.id || this._asString(entity?.id);
    if (!textId || !entity) return;

    this._options.ensureTextSystem();

    const existing = this._getTextObjectById(textId);
    if (existing) {
      this._applyTextEntityPatch(textId, entity);
      return;
    }

    const snapshot = this._getTextSnapshotFromEntity(entity);
    if (snapshot) {
      this._withTextEntitySyncSuppressed(() => {
        const promise = this._options
          .restoreText(snapshot)
          .then((restoredId: string) => {
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
    payload: { key?: string; id?: string; entity?: EntityLike; patch?: Record<string, any> } = {}
  ) {
    if (this._isTextEntitySyncSuppressed()) return;
    const entity = payload.entity;
    const textId = payload.key || payload.id || this._asString(entity?.id);
    if (!textId) return;

    const patch = payload.patch && Object.keys(payload.patch).length > 0 ? payload.patch : entity;
    if (!patch) return;

    this._applyTextEntityPatch(textId, patch);
  }

  private _handleTextEntityRemoved(payload: { key?: string; id?: string; entity?: EntityLike } = {}) {
    if (this._isTextEntitySyncSuppressed()) return;
    const entity = payload.entity;
    const textId = payload.key || payload.id || this._asString(entity?.id);
    if (!textId) return;

    const existing = this._getTextObjectById(textId);
    if (!existing) return;

    this._withTextEntitySyncSuppressed(() => {
      const promise = this._options.deleteText(textId).catch(() => {});
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
        const promise = this._options.updateTextConfig(textId, configPatch).catch(() => {});
        this._trackTextEntitySync(promise);
      }

      if (patch.color !== undefined) {
        this._options.updateTextColor(textId, patch.color);
      }

      if (patch.content !== undefined) {
        const promise = this._options.updateTextContent(textId, patch.content).catch(() => {});
        this._trackTextEntitySync(promise);
      }

      if (patch.textType !== undefined) {
        const promise = this._options.switchTextMode(textId, patch.textType).catch(() => {});
        this._trackTextEntitySync(promise);
      }

      if (patch.position || patch.rotation || patch.rotate || patch.scale) {
        const mesh = textObject.mesh;
        if (mesh && patch.position) {
          const [x = 0, y = 0, z = 0] = patch.position;
          mesh.position.set(x, y, z);
        }
        const nextRotation = patch.rotation ?? patch.rotate;
        if (mesh && Array.isArray(nextRotation)) {
          const [x = 0, y = 0, z = 0, order] = nextRotation;
          if (typeof order === 'string' && isEulerOrder(order)) {
            mesh.rotation.order = order;
          }
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
    const manager = this._options.getTextManager();
    const fromManager = manager?.textObjects?.get?.(textId);
    if (fromManager) return fromManager;
    const list = this._options.getTextObjects() || [];
    return list.find((item) => item?.id === textId) || null;
  }

  private _getTextSnapshotFromEntity(entity: EntityLike | null | undefined) {
    if (entity?.snapshot?.id) return entity.snapshot;
    return null;
  }

  private _buildTextTransformPatch(entity: EntityLike | null | undefined) {
    if (!entity) return null;
    const textEntityObject = new TextEntityObject(entity.id || 'text_entity', entity);
    return textEntityObject.buildTransformPatch();
  }

  private async _createTextObjectFromEntity(entity: EntityLike | null | undefined) {
    if (!entity) return null;

    const textEntityObject = new TextEntityObject(entity.id || 'text_entity', entity);
    const content = textEntityObject.getContent();
    if (!content) return null;

    const manager = this._options.ensureTextSystem();
    if (!manager?.createTextObject) return null;

    const options = textEntityObject.buildCreateOptions();
    const faceInfo = this._buildTextAnchorFaceInfo();
    const textId = await manager.createTextObject(content, faceInfo, options);
    if (!textId) return null;

    const patch = textEntityObject.buildTransformPatch();
    if (patch) {
      this._applyTextEntityPatch(textId, patch);
    }

    return textId;
  }

  private _getTextAnchorMesh() {
    if (this._textAnchorMesh) return this._textAnchorMesh;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({ visible: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.name = '__text_anchor__';
    mesh.userData.isHelper = true;
    this._options.scene.add(mesh);
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

  private _withTextEntitySyncSuppressed(callback: () => void) {
    this._pushTextEntitySyncSuppression();
    try {
      callback();
    } finally {
      this._popTextEntitySyncSuppression();
    }
  }

  private _trackTextEntitySync(result?: unknown) {
    const promise = this._toPromise(result);
    if (!promise) return;
    this._pushTextEntitySyncSuppression();
    promise.finally(() => {
      this._popTextEntitySyncSuppression();
    });
  }

  private _emitEntityAdd(entity: EntityLike, options: Record<string, any> = {}) {
    if (this._entityHandler?.addEntity) {
      return this._entityHandler.addEntity(entity, options);
    }
    return this._doc().entityManager.addEntity(entity);
  }

  private _emitEntityUpdate(
    id: string,
    patch: Record<string, any>,
    options: Record<string, any> = {}
  ) {
    if (this._entityHandler?.updateEntity) {
      return this._entityHandler.updateEntity(id, patch, options);
    }
    return this._doc().entityManager.updateEntity(id, patch, options);
  }

  private _emitEntityRemove(id: string, options: Record<string, any> = {}) {
    if (this._entityHandler?.delEntity) {
      return this._entityHandler.delEntity(id, options);
    }
    return this._doc().entityManager.removeEntity(id, options);
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

  private _buildTextEntity(textObject: TextObjectLike): EntityLike {
    const config = textObject?.config || {};
    const configRecord = config as Record<string, unknown>;
    return {
      id: textObject.id,
      type: 'text',
      resource: configRecord.font,
      textType: textObject.mode,
      content: typeof textObject.content === 'string' ? textObject.content : '',
      size: configRecord.size,
      depth: configRecord.thickness,
      direction: configRecord.direction,
      letterSpacing: configRecord.letterSpacing,
      curvingStrength: configRecord.curvingStrength,
      startAngle: configRecord.startAngle,
      color: this._getTextColor(textObject),
      ...this._getTextTransform(textObject),
    };
  }

  private _buildTextPatchFromConfig(config: Record<string, any>, textObject?: TextObjectLike) {
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

  private _getTextTransform(textObject: TextObjectLike) {
    const mesh = textObject?.mesh;
    if (!mesh) return {};
    return {
      position: [mesh.position.x, mesh.position.y, mesh.position.z],
      rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
      scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
    };
  }

  private _getTextColor(textObject?: TextObjectLike, override?: unknown): string | number | undefined {
    if (typeof override === 'string' || typeof override === 'number') return override;
    const materialColor = textObject?.material?.color?.getHex?.();
    if (typeof materialColor === 'number') return materialColor;
    const configColor = textObject?.config?.color;
    if (typeof configColor === 'string' || typeof configColor === 'number') return configColor;
    return undefined;
  }

  private _getBooleanSources() {
    const keysInOrder = Array.from(this._doc().models?.keys?.() || []) as string[];
    const sources: Array<{ key: string; object: THREE.Object3D; op?: unknown }> = [];
    for (const key of keysInOrder) {
      const entityObject = this._loadedModels.get(key);
      if (!entityObject) continue;
      sources.push({
        key,
        object: entityObject,
        op: entityObject.getBooleanOp(),
      });
    }
    return sources;
  }

  private _scheduleCSGUpdate() {
    this._booleanController.scheduleUpdate();
  }

  private _clearCSGResult() {
    this._booleanController.clearResult();
  }

  private _removeLoadedModel(key: string) {
    this._loadTokens.delete(key);
    const entityObject = this._loadedModels.get(key);
    if (entityObject) {
      this._options.removeMesh(entityObject);
      entityObject.disposeNode();
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
}

export default EntityVisualController;
