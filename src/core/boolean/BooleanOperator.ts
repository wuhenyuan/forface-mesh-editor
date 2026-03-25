import * as THREE from 'three';
import { annotateEntityMaterial } from '../entities/EntityHitUtils';
import EditorTaskWorkerBridge from '../tasks/EditorTaskWorkerBridge';
import {
  collectBooleanSourceTransferables,
  serializeBinaryBooleanSources,
} from '../tasks/sceneSerialization';
import { hydrateBufferGeometry, hydrateMaterialDescriptor } from '../tasks/serialization';
import type { WorkerTaskProgress } from '../tasks/types';

type BooleanCallbacks = {
  onProgress?: (progress: WorkerTaskProgress) => void;
  onError?: (error: Error) => void;
};

type BooleanOperationOptions = Record<string, CoreValue> & {
  onProgress?: (progress: WorkerTaskProgress) => void;
};

type BooleanOperationResult = {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
};

type BatchOperation = {
  geometry: THREE.BufferGeometry;
  matrix?: THREE.Matrix4 | null;
  operation: 'subtract' | 'union' | 'intersect';
};

export class BooleanOperator {
  private _bridge: EditorTaskWorkerBridge;
  private _callbacks: BooleanCallbacks;
  private _activeTaskId: string | null;

  /**
   * 初始化布尔操作器，并绑定主线程侧的进度与错误回调。
   */
  constructor(callbacks: BooleanCallbacks = {}) {
    this._bridge = EditorTaskWorkerBridge.getShared();
    this._callbacks = callbacks;
    this._activeTaskId = null;
  }

  /**
   * 返回当前操作器是否可用。
   */
  isReady() {
    return true;
  }

  /**
   * 更新进度与错误回调。
   */
  setCallbacks(callbacks: BooleanCallbacks = {}) {
    this._callbacks = callbacks;
  }

  /**
   * 执行减法布尔，并补齐宿主与工具区域的材质信息。
   */
  async subtract(
    targetGeometry: THREE.BufferGeometry,
    toolGeometry: THREE.BufferGeometry,
    toolMatrix: THREE.Matrix4 | null = null,
    options: BooleanOperationOptions = {}
  ): Promise<BooleanOperationResult> {
    // 布尔减法返回后，结果通常会拆成“宿主区域 + 工具切出的区域”两套材质。
    // 因此在真正发给 worker 之前，先在主线程准备好材质及其实体标记，
    // 这样结果回写到场景后，点击命中、区域着色、实体追踪都还能成立。
    const targetMaterial = this._buildTargetMaterial(options);
    const toolMaterial = this._buildToolMaterial(options);

    annotateEntityMaterial(targetMaterial, {
      entityKey: this._asString(options.targetEntityKey) || this._asString(options.sourceEntityId),
      sourceEntityId:
        this._asString(options.targetEntityKey) || this._asString(options.sourceEntityId),
      regionRole: 'base',
    });
    annotateEntityMaterial(toolMaterial, {
      entityKey:
        this._asString(options.toolEntityKey) ||
        this._asString(options.regionOwnerEntityId) ||
        this._asString(options.entityKey) ||
        this._asString(options.textId),
      sourceEntityId:
        this._asString(options.toolEntityKey) ||
        this._asString(options.regionOwnerEntityId) ||
        this._asString(options.entityKey) ||
        this._asString(options.textId),
      regionOwnerEntityId:
        this._asString(options.regionOwnerEntityId) ||
        this._asString(options.toolEntityKey) ||
        this._asString(options.entityKey) ||
        this._asString(options.textId),
      textId: this._asString(options.textId),
      isEngravedText: true,
      regionRole: this._asString(options.regionRole) || 'subtract',
    });

    const result = await this._runBinaryOperation('subtract', targetGeometry, toolGeometry, toolMatrix, {
      ...options,
      materialsA: [targetMaterial],
      materialsB: [toolMaterial],
    });

    return {
      geometry: result.geometry,
      materials: result.materials.length > 0 ? result.materials : [targetMaterial, toolMaterial],
    };
  }

