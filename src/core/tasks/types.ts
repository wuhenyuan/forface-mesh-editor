export type TypedArrayValue =
  | Float32Array
  | Float64Array
  | Uint32Array
  | Int32Array
  | Uint16Array
  | Int16Array
  | Uint8Array
  | Int8Array
  | Uint8ClampedArray;

export type TypedArrayName =
  | 'Float32Array'
  | 'Float64Array'
  | 'Uint32Array'
  | 'Int32Array'
  | 'Uint16Array'
  | 'Int16Array'
  | 'Uint8Array'
  | 'Int8Array'
  | 'Uint8ClampedArray';

export type SerializedAttributeData = {
  type: TypedArrayName;
  array: TypedArrayValue;
  itemSize: number;
  normalized: boolean;
};

export type SerializedGeometryGroup = {
  start: number;
  count: number;
  materialIndex: number;
};

export type SerializedBox3 = {
  min: [number, number, number];
  max: [number, number, number];
};

export type SerializedGeometryData = {
  attributes: Record<string, SerializedAttributeData | undefined>;
  index?: SerializedAttributeData | null;
  groups: SerializedGeometryGroup[];
  boundingBox?: SerializedBox3 | null;
};

export type SerializedMaterialData = {
  id: string;
  name: string;
  color?: number;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  transparent?: boolean;
  emissive?: number;
  mapName?: string;
  normalMapName?: string;
  roughnessMapName?: string;
  metalnessMapName?: string;
  aoMapName?: string;
  emissiveMapName?: string;
};

export type SerializedTextureFile = {
  name: string;
  type: string;
  size: number;
  buffer: ArrayBuffer;
};

export type SerializedMeshData = {
  id: string;
  name: string;
  geometry: SerializedGeometryData;
  matrixWorld: Float32Array;
  materials: SerializedMaterialData[];
};

export type BooleanOperationType = 'union' | 'subtract' | 'intersect' | 'difference';

export type SerializedBooleanSource = {
  id: string;
  version?: string | number;
  cacheKey?: string;
  op: BooleanOperationType;
  geometry?: SerializedGeometryData | null;
  matrixWorld?: Float32Array | null;
  materials?: SerializedMaterialData[];
  meshes?: SerializedMeshData[];
};

export type BooleanTaskPayload = {
  sources: SerializedBooleanSource[];
};

export type ExportZipTaskPayload = {
  filename: string;
  objects: SerializedMeshData[];
  textureFiles: SerializedTextureFile[];
  compressionLevel?: number;
};

export type BooleanPhaseName =
  | 'prepare'
  | 'build-cache'
  | 'csg-core'
  | 'rebuild-result'
  | 'transfer';

export type ExportPhaseName =
  | 'collect'
  | 'estimate'
  | 'export-obj'
  | 'zip'
  | 'finalize';

export type WorkerPhaseName = BooleanPhaseName | ExportPhaseName;
export type WorkerTaskType = 'boolean' | 'exportZip';

export type BooleanTaskResult = {
  geometry: SerializedGeometryData;
  materials: SerializedMaterialData[];
  cacheHit: boolean;
  cacheKey: string;
  metrics: {
    totalMs: number;
    coreMs: number;
    triA: number;
    triB: number;
    bboxOverlapRatio: number;
    coplanarRisk: number;
    estimatedCoreMs: number;
    sourceCacheHits?: number;
    resultCacheHits?: number;
    computedSteps?: number;
    totalSteps?: number;
    fullCacheHit?: boolean;
  };
};

export type ExportZipTaskResult = {
  filename: string;
  mimeType: string;
  extension: string;
  buffer: ArrayBuffer;
  size: number;
  metrics: {
    meshCount: number;
    vertexCount: number;
    faceCount: number;
    estimatedObjMs: number;
    estimatedZipMs: number;
    compressionLevel: number;
  };
};

export type WorkerProgressDetail = Record<string, unknown> & {
  taskType?: WorkerTaskType;
  phaseName?: WorkerPhaseName;
  phaseProgress?: number;
  cacheHit?: boolean;
  currentFile?: string;
  simulatedMs?: number;
  simulatedCeilingProgress?: number;
  estimatedCoreMs?: number;
  estimatedObjMs?: number;
  estimatedZipMs?: number;
  objWeight?: number;
  zipWeight?: number;
  sourceCacheHits?: number;
  sourceCacheMisses?: number;
  resultCacheHits?: number;
  computedSteps?: number;
  totalSteps?: number;
};

export type WorkerRequest =
  | {
      type: 'boolean';
      taskId: string;
      payload: BooleanTaskPayload;
    }
  | {
      type: 'exportZip';
      taskId: string;
      payload: ExportZipTaskPayload;
    }
  | {
      type: 'cancel';
      taskId: string;
    }
  | {
      type: 'clearCache';
    }
  | {
      type: 'getStats';
    };

export type WorkerResponse =
  | {
      type: 'progress';
      taskId: string;
      phase: WorkerPhaseName;
      progress: number;
      detail?: WorkerProgressDetail;
      message?: string;
    }
  | {
      type: 'result';
      taskId: string;
      payload: BooleanTaskResult | ExportZipTaskResult;
    }
  | {
      type: 'error';
      taskId: string;
      error: string;
    }
  | {
      type: 'stats';
      payload: {
        queue: {
          activeTaskId: string | null;
          pendingCount: number;
        };
        caches: {
          geometry: {
            size: number;
            hits: number;
            misses: number;
            maxEntries: number;
          };
          result: {
            size: number;
            hits: number;
            misses: number;
            maxEntries: number;
          };
        };
        history: {
          booleanSamples: number;
          exportSamples: number;
        };
      };
    };

export type WorkerTaskProgress = Extract<WorkerResponse, { type: 'progress' }>;
