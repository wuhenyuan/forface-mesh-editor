import EditorTaskWorker from './editorTask.worker?worker';
import type {
  BooleanTaskPayload,
  BooleanTaskResult,
  ExportZipTaskPayload,
  ExportZipTaskResult,
  WorkerProgressDetail,
  WorkerRequest,
  WorkerResponse,
  WorkerTaskProgress,
} from './types';

type TaskKind = 'boolean' | 'exportZip';

type TaskCallbacks = {
  onProgress?: (progress: WorkerTaskProgress) => void;
};

type TaskRecord = TaskCallbacks & {
  id: string;
  kind: TaskKind;
  resolve: (value: BooleanTaskResult | ExportZipTaskResult) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setInterval> | null;
  simulatedPhase: string | null;
  lastProgress: number;
  lastEmittedProgress: number;
  lastEmittedPhase: string | null;
  estimateStartedAt: number;
  estimateMs: number;
  estimateCeiling: number;
};

export class EditorTaskWorkerBridge {
  private static _shared: EditorTaskWorkerBridge | null = null;

  /**
   * 返回全局共享的 bridge 单例。
   */
  static getShared() {
    if (!EditorTaskWorkerBridge._shared) {
      EditorTaskWorkerBridge._shared = new EditorTaskWorkerBridge();
    }
    return EditorTaskWorkerBridge._shared;
  }

  private _worker: Worker;
  private _tasks: Map<string, TaskRecord>;
  private _taskCounter: number;