  /**
   * 执行并集布尔。
   */
  async union(
    geometry1: THREE.BufferGeometry,
    geometry2: THREE.BufferGeometry,
    matrix2: THREE.Matrix4 | null = null,
    options: BooleanOperationOptions = {}
  ) {
    const result = await this._runBinaryOperation('union', geometry1, geometry2, matrix2, options);
    return result.geometry;
  }

  /**
   * 执行交集布尔。
   */
  async intersect(
    geometry1: THREE.BufferGeometry,
    geometry2: THREE.BufferGeometry,
    matrix2: THREE.Matrix4 | null = null,
    options: BooleanOperationOptions = {}
  ) {
    const result = await this._runBinaryOperation(
      'intersect',
      geometry1,
      geometry2,
      matrix2,
      options
    );
    return result.geometry;
  }

  /**
   * 按顺序对一组操作执行批量布尔运算。
   */
  async batchOperation(baseGeometry: THREE.BufferGeometry, operations: BatchOperation[] = []) {
    let currentGeometry = baseGeometry.clone();

    for (const operation of operations) {
      const result = await this._runBinaryOperation(
        operation.operation,
        currentGeometry,
        operation.geometry,
        operation.matrix || null
      );

      if (currentGeometry !== baseGeometry) {
        currentGeometry.dispose();
      }
      currentGeometry = result.geometry;
    }

    return currentGeometry;
  }

  /**
   * 校验几何体是否满足布尔运算的最小要求。
   */
  validateGeometry(geometry: THREE.BufferGeometry) {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!geometry) {
      errors.push('Geometry is required');
      return { isValid: false, errors, warnings };
    }

    if (!geometry.isBufferGeometry) {
      errors.push('Only BufferGeometry is supported');
    }

    const position = geometry.getAttribute('position');
    if (!position) {
      errors.push('Geometry is missing position attribute');
    } else if (position.count < 3) {
      errors.push('Geometry does not contain enough vertices');
    }

    const vertexCount = position ? position.count : 0;
    const faceCount = geometry.index ? geometry.index.count / 3 : vertexCount / 3;

    if (!geometry.getIndex()) {
      warnings.push('Geometry has no index and will be normalized before boolean evaluation');
    }

