import * as THREE from 'three';
import type Document from '../Document';
import type AssetsManager from '../AssetsManager';
import type { DocumentModelSource } from '../Document';
import type { EntityProps } from '../Document/Entity';
import type { EntityLike as BaseEntityLike } from '../entities/EntityObject';
import ModelEntityObject from '../entities/ModelEntityObject';
import TextEntityObject from '../entities/TextEntityObject';
import ModelBooleanController from '../csg/ModelBooleanController';
type PrimitiveValue = string | number | boolean | null | undefined;
type ControllerObject = { [key: string]: ControllerValue };
type ControllerValue =
  | PrimitiveValue
  | ControllerObject
  | ControllerValue[]
  | THREE.Object3D
  | THREE.Vector2
  | THREE.Vector3
  | THREE.Euler
  | Blob
  | File
  | Map<string, DocumentModelSource>;
type EntityVector = [number, number, number] | number[];
type EntityRotation = [number, number, number, string] | EntityVector;
type TextMode = 'raised' | 'engraved' | string;
type TextSnapshotLike = Record<string, ControllerValue> & { id?: string };
type TextConfigLike = {
  font?: string;
  size?: number;
  thickness?: number;
  color?: string | number;
  direction?: string;
  letterSpacing?: number;
  curvingStrength?: number;
  startAngle?: number;
};
type TextFaceInfoLike = {
  mesh: THREE.Mesh;
  faceIndex: number;
  face?: { normal?: THREE.Vector3 } | null;
  point?: THREE.Vector3;
  distance?: number;
  uv?: THREE.Vector2 | null;
};

type EntityPatchLike = {
  resource?: string | Blob | File;
  font?: string | Blob | File;
  size?: number;
  depth?: number;
  thickness?: number;
  direction?: string;
  letterSpacing?: number;
  curvingStrength?: number;
  startAngle?: number;
  color?: string | number;
  content?: string;
  textType?: TextMode;
  position?: EntityVector;
  rotation?: EntityRotation;
  rotate?: EntityRotation;
  scale?: EntityVector;
  boolean?: string;
  transform?: {
    position?: EntityVector;
    rotation?: EntityVector;
    scale?: EntityVector;
  };
  loaderOptions?: Record<string, ControllerValue>;
  visualOptions?: Record<string, ControllerValue>;
  [key: string]: ControllerValue | EntityVector | EntityRotation | object | undefined;
};

type EntityLike = BaseEntityLike &
  EntityPatchLike & {
    type?: string;
    id?: string;
    snapshot?: TextSnapshotLike;
  };

type MaybePromise<T> = T | Promise<T>;
type EntityOperationResult = EntityLike | EntityProps | object | boolean | void;
type TextSyncResult = EntityOperationResult | string | null;
type EntityActionOptions = {
  description?: string;
  silent?: boolean;
  [key: string]: ControllerValue | undefined;
};
type MeshAddOptions = {
  selectable?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  group?: 'entity' | 'scene' | 'csg';
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
  config?: TextConfigLike;
  mode?: TextMode;
  content?: string;
  mesh?: TextMeshLike;
  material?: { color?: { getHex?: () => number } };
};

type TextManagerLike = {
  on: (event: string, handler: (payload?: ControllerValue) => void) => void;
  off: (event: string, handler: (payload?: ControllerValue) => void) => void;
  textObjects?: Map<string, TextObjectLike>;
  createTextObject?: (
    content: string,
    faceInfo: TextFaceInfoLike,
    options?: EntityPatchLike
  ) => Promise<string | null>;
};

type EventEmitterLike = {
  emit: (event: string, payload?: ControllerValue) => void;
};

type EntityManagerBridge = {
  on: (event: string, callback: (payload?: ControllerValue) => void) => () => void;
  addEntity: (entity: object, options?: { silent?: boolean }) => object | boolean | void;
  updateEntity: (
    id: string,
    patch: object,
    options?: { silent?: boolean }
  ) => object | boolean | void;
  removeEntity: (id: string, options?: { silent?: boolean }) => object | boolean | void;
  getEntity?: (id: string) => object | null;
};

type SelectionManagerLike = {
  setSelectableObjects?: (objects: THREE.Object3D[]) => void;
};

type SelectableMeshLike = THREE.Object3D & {
  userData: Record<string, ControllerValue> & { isHelper?: boolean };
};

