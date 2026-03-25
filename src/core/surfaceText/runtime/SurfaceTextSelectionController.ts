import * as THREE from 'three';
import TransformSession from '../../objectSelection/TransformSession';
import { TextTransformControls } from '../TextTransformControls';
import TextSelectionBoxOverlay from './TextSelectionBoxOverlay';
import { resolveTextSelectionTarget } from './TextTransformTarget';
import type { SurfaceTextRuntimeObject, SurfaceTextSelectionBridge } from './types';

type MaybePromise<T> = T | Promise<T>;

type ManagedTextObject = SurfaceTextRuntimeObject & {
  mesh?: THREE.Mesh | null;
  modified?: number;
};

type SurfaceTextSelectionOptions = {
  syncEntitySelection?: boolean;
};

type SurfaceTextSelectionControllerOptions = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  getSelectedTextObject: () => ManagedTextObject | null;
  onSelectionTransformed?: (textObject: ManagedTextObject) => void;
  onDraggingChanged?: (isDragging: boolean) => void;
  onDragStart?: (textObject: ManagedTextObject) => void;
  onDragEnd?: (textObject: ManagedTextObject) => MaybePromise<void>;
};

export class SurfaceTextSelectionController {
  readonly transformControls: TextTransformControls;

  private _options: SurfaceTextSelectionControllerOptions;
  private _transformSession: TransformSession;
  private _selectionBoxOverlay: TextSelectionBoxOverlay;
  private _entitySelectionBridge: SurfaceTextSelectionBridge | null;

  constructor(options: SurfaceTextSelectionControllerOptions) {
    this._options = options;
    this._transformSession = new TransformSession(options.scene);
    this._selectionBoxOverlay = new TextSelectionBoxOverlay(options.scene);
    this.transformControls = new TextTransformControls(
      options.scene,
      options.camera,
      options.renderer
    );
    this._entitySelectionBridge = null;

    this._bindTransformControlEvents();
  }

  setEntitySelectionBridge(bridge: SurfaceTextSelectionBridge | null = null) {
    this._entitySelectionBridge = bridge || null;
    const useEntityBridge = !!this._entitySelectionBridge;
    this.transformControls?.setEnabled?.(!useEntityBridge);
    if (useEntityBridge) {
      this._clearRuntimeSelection();
    }
  }

  getCurrentTransformMode() {
    const mode = this.transformControls?.getMode?.();
    return ['translate', 'rotate', 'scale'].includes(mode) ? mode : 'translate';
  }

  select(textObject: ManagedTextObject | null, options: SurfaceTextSelectionOptions = {}) {
    if (!textObject) return null;

    const syncEntitySelection = options?.syncEntitySelection !== false;
    const selectionTarget = resolveTextSelectionTarget(textObject);

    if (this._hasEntityBridge()) {
      this._clearRuntimeSelection();
      if (syncEntitySelection) {
        this._entitySelectionBridge?.selectEntityObject?.(selectionTarget);
      }
      return textObject;
    }

    return this._activateRuntimeSelection(textObject);
  }

  deselect(textObject: ManagedTextObject | null, options: SurfaceTextSelectionOptions = {}) {
    const syncEntitySelection = options?.syncEntitySelection !== false;
    const selectionTarget = resolveTextSelectionTarget(textObject || undefined);

    if (syncEntitySelection && this._entitySelectionBridge?.clearEntitySelection) {
      this._entitySelectionBridge.clearEntitySelection(selectionTarget);
    }

    this._clearRuntimeSelection(textObject?.mesh || null);
  }

  syncSelection(textObject: ManagedTextObject | null) {
    if (!textObject) return null;

    const selectionTarget = resolveTextSelectionTarget(textObject);
    if (
      selectionTarget &&
      typeof this._entitySelectionBridge?.refreshEntityObjectSession === 'function'
    ) {
      this._entitySelectionBridge.refreshEntityObjectSession(selectionTarget);
      return null;
    }

    return this._activateRuntimeSelection(textObject);
  }

  dispose() {
    this._clearRuntimeSelection();
    this._selectionBoxOverlay.dispose?.();
    this._transformSession?.end?.();
    this.transformControls?.dispose?.();
    this._entitySelectionBridge = null;
  }

  private _bindTransformControlEvents() {
    this.transformControls.on?.('change', () => {
      const textObject = this._options.getSelectedTextObject();
      if (!textObject) return;

      this._transformSession?.updateFromPivot?.();
      this._selectionBoxOverlay.update();
      textObject.modified = Date.now();
      this._options.onSelectionTransformed?.(textObject);
    });

    this.transformControls.on?.('objectChange', () => {
      if (!this._options.getSelectedTextObject()) return;
      this._transformSession?.updateFromPivot?.();
      this._selectionBoxOverlay.update();
    });

    this.transformControls.on?.('dragging-changed', async (isDragging: boolean) => {
      this._options.onDraggingChanged?.(isDragging);

      const textObject = this._options.getSelectedTextObject();
      if (!textObject) return;

      if (isDragging) {
        this._transformSession?.beginInteraction?.(this.getCurrentTransformMode());
        this._options.onDragStart?.(textObject);
        return;
      }

      this._transformSession?.finishInteraction?.(true);
      this.syncSelection(textObject);
      await this._options.onDragEnd?.(textObject);
    });
  }

  private _hasEntityBridge() {
    return typeof this._entitySelectionBridge?.selectEntityObject === 'function';
  }

  private _activateRuntimeSelection(textObject: ManagedTextObject) {
    const selectionTarget = resolveTextSelectionTarget(textObject);
    if (!selectionTarget?.parent) {
      this._clearRuntimeSelection(textObject?.mesh || null);
      return null;
    }

    const result = this._transformSession.begin([selectionTarget], {
      mode: this.getCurrentTransformMode(),
    });
    this.transformControls.attach(result?.attachTarget || result?.pivotHandle || selectionTarget);

    this._addSelectionHighlight(textObject.mesh || null);
    if (textObject.mesh) {
      this._selectionBoxOverlay.attach(textObject.mesh, 0x52c41a);
      this._selectionBoxOverlay.update();
    } else {
      this._selectionBoxOverlay.clear();
    }

    return result;
  }

  private _clearRuntimeSelection(mesh: THREE.Mesh | null = null) {
    const targetMesh = mesh || this._options.getSelectedTextObject?.()?.mesh || null;
    this._transformSession?.end?.();
    this.transformControls.detach?.();
    this._removeSelectionHighlight(targetMesh);
    this._selectionBoxOverlay.clear();
  }

  private _addSelectionHighlight(mesh: THREE.Mesh | null) {
    if (!mesh) return;

    if (!mesh.userData.originalMaterial) {
      mesh.userData.originalMaterial = mesh.material;
    }

    mesh.material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      depthWrite: false,
    });
    mesh.renderOrder = 999;
  }

  private _removeSelectionHighlight(mesh: THREE.Mesh | null) {
    if (!mesh?.userData?.originalMaterial) return;

    mesh.material = mesh.userData.originalMaterial;
    delete mesh.userData.originalMaterial;
    mesh.renderOrder = 0;
  }
}

export default SurfaceTextSelectionController;
