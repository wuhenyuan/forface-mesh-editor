import JSZip from 'jszip';
import * as THREE from 'three';
import { Brush, Evaluator, INTERSECTION, SUBTRACTION, ADDITION, DIFFERENCE } from 'three-bvh-csg';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OBJExporter } from '../export/ObjExport';
import {
  collectGeometryTransferables,
  hydrateBufferGeometry,
  hydrateMaterialDescriptor,
  hydrateMatrix4,
  serializeBufferGeometry,
  serializeMaterialDescriptor,
} from './serialization';
import type {
  BooleanOperationType,
  BooleanTaskPayload,
  BooleanTaskResult,
  ExportZipTaskPayload,
  ExportZipTaskResult,
  SerializedBooleanSource,
  SerializedGeometryData,
  SerializedMaterialData,
  SerializedMeshData,
  WorkerProgressDetail,
  WorkerRequest,
  WorkerResponse,
} from './types';

type QueueTask = Extract<WorkerRequest, { type: 'boolean' | 'exportZip' }>;

type TaskControl = {
  cancelled: boolean;
};

type CachedBrushEntry = {
  cacheKey: string;
  brush: Brush;
  triCount: number;
  bbox: THREE.Box3;
};

type PreparedSource = CachedBrushEntry & {
  cacheHit: boolean;
};

type BooleanEvaluationPlan = {
  estimatedCoreMs: number;
  triA: number;
  triB: number;
  bboxOverlapRatio: number;
  coplanarRisk: number;
  opType: BooleanOperationType;
  resultCacheHits: number;
  totalSteps: number;
  computedSteps: number;
};

type BooleanSample = {
  op: BooleanOperationType;
  triA: number;
  triB: number;
  bboxOverlapRatio: number;
  coplanarRisk: number;
  cacheHit: boolean;
  totalMs: number;
  coreMs: number;
  predictedMs: number;
};

type ExportSample = {
  meshCount: number;
  vertexCount: number;
  faceCount: number;
  objMs: number;
  zipMs: number;
  totalBytes: number;
  compressionLevel: number;
  predictedObjMs: number;
  predictedZipMs: number;
};

type ExportStats = {
  meshCount: number;
  vertexCount: number;
  faceCount: number;
  hasNormals: boolean;
  hasUVs: boolean;
};

class LruCache<K, V> {
  private _map = new Map<K, V>();
  private _hits = 0;
  private _misses = 0;
  private _maxEntries: number;
  private _onEvict?: (key: K, value: V) => void;

  // 初始化一个带淘汰回调的简单 LRU 缓存。
  constructor(maxEntries: number, onEvict?: (key: K, value: V) => void) {
    this._maxEntries = Math.max(1, maxEntries);
    this._onEvict = onEvict;
  }

  // 读取缓存并刷新最近访问顺序。
  get(key: K) {
    if (!this._map.has(key)) {
      this._misses += 1;
      return null;
    }

    this._hits += 1;
    const value = this._map.get(key) as V;
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  // 只读取缓存，不更新最近访问顺序。
  peek(key: K) {
    return this._map.get(key) || null;
  }

  // 写入缓存，并在超限时淘汰最旧项。
  set(key: K, value: V) {
    if (this._map.has(key)) {
      const previous = this._map.get(key) as V;
      this._map.delete(key);
      if (previous !== value) {
        this._onEvict?.(key, previous);
      }
    }
    this._map.set(key, value);
    while (this._map.size > this._maxEntries) {
      const oldest = this._map.keys().next().value as K;
      const evicted = this._map.get(oldest);
      this._map.delete(oldest);
      if (evicted !== undefined) {
        this._onEvict?.(oldest, evicted);
      }
    }
  }

  // 清空缓存，并对每个条目执行淘汰回调。
  clear() {
    for (const [key, value] of this._map.entries()) {
      this._onEvict?.(key, value);
    }
    this._map.clear();
  }

  // 返回当前缓存命中统计。
  stats() {
    return {
      size: this._map.size,
      hits: this._hits,
      misses: this._misses,
      maxEntries: this._maxEntries,
    };
  }
}

class SampleHistory<T> {
  private _samples: T[] = [];
  private _limit: number;

  // 初始化固定长度的样本历史。
  constructor(limit: number) {
    this._limit = Math.max(1, limit);
  }

  // 写入一条样本，并在超限时移除最旧记录。
  add(sample: T) {
    this._samples.push(sample);
    while (this._samples.length > this._limit) {
      this._samples.shift();
    }
  }

  // 返回当前样本快照。
  values() {
    return [...this._samples];
  }

  // 返回当前样本数量。
  get size() {
    return this._samples.length;
  }
}

const BOOLEAN_PHASE_WEIGHTS = {
  prepare: 0.08,
  'build-cache': 0.17,
  'csg-core': 0.55,
  'rebuild-result': 0.15,
  transfer: 0.05,
} as const;

const EXPORT_STATIC_WEIGHTS = {
  collect: 0.06,
  estimate: 0.08,
  finalize: 0.04,
} as const;

const GEOMETRY_CACHE_MAX = 32;
const RESULT_CACHE_MAX = 24;
const HISTORY_LIMIT = 60;
const PROGRESS_THROTTLE_MS = 40;

const evaluator = new Evaluator();
evaluator.useGroups = true;
evaluator.consolidateMaterials = true;

const geometryCache = new LruCache<string, CachedBrushEntry>(GEOMETRY_CACHE_MAX, disposeCachedBrushEntry);
const resultCache = new LruCache<string, CachedBrushEntry>(RESULT_CACHE_MAX, disposeCachedBrushEntry);
const booleanHistory = new SampleHistory<BooleanSample>(HISTORY_LIMIT);
const exportHistory = new SampleHistory<ExportSample>(HISTORY_LIMIT);

const queue: QueueTask[] = [];
const taskControls = new Map<string, TaskControl>();
const lastProgressReport = new Map<string, { phase: string; progress: number; ts: number }>();

let activeTaskId: string | null = null;
let pendingCacheClear = false;
const workerScope = self as unknown as {
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
};

// worker 的统一消息入口，负责取消任务、清缓存、读取统计和排队执行任务。
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === 'cancel') {
    const control = taskControls.get(request.taskId);
    if (control) {
      control.cancelled = true;
    }

    const queuedIndex = queue.findIndex((item) => item.taskId === request.taskId);
    if (queuedIndex !== -1) {
      queue.splice(queuedIndex, 1);
      workerScope.postMessage({
        type: 'error',
        taskId: request.taskId,
        error: 'cancelled',
      } satisfies WorkerResponse);
    }
    return;
  }

  if (request.type === 'clearCache') {
    if (activeTaskId) {
      pendingCacheClear = true;
    } else {
      clearWorkerCaches();
    }
    return;
  }

  if (request.type === 'getStats') {
    workerScope.postMessage({
      type: 'stats',
      payload: {
        queue: {
          activeTaskId,
          pendingCount: queue.length,
        },
        caches: {
          geometry: geometryCache.stats(),
          result: resultCache.stats(),
        },
        history: {
          booleanSamples: booleanHistory.size,
          exportSamples: exportHistory.size,
        },
      },
    } satisfies WorkerResponse);
    return;
  }

  queue.push(request);
  if (!taskControls.has(request.taskId)) {
    taskControls.set(request.taskId, { cancelled: false });
  }
  void pumpQueue();
};

