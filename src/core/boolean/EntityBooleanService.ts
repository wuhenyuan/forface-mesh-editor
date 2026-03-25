import * as THREE from 'three';
import { annotateEntityMaterial, resolveEntityKeyFromObject } from '../entities/EntityHitUtils';
import { BooleanOperator } from './BooleanOperator';
import type { WorkerTaskProgress } from '../tasks/types';

export type EntityBooleanMetadata = {
  targetEntityKey?: string | null;
  toolEntityKey?: string | null;
  regionOwnerEntityId?: string | null;
  regionRole?: string;
  compatibilityTextId?: string | null;
};

type EntityBooleanServiceOptions = {
  /**
   * 通用 CSG 操作器。
   * 当前默认实现仍然是 three-bvh-csg 的封装，
   * 但它已经不再归属于 surfaceText 模块。
   */
  operator?: BooleanOperator;
  onProgress?: (progress: WorkerTaskProgress) => void;
  onError?: (error: Error) => void;
};

type EntityBooleanSubtractOptions = EntityBooleanMetadata & {
  toolMatrix?: THREE.Matrix4 | null;
  targetMaterial?: THREE.Material | null;
  toolMaterial?: THREE.Material | null;
};

/**
 * 通用实体布尔服务。
 *
 * 这个服务只负责三件事：
 * 1. 统一生成布尔操作 metadata；
 * 2. 统一调用底层 CSG operator；
 * 3. 统一给结果材质补齐 entityKey / regionRole 等实体来源信息。
 *
 * 它不关心“工具几何从哪里来”，也不关心 UI、文字编辑态或选择框。
 */
export class EntityBooleanService {
  private _operator: BooleanOperator;
  private _onProgress: ((progress: WorkerTaskProgress) => void) | null;
  private _onError: ((error: Error) => void) | null;

  /**
   * 初始化实体布尔服务，并把底层 operator 回调接到当前 service。
   */
  constructor(options: EntityBooleanServiceOptions = {}) {
    this._onProgress = options.onProgress || null;
    this._onError = options.onError || null;
    this._operator =
      options.operator ||
      new BooleanOperator({
        onProgress: (progress) => {
          this._onProgress?.(progress);
        },
        onError: (error) => {
          this._onError?.(error);
        },
      });
    this._operator.setCallbacks({
      onProgress: (progress) => {
        this._onProgress?.(progress);
      },
      onError: (error) => {
        this._onError?.(error);
      },
    });
  }

  /**
   * 更新布尔进度上报函数。
   */
  setProgressReporter(callback: ((progress: WorkerTaskProgress) => void) | null = null) {
    this._onProgress = callback;
    this._operator.setCallbacks({
      onProgress: (progress) => {
        this._onProgress?.(progress);
      },
      onError: (error) => {
        this._onError?.(error);
      },
    });
  }

  /**
   * 更新布尔错误上报函数。
   */
  setErrorReporter(callback: ((error: Error) => void) | null = null) {
    this._onError = callback;
    this._operator.setCallbacks({
      onProgress: (progress) => {
        this._onProgress?.(progress);
      },
      onError: (error) => {
        this._onError?.(error);
      },
    });
  }

  /**
   * 从对象读取统一的实体主键。
   */
  getEntityKeyFromObject(object: THREE.Object3D | null | undefined) {
    return resolveEntityKeyFromObject(object);
  }

  /**
   * 构建减法布尔所需的统一 metadata。
   *
   * 这里保留 `compatibilityTextId`，是为了兼容旧链路仍然读取 `textId`
   * 的场景；但真正的主线已经是 `entityKey / sourceEntityId / regionOwnerEntityId`。
   */
  buildSubtractMetadata(
    metadata: EntityBooleanMetadata & {
      targetObject?: THREE.Object3D | null;
    } = {}
  ) {
    // 业务层传进来的信息可能来自不同对象：
    // 目标侧通常是被雕刻的 mesh，工具侧通常是文字实体本身。
    // 这里先把这些来源统一收敛成一份稳定 metadata，后面的 operator / worker /
    // 命中链路都只认这一套字段，不再关心上层对象长什么样。
    const targetEntityKey =
      metadata.targetEntityKey || this.getEntityKeyFromObject(metadata.targetObject || null) || null;
    const toolEntityKey = metadata.toolEntityKey || metadata.regionOwnerEntityId || null;

    return {
      textId: metadata.compatibilityTextId || undefined,
      targetEntityKey: targetEntityKey || undefined,
      toolEntityKey: toolEntityKey || undefined,
      regionOwnerEntityId: (metadata.regionOwnerEntityId || toolEntityKey) || undefined,
      regionRole: metadata.regionRole || 'subtract',
    };
  }