type EntityHandler = {
  addEntity?(entity: EntityProps, options?: EntityActionOptions): MaybePromise<EntityOperationResult>;
  updateEntity?(
    id: string,
    patch: EntityPatchLike,
    options?: EntityActionOptions
  ): MaybePromise<EntityOperationResult>;
  delEntity?(id: string, options?: EntityActionOptions): MaybePromise<EntityOperationResult>;
} | null;

export interface EntityVisualControllerOptions {
  document: Document;
  assetsManager: AssetsManager;
  events: EventEmitterLike;
  scene: THREE.Scene;
  csgGroup: THREE.Group | null;
  entityGroup: THREE.Group | null;
  getViewMode: () => 'construct' | 'result';
  isDisposed: () => boolean;
  getMeshes: () => SelectableMeshLike[];
  getObjectSelectionManager: () => SelectionManagerLike | null;
  addMesh: (
    mesh: THREE.Object3D,
    options?: MeshAddOptions
  ) => THREE.Object3D | void;
  removeMesh: (mesh: THREE.Object3D) => void;
  ensureTextSystem: () => TextManagerLike | null;
  getTextManager: () => TextManagerLike | null;
  getTextObjects: () => TextObjectLike[];
  restoreText: (snapshot: TextSnapshotLike) => Promise<string | null>;
  deleteText: (textId: string) => Promise<void>;
  updateTextConfig: (textId: string, patch: TextConfigLike) => Promise<void>;
  updateTextColor: (textId: string, color: string | number) => void;
  updateTextContent: (textId: string, content: string) => Promise<void>;
  switchTextMode: (textId: string, mode: TextMode) => Promise<void>;
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
      getSelectableObjects: () =>
        this._options.getMeshes().filter((mesh) => !mesh.userData?.isHelper),
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

  private _doc(): Document {
    return this._options.document;
  }

  private _events(): EventEmitterLike {
    return this._options.events;
  }

  private _entityManager(): EntityManagerBridge {
    return this._doc().entityManager as EntityManagerBridge;
  }

  private _toPromise(result?: MaybePromise<TextSyncResult>) {
    if (!result) return null;
    const maybePromise = result as Promise<TextSyncResult>;
    if (typeof maybePromise.then !== 'function') return null;
    return maybePromise;
  }

  private _asTextObject(value?: ControllerValue | null): TextObjectLike | null {
    if (!value || typeof value !== 'object') return null;
    return value as TextObjectLike;
  }