// 如果当前没有活动任务，就从队列中取下一项开始执行。
async function pumpQueue() {
  if (activeTaskId || queue.length === 0) {
    return;
  }

  const next = queue.shift();
  if (!next) {
    return;
  }

  const control = taskControls.get(next.taskId) || { cancelled: false };
  taskControls.set(next.taskId, control);
  activeTaskId = next.taskId;

  try {
    if (next.type === 'boolean') {
      await handleBooleanTask(next.taskId, next.payload, control);
    } else {
      await handleExportZipTask(next.taskId, next.payload, control);
    }
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      taskId: next.taskId,
      error: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse);
  } finally {
    activeTaskId = null;
    taskControls.delete(next.taskId);
    lastProgressReport.delete(next.taskId);
    if (pendingCacheClear) {
      clearWorkerCaches();
      pendingCacheClear = false;
    }
    void pumpQueue();
  }
}

// 处理布尔任务，并按固定阶段回传进度、结果和缓存命中信息。
async function handleBooleanTask(taskId: string, payload: BooleanTaskPayload, control: TaskControl) {
  // 布尔任务在 worker 中固定走这几个阶段：
  // prepare -> build-cache -> csg-core -> rebuild-result -> transfer。
  // 主线程看到的阶段文案、缓存命中信息和大部分进度细节都从这里发出。
  const totalStart = performance.now();
  assertNotCancelled(control);

  postProgress(taskId, 'prepare', BOOLEAN_PHASE_WEIGHTS.prepare, {
    taskType: 'boolean',
    phaseName: 'prepare',
    phaseProgress: 1,
  });

  const sources = payload.sources || [];
  if (sources.length < 2) {
    throw new Error('Boolean task requires at least two sources');
  }

  await flushEventLoop();
  assertNotCancelled(control);

  // 先把每个输入 source 统一整理成 Brush 缓存条目。
  // 这一步会完成几何还原、矩阵应用、材质恢复，以及索引/法线等标准化处理。
  const preparedSources = sources.map((source) => prepareBooleanSource(source));
  const sourceCacheHits = preparedSources.filter((source) => source.cacheHit).length;
  postProgress(
    taskId,
    'build-cache',
    BOOLEAN_PHASE_WEIGHTS.prepare + BOOLEAN_PHASE_WEIGHTS['build-cache'],
    {
      taskType: 'boolean',
      phaseName: 'build-cache',
      phaseProgress: 1,
      cacheHit: sourceCacheHits > 0,
      sourceCacheHits,
      sourceCacheMisses: Math.max(0, preparedSources.length - sourceCacheHits),
    }
  );

  // 如果整条布尔链的最终缓存 key 已命中，说明“输入集合 + 顺序 + 操作类型”完全一致，
  // 可以直接跳过 csg-core，进入结果序列化与回传。
  const resultCacheKey = buildBooleanResultCacheKey(sources, preparedSources);
  const cachedResult = resultCache.get(resultCacheKey);
  if (cachedResult) {
    const cachedMetrics = buildBooleanAggregateMetrics(preparedSources, sources, 0);
    const resultPayload = buildBooleanTaskResult(cachedResult, {
      cacheHit: true,
      cacheKey: resultCacheKey,
      metrics: {
        totalMs: performance.now() - totalStart,
        coreMs: 0,
        ...cachedMetrics,
        sourceCacheHits,
        resultCacheHits: Math.max(1, sources.length - 1),
        computedSteps: 0,
        totalSteps: Math.max(0, sources.length - 1),
        fullCacheHit: true,
      },
    });

    postProgress(taskId, 'transfer', 1, {
      taskType: 'boolean',
      phaseName: 'transfer',
      cacheHit: true,
      sourceCacheHits,
      resultCacheHits: Math.max(1, sources.length - 1),
      phaseProgress: 1,
    });

    const transferables = collectGeometryTransferables(resultPayload.geometry, []);
    workerScope.postMessage(
      {
        type: 'result',
        taskId,
        payload: {
          ...resultPayload,
          cacheHit: true,
        },
      } satisfies WorkerResponse,
      transferables
    );
    return;
  }

  // 真正求值前，先只基于缓存状态、三角面数和包围盒关系做一次轻量估算，
  // 用来驱动主线程的模拟进度与耗时预测。
  const evaluationPlan = planBooleanEvaluation(preparedSources, sources);
  const {
    triA,
    triB,
    bboxOverlapRatio,
    coplanarRisk,
    opType,
    estimatedCoreMs,
    resultCacheHits,
    totalSteps,
    computedSteps,
  } = evaluationPlan;

  const coreStartProgress = BOOLEAN_PHASE_WEIGHTS.prepare + BOOLEAN_PHASE_WEIGHTS['build-cache'];
  const coreCeilingProgress = coreStartProgress + BOOLEAN_PHASE_WEIGHTS['csg-core'] * 0.93;

  postProgress(taskId, 'csg-core', coreStartProgress, {
    taskType: 'boolean',
    phaseName: 'csg-core',
    phaseProgress: 0,
    cacheHit: sourceCacheHits > 0 || resultCacheHits > 0,
    estimatedCoreMs,
    simulatedMs: estimatedCoreMs,
    simulatedCeilingProgress: coreCeilingProgress,
    triA,
    triB,
    bboxOverlapRatio,
    coplanarRisk,
    opType,
    sourceCacheHits,
    resultCacheHits,
    computedSteps,
    totalSteps,
  });

  await flushEventLoop();
  assertNotCancelled(control);

  // 从这里开始才会真正调用 CSG evaluator。
  // evaluateBooleanSources 会按 source 顺序把整条布尔链折叠成最终结果。
  const coreStart = performance.now();
  const evaluation = evaluateBooleanSources(preparedSources, sources, control);
  const coreMs = performance.now() - coreStart;

  assertNotCancelled(control);

  postProgress(
    taskId,
    'rebuild-result',
    coreStartProgress + BOOLEAN_PHASE_WEIGHTS['csg-core'] + BOOLEAN_PHASE_WEIGHTS['rebuild-result'],
    {
      taskType: 'boolean',
      phaseName: 'rebuild-result',
      phaseProgress: 1,
      cacheHit: sourceCacheHits > 0 || evaluation.resultCacheHits > 0,
      sourceCacheHits,
      resultCacheHits: evaluation.resultCacheHits,
      computedSteps: evaluation.computedSteps,
      totalSteps: evaluation.totalSteps,
    }
  );

  const resultBrush = evaluation.entry.brush;
  resultBrush.geometry.computeBoundingBox();
  resultBrush.geometry.computeBoundingSphere();
  resultBrush.geometry.computeVertexNormals();

  const resultPayload = buildBooleanTaskResult(evaluation.entry, {
    cacheHit: sourceCacheHits > 0 || evaluation.resultCacheHits > 0,
    cacheKey: evaluation.finalCacheKey,
    metrics: {
      totalMs: performance.now() - totalStart,
      coreMs,
      triA,
      triB,
      bboxOverlapRatio,
      coplanarRisk,
      estimatedCoreMs,
      sourceCacheHits,
      resultCacheHits: evaluation.resultCacheHits,
      computedSteps: evaluation.computedSteps,
      totalSteps: evaluation.totalSteps,
      fullCacheHit: false,
    },
  });

  // 把真实耗时样本记下来，下一次估算 estimatedCoreMs 时会参考这些历史数据，
  // 让进度条更贴近当前设备的实际性能。
  booleanHistory.add({
    op: opType,
    triA,
    triB,
    bboxOverlapRatio,
    coplanarRisk,
    cacheHit: sourceCacheHits > 0 || evaluation.resultCacheHits > 0,
    totalMs: resultPayload.metrics.totalMs,
    coreMs,
    predictedMs: estimatedCoreMs,
  });

  assertNotCancelled(control);

  // 最后一段只负责把结果序列化并通过 transferables 送回主线程。
  postProgress(taskId, 'transfer', 1, {
    taskType: 'boolean',
    phaseName: 'transfer',
    phaseProgress: 1,
    cacheHit: resultPayload.cacheHit,
    sourceCacheHits,
    resultCacheHits: evaluation.resultCacheHits,
  });

  const transferables = collectGeometryTransferables(resultPayload.geometry, []);
  workerScope.postMessage(
    {
      type: 'result',
      taskId,
      payload: resultPayload,
    } satisfies WorkerResponse,
    transferables
  );
}

