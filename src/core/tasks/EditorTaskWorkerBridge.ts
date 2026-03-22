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

  static getShared() {
    if (!EditorTaskWorkerBridge._shared) {
      EditorTaskWorkerBridge._shared = new EditorTaskWorkerBridge();
    }
    return EditorTaskWorkerBridge._shared;
  }

  private _worker: Worker;
  private _tasks: Map<string, TaskRecord>;
  private _taskCounter: number;

  private constructor() {
    this._worker = new EditorTaskWorker();
    this._tasks = new Map();
    this._taskCounter = 0;
    this._worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this._handleMessage(event.data);
    };
  }

  createTaskId(prefix: TaskKind) {
    this._taskCounter += 1;
    return `${prefix}_${Date.now()}_${this._taskCounter}`;
  }

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

  clearCache() {
    this._worker.postMessage({ type: 'clearCache' } satisfies WorkerRequest);
  }

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

  private _runTask<T extends BooleanTaskResult | ExportZipTaskResult>(
    request: Extract<WorkerRequest, { type: 'boolean' | 'exportZip' }>,
    kind: TaskKind,
    options: TaskCallbacks & { transferables?: Transferable[] } = {}
  ) {
    return awaitable<T>((resolve, reject) => {
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

  private _handleMessage(message: WorkerResponse) {
    if (message.type === 'stats') {
      return;
    }

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

  private _handleProgress(task: TaskRecord, progress: WorkerTaskProgress) {
    task.lastProgress = Math.max(task.lastProgress, progress.progress || 0);
    this._syncSimulation(task, progress.detail || {});
    this._emitProgress(task, progress);
  }

  private _syncSimulation(task: TaskRecord, detail: WorkerProgressDetail) {
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

  private _emitProgress(task: TaskRecord, progress: WorkerTaskProgress) {
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

function awaitable<T>(
  executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
) {
  return new Promise<T>((resolve, reject) => {
    executor(resolve, reject);
  });
}

export default EditorTaskWorkerBridge;
