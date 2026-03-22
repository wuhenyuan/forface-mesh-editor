import * as THREE from 'three';
import EditorTaskWorkerBridge from '../tasks/EditorTaskWorkerBridge';
import {
  collectBooleanSourceTransferables,
  serializeObjectSourceForBoolean,
} from '../tasks/sceneSerialization';
import { hydrateBufferGeometry, hydrateMaterialDescriptor } from '../tasks/serialization';
import {
  normalizeModelBooleanOp,
  type ModelBooleanOpInput,
} from './ModelCSG';
import type { WorkerTaskProgress } from '../tasks/types';

type BooleanSource = {
  key: string;
  object: THREE.Object3D;
  op?: ModelBooleanOpInput;
  version?: string | number;
  cacheKey?: string;
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
  onProgress?: (progress: WorkerTaskProgress) => void;
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
  private _onProgress?: (progress: WorkerTaskProgress) => void;
  private _resultMesh: THREE.Mesh | null;
  private _updateToken: number;
  private _scheduledToken: ReturnType<typeof setTimeout> | null;
  private _busy: boolean;
  private _bridge: EditorTaskWorkerBridge;
  private _activeTaskId: string | null;

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
    this._onProgress = options.onProgress;
    this._resultMesh = null;
    this._updateToken = 0;
    this._scheduledToken = null;
    this._busy = false;
    this._bridge = EditorTaskWorkerBridge.getShared();
    this._activeTaskId = null;
  }

  scheduleUpdate() {
    if (this._isDisposed?.()) return;
    if (this._scheduledToken) {
      clearTimeout(this._scheduledToken);
      this._scheduledToken = null;
    }
    if (this._busy && this._activeTaskId) {
      this._bridge.cancelTask(this._activeTaskId);
    }
    const token = ++this._updateToken;
    this._scheduledToken = setTimeout(() => {
      this._scheduledToken = null;
      this._update(token).catch((error) => {
        if (error instanceof Error && error.message === 'cancelled') {
          return;
        }
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
    if (this._activeTaskId) {
      this._bridge.cancelTask(this._activeTaskId);
      this._activeTaskId = null;
    }
    this.clearResult();
    this._busy = false;
  }

  private async _update(token: number) {
    if (this._isDisposed?.()) return;
    if (this._isBlocked?.()) return;
    if (this._busy) return;

    this._busy = true;
    const taskId = this._bridge.createTaskId('boolean');
    this._activeTaskId = taskId;

    try {
      if (token !== this._updateToken) return;

      const sources = this._getSources();
      const serializedSources = [];
      sources.forEach((source) => {
        const op = normalizeModelBooleanOp(source.op) || 'union';
        const serialized = serializeObjectSourceForBoolean(source.key, source.object, op, {
          version: source.version,
          cacheKey: source.cacheKey,
        });
        if (serialized) {
          serializedSources.push(serialized);
        }
      });

      if (serializedSources.length < 2) {
        this.clearResult();
        return;
      }

      const transferables = collectBooleanSourceTransferables(serializedSources);
      const result = await this._bridge.runBooleanTask(
        {
          sources: serializedSources,
        },
        {
          taskId,
          transferables,
          onProgress: (progress) => {
            this._onProgress?.(progress);
          },
        }
      );

      if (token !== this._updateToken || this._isDisposed?.()) {
        return;
      }

      const geometry = hydrateBufferGeometry(result.geometry);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const materialList =
        result.materials?.length > 0
          ? result.materials.map((material) => hydrateMaterialDescriptor(material))
          : [new THREE.MeshStandardMaterial()];

      const resultMesh = new THREE.Mesh(
        geometry,
        materialList.length <= 1 ? materialList[0] : materialList
      );
      resultMesh.name = 'csgResult';
      resultMesh.castShadow = true;
      resultMesh.receiveShadow = true;
      resultMesh.userData = {
        ...(resultMesh.userData || {}),
        isCSGResult: true,
      };

      this.clearResult();
      this._csgGroup?.add?.(resultMesh);
      this._resultMesh = resultMesh;
      this.syncVisibilityAndSelection();
    } catch (error) {
      const normalized = this._toError(error);
      if (normalized.message !== 'cancelled') {
        this._onError?.(normalized);
      }
    } finally {
      if (this._activeTaskId === taskId) {
        this._activeTaskId = null;
      }
      this._busy = false;
      if (!this._isDisposed?.() && token !== this._updateToken) {
        this.scheduleUpdate();
      }
    }
  }

  private _toError(error: Error | string) {
    if (error instanceof Error) return error;
    return new Error(typeof error === 'string' ? error : 'CSG update failed');
  }
}

export default ModelBooleanController;