// 处理导出 ZIP 任务，并把导出与压缩拆成多阶段进度。
async function handleExportZipTask(
  taskId: string,
  payload: ExportZipTaskPayload,
  control: TaskControl
) {
  assertNotCancelled(control);

  postProgress(taskId, 'collect', EXPORT_STATIC_WEIGHTS.collect, {
    taskType: 'exportZip',
    phaseName: 'collect',
    phaseProgress: 1,
  });

  const exportStats = collectExportStats(payload.objects);
  const estimatedObjMs = estimateExportObjMs(exportStats);
  const estimatedZipMs = estimateZipMs(payload, exportStats);
  const budget =
    1 -
    EXPORT_STATIC_WEIGHTS.collect -
    EXPORT_STATIC_WEIGHTS.estimate -
    EXPORT_STATIC_WEIGHTS.finalize;
  const dynamicTotal = estimatedObjMs + estimatedZipMs;
  const dynamicObjWeight = dynamicTotal > 0 ? estimatedObjMs / dynamicTotal : 0.45;
  const dynamicZipWeight = dynamicTotal > 0 ? estimatedZipMs / dynamicTotal : 0.55;
  const objBudget = budget * dynamicObjWeight;
  const zipBudget = budget * dynamicZipWeight;

  postProgress(taskId, 'estimate', EXPORT_STATIC_WEIGHTS.collect + EXPORT_STATIC_WEIGHTS.estimate, {
    taskType: 'exportZip',
    phaseName: 'estimate',
    phaseProgress: 1,
    estimatedObjMs,
    estimatedZipMs,
    objWeight: dynamicObjWeight,
    zipWeight: dynamicZipWeight,
  });

  await flushEventLoop();
  assertNotCancelled(control);

  const objStartProgress = EXPORT_STATIC_WEIGHTS.collect + EXPORT_STATIC_WEIGHTS.estimate;
  postProgress(taskId, 'export-obj', objStartProgress, {
    taskType: 'exportZip',
    phaseName: 'export-obj',
    phaseProgress: 0,
    estimatedObjMs,
    estimatedZipMs,
    objWeight: dynamicObjWeight,
    zipWeight: dynamicZipWeight,
    simulatedMs: estimatedObjMs,
    simulatedCeilingProgress: objStartProgress + objBudget * 0.92,
  });

  await flushEventLoop();
  assertNotCancelled(control);

  const objStart = performance.now();
  const exportScene = buildExportSceneFromPayload(payload.objects);
  const exporter = new OBJExporter();
  const objBody = exporter.parse(exportScene);
  const mtlBody = generateMTL(payload.objects);
  const objText = `mtllib ${payload.filename}.mtl\n${objBody}`;
  const objMs = performance.now() - objStart;

  postProgress(taskId, 'export-obj', objStartProgress + objBudget, {
    taskType: 'exportZip',
    phaseName: 'export-obj',
    phaseProgress: 1,
    estimatedObjMs,
    estimatedZipMs,
    objWeight: dynamicObjWeight,
    zipWeight: dynamicZipWeight,
  });

  assertNotCancelled(control);

  const zip = new JSZip();
  zip.file(`${payload.filename}.obj`, objText);
  zip.file(`${payload.filename}.mtl`, mtlBody);
  (payload.textureFiles || []).forEach((texture) => {
    zip.file(texture.name, texture.buffer);
  });

  const zipStart = performance.now();
  const zipBuffer = await zip.generateAsync(
    {
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: clampCompressionLevel(payload.compressionLevel),
      },
    },
    (metadata) => {
      assertNotCancelled(control);
      const ratio = (metadata.percent || 0) / 100;
      const progress = objStartProgress + objBudget + zipBudget * ratio;
      postProgress(taskId, 'zip', progress, {
        taskType: 'exportZip',
        phaseName: 'zip',
        phaseProgress: ratio,
        currentFile: metadata.currentFile || undefined,
        estimatedObjMs,
        estimatedZipMs,
        objWeight: dynamicObjWeight,
        zipWeight: dynamicZipWeight,
      });
    }
  );
  const zipMs = performance.now() - zipStart;

  assertNotCancelled(control);

  postProgress(taskId, 'finalize', 1, {
    taskType: 'exportZip',
    phaseName: 'finalize',
    phaseProgress: 1,
    estimatedObjMs,
    estimatedZipMs,
    objWeight: dynamicObjWeight,
    zipWeight: dynamicZipWeight,
  });

  const resultPayload: ExportZipTaskResult = {
    filename: payload.filename,
    mimeType: 'application/zip',
    extension: 'zip',
    buffer: zipBuffer,
    size: zipBuffer.byteLength,
    metrics: {
      meshCount: exportStats.meshCount,
      vertexCount: exportStats.vertexCount,
      faceCount: exportStats.faceCount,
      estimatedObjMs,
      estimatedZipMs,
      compressionLevel: clampCompressionLevel(payload.compressionLevel),
    },
  };

  exportHistory.add({
    meshCount: exportStats.meshCount,
    vertexCount: exportStats.vertexCount,
    faceCount: exportStats.faceCount,
    objMs,
    zipMs,
    totalBytes: estimateExportBytes(payload, objText, mtlBody),
    compressionLevel: clampCompressionLevel(payload.compressionLevel),
    predictedObjMs: estimatedObjMs,
    predictedZipMs: estimatedZipMs,
  });

  workerScope.postMessage(
    {
      type: 'result',
      taskId,
      payload: resultPayload,
    } satisfies WorkerResponse,
    [zipBuffer]
  );
}