  /**
   * 创建 worker 实例，并建立统一的消息入口。
   */
  private constructor() {
    this._worker = new EditorTaskWorker();
    this._tasks = new Map();
    this._taskCounter = 0;
    this._worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this._handleMessage(event.data);
    };
  }

  /**
   * 生成唯一任务 ID。
   */
  createTaskId(prefix: TaskKind) {
    this._taskCounter += 1;
    return `${prefix}_${Date.now()}_${this._taskCounter}`;
  }

  /**
   * 发起布尔 worker 任务。
   */
  runBooleanTask(
    payload: BooleanTaskPayload,
    options: TaskCallbacks & { taskId?: string; transferables?: Transferable[] } = {}
  ) {
    const taskId = options.taskId || this.createTaskId('boolean');
    return this._runTask<BooleanTaskResult>(
      {
        type: 'boolean',
        taskId,
        payload,
      },
      'boolean',
      options
    );
  }

  /**
   * 发起导出压缩 worker 任务。
   */
  runExportZipTask(
    payload: ExportZipTaskPayload,
    options: TaskCallbacks & { taskId?: string; transferables?: Transferable[] } = {}
  ) {
    const taskId = options.taskId || this.createTaskId('exportZip');
    return this._runTask<ExportZipTaskResult>(
      {
        type: 'exportZip',
        taskId,
        payload,
      },
      'exportZip',
      options
    );
  }

  /**
   * 取消指定任务。
   */
  cancelTask(taskId: string) {
    const record = this._tasks.get(taskId);
    if (record?.timer) {
      clearInterval(record.timer);
      record.timer = null;
    }
    this._worker.postMessage({
      type: 'cancel',
      taskId,
    } satisfies WorkerRequest);
  }

  /**
   * 请求 worker 清空缓存。
   */
  clearCache() {
    this._worker.postMessage({ type: 'clearCache' } satisfies WorkerRequest);
  }

  /**
   * 读取 worker 当前队列、缓存和历史统计信息。
   */
  async getStats() {
    return await new Promise<Extract<WorkerResponse, { type: 'stats' }>['payload']>((resolve) => {
      const handleMessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data?.type !== 'stats') return;
        this._worker.removeEventListener('message', handleMessage);
        resolve(event.data.payload);
      };
      this._worker.addEventListener('message', handleMessage);
      this._worker.postMessage({ type: 'getStats' } satisfies WorkerRequest);
    });
  }

  /**
   * 统一提交任务到 worker，并登记主线程侧的任务状态。
   */
  private _runTask<T extends BooleanTaskResult | ExportZipTaskResult>(
    request: Extract<WorkerRequest, { type: 'boolean' | 'exportZip' }>,
    kind: TaskKind,
    options: TaskCallbacks & { transferables?: Transferable[] } = {}
  ) {
    return awaitable<T>((resolve, reject) => {
      // 先在主线程登记任务记录，再 postMessage 给 worker。
      // 这样即使 worker 很快返回 progress / result，也能立即按 taskId 找到对应回调。
      this._tasks.set(request.taskId, {
        id: request.taskId,
        kind,
        resolve: resolve as TaskRecord['resolve'],
        reject,
        onProgress: options.onProgress,
        timer: null,
        simulatedPhase: null,
        lastProgress: 0,
        lastEmittedProgress: -1,
        lastEmittedPhase: null,
        estimateStartedAt: 0,
        estimateMs: 0,
        estimateCeiling: 0,
      });

      this._worker.postMessage(request, options.transferables || []);
    });
  }

  /**
   * 处理 worker 返回的进度、结果与错误消息。
   */
  private _handleMessage(message: WorkerResponse) {
    if (message.type === 'stats') {
      return;
    }

    // 除 stats 外，所有 worker 消息都会按 taskId 汇总到这里统一分发。
    const task = this._tasks.get(message.taskId);
    if (!task) {
      return;
    }

    if (message.type === 'progress') {
      this._handleProgress(task, message);
      return;
    }

    if (task.timer) {
      clearInterval(task.timer);
      task.timer = null;
    }

    this._tasks.delete(message.taskId);

    if (message.type === 'result') {
      task.resolve(message.payload as BooleanTaskResult | ExportZipTaskResult);
      return;
    }

    task.reject(new Error(message.error || 'Worker task failed'));
  }

  /**
   * 汇总并处理单次任务进度。
   */
  private _handleProgress(task: TaskRecord, progress: WorkerTaskProgress) {
    // 进度在 bridge 层保持单调递增；
    // worker 真进度和 bridge 自己补出来的模拟进度都会先汇总到这里。
    task.lastProgress = Math.max(task.lastProgress, progress.progress || 0);
    this._syncSimulation(task, progress.detail || {});
    this._emitProgress(task, progress);
  }

  /**
   * 根据 worker 给出的估算信息，在主线程补出平滑进度。
   */
  private _syncSimulation(task: TaskRecord, detail: WorkerProgressDetail) {
    // worker 在耗时阶段会给出“预计耗时 + 本阶段最高可推进到哪里”。
    // bridge 利用这两个值在主线程补一段平滑进度，避免 UI 长时间卡在某个百分比不动。
    const estimatedMs = Number(detail.simulatedMs || 0);
    const ceiling = Number(detail.simulatedCeilingProgress || 0);
    const phaseName = typeof detail.phaseName === 'string' ? String(detail.phaseName) : null;

    if (!estimatedMs || !ceiling || !phaseName) {
      if (task.timer) {
        clearInterval(task.timer);
        task.timer = null;
      }
      task.simulatedPhase = null;
      return;
    }

    if (task.simulatedPhase === phaseName && task.timer) {
      return;
    }

    if (task.timer) {
      clearInterval(task.timer);
      task.timer = null;
    }

    task.simulatedPhase = phaseName;
    task.estimateStartedAt = performance.now();
    task.estimateMs = estimatedMs;
    task.estimateCeiling = ceiling;

    task.timer = setInterval(() => {
      const current = this._tasks.get(task.id);
      if (!current) return;

      const elapsed = performance.now() - current.estimateStartedAt;
      const ratio = Math.min(elapsed / Math.max(current.estimateMs, 1), 1);
      const nextProgress =
        current.lastProgress + (current.estimateCeiling - current.lastProgress) * ratio;

      this._emitProgress(current, {
        type: 'progress',
        taskId: current.id,
        phase: current.simulatedPhase as WorkerTaskProgress['phase'],
        progress: Math.max(current.lastProgress, nextProgress),
        detail: {
          phaseName: current.simulatedPhase as WorkerProgressDetail['phaseName'],
          phaseProgress: ratio,
          simulatedMs: current.estimateMs,
          simulatedCeilingProgress: current.estimateCeiling,
          simulated: true,
        },
      });

      if (ratio >= 1 && current.timer) {
        clearInterval(current.timer);
        current.timer = null;
      }
    }, 40);
  }

  /**
   * 按 UI 友好的粒度向外发出进度事件。
   */
  private _emitProgress(task: TaskRecord, progress: WorkerTaskProgress) {
    // UI 侧不需要每个细粒度 tick；
    // 这里只在“阶段变化 / 百分比跨整数桶 / 完成”时往外发一次，减少重渲染。
    const currentBucket = Math.floor(Math.max(0, Math.min(progress.progress || 0, 1)) * 100);
    const previousBucket = Math.floor(Math.max(task.lastEmittedProgress, 0) * 100);
    const phaseChanged = task.lastEmittedPhase !== progress.phase;
    const shouldEmit = phaseChanged || currentBucket > previousBucket || (progress.progress || 0) >= 1;

    if (!shouldEmit) {
      return;
    }

    const normalizedProgress =
      (progress.progress || 0) >= 1
        ? 1
        : phaseChanged
          ? Math.max(0, Math.min(progress.progress || 0, 1))
          : currentBucket / 100;

    task.lastEmittedProgress = normalizedProgress;
    task.lastEmittedPhase = progress.phase;
    task.onProgress?.({
      ...progress,
      progress: normalizedProgress,
    });
  }
}

/**
 * 用同步风格封装 Promise 构造，便于桥接任务回调。
 */
function awaitable<T>(
  executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
) {
  return new Promise<T>((resolve, reject) => {
    executor(resolve, reject);
  });
}

export default EditorTaskWorkerBridge;
