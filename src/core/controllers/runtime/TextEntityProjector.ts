import * as THREE from 'three';
import type { EntityLike as BaseEntityLike } from '../../entities/EntityObject';
import TextEntityObject from '../../entities/TextEntityObject';

type PrimitiveValue = string | number | boolean | null | undefined;
type ProjectorRecord = { [key: string]: ProjectorValue };
type ProjectorValue =
  | PrimitiveValue
  | ProjectorRecord
  | ProjectorValue[]
  | THREE.Object3D
  | THREE.Vector2
  | THREE.Vector3
  | THREE.Euler
  | Blob
  | File
  | Map<string, unknown>;
type EntityVector = [number, number, number] | number[];
type EntityRotation = [number, number, number, string] | EntityVector;
type TextMode = 'raised' | 'engraved' | string;
type TextSnapshotLike = Record<string, ProjectorValue> & { id?: string };
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
  loaderOptions?: Record<string, ProjectorValue>;
  visualOptions?: Record<string, ProjectorValue>;
  [key: string]: ProjectorValue | EntityVector | EntityRotation | object | undefined;
};
type EntityLike = BaseEntityLike &
  EntityPatchLike & {
    type?: string;
    id?: string;
    snapshot?: TextSnapshotLike;
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
  on: (event: string, handler: (payload?: ProjectorValue) => void) => void;
  off: (event: string, handler: (payload?: ProjectorValue) => void) => void;
  textObjects?: Map<string, TextObjectLike>;
  createTextObject?: (
    content: string,
    faceInfo: TextFaceInfoLike,
    options?: EntityPatchLike
  ) => Promise<string | null>;
};
type MaybePromise<T> = T | Promise<T>;
type TextSyncResult = object | boolean | string | null | void;
type EntityActionOptions = {
  description?: string;
  silent?: boolean;
  [key: string]: ProjectorValue | undefined;
};

const EULER_ORDERS: THREE.EulerOrder[] = ['XYZ', 'YZX', 'ZXY', 'XZY', 'YXZ', 'ZYX'];

function isEulerOrder(value: string): value is THREE.EulerOrder {
  return EULER_ORDERS.includes(value as THREE.EulerOrder);
}

export type TextEntityProjectorOptions = {
  scene: THREE.Scene;
  ensureTextSystem: () => TextManagerLike | null;
  getTextManager: () => TextManagerLike | null;
  getTextObjects: () => TextObjectLike[];
  restoreText: (snapshot: any) => Promise<string | null>;
  deleteText: (textId: string) => Promise<void>;
  updateTextConfig: (textId: string, patch: TextConfigLike) => Promise<void>;
  updateTextColor: (textId: string, color: string | number) => void;
  updateTextContent: (textId: string, content: string) => Promise<void>;
  switchTextMode: (textId: string, mode: TextMode) => Promise<void>;
  addEntity: (entity: any, options?: any) => MaybePromise<TextSyncResult>;
  updateEntity: (id: string, patch: any, options?: any) => MaybePromise<TextSyncResult>;
  removeEntity: (id: string, options?: any) => MaybePromise<TextSyncResult>;
};

export default class TextEntityProjector {
  private _options: TextEntityProjectorOptions;
  private _subscriptions: Array<() => void>;
  private _isBound: boolean;
  private _syncDepth: number;
  private _textAnchorMesh: THREE.Mesh | null;

  constructor(options: TextEntityProjectorOptions) {
    this._options = options;
    this._subscriptions = [];
    this._isBound = false;
    this._syncDepth = 0;
    this._textAnchorMesh = null;
  }