// 把序列化 source 转成可直接参与布尔运算的缓存条目。
function prepareBooleanSource(source: SerializedBooleanSource): PreparedSource {
  // geometryCache 缓的是“单个 source -> 可直接参与 CSG 的 Brush”。
  // 只要源几何、矩阵和材质签名没变化，就不需要重复 hydrate / prepareGeometry。
  const cacheKey = buildPreparedSourceKey(source);
  const cached = geometryCache.get(cacheKey);
  if (cached) {
    return { ...cached, cacheHit: true };
  }

  const prepared = buildSourceBrushEntry(source, cacheKey);
  geometryCache.set(cacheKey, prepared);
  return {
    ...prepared,
    cacheHit: false,
  };
}

// 根据 source 构建一个标准化的 Brush 缓存条目。
function buildSourceBrushEntry(source: SerializedBooleanSource, cacheKey: string): CachedBrushEntry {
  // source 有两种形态：
  // 1. 已经合并好的单份 geometry；
  // 2. 由多个 mesh 片段组成的对象集合。
  // 不管输入是哪一种，这里最终都会归一成同一种 Brush 条目。
  let geometry: THREE.BufferGeometry | null = null;
  let materialDescriptors: SerializedMaterialData[] = [];

  if (source.geometry) {
    geometry = hydrateBufferGeometry(source.geometry);
    if (source.matrixWorld) {
      geometry.applyMatrix4(hydrateMatrix4(source.matrixWorld));
    }
    materialDescriptors = source.materials?.length
      ? source.materials.map((item) => ({ ...item }))
      : [defaultMaterial()];
  } else {
    const meshes = source.meshes || [];
    const parts: Array<{ geometry: THREE.BufferGeometry; material: SerializedMaterialData }> = [];
    meshes.forEach((mesh) => {
      parts.push(...buildSubGeometriesFromMesh(mesh));
    });

    if (parts.length === 0) {
      throw new Error(`Boolean source "${source.id}" has no valid mesh geometry`);
    }

    geometry = mergeGeometries(
      parts.map((part) => part.geometry),
      true
    );
    if (!geometry) {
      throw new Error(`Failed to merge boolean source "${source.id}" geometry`);
    }

    materialDescriptors = parts.map((part) => ({ ...part.material }));
    parts.forEach((part) => part.geometry.dispose());
  }

  if (!geometry) {
    throw new Error(`Boolean source "${source.id}" has no geometry`);
  }

  if (!geometry.index) {
    const position = geometry.getAttribute('position');
    if (position) {
      geometry.setIndex([...Array(position.count).keys()]);
    }
  }

  const materials = materialDescriptors.map((item) => hydrateMaterialDescriptor(item));
  const brush = new Brush(geometry, materialListToBrushMaterial(materials));
  return createCachedBrushEntry(cacheKey, brush, { cloneMaterials: false });
}

// 把多材质 mesh 拆成多个子几何，便于后续合并和保留材质边界。
function buildSubGeometriesFromMesh(mesh: SerializedMeshData) {
  // 多材质 mesh 需要先按 group 切成多个小 geometry，
  // 后面 merge 成 source geometry 时才能尽量保留材质边界信息。
  const worldGeometry = hydrateBufferGeometry(mesh.geometry);
  worldGeometry.applyMatrix4(hydrateMatrix4(mesh.matrixWorld));

  const nonIndexed = worldGeometry.toNonIndexed();
  const position = nonIndexed.getAttribute('position') as THREE.BufferAttribute;
  const normal = nonIndexed.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const uv = nonIndexed.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const groups =
    nonIndexed.groups && nonIndexed.groups.length > 0
      ? nonIndexed.groups
      : [{ start: 0, count: position.count, materialIndex: 0 }];

  const results: Array<{ geometry: THREE.BufferGeometry; material: SerializedMaterialData }> = [];

  groups.forEach((group) => {
    const material =
      mesh.materials[group.materialIndex] || mesh.materials[0] || defaultMaterial();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', sliceBufferAttribute(position, group.start, group.count));
    if (normal) {
      geometry.setAttribute('normal', sliceBufferAttribute(normal, group.start, group.count));
    }
    if (uv) {
      geometry.setAttribute('uv', sliceBufferAttribute(uv, group.start, group.count));
    }
    if (!geometry.getAttribute('normal')) {
      geometry.computeVertexNormals();
    }
    geometry.computeBoundingBox();
    results.push({
      geometry,
      material: { ...material },
    });
  });

  if (nonIndexed !== worldGeometry) {
    nonIndexed.dispose();
  }
  worldGeometry.dispose();
  return results;
}

// 按 source 顺序执行整条布尔链，并尽量复用中间结果缓存。
function evaluateBooleanSources(
  preparedSources: PreparedSource[],
  sourceDefs: SerializedBooleanSource[],
  control: TaskControl
) {
  // currentEntry 始终表示“截至当前步骤的中间结果”。
  // 之后每一步都会把 currentEntry 与下一个 source 再做一次布尔运算。
  const operationMap: Record<BooleanOperationType, number> = {
    union: ADDITION,
    subtract: SUBTRACTION,
    intersect: INTERSECTION,
    difference: DIFFERENCE,
  };

  let currentEntry: CachedBrushEntry = preparedSources[0];
  let currentChainKey = buildBooleanChainSeedKey(currentEntry.cacheKey);
  let resultCacheHits = 0;
  let computedSteps = 0;

  for (let index = 1; index < preparedSources.length; index += 1) {
    assertNotCancelled(control);
    const nextSource = preparedSources[index];
    const op = sourceDefs[index]?.op || 'union';
    // stepKey 精确标识“上一步链结果 + 本步操作 + 当前 source”。
    // 命中后可以直接复用中间结果，而不必从头重算前面的步骤。
    const stepKey = buildBooleanChainStepKey(currentChainKey, op, nextSource.cacheKey);
    const cachedStep = resultCache.get(stepKey);
    if (cachedStep) {
      currentEntry = cachedStep;
      currentChainKey = stepKey;
      resultCacheHits += 1;
      continue;
    }

    // 只有未命中 step cache 时，才真正执行这一步的 three-bvh-csg 求值。
    const resultBrush = evaluator.evaluate(
      currentEntry.brush,
      nextSource.brush,
      operationMap[op],
      new Brush()
    );
    const resultEntry = createCachedBrushEntry(stepKey, resultBrush, { cloneMaterials: true });
    if (control.cancelled) {
      disposeCachedBrushEntry(stepKey, resultEntry);
      throw new Error('cancelled');
    }

    resultCache.set(stepKey, resultEntry);
    currentEntry = resultEntry;
    currentChainKey = stepKey;
    computedSteps += 1;
  }

  return {
    entry: currentEntry,
    finalCacheKey: currentChainKey,
    resultCacheHits,
    computedSteps,
    totalSteps: Math.max(0, preparedSources.length - 1),
  };
}