  /**
   * 执行实体减法布尔。
   */
  async subtract(
    targetGeometry: THREE.BufferGeometry,
    toolGeometry: THREE.BufferGeometry,
    options: EntityBooleanSubtractOptions = {}
  ) {
    // service 层不处理线程、缓存和序列化细节，
    // 这里只负责把“谁减谁”的业务语义压成一次标准减法调用。
    const metadata = this.buildSubtractMetadata(options);
    return this._operator.subtract(targetGeometry, toolGeometry, options.toolMatrix || null, {
      ...metadata,
      targetMaterial: options.targetMaterial || undefined,
      toolMaterial: options.toolMaterial || undefined,
    });
  }

  /**
   * 给宿主材质补齐实体来源 metadata。
   */
  annotateBaseMaterial(
    material: THREE.Material,
    options: {
      targetObject?: THREE.Object3D | null;
      targetEntityKey?: string | null;
      regionRole?: string;
    } = {}
  ) {
    const targetEntityKey =
      options.targetEntityKey || this.getEntityKeyFromObject(options.targetObject || null) || undefined;

    annotateEntityMaterial(material, {
      entityKey: targetEntityKey,
      sourceEntityId: targetEntityKey,
      regionRole: options.regionRole || 'base',
    });

    return material;
  }

  /**
   * 给工具侧材质补齐实体来源 metadata。
   */
  annotateToolMaterial(
    material: THREE.Material,
    options: {
      toolEntityKey?: string | null;
      regionOwnerEntityId?: string | null;
      regionRole?: string;
      compatibilityTextId?: string | null;
      materialIndex?: number;
    } = {}
  ) {
    const toolEntityKey = options.toolEntityKey || options.regionOwnerEntityId || undefined;

    annotateEntityMaterial(material, {
      entityKey: toolEntityKey,
      sourceEntityId: toolEntityKey,
      regionOwnerEntityId: options.regionOwnerEntityId || toolEntityKey,
      textId: options.compatibilityTextId || undefined,
      isEngravedText: options.regionRole === 'engraved' ? true : undefined,
      materialIndex: options.materialIndex,
      regionRole: options.regionRole || 'subtract',
    });

    return material;
  }

  /**
   * 对布尔操作返回的材质数组做统一标注。
   *
   * 当前默认约定：
   * - `materials[0]` 是宿主模型区域；
   * - `materials[1]` 是工具实体切出的区域。
   */
  annotateSubtractResultMaterials(
    materials: THREE.Material[] | undefined,
    options: {
      targetObject?: THREE.Object3D | null;
      targetEntityKey?: string | null;
      toolEntityKey?: string | null;
      regionOwnerEntityId?: string | null;
      regionRole?: string;
      compatibilityTextId?: string | null;
    } = {}
  ) {
    if (!materials || materials.length === 0) {
      return materials;
    }

    this.annotateBaseMaterial(materials[0], {
      targetObject: options.targetObject || null,
      targetEntityKey: options.targetEntityKey || null,
      regionRole: 'base',
    });

    if (materials[1]) {
      this.annotateToolMaterial(materials[1], {
        toolEntityKey: options.toolEntityKey || null,
        regionOwnerEntityId: options.regionOwnerEntityId || null,
        regionRole: options.regionRole || 'subtract',
        compatibilityTextId: options.compatibilityTextId || null,
      });
    }

    return materials;
  }
}

export default EntityBooleanService;