  bind(manager: TextManagerLike | null) {
    if (this._isBound || !manager) return;
    this._isBound = true;

    const bindEvent = (event: string, handler: (payload?: ProjectorValue) => void) => {
      manager.on(event, handler);
      this._subscriptions.push(() => manager.off(event, handler));
    };

    bindEvent('textCreated', (value: ProjectorValue) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const textObject = this._asTextObject(value);
      const textId = this._asString(textObject?.id);
      if (!textObject || !textId) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._options.addEntity(this._buildTextEntity(textObject), {
          description: 'Create text entity',
        });
        this._trackTextEntitySync(result);
      });
    });

    bindEvent('textDeleted', (value?: ProjectorValue) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const payload = this._asRecord(value);
      const textObject = this._asTextObject(payload?.textObject);
      const textId = this._asString(payload?.id) || this._asString(textObject?.id);
      if (!textId) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._options.removeEntity(textId, { description: 'Delete text entity' });
        this._trackTextEntitySync(result);
      });
    });

    bindEvent('textContentUpdated', (value?: ProjectorValue) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const payload = this._asRecord(value);
      const textObject = this._asTextObject(payload?.textObject);
      const textId = this._asString(textObject?.id);
      const newContent = this._asString(payload?.newContent, true);
      if (!textId || newContent === null) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._options.updateEntity(
          textId,
          { content: newContent },
          { description: 'Update text content' }
        );
        this._trackTextEntitySync(result);
      });
    });

    bindEvent('textConfigUpdated', (value?: ProjectorValue) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const payload = this._asRecord(value);
      const textObject = this._asTextObject(payload?.textObject);
      const newConfig = this._asTextConfig(payload?.newConfig);
      const textId = this._asString(textObject?.id);
      if (!textId || !newConfig) return;
      const patch = this._buildTextPatchFromConfig(newConfig, textObject);
      if (!patch) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._options.updateEntity(textId, patch, {
          description: 'Update text config',
        });
        this._trackTextEntitySync(result);
      });
    });

    bindEvent('textColorUpdated', (value?: ProjectorValue) => {
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
        const result = this._options.updateEntity(textId, { color }, {
          description: 'Update text color',
        });
        this._trackTextEntitySync(result);
      });
    });

    bindEvent('textModeChanged', (value?: ProjectorValue) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const payload = this._asRecord(value);
      const textObject = this._asTextObject(payload?.textObject);
      const nextMode = this._asString(payload?.newMode);
      const textId = this._asString(textObject?.id);
      if (!textId || !nextMode) return;
      this._withTextEntitySyncSuppressed(() => {
        const result = this._options.updateEntity(
          textId,
          { textType: nextMode },
          { description: 'Update text mode' }
        );
        this._trackTextEntitySync(result);
      });
    });

    bindEvent('dragEnd', (value: ProjectorValue) => {
      if (this._isTextEntitySyncSuppressed()) return;
      const textObject = this._asTextObject(value);
      const textId = this._asString(textObject?.id);
      if (!textObject || !textId) return;
      const transformPatch = this._getTextTransform(textObject);
      this._withTextEntitySyncSuppressed(() => {
        const result = this._options.updateEntity(textId, transformPatch, {
          description: 'Transform text entity',
        });
        this._trackTextEntitySync(result);
      });
    });
  }

  handleEntityAdded(payload: { key?: string; id?: string; entity?: EntityLike } = {}) {
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
          .then((restoredId: string | null) => {
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

  handleEntityUpdated(
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

  handleEntityRemoved(payload: { key?: string; id?: string; entity?: EntityLike } = {}) {
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

  dispose() {
    this._subscriptions.forEach((off) => off());
    this._subscriptions = [];
    this._isBound = false;

    if (!this._textAnchorMesh) return;

    this._textAnchorMesh.parent?.remove?.(this._textAnchorMesh);
    this._textAnchorMesh.geometry?.dispose?.();
    const materials = Array.isArray(this._textAnchorMesh.material)
      ? this._textAnchorMesh.material
      : [this._textAnchorMesh.material];
    materials.forEach((material) => material?.dispose?.());
    this._textAnchorMesh = null;
  }

  private _toPromise(result?: MaybePromise<TextSyncResult>) {
    if (!result) return null;
    const maybePromise = result as Promise<TextSyncResult>;
    if (typeof maybePromise.then !== 'function') return null;
    return maybePromise;
  }

  private _asTextObject(value?: ProjectorValue | null): TextObjectLike | null {
    if (!value || typeof value !== 'object') return null;
    return value as TextObjectLike;
  }

  private _asRecord(value?: ProjectorValue | null): ProjectorRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Map) {
      return null;
    }
    return value as ProjectorRecord;
  }

  private _asTextConfig(value?: ProjectorValue | null): TextConfigLike | null {
    const record = this._asRecord(value);
    if (!record) return null;
    return record as TextConfigLike;
  }

  private _asString(value?: ProjectorValue | null, allowEmpty = false) {
    if (typeof value !== 'string') return null;
    if (!allowEmpty && value.length === 0) return null;
    return value;
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
        const transformTarget = (textObject.entityObject || textObject.mesh) as
          | (TextMeshLike & {
              markBoxDirty?: () => void;
              refreshWorldBox?: (force?: boolean) => THREE.Box3;
            })
          | undefined;
        if (transformTarget && patch.position) {
          const [x = 0, y = 0, z = 0] = patch.position;
          transformTarget.position.set(x, y, z);
        }
        const nextRotation = patch.rotation ?? patch.rotate;
        if (transformTarget && Array.isArray(nextRotation)) {
          const [x = 0, y = 0, z = 0, order] = nextRotation;
          if (typeof order === 'string' && isEulerOrder(order)) {
            transformTarget.rotation.order = order;
          }
          transformTarget.rotation.set(x, y, z);
        }
        if (transformTarget && patch.scale) {
          const [x = 1, y = 1, z = 1] = patch.scale;
          transformTarget.scale.set(x, y, z);
        }
        transformTarget?.updateMatrixWorld?.(true);
        transformTarget?.markBoxDirty?.();
        transformTarget?.refreshWorldBox?.(true);
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

  private _pushTextEntitySyncSuppression() {
    this._syncDepth += 1;
  }

  private _popTextEntitySyncSuppression() {
    this._syncDepth = Math.max(0, this._syncDepth - 1);
  }

  private _isTextEntitySyncSuppressed() {
    return this._syncDepth > 0;
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
    const transformTarget = textObject?.entityObject || textObject?.mesh;
    if (!transformTarget) return {};
    return {
      position: [
        transformTarget.position.x,
        transformTarget.position.y,
        transformTarget.position.z,
      ],
      rotation: [
        transformTarget.rotation.x,
        transformTarget.rotation.y,
        transformTarget.rotation.z,
      ],
      scale: [transformTarget.scale.x, transformTarget.scale.y, transformTarget.scale.z],
    };
  }

  private _getTextColor(textObject?: TextObjectLike, override?: string | number) {
    if (typeof override === 'string' || typeof override === 'number') return override;
    const materialColor = textObject?.material?.color?.getHex?.();
    if (typeof materialColor === 'number') return materialColor;
    const configColor = textObject?.config?.color;
    if (typeof configColor === 'string' || typeof configColor === 'number') return configColor;
    return undefined;
  }

  private _asFontPath(value: EntityPatchLike['resource'] | EntityPatchLike['font']) {
    if (typeof value === 'string' && value.length > 0) return value;
    return undefined;
  }
}