// 对 Brush 做统一标准化后包装成可缓存条目。
function createCachedBrushEntry(
  cacheKey: string,
  brush: Brush,
  options: { cloneMaterials?: boolean } = {}
) {
  // 无论缓存的是原始 source 还是中间布尔结果，
  // 在写入缓存前都先做一次统一标准化，保证下一步可以直接继续参与运算。
  const geometry = brush.geometry;
  if (!geometry.index) {
    const position = geometry.getAttribute('position');
    if (position) {
      geometry.setIndex([...Array(position.count).keys()]);
    }
  }
  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();

  if (options.cloneMaterials !== false) {
    const materials = cloneMaterialList(brush.material);
    brush.material = materialListToBrushMaterial(materials);
  }

  brush.updateMatrixWorld(true);
  brush.prepareGeometry();

  return {
    cacheKey,
    brush,
    triCount: getGeometryTriCount(geometry),
    bbox: geometry.boundingBox?.clone() || new THREE.Box3(),
  };
}

// 把缓存条目转换成可跨线程传输的布尔结果对象。
function buildBooleanTaskResult(
  entry: CachedBrushEntry,
  options: {
    cacheHit: boolean;
    cacheKey: string;
    metrics: BooleanTaskResult['metrics'];
  }
): BooleanTaskResult {
  // worker 返回给主线程的必须是可结构化克隆的数据，
  // 不能直接把 Brush / Material 运行时实例跨线程传出去。
  return {
    geometry: serializeBufferGeometry(entry.brush.geometry),
    materials: serializeResultMaterials(entry.brush.material),
    cacheHit: options.cacheHit,
    cacheKey: options.cacheKey,
    metrics: options.metrics,
  };
}

// 汇总整条布尔链的基础指标，供缓存命中和估算阶段复用。
function buildBooleanAggregateMetrics(
  preparedSources: Array<{ triCount: number; bbox: THREE.Box3 }>,
  sourceDefs: SerializedBooleanSource[],
  estimatedCoreMs: number
) {
  const triA = preparedSources[0]?.triCount || 0;
  const triB = preparedSources.slice(1).reduce((sum, item) => sum + item.triCount, 0);
  const bboxOverlapRatio = estimateBboxOverlapRatio(
    preparedSources[0]?.bbox,
    mergeBoxes(preparedSources.slice(1).map((source) => source.bbox))
  );
  const opType = sourceDefs[1]?.op || 'subtract';
  const coplanarRisk = estimateCoplanarRisk(preparedSources);

  return {
    triA,
    triB,
    bboxOverlapRatio,
    coplanarRisk,
    estimatedCoreMs,
    opType,
  };
}

// 只做轻量预测，不真正执行 CSG，用来估算后续求值成本。
function planBooleanEvaluation(
  preparedSources: PreparedSource[],
  sourceDefs: SerializedBooleanSource[]
): BooleanEvaluationPlan {
  // 估算阶段不会真的做 CSG。
  // 它只是沿着同一条布尔链检查哪些中间结果已经命中缓存，
  // 再结合三角面数、包围盒重叠度和共面风险预测剩余核心耗时。
  const totalSteps = Math.max(0, preparedSources.length - 1);
  if (totalSteps === 0) {
    const aggregate = buildBooleanAggregateMetrics(preparedSources, sourceDefs, 20);
    return {
      estimatedCoreMs: 20,
      triA: aggregate.triA,
      triB: aggregate.triB,
      bboxOverlapRatio: aggregate.bboxOverlapRatio,
      coplanarRisk: aggregate.coplanarRisk,
      opType: aggregate.opType,
      resultCacheHits: 0,
      totalSteps,
      computedSteps: 0,
    };
  }

  let currentState = buildEstimatedState(preparedSources[0]);
  let currentChainKey = buildBooleanChainSeedKey(preparedSources[0].cacheKey);
  let estimatedCoreMs = 0;
  let resultCacheHits = 0;
  let firstPendingMetrics:
    | {
        triA: number;
        triB: number;
        bboxOverlapRatio: number;
        coplanarRisk: number;
        opType: BooleanOperationType;
      }
    | null = null;

  for (let index = 1; index < preparedSources.length; index += 1) {
    const nextSource = preparedSources[index];
    const op = sourceDefs[index]?.op || 'union';
    const stepKey = buildBooleanChainStepKey(currentChainKey, op, nextSource.cacheKey);
    const cachedStep = resultCache.peek(stepKey);

    if (cachedStep) {
      currentState = buildEstimatedState(cachedStep);
      currentChainKey = stepKey;
      resultCacheHits += 1;
      continue;
    }

    const metrics = buildBooleanStepMetrics(currentState, nextSource, op);
    estimatedCoreMs += estimateBooleanCoreMs({
      triA: metrics.triA,
      triB: metrics.triB,
      bboxOverlapRatio: metrics.bboxOverlapRatio,
      coplanarRisk: metrics.coplanarRisk,
      opType: metrics.opType,
      cacheHit: false,
    });
    if (!firstPendingMetrics) {
      firstPendingMetrics = metrics;
    }

    currentState = estimateBooleanResultState(currentState, nextSource, op);
    currentChainKey = stepKey;
  }

  const aggregate = buildBooleanAggregateMetrics(
    preparedSources,
    sourceDefs,
    Math.max(20, estimatedCoreMs)
  );
  const referenceMetrics = firstPendingMetrics || aggregate;

  return {
    estimatedCoreMs: Math.max(20, estimatedCoreMs),
    triA: referenceMetrics.triA,
    triB: referenceMetrics.triB,
    bboxOverlapRatio: referenceMetrics.bboxOverlapRatio,
    coplanarRisk: referenceMetrics.coplanarRisk,
    opType: referenceMetrics.opType,
    resultCacheHits,
    totalSteps,
    computedSteps: Math.max(0, totalSteps - resultCacheHits),
  };
}

// 从已有 source 或缓存结果中提取估算阶段所需的最小状态。
function buildEstimatedState(source: { triCount: number; bbox: THREE.Box3 }) {
  return {
    triCount: source.triCount,
    bbox: source.bbox.clone(),
  };
}

// 计算单步布尔估算所需的三角面数、重叠率和共面风险。
function buildBooleanStepMetrics(
  sourceA: { triCount: number; bbox: THREE.Box3 },
  sourceB: { triCount: number; bbox: THREE.Box3 },
  opType: BooleanOperationType
) {
  return {
    triA: sourceA.triCount,
    triB: sourceB.triCount,
    bboxOverlapRatio: estimateBboxOverlapRatio(sourceA.bbox, sourceB.bbox),
    coplanarRisk: estimateCoplanarRisk([sourceA, sourceB]),
    opType,
  };
}