  private _asRecord(value?: ControllerValue | null): ControllerObject | null {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Map) {
      return null;
    }
    return value as ControllerObject;
  }

  private _asTextConfig(value?: ControllerValue | null): TextConfigLike | null {
    const record = this._asRecord(value);
    if (!record) return null;
    return record as TextConfigLike;
  }

  private _asString(value?: ControllerValue | null, allowEmpty = false) {
    if (typeof value !== 'string') return null;
    if (!allowEmpty && value.length === 0) return null;
    return value;
  }

  bindTextEntityEvents(manager: TextManagerLike | null) {
    if (this._textEntityBound || !manager) return;
    this._textEntityBound = true;

    const bind = (event: string, handler: (payload?: ControllerValue) => void) => {
      manager.on(event, handler);
      this._textEntitySubscriptions.push(() => manager.off(event, handler));
    };

    bind('textCreated', (value: ControllerValue) => {
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

    bind('textDeleted', (value?: ControllerValue) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const payload = this._asRecord(value);
      const textObject = this._asTextObject(payload?.textObject);
      const textId = this._asString(payload?.id) || this._asString(textObject?.id);
      if (!textId) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._emitEntityRemove(textId, { description: '????' });
        this._trackTextEntitySync(result);
      });
    });

    bind(
      'textContentUpdated',
      (value?: ControllerValue) => {
        if (this._isTextEntitySyncSuppressed()) return;
        const payload = this._asRecord(value);
        const textObject = this._asTextObject(payload?.textObject);
        const textId = this._asString(textObject?.id);
        const newContent = this._asString(payload?.newContent, true);
        if (!textId || newContent === null) return;
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
      (value?: ControllerValue) => {
        if (this._isTextEntitySyncSuppressed()) return;
        const payload = this._asRecord(value);
        const textObject = this._asTextObject(payload?.textObject);
        const newConfig = this._asTextConfig(payload?.newConfig);
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
      (value?: ControllerValue) => {
        if (this._isTextEntitySyncSuppressed()) return;
        const payload = this._asRecord(value);
        const textObject = this._asTextObject(payload?.textObject);
        const nextColor = payload?.newColor;
        const newColor =
          typeof nextColor === 'string' || typeof nextColor === 'number' ? nextColor : undefined;
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

    bind(
      'textModeChanged',
      (value?: ControllerValue) => {
        if (this._isTextEntitySyncSuppressed()) return;
        const payload = this._asRecord(value);
        const textObject = this._asTextObject(payload?.textObject);
        const nextMode = this._asString(payload?.newMode);
        const textId = this._asString(textObject?.id);
        if (!textId || !nextMode) return;
        this._withTextEntitySyncSuppressed(() => {
          const result = this._emitEntityUpdate(
            textId,
            { textType: nextMode },
            { description: '??????' }
          );
          this._trackTextEntitySync(result);
        });
      }
    );

    bind('dragEnd', (value: ControllerValue) => {
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
    const shouldForward = document.events !== this._options.events;
    const entityEvents = this._entityManager();

    this._documentSubscriptions.push(
      document.events.on('documentLoaded', (payload?: ControllerValue) => this._onDocumentLoaded(payload))
    );
    this._documentSubscriptions.push(
      document.events.on('documentCleared', () => this._clearLoadedModels())
    );
    this._documentSubscriptions.push(
      entityEvents.on('entityAdded', (payload?: ControllerValue) => {
        this._handleEntityAdded(
          (payload || {}) as { key?: string; id?: string; entity?: EntityLike }
        );
      })
    );
    this._documentSubscriptions.push(
      entityEvents.on('entityRemoved', (payload?: ControllerValue) => {
        this._handleEntityRemoved(
          (payload || {}) as { key?: string; id?: string; entity?: EntityLike }
        );
      })
    );
    this._documentSubscriptions.push(
      entityEvents.on('entityUpdated', (payload?: ControllerValue) => {
        this._handleEntityUpdated(
          (payload || {}) as {
            key?: string;
            id?: string;
            entity?: EntityLike;
            patch?: EntityPatchLike;
            reload?: boolean;
          }
        );
      })
    );

    if (shouldForward) {
      this._documentSubscriptions.push(
        document.events.on('exportProgress', (payload?: ControllerValue) => {
          events.emit('exportProgress', payload);
        })
      );
      this._documentSubscriptions.push(
        document.events.on('exportError', (payload?: ControllerValue) => {
          events.emit('exportError', payload);
        })
      );
      this._documentSubscriptions.push(
        document.events.on('projectChanged', (payload?: ControllerValue) => {
          events.emit('projectChanged', payload);
        })
      );
      this._documentSubscriptions.push(
        document.events.on('projectSaved', (payload?: ControllerValue) => {
          events.emit('projectSaved', payload);
        })
      );
      this._documentSubscriptions.push(
        document.events.on('projectLoaded', (payload?: ControllerValue) => {
          events.emit('projectLoaded', payload);
        })
      );
    }
  }

  private _onDocumentLoaded(payload: ControllerValue) {
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
      const addToScene = visualOptions.addToScene !== false;
      const group = visualOptions.group;
      const meshOptions: MeshAddOptions = {
        selectable:
          typeof visualOptions.selectable === 'boolean' ? visualOptions.selectable : undefined,
        castShadow:
          typeof visualOptions.castShadow === 'boolean' ? visualOptions.castShadow : undefined,
        receiveShadow:
          typeof visualOptions.receiveShadow === 'boolean'
            ? visualOptions.receiveShadow
            : undefined,
        group: group === 'entity' || group === 'scene' || group === 'csg' ? group : undefined,
      };

      const entity = (this._entityManager().getEntity?.(key) as EntityLike | null) || null;
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
      patch?: EntityPatchLike;
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
    payload: { key?: string; id?: string; entity?: EntityLike; patch?: EntityPatchLike } = {}
  ) {
    if (this._isTextEntitySyncSuppressed()) return;
    const entity = payload.entity;
    const textId = payload.key || payload.id || this._asString(entity?.id);
    if (!textId) return;

    const patch = payload.patch && Object.keys(payload.patch).length > 0 ? payload.patch : entity;
    if (!patch) return;

    this._applyTextEntityPatch(textId, patch);
  }

  private _handleTextEntityRemoved(
    payload: { key?: string; id?: string; entity?: EntityLike } = {}
  ) {
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

  private _applyTextEntityPatch(textId: string, patch: EntityPatchLike) {
    const textObject = this._getTextObjectById(textId);
    if (!textObject) return;

    const configPatch: TextConfigLike = {};
    const resourceFont = this._asFontPath(patch.resource);
    if (resourceFont !== undefined) configPatch.font = resourceFont;
    const fontPath = this._asFontPath(patch.font);
    if (fontPath !== undefined) configPatch.font = fontPath;
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

  private _trackTextEntitySync(result?: MaybePromise<TextSyncResult>) {
    const promise = this._toPromise(result);
    if (!promise) return;
    this._pushTextEntitySyncSuppression();
    promise.finally(() => {
      this._popTextEntitySyncSuppression();
    });
  }

  private _emitEntityAdd(entity: EntityLike, options: EntityActionOptions = {}) {
    const entityProps = this._toEntityProps(entity);
    if (this._entityHandler?.addEntity) {
      return this._entityHandler.addEntity(entityProps, options);
    }
    this._entityManager().addEntity(entityProps, { silent: options.silent });
    return true;
  }

  private _emitEntityUpdate(
    id: string,
    patch: EntityPatchLike,
    options: EntityActionOptions = {}
  ) {
    if (this._entityHandler?.updateEntity) {
      return this._entityHandler.updateEntity(id, patch, options);
    }
    const result = this._entityManager().updateEntity(id, patch, { silent: options.silent });
    return typeof result === 'boolean' ? result : true;
  }

  private _emitEntityRemove(id: string, options: EntityActionOptions = {}) {
    if (this._entityHandler?.delEntity) {
      return this._entityHandler.delEntity(id, options);
    }
    const result = this._entityManager().removeEntity(id, { silent: options.silent });
    return typeof result === 'boolean' ? result : true;
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
    return {
      id: textObject.id,
      type: 'text',
      resource: config.font,
      textType: textObject.mode,
      content: typeof textObject.content === 'string' ? textObject.content : '',
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

  private _buildTextPatchFromConfig(config: TextConfigLike, textObject?: TextObjectLike) {
    if (!config) return null;
    const patch: EntityPatchLike = {};
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

  private _getTextColor(
    textObject?: TextObjectLike,
    override?: string | number
  ): string | number | undefined {
    if (typeof override === 'string' || typeof override === 'number') return override;
    const materialColor = textObject?.material?.color?.getHex?.();
    if (typeof materialColor === 'number') return materialColor;
    const configColor = textObject?.config?.color;
    if (typeof configColor === 'string' || typeof configColor === 'number') return configColor;
    return undefined;
  }

  private _toVector3Tuple(value?: EntityVector | EntityRotation) {
    if (!Array.isArray(value)) return undefined;
    const [x = 0, y = 0, z = 0] = value;
    return [x, y, z] as [number, number, number];
  }

  private _toEntityProps(entity: EntityLike): EntityProps {
    const id = typeof entity.id === 'string' && entity.id ? entity.id : undefined;
    const resource =
      typeof entity.resource === 'string' || entity.resource instanceof Blob || entity.resource instanceof File
        ? entity.resource
        : undefined;
    const position = this._toVector3Tuple(entity.position);
    const rotation = this._toVector3Tuple(entity.rotation);
    const scale = this._toVector3Tuple(entity.scale);
    const color =
      typeof entity.color === 'string' || typeof entity.color === 'number' ? entity.color : undefined;
    const boolean = typeof entity.boolean === 'string' ? entity.boolean : undefined;

    if (entity.type === 'model') {
      return {
        id,
        type: 'model',
        resource: resource || '',
        position,
        rotation,
        scale,
        color,
        boolean,
        loaderOptions: entity.loaderOptions as Record<string, CoreValue> | undefined,
        visualOptions: entity.visualOptions as Record<string, CoreValue> | undefined,
      };
    }

    return {
      id,
      type: 'text',
      resource,
      position,
      rotation,
      scale,
      color,
      boolean,
      textType: typeof entity.textType === 'string' ? entity.textType : undefined,
      content: typeof entity.content === 'string' ? entity.content : undefined,
      size: typeof entity.size === 'number' ? entity.size : undefined,
      depth:
        typeof entity.depth === 'number'
          ? entity.depth
          : typeof entity.thickness === 'number'
            ? entity.thickness
            : undefined,
    };
  }

  private _asFontPath(value: EntityPatchLike['resource'] | EntityPatchLike['font']) {
    if (typeof value === 'string' && value.length > 0) return value;
    return undefined;
  }

  private _getBooleanSources() {
    const keysInOrder = Array.from(this._doc().models?.keys?.() || []) as string[];
    const sources: Array<{ key: string; object: THREE.Object3D; op?: string }> = [];
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