    if (faceCount > 50000) {
      warnings.push('Geometry is complex (>50000 faces) and may take noticeable time');
    } else if (faceCount > 10000) {
      warnings.push('Geometry is moderately complex (>10000 faces)');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      faceCount,
      vertexCount,
    };
  }

  /**
   * 对几何体做最基础的标准化处理，便于后续布尔运算。
   */
  optimizeGeometry(geometry: THREE.BufferGeometry) {
    if (!geometry) return geometry;
    const optimized = geometry.clone();
    if (!optimized.index) {
      optimized.setIndex([...Array(optimized.getAttribute('position')?.count || 0).keys()]);
    }
    optimized.computeVertexNormals();
    optimized.computeBoundingBox();
    optimized.computeBoundingSphere();
    return optimized;
  }

  /**
   * 返回当前布尔实现的运行时能力信息。
   */
  getStats() {
    return {
      libraryLoaded: true,
      libraryName: 'three-bvh-csg',
      workerBacked: true,
      supportedOperations: ['subtract', 'union', 'intersect'],
    };
  }

  /**
   * 预留的配置入口，当前实现不需要额外配置。
   */
  setOptions(_options: Record<string, CoreValue> = {}) {}

  /**
   * 取消当前正在执行的 worker 任务。
   */
  cancelActiveTask() {
    if (this._activeTaskId) {
      this._bridge.cancelTask(this._activeTaskId);
      this._activeTaskId = null;
    }
  }

  /**
   * 销毁操作器，并清理活动任务与回调引用。
   */
  destroy() {
    this.cancelActiveTask();
    this._callbacks = {};
  }

  /**
   * 统一执行二元布尔运算，并负责主线程与 worker 之间的数据往返。
   */
  private async _runBinaryOperation(
    operation: 'subtract' | 'union' | 'intersect',
    geometryA: THREE.BufferGeometry,
    geometryB: THREE.BufferGeometry,
    matrixB: THREE.Matrix4 | null = null,
    options: BooleanOperationOptions & {
      materialsA?: THREE.Material[];
      materialsB?: THREE.Material[];
    } = {}
  ): Promise<BooleanOperationResult> {
    // 这一层是主线程侧真正的布尔入口：
    // 1. 校验输入几何；
    // 2. 序列化成 worker 可传输的 source；
    // 3. 通过 bridge 发起异步任务；
    // 4. 把 worker 返回的纯数据还原成 three 运行时对象。
    const validationA = this.validateGeometry(geometryA);
    const validationB = this.validateGeometry(geometryB);
    if (!validationA.isValid) {
      throw new Error(validationA.errors[0] || 'Invalid geometry A');
    }
    if (!validationB.isValid) {
      throw new Error(validationB.errors[0] || 'Invalid geometry B');
    }

    // worker 线程不能直接消费当前线程里的 BufferGeometry / Material 实例，
    // 所以这里先把几何、矩阵、材质全部压成可结构化克隆的数据。
    const sources = serializeBinaryBooleanSources(geometryA, geometryB, operation, {
      sourceAId:
        this._asString(options.targetEntityKey) ||
        this._asString(options.sourceEntityId) ||
        'boolean_source_a',
      sourceBId:
        this._asString(options.toolEntityKey) ||
        this._asString(options.regionOwnerEntityId) ||
        this._asString(options.entityKey) ||
        this._asString(options.textId) ||
        'boolean_source_b',
      sourceAVersion: this._asVersion(options.sourceAVersion),
      sourceBVersion: this._asVersion(options.sourceBVersion),
      sourceACacheKey: this._asString(options.sourceACacheKey),
      sourceBCacheKey: this._asString(options.sourceBCacheKey),
      matrixB,
      materialsA: options.materialsA,
      materialsB: options.materialsB,
    });

    const transferables = collectBooleanSourceTransferables(sources);
    const taskId = this._bridge.createTaskId('boolean');
    this._activeTaskId = taskId;

    try {
      // 从这里开始正式切到“主线程 -> worker”链路。
      // bridge 负责管理 taskId、进度平滑、取消与消息分发，operator 只关心输入输出。
      const result = await this._bridge.runBooleanTask(
        { sources },
        {
          taskId,
          transferables,
          onProgress: (progress) => {
            this._callbacks.onProgress?.(progress);
            options.onProgress?.(progress);
          },
        }
      );

      // worker 返回的是序列化后的结果，回到主线程后再还原成真正的 three 对象。
      const geometry = hydrateBufferGeometry(result.geometry);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometry.computeVertexNormals();

      const materials =
        result.materials?.length > 0
          ? result.materials.map((material) => hydrateMaterialDescriptor(material))
          : [];

      return {
        geometry,
        materials,
      };
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Boolean task failed');
      this._callbacks.onError?.(normalizedError);
      throw normalizedError;
    } finally {
      if (this._activeTaskId === taskId) {
        this._activeTaskId = null;
      }
    }
  }

  /**
   * 构建宿主区域默认材质，必要时克隆调用方传入的材质。
   */
  private _buildTargetMaterial(options: BooleanOperationOptions) {
    const provided = (options.targetMaterial || options.baseMaterial) as THREE.Material | null;
    if (provided?.clone) {
      return provided.clone();
    }
    return new THREE.MeshStandardMaterial({
      color: 0x409eff,
      name: 'original_surface',
    });
  }

  /**
   * 构建工具区域默认材质，必要时克隆调用方传入的材质。
   */
  private _buildToolMaterial(options: BooleanOperationOptions) {
    const provided = (options.toolMaterial || options.engravedMaterial) as THREE.Material | null;
    if (provided?.clone) {
      return provided.clone();
    }
    return new THREE.MeshStandardMaterial({
      color: 0xff0000,
      name: this._asString(options.textId) ? `engraved_${this._asString(options.textId)}` : 'engraved_text',
    });
  }

  /**
   * 把动态值安全转换为非空字符串。
   */
  private _asString(value: CoreValue) {
    return typeof value === 'string' && value ? value : null;
  }

  /**
   * 把动态值转换为可参与版本签名的字符串或数字。
   */
  private _asVersion(value: CoreValue) {
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return undefined;
  }
}

export default BooleanOperator;
