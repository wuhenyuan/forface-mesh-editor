import * as THREE from 'three';
import { ObjectSelector } from './ObjectSelector';
import { ObjectTransformControls } from './ObjectTransformControls';
import { ObjectBoundsHelper } from './ObjectBoundsHelper';
import TransformSession, {
  type TransformCancelEventPayload,
  type TransformCommitEventPayload,
  type TransformMode,
  type TransformPreviewEventPayload,
  type TransformSnapshot,
  type TransformStartEventPayload,
} from './TransformSession';

type SelectableObject = THREE.Object3D & {
  userData?: Record<string, CoreValue>;
};

type BoxLikeObject = SelectableObject & {
  getWorldBox?: (force?: boolean) => THREE.Box3;
};

/**
 * 物体选择管理器
 * 统一管理对象选择、变换控制和编辑生命周期
 */
export class ObjectSelectionManager {
  [key: string]: CoreValue;

  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  domElement: HTMLElement;
  objectSelector: ObjectSelector;
  transformControls: ObjectTransformControls;
  boundsHelper: ObjectBoundsHelper;
  transformSession: TransformSession;
  enabled: boolean;
  selectedObject: SelectableObject | null;
  eventListeners: Map<string, Function[]>;
  config: Record<string, CoreValue>;

  private _tmpBox: THREE.Box3;
  private _tmpCenter: THREE.Vector3;

  constructor(scene, camera, renderer, domElement) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.domElement = domElement;

    this.objectSelector = new ObjectSelector(scene, camera, renderer, domElement);
    this.transformControls = new ObjectTransformControls(scene, camera, renderer, domElement);
    this.boundsHelper = new ObjectBoundsHelper(scene, { labelBackground: false });
    this.transformSession = new TransformSession(scene);

    this.enabled = false;
    this.selectedObject = null;

    this.eventListeners = new Map();

    this.config = {
      enableTransformControls: true,
      defaultTransformMode: 'translate',
      enableHover: true,
      highlightConfig: {
        color: 0x00ff00,
        emissive: 0x004400,
        emissiveIntensity: 0.2,
      },
    };

    this._tmpBox = new THREE.Box3();
    this._tmpCenter = new THREE.Vector3();

