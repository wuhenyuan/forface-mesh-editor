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

  constructor(callbacks: BooleanCallbacks = {}) {
    this._bridge = EditorTaskWorkerBridge.getShared();
    this._callbacks = callbacks;
    this._activeTaskId = null;
  }

  isReady() {
    return true;
  }

  setCallbacks(callbacks: BooleanCallbacks = {}) {
    this._callbacks = callbacks;
  }

  async subtract(
    targetGeometry: THREE.BufferGeometry,
    toolGeometry: THREE.BufferGeometry,
    toolMatrix: THREE.Matrix4 | null = null,
    options: BooleanOperationOptions = {}
  ): Promise<BooleanOperationResult> {
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

  async union(
    geometry1: THREE.BufferGeometry,
    geometry2: THREE.BufferGeometry,
    matrix2: THREE.Matrix4 | null = null,
    options: BooleanOperationOptions = {}
  ) {
    const result = await this._runBinaryOperation('union', geometry1, geometry2, matrix2, options);
    return result.geometry;
  }

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

  getStats() {
    return {
      libraryLoaded: true,
      libraryName: 'three-bvh-csg',
      workerBacked: true,
      supportedOperations: ['subtract', 'union', 'intersect'],
    };
  }

  setOptions(_options: Record<string, CoreValue> = {}) {}

  cancelActiveTask() {
    if (this._activeTaskId) {
      this._bridge.cancelTask(this._activeTaskId);
      this._activeTaskId = null;
    }
  }

  destroy() {
    this.cancelActiveTask();
    this._callbacks = {};
  }

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
    const validationA = this.validateGeometry(geometryA);
    const validationB = this.validateGeometry(geometryB);
    if (!validationA.isValid) {
      throw new Error(validationA.errors[0] || 'Invalid geometry A');
    }
    if (!validationB.isValid) {
      throw new Error(validationB.errors[0] || 'Invalid geometry B');
    }

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

  private _asString(value: CoreValue) {
    return typeof value === 'string' && value ? value : null;
  }

  private _asVersion(value: CoreValue) {
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return undefined;
  }
}

export default BooleanOperator;
