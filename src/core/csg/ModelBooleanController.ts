import * as THREE from 'three';
import { ADDITION, Brush, DIFFERENCE, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import {
  createBrushFromObject,
  normalizeModelBooleanOp,
  type ModelBooleanOp,
  type ModelBooleanOpInput,
} from './ModelCSG';

type BooleanSource = {
  key: string;
  object: THREE.Object3D;
  op?: ModelBooleanOpInput;
};

type ModelBooleanControllerOptions = {
  csgGroup?: THREE.Group | null;
  entityGroup?: THREE.Group | null;
  getSources: () => BooleanSource[];
  getViewMode: () => 'construct' | 'result';
  getSelectableObjects: () => THREE.Object3D[];
  setSelectableObjects?: (objects: THREE.Object3D[]) => void;
  isBlocked?: () => boolean;
  isDisposed?: () => boolean;
  onError?: (error: Error) => void;
};

export class ModelBooleanController {
  private _csgGroup: THREE.Group | null;
  private _entityGroup: THREE.Group | null;
  private _getSources: () => BooleanSource[];
  private _getViewMode: () => 'construct' | 'result';
  private _getSelectableObjects: () => THREE.Object3D[];
  private _setSelectableObjects?: (objects: THREE.Object3D[]) => void;
  private _isBlocked?: () => boolean;
  private _isDisposed?: () => boolean;
  private _onError?: (error: Error) => void;
  private _resultMesh: THREE.Mesh | null;
  private _updateToken: number;
  private _scheduledToken: ReturnType<typeof setTimeout> | null;
  private _busy: boolean;

  constructor(options: ModelBooleanControllerOptions) {
    this._csgGroup = options.csgGroup || null;
    this._entityGroup = options.entityGroup || null;
    this._getSources = options.getSources;
    this._getViewMode = options.getViewMode;
    this._getSelectableObjects = options.getSelectableObjects;
    this._setSelectableObjects = options.setSelectableObjects;
    this._isBlocked = options.isBlocked;
    this._isDisposed = options.isDisposed;
    this._onError = options.onError;
    this._resultMesh = null;
    this._updateToken = 0;
    this._scheduledToken = null;
    this._busy = false;
  }

  scheduleUpdate() {
    if (this._isDisposed?.()) return;
    if (this._scheduledToken) {
      clearTimeout(this._scheduledToken);
      this._scheduledToken = null;
    }
    const token = ++this._updateToken;
    this._scheduledToken = setTimeout(() => {
      this._scheduledToken = null;
      this._update(token).catch((error) => {
        this._onError?.(this._toError(error));
      });
    }, 0);
  }

  clearResult() {
    if (!this._csgGroup) {
      this._resultMesh = null;
      this.syncVisibilityAndSelection();
      return;
    }

    const children = [...this._csgGroup.children];
    children.forEach((child) => {
      child.parent?.remove?.(child);
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((material) => material?.dispose?.());
      }
    });

    this._resultMesh = null;
    this.syncVisibilityAndSelection();
  }

  syncVisibilityAndSelection() {
    const hasCSG = this.hasResult();
    const viewMode = this._getViewMode();

    if (viewMode === 'result') {
      if (this._entityGroup) this._entityGroup.visible = !hasCSG;
      if (this._csgGroup) this._csgGroup.visible = hasCSG;
    } else {
      if (this._entityGroup) this._entityGroup.visible = true;
      if (this._csgGroup) this._csgGroup.visible = false;
    }

    if (this._setSelectableObjects) {
      const selectable =
        viewMode === 'result' && hasCSG && this._resultMesh
          ? [this._resultMesh]
          : this._getSelectableObjects();
      this._setSelectableObjects(selectable);
    }
  }

  hasResult() {
    return !!this._resultMesh && (this._csgGroup?.children?.length || 0) > 0;
  }

  dispose() {
    if (this._scheduledToken) {
      clearTimeout(this._scheduledToken);
      this._scheduledToken = null;
    }
    this.clearResult();
    this._busy = false;
  }

  private async _update(token: number) {
    if (this._isDisposed?.()) return;
    if (this._isBlocked?.()) return;
    if (this._busy) return;

    this._busy = true;
    try {
      if (token !== this._updateToken) return;

      const sources = this._getSources();
      const brushes: Array<{ key: string; brush: Brush; op: ModelBooleanOp }> = [];

      for (const source of sources) {
        if (!source?.object) continue;
        const brush = createBrushFromObject(source.object);
        if (!brush) continue;
        const op = normalizeModelBooleanOp(source.op) || 'union';
        brushes.push({ key: source.key, brush, op });
      }

      if (brushes.length < 2) {
        brushes.forEach((b) => b.brush?.geometry?.dispose?.());
        this.clearResult();
        return;
      }

      const evaluator = new Evaluator();
      evaluator.useGroups = true;
      evaluator.consolidateMaterials = true;

      let current = brushes[0].brush;
      for (let i = 1; i < brushes.length; i++) {
        const next = brushes[i].brush;
        const op = brushes[i].op;
        const operation =
          op === 'subtract'
            ? SUBTRACTION
            : op === 'intersect'
              ? INTERSECTION
              : op === 'difference'
                ? DIFFERENCE
                : ADDITION;

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

      const rawMaterials = current.material;
      const clonedMaterials = Array.isArray(rawMaterials)
        ? rawMaterials.map((material) => material?.clone?.() || new THREE.MeshStandardMaterial())
        : rawMaterials?.clone?.() || new THREE.MeshStandardMaterial();

      const resultMesh = new THREE.Mesh(current.geometry, clonedMaterials);
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

      this.clearResult();
      this._csgGroup?.add?.(resultMesh);
      this._resultMesh = resultMesh;
      this.syncVisibilityAndSelection();
    } finally {
      this._busy = false;
      if (!this._isDisposed?.() && token !== this._updateToken) {
        this.scheduleUpdate();
      }
    }
  }

  private _toError(error: Error | string): Error {
    if (error instanceof Error) return error;
    return new Error(typeof error === 'string' ? error : 'CSG update failed');
  }
}

export default ModelBooleanController;