    this.setupEvents();
  }

  setupEvents() {
    this.objectSelector.on('objectSelected', (object: SelectableObject) => {
      this.selectedObject = object;

      if (this.config.enableTransformControls) {
        this.beginTransformSession([object]);
      }

      this.boundsHelper?.attach?.(object);
      this.emit('objectSelected', object);
    });

    this.objectSelector.on('objectDeselected', (object: SelectableObject) => {
      this.endTransformSession({ commit: false });
      this.selectedObject = null;
      this.boundsHelper?.detach?.();
      this.emit('objectDeselected', object);
    });

    this.objectSelector.on('selectionCleared', () => {
      this.endTransformSession({ commit: false });
      this.selectedObject = null;
      this.boundsHelper?.detach?.();
      this.emit('selectionCleared');
    });

    this.transformControls.on('draggingChanged', (isDragging: boolean) => {
      if (isDragging) {
        this.beginDragInteraction();
      } else {
        this.endDragInteraction(true);
      }
      this.emit('draggingChanged', isDragging);
    });

    this.transformControls.on('objectTransformed', () => {
      this.updateTransformSession();
    });

    this.transformControls.on('modeChanged', (mode: TransformMode) => {
      this.emit('transformModeChanged', mode);
    });

    this.transformControls.on('controlMouseDown', () => {
      this.emit('controlMouseDown');
    });

    this.transformControls.on('controlMouseUp', () => {
      this.emit('controlMouseUp');
    });
  }

  enable() {
    if (this.enabled) return;

    this.enabled = true;
    this.objectSelector.enable();
    if (this.config.enableTransformControls) {
      this.transformControls.enable();
      if (this.selectedObject) {
        this.beginTransformSession([this.selectedObject]);
      }
    }

    this.emit('enabled');
  }

  disable() {
    if (!this.enabled) return;

    this.enabled = false;

    this.endTransformSession({ commit: false });
    this.objectSelector.disable();
    this.transformControls.disable();

    this.selectedObject = null;
    this.boundsHelper?.detach?.();

    this.emit('disabled');
  }

  beginTransformSession(targets: SelectableObject[] = []) {
    if (!this.config.enableTransformControls) {
      return null;
    }

    const result = this.transformSession.begin(targets, {
      mode: this.getTransformMode(),
    });

    if (!result) {
      this.transformControls.detach();
      return null;
    }

    this.transformControls.attach(result.pivotHandle);
    this._emitBBoxUpdated();
    return result;
  }

  updateTransformSession() {
    const preview = this.transformSession.updateFromPivot();
    if (!preview) return null;

    const primaryObject = this.selectedObject;
    if (primaryObject) {
      this.boundsHelper?.update?.(primaryObject);
    }

    this.emit('transform:preview', preview as TransformPreviewEventPayload);
    this._emitLegacyObjectTransformed(preview);
    this._emitBBoxUpdated();

    return preview;
  }

  endTransformSession(options: { commit?: boolean } = {}) {
    const commit = !!options.commit;
    if (this.transformSession.hasInteraction()) {
      this.endDragInteraction(commit);
    }

    this.transformControls.detach();
    this.transformSession.end();
  }

  beginDragInteraction() {
    const mode = this.getTransformMode();
    const startPayload = this.transformSession.beginInteraction(mode as TransformMode);
    if (!startPayload) {
      return null;
    }

    this.emit('dragStart', {
      object: this.selectedObject,
      mode,
    });

    this.emit('transform:start', startPayload as TransformStartEventPayload);
    return startPayload;
  }

  endDragInteraction(commit = true) {
    const result = this.transformSession.finishInteraction(commit);
    if (!result) {
      return null;
    }

    if (this.selectedObject) {
      this.boundsHelper?.update?.(this.selectedObject);
    }

    this._emitBBoxUpdated();

    if (commit) {
      this.emit('dragEnd', {
        object: this.selectedObject,
        mode: result.mode,
      });

      this.emit('transform:commit', {
        mode: result.mode,
        before: result.before,
        after: result.after,
      } as TransformCommitEventPayload);

      const legacyPayload = this._buildLegacyTransformData(result.after[0], result.mode);
      if (legacyPayload) {
        this.emit('objectTransformed', legacyPayload);
      }
      return result;
    }

    this.emit('transform:cancel', {
      mode: result.mode,
      targetIds: result.targetIds,
    } as TransformCancelEventPayload);

    const legacyPayload = this._buildLegacyTransformData(result.after[0], result.mode);
    if (legacyPayload) {
      this.emit('objectTransformed', legacyPayload);
    }
    return result;
  }

  cancelCurrentTransform() {
    if (!this.transformSession.hasInteraction()) {
      return false;
    }

    this.endDragInteraction(false);
    return true;
  }

  getSelectionBox() {
    return this.transformSession.getSelectionBox(new THREE.Box3());
  }

  setSelectableObjects(objects: SelectableObject[]) {
    this.objectSelector.setSelectableObjects(objects);
  }

  addSelectableObject(object: SelectableObject) {
    this.objectSelector.addSelectableObject(object);
  }

  removeSelectableObject(object: SelectableObject) {
    this.objectSelector.removeSelectableObject(object);
  }

  selectObject(object: SelectableObject) {
    this.objectSelector.selectObject(object);
  }

  clearSelection() {
    this.objectSelector.clearSelection();
  }

  getSelectedObject() {
    return this.selectedObject;
  }

  setTransformMode(mode: TransformMode) {
    this.transformControls.setMode(mode);
  }

  getTransformMode() {
    return this.transformControls.getMode() as TransformMode;
  }

  setTransformControlsEnabled(enabled: boolean) {
    this.config.enableTransformControls = enabled;

    if (enabled) {
      this.transformControls.enable();
      if (this.selectedObject) {
        this.beginTransformSession([this.selectedObject]);
      }
      return;
    }

    this.endTransformSession({ commit: false });
    this.transformControls.disable();
  }

  isDragging() {
    return this.transformControls.isDragging();
  }

  setHighlightConfig(config: Record<string, CoreValue>) {
    Object.assign(this.config.highlightConfig, config);
    this.objectSelector.setHighlightConfig(this.config.highlightConfig);
  }

  setTransformConfig(config: Record<string, CoreValue>) {
    if (config.size !== undefined) {
      this.transformControls.setSize(config.size as number);
    }

    if (config.space !== undefined) {
      this.transformControls.setSpace(config.space as 'local' | 'world');
    }

    if (config.axes !== undefined) {
      this.transformControls.setAxesVisibility(config.axes as { x?: boolean; y?: boolean; z?: boolean });
    }

    if (config.snap !== undefined) {
      this.transformControls.setSnap(config.snap as Record<string, CoreValue>);
    }
  }

  getState() {
    return {
      enabled: this.enabled,
      selectedObject: this.selectedObject
        ? {
            name: this.selectedObject.name || 'Unnamed',
            uuid: this.selectedObject.uuid,
            position: this.selectedObject.position.clone(),
            rotation: this.selectedObject.rotation.clone(),
            scale: this.selectedObject.scale.clone(),
          }
        : null,
      transformMode: this.transformControls.getMode(),
      isDragging: this.transformControls.isDragging(),
      config: { ...this.config },
    };
  }

  on(eventName: string, callback: Function) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName)?.push(callback);
  }

  off(eventName: string, callback: Function) {
    if (!this.eventListeners.has(eventName)) return;

    const listeners = this.eventListeners.get(eventName);
    if (!listeners) return;

    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  emit(eventName: string, ...args: CoreValue[]) {
    if (!this.eventListeners.has(eventName)) return;

    const listeners = this.eventListeners.get(eventName) || [];
    listeners.forEach((callback) => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error);
      }
    });
  }

  destroy() {
    this.disable();
    this.objectSelector.destroy();
    this.transformControls.destroy();
    this.boundsHelper?.dispose?.();
    this.transformSession.dispose();
    this.eventListeners.clear();
    this.selectedObject = null;
  }

  private _emitLegacyObjectTransformed(preview: TransformPreviewEventPayload) {
    const first = preview.targets[0];
    if (!first) return;
    const payload = this._buildLegacyTransformData(first, preview.mode);
    if (payload) {
      this.emit('objectTransformed', payload);
    }
  }

  private _buildLegacyTransformData(snapshot: TransformSnapshot | undefined, mode: TransformMode) {
    if (!snapshot || !this.selectedObject) {
      return null;
    }

    return {
      object: this.selectedObject,
      mode,
      position: new THREE.Vector3(...snapshot.position),
      rotation: new THREE.Euler(...snapshot.rotation),
      scale: new THREE.Vector3(...snapshot.scale),
    };
  }

  private _emitBBoxUpdated() {
    if (!this.transformSession.hasSession()) {
      return;
    }

    const selectionBox = this.transformSession.getSelectionBox(this._tmpBox);
    if (selectionBox.isEmpty()) {
      return;
    }

    const selectionCenter = selectionBox.getCenter(this._tmpCenter);
    const targets = this.transformSession.targets.map((targetObject: BoxLikeObject) => {
      const box = this._resolveObjectWorldBox(targetObject);
      const center = box.getCenter(new THREE.Vector3());
      return {
        id: this._resolveObjectId(targetObject),
        box: {
          min: [box.min.x, box.min.y, box.min.z],
          max: [box.max.x, box.max.y, box.max.z],
        },
        anchors: {
          center: [center.x, center.y, center.z],
          corners: [] as number[][],
          faceCenters: [] as number[][],
          edgeCenters: [] as number[][],
        },
      };
    });

    this.emit('bbox:updated', {
      targetIds: targets.map((target) => target.id),
      selection: {
        min: [selectionBox.min.x, selectionBox.min.y, selectionBox.min.z],
        max: [selectionBox.max.x, selectionBox.max.y, selectionBox.max.z],
        anchors: {
          center: [selectionCenter.x, selectionCenter.y, selectionCenter.z],
          corners: [] as number[][],
          faceCenters: [] as number[][],
          edgeCenters: [] as number[][],
        },
      },
      targets,
    });
  }

  private _resolveObjectId(object: SelectableObject) {
    const entityKey = object?.userData?.entityKey;
    if (typeof entityKey === 'string' && entityKey.length > 0) {
      return entityKey;
    }
    return object.uuid;
  }

  private _resolveObjectWorldBox(object: BoxLikeObject) {
    if (typeof object.getWorldBox === 'function') {
      const box = object.getWorldBox(false);
      if (box?.isBox3) {
        return box.clone();
      }
    }

    const box = new THREE.Box3();
    box.setFromObject(object);
    return box;
  }
}

export { ObjectSelector, ObjectTransformControls };

