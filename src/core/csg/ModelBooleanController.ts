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

  /**
   * 初始化模型布尔控制器。
   */
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

  /**
   * 调度一次最新的布尔重算。
   */
  scheduleUpdate() {
    if (this._isDisposed?.()) return;
    if (this._scheduledToken) {
      clearTimeout(this._scheduledToken);
      this._scheduledToken = null;
    }
    // 只保留最新一轮布尔更新请求。
    // 如果旧任务还在 worker 中运行，先取消，避免过时结果晚到后覆盖新结果。
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

  /**
   * 清空当前场景中的布尔结果对象。
   */
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

  /**
   * 根据当前视图模式同步普通对象与 CSG 结果的可见性和可选中集合。
   */
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

  /**
   * 判断当前是否存在可展示的布尔结果。
   */
  hasResult() {
    return !!this._resultMesh && (this._csgGroup?.children?.length || 0) > 0;
  }

  /**
   * 释放控制器占用的任务和场景资源。
   */
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

  /**
   * 采集当前布尔源，发起 worker 计算，并把结果回写到场景。
   */
  private async _update(token: number) {
    if (this._isDisposed?.()) return;
    if (this._isBlocked?.()) return;
    if (this._busy) return;

    // controller 负责“场景对象 -> worker 输入 -> 场景结果”的完整闭环。
    this._busy = true;
    const taskId = this._bridge.createTaskId('boolean');
    this._activeTaskId = taskId;

    try {
      if (token !== this._updateToken) return;

      const sources = this._getSources();
      const serializedSources = [];
      sources.forEach((source) => {
        // worker 线程不能直接读取 Object3D 层级，所以这里先把场景对象序列化成纯几何 source。
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
      // bridge 会继续负责 taskId、进度回调和取消控制，controller 这里只做结果消费与转发。
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

      // worker 返回的是纯序列化数据，这里再还原成真正可挂到 csgGroup 的 Mesh。
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

      // 用最新结果替换旧的 csgResult，并同步场景可见性与可选中对象集合。
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

  /**
   * 规范化各种错误形态，统一返回 Error 实例。
   */
  private _toError(error: Error | string) {
    if (error instanceof Error) return error;
    return new Error(typeof error === 'string' ? error : 'CSG update failed');
  }
}

export default ModelBooleanController;