// 基于启发式规则预测当前步完成后的结果状态。
function estimateBooleanResultState(
  sourceA: { triCount: number; bbox: THREE.Box3 },
  sourceB: { triCount: number; bbox: THREE.Box3 },
  opType: BooleanOperationType
) {
  const bboxOverlapRatio = estimateBboxOverlapRatio(sourceA.bbox, sourceB.bbox);
  return {
    triCount: estimateResultTriCount(sourceA.triCount, sourceB.triCount, opType, bboxOverlapRatio),
    bbox: estimateResultBbox(sourceA.bbox, sourceB.bbox, opType),
  };
}

// 估算不同布尔类型下结果几何的大致三角面数量。
function estimateResultTriCount(
  triA: number,
  triB: number,
  opType: BooleanOperationType,
  bboxOverlapRatio: number
) {
  const overlap = Math.max(0.05, Math.min(1, bboxOverlapRatio));
  switch (opType) {
    case 'intersect':
      return Math.max(1, Math.round(Math.min(triA, triB) * overlap * 0.9));
    case 'subtract':
      return Math.max(1, Math.round(triA * (0.82 + (1 - overlap) * 0.12) + triB * overlap * 0.08));
    case 'difference':
      return Math.max(1, Math.round(triA + triB * Math.max(0.3, overlap * 0.7)));
    case 'union':
    default:
      return Math.max(1, Math.round(Math.max(triA, triB) + Math.min(triA, triB) * overlap * 0.65));
  }
}

// 估算不同布尔类型下结果包围盒的大致范围。
function estimateResultBbox(boxA: THREE.Box3, boxB: THREE.Box3, opType: BooleanOperationType) {
  if (opType === 'intersect') {
    return boxA.clone().intersect(boxB);
  }

  if (opType === 'subtract') {
    return boxA.clone();
  }

  return boxA.clone().union(boxB);
}

// 把材质数组压成 Brush 可接受的单材质或多材质形式。
function materialListToBrushMaterial(materials: THREE.Material[]) {
  return materials.length <= 1 ? materials[0] || hydrateMaterialDescriptor(defaultMaterial()) : materials;
}

// 克隆一组材质，避免缓存条目之间共享可变材质实例。
function cloneMaterialList(material: THREE.Material | THREE.Material[]) {
  const materials = Array.isArray(material) ? material : [material];
  return materials.filter(Boolean).map((item) => item.clone());
}

// 统一释放单材质或材质数组。
function disposeMaterialList(material: THREE.Material | THREE.Material[] | null | undefined) {
  const materials = Array.isArray(material) ? material : [material];
  materials.filter(Boolean).forEach((item) => item.dispose());
}

// 释放缓存中的 Brush、几何和材质资源。
function disposeCachedBrushEntry(_key: string, entry: CachedBrushEntry) {
  entry.brush.disposeCacheData?.();
  disposeMaterialList(entry.brush.material);
  entry.brush.geometry?.dispose?.();
}

// 清空 worker 内部的几何缓存和结果缓存。
function clearWorkerCaches() {
  geometryCache.clear();
  resultCache.clear();
}

// 统计几何体的三角面数量。
function getGeometryTriCount(geometry: THREE.BufferGeometry) {
  return geometry.index
    ? Math.floor(geometry.index.count / 3)
    : Math.floor((geometry.getAttribute('position')?.count || 0) / 3);
}

// 把结果材质序列化成可回传主线程的描述对象。
function serializeResultMaterials(material: THREE.Material | THREE.Material[]) {
  const materials = Array.isArray(material) ? material : [material];
  return materials.filter(Boolean).map((item) => serializeMaterialDescriptor(item));
}

// 为单个 source 生成稳定缓存 key。
function buildPreparedSourceKey(source: SerializedBooleanSource) {
  if (typeof source.cacheKey === 'string' && source.cacheKey) {
    return `${source.id}:${normalizeVersionKey(source.version)}:${source.cacheKey}`;
  }

  if (source.geometry) {
    return `${source.id}:${normalizeVersionKey(source.version)}:${hashGeometry(source.geometry)}:${hashMatrix(source.matrixWorld)}:${hashMaterialList(source.materials)}`;
  }
  const meshKey = (source.meshes || [])
    .map(
      (mesh) =>
        `${mesh.id}:${hashGeometry(mesh.geometry)}:${hashMatrix(mesh.matrixWorld)}:${hashMaterialList(mesh.materials)}`
    )
    .join('|');
  return `${source.id}:${normalizeVersionKey(source.version)}:${meshKey}`;
}

// 生成布尔链起点的 key。
function buildBooleanChainSeedKey(sourceKey: string) {
  return `seed:${sourceKey}`;
}

// 生成某一步中间结果的缓存 key。
function buildBooleanChainStepKey(
  previousKey: string,
  op: BooleanOperationType,
  sourceKey: string
) {
  return `${previousKey}::${op}:${sourceKey}`;
}

// 根据整条 source 链构建最终结果缓存 key。
function buildBooleanResultCacheKey(
  sources: SerializedBooleanSource[],
  preparedSources: PreparedSource[]
) {
  if (sources.length === 0) {
    return 'seed:empty';
  }

  let key = buildBooleanChainSeedKey(preparedSources[0]?.cacheKey || buildPreparedSourceKey(sources[0]));
  for (let index = 1; index < sources.length; index += 1) {
    key = buildBooleanChainStepKey(
      key,
      sources[index]?.op || 'union',
      preparedSources[index]?.cacheKey || buildPreparedSourceKey(sources[index])
    );
  }
  return key;
}

// 统一版本字段的序列化格式。
function normalizeVersionKey(version: string | number | undefined) {
  if (version === undefined || version === null) return 'v0';
  return `v:${String(version)}`;
}

// 为材质列表生成稳定哈希，用于 source 缓存签名。
function hashMaterialList(materials: SerializedMaterialData[] | null | undefined) {
  if (!materials?.length) return 'm0';
  const signature = materials
    .map((material) =>
      [
        material.id || '',
        material.name || '',
        material.color ?? '',
        material.roughness ?? '',
        material.metalness ?? '',
        material.opacity ?? '',
        material.transparent ?? '',
        material.emissive ?? '',
        material.mapName || '',
        material.normalMapName || '',
        material.roughnessMapName || '',
        material.metalnessMapName || '',
        material.aoMapName || '',
        material.emissiveMapName || '',
      ].join(':')
    )
    .join('|');
  return `m:${hashString(signature)}`;
}

// 为序列化几何生成轻量哈希。
function hashGeometry(geometry: SerializedGeometryData) {
  const position = geometry.attributes?.position?.array;
  const normal = geometry.attributes?.normal?.array;
  const uv = geometry.attributes?.uv?.array;
  const index = geometry.index?.array;
  return [
    hashArray(position),
    hashArray(normal),
    hashArray(uv),
    hashArray(index),
    geometry.groups?.length || 0,
  ].join('-');
}

// 为矩阵生成哈希；空矩阵按单位矩阵处理。
function hashMatrix(matrix: Float32Array | ArrayLike<number> | null | undefined) {
  if (!matrix) return 'identity';
  return hashArray(Array.from(matrix));
}

