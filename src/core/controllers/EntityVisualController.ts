import * as THREE from 'three';
import type Document from '../Document';
import type AssetsManager from '../AssetsManager';
import type { DocumentModelSource } from '../Document';
import type { EntityProps } from '../Document/Entity';
import type { EntityLike as BaseEntityLike } from '../entities/EntityObject';
import ModelEntityObject from '../entities/ModelEntityObject';
import ModelBooleanController from '../csg/ModelBooleanController';
import TextEntityProjector from './runtime/TextEntityProjector';
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
  entityObject?: TextMeshLike & {
    markBoxDirty?: () => void;
    refreshWorldBox?: (force?: boolean) => THREE.Box3;
  };
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
  addEntity?(
    entity: EntityProps,
    options?: EntityActionOptions
  ): MaybePromise<EntityOperationResult>;
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
  addMesh: (mesh: THREE.Object3D, options?: MeshAddOptions) => THREE.Object3D | void;
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
  private _textEntityProjector: TextEntityProjector;
  private _booleanController: ModelBooleanController;
  private _entityHandler: EntityHandler;

  constructor(options: EntityVisualControllerOptions) {
    this._options = options;
    this._entityHandler = options.entityHandler || null;
    this._loadedModels = new Map();
    this._loadTokens = new Map();
    this._loadTokenCounter = 0;
    this._documentSubscriptions = [];
    this._textEntityProjector = new TextEntityProjector({
      scene: this._options.scene,
      ensureTextSystem: () => this._options.ensureTextSystem(),
      getTextManager: () => this._options.getTextManager(),
      getTextObjects: () => this._options.getTextObjects(),
      restoreText: (snapshot) => this._options.restoreText(snapshot),
      deleteText: (textId) => this._options.deleteText(textId),
      updateTextConfig: (textId, patch) => this._options.updateTextConfig(textId, patch),
      updateTextColor: (textId, color) => this._options.updateTextColor(textId, color),
      updateTextContent: (textId, content) => this._options.updateTextContent(textId, content),
      switchTextMode: (textId, mode) => this._options.switchTextMode(textId, mode),
      addEntity: (entity, options = {}) => this._emitEntityAdd(entity as EntityLike, options),
      updateEntity: (id, patch, options = {}) =>
        this._emitEntityUpdate(id, patch as EntityPatchLike, options),
      removeEntity: (id, options = {}) => this._emitEntityRemove(id, options),
    });
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

  private _asString(value?: ControllerValue | null, allowEmpty = false) {
    if (typeof value !== 'string') return null;
    if (!allowEmpty && value.length === 0) return null;
    return value;
  }

  bindTextEntityEvents(manager: TextManagerLike | null) {
    this._textEntityProjector.bind(manager);
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
    this._textEntityProjector.dispose();
    this._clearLoadedModels();
    this._booleanController.dispose();
  }

  private _bindDocumentEvents() {
    const document = this._doc();
    const events = this._events();
    const shouldForward = document.events !== this._options.events;
    const entityEvents = this._entityManager();

    this._documentSubscriptions.push(
      document.events.on('documentLoaded', (payload?: ControllerValue) =>
        this._onDocumentLoaded(payload)
      )
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
    this._textEntityProjector.handleEntityAdded(payload);
  }

  private _handleTextEntityUpdated(
    payload: { key?: string; id?: string; entity?: EntityLike; patch?: EntityPatchLike } = {}
  ) {
    this._textEntityProjector.handleEntityUpdated(payload);
  }

  private _handleTextEntityRemoved(
    payload: { key?: string; id?: string; entity?: EntityLike } = {}
  ) {
    this._textEntityProjector.handleEntityRemoved(payload);
  }

  private _emitEntityAdd(entity: EntityLike, options: EntityActionOptions = {}) {
    const entityProps = this._toEntityProps(entity);
    if (this._entityHandler?.addEntity) {
      return this._entityHandler.addEntity(entityProps, options);
    }
    this._entityManager().addEntity(entityProps, { silent: options.silent });
    return true;
  }

  private _emitEntityUpdate(id: string, patch: EntityPatchLike, options: EntityActionOptions = {}) {
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

  private _toVector3Tuple(value?: EntityVector | EntityRotation) {
    if (!Array.isArray(value)) return undefined;
    const [x = 0, y = 0, z = 0] = value;
    return [x, y, z] as [number, number, number];
  }

  private _toEntityProps(entity: EntityLike): EntityProps {
    const id = typeof entity.id === 'string' && entity.id ? entity.id : undefined;
    const resource =
      typeof entity.resource === 'string' ||
      entity.resource instanceof Blob ||
      entity.resource instanceof File
        ? entity.resource
        : undefined;
    const position = this._toVector3Tuple(entity.position);
    const rotation = this._toVector3Tuple(entity.rotation);
    const scale = this._toVector3Tuple(entity.scale);
    const color =
      typeof entity.color === 'string' || typeof entity.color === 'number'
        ? entity.color
        : undefined;
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