// 对数值数组做采样哈希，降低缓存 key 计算成本。
function hashArray(array: ArrayLike<number> | null | undefined) {
  if (!array || typeof array.length !== 'number') return '0';
  const length = array.length;
  const step = Math.max(1, Math.floor(length / 64));
  let hash = 2166136261;
  for (let index = 0; index < length; index += step) {
    const value = Math.round(Number(array[index] || 0) * 1000);
    hash ^= value & 0xff_ff_ff_ff;
    hash = Math.imul(hash, 16777619);
  }
  hash ^= length;
  return (hash >>> 0).toString(36);
}

// 对字符串生成 FNV 风格哈希。
function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= value.length;
  return (hash >>> 0).toString(36);
}

// 从 BufferAttribute 中切出一段子属性，供 group 拆分使用。
function sliceBufferAttribute(attribute: THREE.BufferAttribute, start: number, count: number) {
  const itemSize = attribute.itemSize;
  const begin = start * itemSize;
  const end = (start + count) * itemSize;
  const array = (attribute.array as unknown as ArrayLike<number> & { slice: (a: number, b: number) => THREE.TypedArray }).slice(begin, end);
  return new THREE.BufferAttribute(array, itemSize, attribute.normalized);
}

// 估算两个包围盒的重叠比例。
function estimateBboxOverlapRatio(boxA?: THREE.Box3 | null, boxB?: THREE.Box3 | null) {
  if (!boxA || !boxB) return 0;
  const intersection = boxA.clone().intersect(boxB);
  if (intersection.isEmpty()) return 0;
  const intersectionSize = intersection.getSize(new THREE.Vector3());
  const aSize = boxA.getSize(new THREE.Vector3());
  const bSize = boxB.getSize(new THREE.Vector3());
  const intersectionVolume = intersectionSize.x * intersectionSize.y * intersectionSize.z;
  const minVolume = Math.max(
    Math.min(aSize.x * aSize.y * aSize.z, bSize.x * bSize.y * bSize.z),
    1e-6
  );
  return Math.max(0, Math.min(intersectionVolume / minVolume, 1));
}

// 把多个包围盒合并成一个总包围盒。
function mergeBoxes(boxes: THREE.Box3[]) {
  const merged = new THREE.Box3();
  boxes.forEach((box) => merged.union(box));
  return merged;
}

// 根据尺寸和中心接近程度估算潜在共面风险。
function estimateCoplanarRisk(preparedSources: Array<{ bbox: THREE.Box3 }>) {
  if (preparedSources.length < 2) return 0;
  const boxA = preparedSources[0].bbox;
  const boxB = mergeBoxes(preparedSources.slice(1).map((source) => source.bbox));
  const sizeA = boxA.getSize(new THREE.Vector3());
  const sizeB = boxB.getSize(new THREE.Vector3());
  const dx = relativeAxisDifference(sizeA.x, sizeB.x);
  const dy = relativeAxisDifference(sizeA.y, sizeB.y);
  const dz = relativeAxisDifference(sizeA.z, sizeB.z);
  const centerDistance = boxA
    .getCenter(new THREE.Vector3())
    .distanceTo(boxB.getCenter(new THREE.Vector3()));
  const diagonal = Math.max(sizeA.length(), sizeB.length(), 1e-6);
  const aligned = 1 - Math.min((dx + dy + dz) / 3, 1);
  const centered = 1 - Math.min(centerDistance / diagonal, 1);
  return Math.max(0, Math.min(aligned * centered, 1));
}

// 计算两个标量在同一轴上的相对差异。
function relativeAxisDifference(a: number, b: number) {
  const max = Math.max(Math.abs(a), Math.abs(b), 1e-6);
  return Math.abs(a - b) / max;
}

// 基于面数、重叠率、共面风险和历史样本估算布尔核心耗时。
function estimateBooleanCoreMs(input: {
  triA: number;
  triB: number;
  bboxOverlapRatio: number;
  coplanarRisk: number;
  opType: BooleanOperationType;
  cacheHit: boolean;
}) {
  const triangleFactor = (input.triA + input.triB) * 0.012;
  const overlapFactor =
    (input.triA * input.triB * Math.max(input.bboxOverlapRatio, 0.05)) / 500000;
  const coplanarFactor = 1 + input.coplanarRisk * 0.8;
  const opFactor =
    input.opType === 'intersect' ? 1.15 : input.opType === 'subtract' ? 1.05 : 0.95;
  const cacheFactor = input.cacheHit ? 0.3 : 1;
  const base = Math.max(
    20,
    (triangleFactor + overlapFactor) * coplanarFactor * opFactor * cacheFactor
  );
  const similar = booleanHistory
    .values()
    .filter((sample) => sample.op === input.opType)
    .slice(-12);
  if (similar.length === 0) {
    return base;
  }

  const multiplier =
    similar.reduce((sum, sample) => sum + sample.coreMs / Math.max(sample.predictedMs, 1), 0) /
    similar.length;
  return Math.max(20, base * multiplier);
}

// 汇总导出对象的基础统计信息。
function collectExportStats(objects: SerializedMeshData[]): ExportStats {
  return objects.reduce<ExportStats>(
    (stats, mesh) => {
      const position = mesh.geometry.attributes?.position;
      const normal = mesh.geometry.attributes?.normal;
      const uv = mesh.geometry.attributes?.uv;
      const vertexCount =
        position?.array?.length ? Math.floor(position.array.length / position.itemSize) : 0;
      const faceCount = mesh.geometry.index?.array?.length
        ? Math.floor(mesh.geometry.index.array.length / 3)
        : Math.floor(vertexCount / 3);

      stats.meshCount += 1;
      stats.vertexCount += vertexCount;
      stats.faceCount += faceCount;
      stats.hasNormals = stats.hasNormals || !!normal;
      stats.hasUVs = stats.hasUVs || !!uv;
      return stats;
    },
    {
      meshCount: 0,
      vertexCount: 0,
      faceCount: 0,
      hasNormals: false,
      hasUVs: false,
    }
  );
}

// 估算导出 OBJ 阶段的耗时。
function estimateExportObjMs(stats: ExportStats) {
  const work =
    stats.vertexCount * 1 +
    stats.faceCount * 1.4 +
    (stats.hasNormals ? stats.vertexCount * 0.6 : 0) +
    (stats.hasUVs ? stats.vertexCount * 0.5 : 0) +
    stats.meshCount * 200;
  const base = Math.max(30, work * 0.0022);
  const similar = exportHistory.values().slice(-12);
  if (similar.length === 0) {
    return base;
  }
  const multiplier =
    similar.reduce((sum, sample) => sum + sample.objMs / Math.max(sample.predictedObjMs, 1), 0) /
    similar.length;
  return Math.max(30, base * multiplier);
}

// 估算 ZIP 压缩阶段的耗时。
function estimateZipMs(payload: ExportZipTaskPayload, stats: ExportStats) {
  const totalBytes = estimateExportBytes(payload);
  const mb = totalBytes / 1024 / 1024;
  const level = clampCompressionLevel(payload.compressionLevel);
  const levelMul = 0.7 + level * 0.12;
  const fileCount = 2 + (payload.textureFiles?.length || 0);
  const fileMul = 1 + Math.min(fileCount / 200, 0.3);
  const similar = exportHistory.values().slice(-12);
  const msPerMB =
    similar.length > 0
      ? similar.reduce(
          (sum, sample) =>
            sum + sample.zipMs / Math.max(sample.totalBytes / 1024 / 1024, 0.1),
          0
        ) / similar.length
      : 75;

  void stats;
  return Math.max(30, mb * msPerMB * levelMul * fileMul);
}

// 估算导出结果的总字节数。
function estimateExportBytes(payload: ExportZipTaskPayload, objText?: string, mtlText?: string) {
  const encoder = new TextEncoder();
  const objBytes = objText ? encoder.encode(objText).byteLength : estimateObjBytes(payload.objects);
  const mtlBytes = mtlText ? encoder.encode(mtlText).byteLength : estimateMtlBytes(payload.objects);
  const textureBytes = (payload.textureFiles || []).reduce((sum, item) => sum + (item.size || 0), 0);
  return objBytes + mtlBytes + textureBytes;
}

// 估算 OBJ 文本的体积。
function estimateObjBytes(objects: SerializedMeshData[]) {
  return objects.reduce((sum, mesh) => {
    const position = mesh.geometry.attributes?.position;
    const vertexCount =
      position?.array?.length ? Math.floor(position.array.length / position.itemSize) : 0;
    const faceCount = mesh.geometry.index?.array?.length
      ? Math.floor(mesh.geometry.index.array.length / 3)
      : Math.floor(vertexCount / 3);
    return sum + vertexCount * 30 + faceCount * 20;
  }, 0);
}

// 估算 MTL 文本的体积。
function estimateMtlBytes(objects: SerializedMeshData[]) {
  return objects.reduce((sum, mesh) => sum + mesh.materials.length * 180, 0);
}

// 把序列化 mesh 列表还原成可供 OBJExporter 使用的临时场景。
function buildExportSceneFromPayload(objects: SerializedMeshData[]) {
  const scene = new THREE.Scene();
  objects.forEach((meshData) => {
    const geometry = hydrateBufferGeometry(meshData.geometry);
    const materials = meshData.materials.length
      ? meshData.materials.map((material) => hydrateMaterialDescriptor(material))
      : [hydrateMaterialDescriptor(defaultMaterial())];
    const mesh = new THREE.Mesh(geometry, materials.length <= 1 ? materials[0] : materials);
    mesh.name = meshData.name || meshData.id;
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(hydrateMatrix4(meshData.matrixWorld));
    mesh.matrixWorld.copy(mesh.matrix);
    scene.add(mesh);
  });
  scene.updateMatrixWorld(true);
  return scene;
}

// 根据导出对象生成 MTL 文件内容。
function generateMTL(objects: SerializedMeshData[]) {
  const lines = ['# MTL file exported by EditorTaskWorker'];
  const materials = new Map<string, SerializedMaterialData>();
  objects.forEach((mesh) => {
    mesh.materials.forEach((material) => {
      materials.set(material.name || material.id, material);
    });
  });

  for (const [, material] of materials) {
    lines.push('');
    lines.push(`newmtl ${material.name}`);
    const color = new THREE.Color(typeof material.color === 'number' ? material.color : 0xffffff);
    const emissive = new THREE.Color(
      typeof material.emissive === 'number' ? material.emissive : 0x000000
    );
    lines.push(`Kd ${color.r.toFixed(6)} ${color.g.toFixed(6)} ${color.b.toFixed(6)}`);
    lines.push(
      `Ka ${(color.r * 0.2).toFixed(6)} ${(color.g * 0.2).toFixed(6)} ${(color.b * 0.2).toFixed(6)}`
    );
    lines.push(`Ke ${emissive.r.toFixed(6)} ${emissive.g.toFixed(6)} ${emissive.b.toFixed(6)}`);
    lines.push('Ks 0.500000 0.500000 0.500000');
    lines.push(`Ns ${(((1 - (material.roughness ?? 0.6)) * 100) || 30).toFixed(6)}`);
    lines.push(`d ${(material.opacity ?? 1).toFixed(6)}`);
    lines.push('illum 2');

    if (material.mapName) lines.push(`map_Kd ${material.mapName}`);
    if (material.normalMapName) lines.push(`map_Bump ${material.normalMapName}`);
    if (material.roughnessMapName) lines.push(`map_Pr ${material.roughnessMapName}`);
    if (material.metalnessMapName) lines.push(`map_Pm ${material.metalnessMapName}`);
    if (material.aoMapName) lines.push(`map_Ka ${material.aoMapName}`);
    if (material.emissiveMapName) lines.push(`map_Ke ${material.emissiveMapName}`);
  }

  return lines.join('\n');
}

// 约束 ZIP 压缩级别到合法范围内。
function clampCompressionLevel(value?: number) {
  const numeric = Number.isFinite(value) ? Math.round(value as number) : 6;
  return Math.min(9, Math.max(1, numeric));
}

// 生成默认材质描述，用于缺省材质场景。
function defaultMaterial(): SerializedMaterialData {
  return {
    id: 'default_material',
    name: 'default_material',
    color: 0xffffff,
    roughness: 0.6,
    metalness: 0,
    opacity: 1,
    transparent: false,
  };
}

// 向主线程发送节流后的任务进度消息。
function postProgress(
  taskId: string,
  phase: 'prepare' | 'build-cache' | 'csg-core' | 'rebuild-result' | 'transfer' | 'collect' | 'estimate' | 'export-obj' | 'zip' | 'finalize',
  progress: number,
  detail: WorkerProgressDetail = {},
  message?: string
) {
  // worker 内部可能在极短时间内产生大量细粒度进度。
  // 这里统一做节流，避免主线程收到过密消息后造成 UI 抖动或渲染压力。
  const now = performance.now();
  const last = lastProgressReport.get(taskId);
  const normalizedProgress = Math.max(0, Math.min(progress, 1));

  if (
    last &&
    last.phase === phase &&
    now - last.ts < PROGRESS_THROTTLE_MS &&
    normalizedProgress < 1 &&
    normalizedProgress - last.progress < 0.01
  ) {
    return;
  }

  lastProgressReport.set(taskId, {
    phase,
    progress: normalizedProgress,
    ts: now,
  });

  workerScope.postMessage({
    type: 'progress',
    taskId,
    phase,
    progress: normalizedProgress,
    detail,
    message,
  } satisfies WorkerResponse);
}

// 主动让出一个事件循环，让取消和进度消息有机会先被处理。
async function flushEventLoop() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// 如果任务已被标记取消，则立即中断当前执行链。
function assertNotCancelled(control: TaskControl) {
  if (control.cancelled) {
    throw new Error('cancelled');
  }
}
