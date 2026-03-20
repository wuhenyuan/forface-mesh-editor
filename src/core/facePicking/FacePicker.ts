import * as THREE from 'three';
import { RaycastManager } from './RaycastManager';
import { SelectionManager } from './SelectionManager';
import { HighlightRenderer } from './HighlightRenderer';
import { EventHandler } from './EventHandler';
import { debugLogger } from './DebugLogger';

type SelectionMode = 'single' | 'multi';
type EventCallback = (...args: unknown[]) => void;

type FaceInfo = {
  id?: string;
  mesh: THREE.Mesh;
  faceIndex: number;
  point?: THREE.Vector3;
  distance?: number;
  area?: number;
  [key: string]: unknown;
};

type SelectionSummary = {
  count: number;
  mode: SelectionMode;
  hasSelection: boolean;
  hasHover: boolean;
  faceIds: string[];
  [key: string]: unknown;
};

type PerformanceRecord = {
  operation: string;
  duration: number;
  timestamp: number;
  meshCount: number;
  selectedCount: number;
};

type PerformanceMonitorState = {
  enabled: boolean;
  responseTimeThreshold: number;
  maxFaceCount: number;
  recentOperations: PerformanceRecord[];
  maxHistorySize: number;
};

type ErrorSnapshot = {
  context: string;
  error: string;
  timestamp: number;
  stack?: string;
};

type ErrorHandlerState = {
  maxRetries: number;
  fallbackMode: boolean;
  lastError: ErrorSnapshot | null;
  errorCount: number;
};

type FacePickerOptions = {
  enableHover: boolean;
  enableDoubleClick: boolean;
  enableRightClick: boolean;
  hoverDelay: number;
  dragThreshold: number;
  enablePerformanceMonitoring: boolean;
  enableErrorRecovery: boolean;
};

type PerformanceStats = {
  totalOperations: number;
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  operationsOverThreshold: number;
  overThresholdRatio?: number;
  performanceGrade: 'A' | 'B' | 'C' | 'D';
  threshold?: number;
  fallbackMode?: boolean;
  errorCount?: number;
};

type RaycastManagerLike = {
  screenToNDC: (clientX: number, clientY: number, rect: DOMRect) => THREE.Vector2;
  intersectFaces: (mousePosition: THREE.Vector2, meshes: THREE.Mesh[]) => FaceInfo | null;
  intersectFacesWithDepthSorting: (mousePosition: THREE.Vector2, meshes: THREE.Mesh[]) => FaceInfo[];
  intersectSingleMesh: (mousePosition: THREE.Vector2, mesh: THREE.Mesh) => FaceInfo | null;
  buildFaceInfo: (intersection: Record<string, unknown>) => FaceInfo | null;
};

type SelectionManagerLike = {
  contains: (faceInfo: FaceInfo) => boolean;
  setSelectionMode: (mode: SelectionMode, recordHistory?: boolean) => void;
  removeFace: (faceInfo: FaceInfo, recordHistory?: boolean) => boolean;
  addFace: (faceInfo: FaceInfo, recordHistory?: boolean) => boolean;
  getAll: () => FaceInfo[];
  clearAll: (recordHistory?: boolean) => void;
  getSelectionSummary: () => SelectionSummary;
  undo: () => boolean;
  redo: () => boolean;
  getSelectionMode: () => SelectionMode;
  on: (eventName: string, callback: (...args: unknown[]) => void) => void;
  getSelectionStats: () => Record<string, unknown>;
};

type HighlightRendererLike = {
  clearAllHighlights: (includeHover?: boolean) => void;
  removeHighlight: (mesh: THREE.Mesh, faceIndex: number, isHover?: boolean) => boolean;
  hideHoverEffect: (mesh?: THREE.Mesh | null, faceIndex?: number | null) => void;
  showHoverEffect: (mesh: THREE.Mesh, faceIndex: number) => boolean;
  highlightFace: (mesh: THREE.Mesh, faceIndex: number, color?: number | null, isHover?: boolean) => boolean;
  updateColors: (colors: Record<string, unknown>) => void;
  getHighlightStats: () => Record<string, unknown>;
  destroy: () => void;
};

type EventHandlerLike = {
  enable: () => void;
  disable: () => void;
  setDragThreshold: (threshold: number) => void;
  getState: () => Record<string, unknown>;
};

export class FacePicker {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  domElement: HTMLElement;
  raycastManager: RaycastManagerLike;
  selectionManager: SelectionManagerLike;
  highlightRenderer: HighlightRendererLike;
  eventHandler: EventHandlerLike;
  eventListeners: Map<string, EventCallback[]>;

  enabled: boolean;
  meshes: THREE.Mesh[];
  currentHoverFace: FaceInfo | null;

  performanceMonitor: PerformanceMonitorState;
  errorHandler: ErrorHandlerState;
  options: FacePickerOptions;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    domElement: HTMLElement
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.domElement = domElement;

    this.raycastManager = new RaycastManager(camera) as unknown as RaycastManagerLike;
    this.selectionManager = new SelectionManager() as unknown as SelectionManagerLike;
    this.highlightRenderer = new HighlightRenderer(scene) as unknown as HighlightRendererLike;
    this.eventHandler = new EventHandler(this, domElement) as unknown as EventHandlerLike;
    this.eventListeners = new Map();

    this.enabled = false;
    this.meshes = [];
    this.currentHoverFace = null;

    this.performanceMonitor = {
      enabled: true,
      responseTimeThreshold: 50,
      maxFaceCount: 100000,
      recentOperations: [],
      maxHistorySize: 100,
    };

    this.errorHandler = {
      maxRetries: 3,
      fallbackMode: false,
      lastError: null,
      errorCount: 0,
    };

    this.options = {
      enableHover: true,
      enableDoubleClick: true,
      enableRightClick: true,
      hoverDelay: 0,
      dragThreshold: 5,
      enablePerformanceMonitoring: true,
      enableErrorRecovery: true,
    };

    this.handleClick = this.handleClick.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.setupSelectionEvents();
  }

  private _toError(error: unknown): Error {
    if (error instanceof Error) return error;
    return new Error(typeof error === 'string' ? error : 'Unknown error');
  }

  private _asFaceInfo(value: unknown): FaceInfo | null {
    if (!value || typeof value !== 'object') return null;
    const faceInfo = value as FaceInfo;
    if (!faceInfo.mesh || typeof faceInfo.faceIndex !== 'number') return null;
    return faceInfo;
  }

  private _asFaceInfoArray(value: unknown): FaceInfo[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this._asFaceInfo(item))
      .filter((item): item is FaceInfo => !!item);
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.eventHandler.enable();
    this.eventHandler.setDragThreshold(this.options.dragThreshold);
    debugLogger.info('FacePicker enabled', {
      meshCount: this.meshes.length,
      options: this.options,
    });
    this.emit('enabled');
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.eventHandler.disable();
    this.highlightRenderer.clearAllHighlights(true);
    this.currentHoverFace = null;
    this.emit('disabled');
  }

  setMeshes(meshes: THREE.Mesh[]) {
    this.meshes = Array.isArray(meshes) ? meshes : [];
  }

  addMesh(mesh: THREE.Mesh) {
    if (!this.meshes.includes(mesh)) {
      this.meshes.push(mesh);
    }
  }

  removeMesh(mesh: THREE.Mesh) {
    const index = this.meshes.indexOf(mesh);
    if (index !== -1) {
      this.meshes.splice(index, 1);
    }
  }

  selectFace(faceInfo: FaceInfo | null | undefined, additive = false, originalEvent: MouseEvent | null = null) {
    if (!faceInfo) return;

    const monitor = debugLogger.createPerformanceMonitor('selectFace');
    const wasSelected = this.selectionManager.contains(faceInfo);

    if (additive) {
      this.selectionManager.setSelectionMode('multi', false);
      if (wasSelected) {
        this.selectionManager.removeFace(faceInfo);
        debugLogger.logFacePickingEvent('faceDeselected', faceInfo);
        this.emit('faceDeselected', faceInfo, originalEvent);
      } else {
        this.selectionManager.addFace(faceInfo);
        debugLogger.logFacePickingEvent('faceSelectedMulti', faceInfo);
        this.emit('faceSelected', faceInfo, originalEvent);
      }
    } else {
      this.selectionManager.setSelectionMode('single', false);
      const previousSelection = this.selectionManager.getAll();
      this.selectionManager.clearAll(false);
      previousSelection.forEach((face) => {
        this.emit('faceDeselected', face, originalEvent);
      });
      this.selectionManager.addFace(faceInfo);
      debugLogger.logFacePickingEvent('faceSelectedSingle', faceInfo);
      this.emit('faceSelected', faceInfo, originalEvent);
    }

    const selectionSummary = this.selectionManager.getSelectionSummary();
    debugLogger.logSelectionChange('selectionChanged', {
      selectedCount: selectionSummary.count,
      mode: selectionSummary.mode,
      canUndo: this.selectionManager.undo ? true : false,
      canRedo: this.selectionManager.redo ? true : false,
    });
    this.emit('selectionChanged', selectionSummary);

    monitor.end({ additive, wasSelected });
  }

  clearSelection() {
    const selectedFaces = this.selectionManager.getAll();
    this.selectionManager.clearAll();
    selectedFaces.forEach((face) => {
      this.highlightRenderer.removeHighlight(face.mesh, face.faceIndex, false);
      this.emit('faceDeselected', face);
    });
    this.emit('selectionCleared');
    this.emit('selectionChanged', this.selectionManager.getSelectionSummary());
  }

  handleMouseMove(event: MouseEvent) {
    if (!this.enabled || !this.options.enableHover) return;
    const startTime = performance.now();

    try {
      const rect = this.domElement.getBoundingClientRect();
      const mousePosition = this.raycastManager.screenToNDC(event.clientX, event.clientY, rect);
      const intersection = this.raycastManager.intersectFaces(mousePosition, this.meshes);

      if (intersection) {
        const changed =
          !this.currentHoverFace ||
          this.currentHoverFace.mesh !== intersection.mesh ||
          this.currentHoverFace.faceIndex !== intersection.faceIndex;

        if (changed) {
          if (this.currentHoverFace) {
            this.highlightRenderer.hideHoverEffect(
              this.currentHoverFace.mesh,
              this.currentHoverFace.faceIndex
            );
          }

          if (!this.selectionManager.contains(intersection)) {
            this.highlightRenderer.showHoverEffect(intersection.mesh, intersection.faceIndex);
            this.currentHoverFace = intersection;
            this.emit('faceHover', intersection);
          } else {
            this.currentHoverFace = null;
          }
        }
      } else if (this.currentHoverFace) {
        this.highlightRenderer.hideHoverEffect(
          this.currentHoverFace.mesh,
          this.currentHoverFace.faceIndex
        );
        this.currentHoverFace = null;
        this.emit('faceHoverEnd');
      }

      this.recordPerformance('hover', performance.now() - startTime);
    } catch (error) {
      this.handleError('handleMouseMove', error);
    }
  }

  setOptions(options: Partial<FacePickerOptions>) {
    Object.assign(this.options, options);
    if (options.dragThreshold !== undefined) {
      this.eventHandler.setDragThreshold(options.dragThreshold);
    }
  }

  getOptions(): FacePickerOptions {
    return { ...this.options };
  }

  setHoverEnabled(enabled: boolean) {
    this.options.enableHover = enabled;
    if (!enabled && this.currentHoverFace) {
      this.highlightRenderer.hideHoverEffect(
        this.currentHoverFace.mesh,
        this.currentHoverFace.faceIndex
      );
      this.currentHoverFace = null;
    }
  }

  getCurrentHoverFace() {
    return this.currentHoverFace;
  }

  selectFaceByIndex(mesh: THREE.Mesh, faceIndex: number, additive = false) {
    if (!mesh || faceIndex < 0) return false;
    const faceInfo = this.raycastManager.buildFaceInfo({
      object: mesh,
      faceIndex,
      face: null,
      point: new THREE.Vector3(),
      distance: 0,
    });
    if (!faceInfo) return false;
    this.selectFace(faceInfo, additive);
    return true;
  }

  getFaceAtPosition(clientX: number, clientY: number) {
    const rect = this.domElement.getBoundingClientRect();
    const mousePosition = this.raycastManager.screenToNDC(clientX, clientY, rect);
    return this.raycastManager.intersectFaces(mousePosition, this.meshes);
  }

  getAllFacesAtPosition(clientX: number, clientY: number) {
    const rect = this.domElement.getBoundingClientRect();
    const mousePosition = this.raycastManager.screenToNDC(clientX, clientY, rect);
    return this.raycastManager.intersectFacesWithDepthSorting(mousePosition, this.meshes);
  }

  getSelectedFaces() {
    return this.selectionManager.getAll();
  }

  handleClick(event: MouseEvent) {
    if (!this.enabled) return;
    const startTime = performance.now();

    try {
      const rect = this.domElement.getBoundingClientRect();
      const mousePosition = this.raycastManager.screenToNDC(event.clientX, event.clientY, rect);
      const intersection = this.raycastManager.intersectFaces(mousePosition, this.meshes);

      if (intersection) {
        const isMultiSelect = event.ctrlKey || event.metaKey;
        this.selectFace(intersection, isMultiSelect, event);
      } else {
        this.clearSelection();
      }

      this.recordPerformance('click', performance.now() - startTime);
    } catch (error) {
      this.handleError('handleClick', error);
    }
  }

  handleKeyDown(event: KeyboardEvent) {
    if (!this.enabled) return;

    switch (event.key) {
      case 'Escape':
        this.clearSelection();
        break;
      case 'z':
        if (event.ctrlKey || event.metaKey) {
          if (event.shiftKey) this.redo();
          else this.undo();
          event.preventDefault();
        }
        break;
      case 'y':
        if (event.ctrlKey || event.metaKey) {
          this.redo();
          event.preventDefault();
        }
        break;
      case 'a':
        if (event.ctrlKey || event.metaKey) {
          this.selectAllFaces();
          event.preventDefault();
        }
        break;
      default:
        break;
    }
  }

  undo() {
    const success = this.selectionManager.undo();
    if (success) {
      this.emit('undoPerformed');
      this.emit('selectionChanged', this.selectionManager.getSelectionSummary());
    }
    return success;
  }

  redo() {
    const success = this.selectionManager.redo();
    if (success) {
      this.emit('redoPerformed');
      this.emit('selectionChanged', this.selectionManager.getSelectionSummary());
    }
    return success;
  }

  selectAllFaces() {
    console.warn('selectAllFaces is not implemented for safety reasons');
  }

  setSelectionMode(mode: SelectionMode) {
    this.selectionManager.setSelectionMode(mode);
    this.emit('selectionModeChanged', mode);
  }

  getSelectionMode() {
    return this.selectionManager.getSelectionMode();
  }

  setupSelectionEvents() {
    this.selectionManager.on('faceAdded', (faceInfo: unknown) => {
      const face = this._asFaceInfo(faceInfo);
      if (!face) return;
      this.highlightRenderer.highlightFace(face.mesh, face.faceIndex);
      if (
        this.currentHoverFace &&
        this.currentHoverFace.mesh === face.mesh &&
        this.currentHoverFace.faceIndex === face.faceIndex
      ) {
        this.highlightRenderer.hideHoverEffect(face.mesh, face.faceIndex);
        this.currentHoverFace = null;
      }
    });

    this.selectionManager.on('faceRemoved', (faceInfo: unknown) => {
      const face = this._asFaceInfo(faceInfo);
      if (!face) return;
      this.highlightRenderer.removeHighlight(face.mesh, face.faceIndex);
    });

    this.selectionManager.on('selectionCleared', (clearedFaces: unknown) => {
      this._asFaceInfoArray(clearedFaces).forEach((face) => {
        this.highlightRenderer.removeHighlight(face.mesh, face.faceIndex);
      });
    });

    this.selectionManager.on('multipleFacesAdded', (faceInfos: unknown) => {
      this._asFaceInfoArray(faceInfos).forEach((face) => {
        this.highlightRenderer.highlightFace(face.mesh, face.faceIndex);
      });
    });

    this.selectionManager.on('multipleFacesRemoved', (faceInfos: unknown) => {
      this._asFaceInfoArray(faceInfos).forEach((face) => {
        this.highlightRenderer.removeHighlight(face.mesh, face.faceIndex);
      });
    });
  }

  setHighlightColors(colors: Record<string, unknown>) {
    this.highlightRenderer.updateColors(colors);
    const selectedFaces = this.selectionManager.getAll();
    selectedFaces.forEach((face) => {
      this.highlightRenderer.removeHighlight(face.mesh, face.faceIndex);
      this.highlightRenderer.highlightFace(face.mesh, face.faceIndex);
    });
  }

  getHighlightStats() {
    return this.highlightRenderer.getHighlightStats();
  }

  on(eventName: string, callback: EventCallback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName)?.push(callback);
  }

  off(eventName: string, callback: EventCallback) {
    const listeners = this.eventListeners.get(eventName);
    if (!listeners) return;
    const index = listeners.indexOf(callback);
    if (index !== -1) listeners.splice(index, 1);
  }

  emit(eventName: string, ...args: unknown[]) {
    const listeners = this.eventListeners.get(eventName);
    if (!listeners) return;
    listeners.forEach((callback) => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error);
      }
    });
  }

  getAllIntersectionsAtPosition(event: MouseEvent) {
    if (!this.enabled) return [];
    const rect = this.domElement.getBoundingClientRect();
    const mousePosition = this.raycastManager.screenToNDC(event.clientX, event.clientY, rect);
    return this.raycastManager.intersectFacesWithDepthSorting(mousePosition, this.meshes);
  }

  intersectSpecificMesh(event: MouseEvent, mesh: THREE.Mesh) {
    if (!this.enabled) return null;
    const rect = this.domElement.getBoundingClientRect();
    const mousePosition = this.raycastManager.screenToNDC(event.clientX, event.clientY, rect);
    return this.raycastManager.intersectSingleMesh(mousePosition, mesh);
  }

  addValidatedMesh(mesh: THREE.Mesh) {
    if (RaycastManager.validateMesh(mesh)) {
      this.addMesh(mesh);
      return true;
    }
    return false;
  }

  getGeometryCompatibility(mesh: THREE.Mesh) {
    if (!mesh || !mesh.geometry) {
      return { isCompatible: false, warnings: ['Mesh has no geometry'] };
    }
    return RaycastManager.checkGeometryCompatibility(mesh.geometry);
  }

  getSelectionStats() {
    return this.selectionManager.getSelectionStats();
  }

  getEventHandlerState() {
    return this.eventHandler.getState();
  }

  getFullState() {
    return {
      enabled: this.enabled,
      options: this.getOptions(),
      meshCount: this.meshes.length,
      selection: this.getSelectionStats(),
      highlight: this.getHighlightStats(),
      eventHandler: this.getEventHandlerState(),
      currentHover: this.currentHoverFace
        ? {
            meshName: this.currentHoverFace.mesh.name || 'Unnamed',
            faceIndex: this.currentHoverFace.faceIndex,
          }
        : null,
    };
  }

  recordPerformance(operation: string, duration: number) {
    if (!this.options.enablePerformanceMonitoring) return;

    const record: PerformanceRecord = {
      operation,
      duration,
      timestamp: Date.now(),
      meshCount: this.meshes.length,
      selectedCount: this.selectionManager.getAll().length,
    };

    this.performanceMonitor.recentOperations.push(record);
    if (this.performanceMonitor.recentOperations.length > this.performanceMonitor.maxHistorySize) {
      this.performanceMonitor.recentOperations.shift();
    }

    if (duration > this.performanceMonitor.responseTimeThreshold) {
      this.emit('performanceWarning', {
        operation,
        duration,
        threshold: this.performanceMonitor.responseTimeThreshold,
      });
      if (this.options.enableErrorRecovery) {
        this.optimizeForPerformance();
      }
    }
  }

  handleError(context: string, error: unknown) {
    const parsed = this._toError(error);

    this.errorHandler.lastError = {
      context,
      error: parsed.message,
      timestamp: Date.now(),
      stack: parsed.stack,
    };
    this.errorHandler.errorCount += 1;

    debugLogger.logError(context, parsed, {
      errorCount: this.errorHandler.errorCount,
      fallbackMode: this.errorHandler.fallbackMode,
    });

    this.emit('error', this.errorHandler.lastError);

    if (this.options.enableErrorRecovery) {
      this.attemptErrorRecovery(context, parsed);
    }
  }

  attemptErrorRecovery(context: string, _error: Error) {
    if (this.errorHandler.errorCount > this.errorHandler.maxRetries) {
      this.enableFallbackMode();
      return;
    }

    switch (context) {
      case 'handleClick':
      case 'handleMouseMove':
        this.validateAndCleanMeshes();
        break;
      case 'selectFace':
        this.clearSelection();
        break;
      default:
        break;
    }
  }

  enableFallbackMode() {
    this.errorHandler.fallbackMode = true;
    this.options.enableHover = false;
    this.options.dragThreshold = Math.max(this.options.dragThreshold, 10);

    if (this.meshes.length > 10) {
      this.meshes = this.meshes.slice(0, 10);
    }

    this.emit('fallbackModeEnabled');
  }

  optimizeForPerformance() {
    const complexMeshes = this.meshes.filter((mesh) => {
      const faceCount = RaycastManager.getFaceCount(mesh.geometry);
      return faceCount > this.performanceMonitor.maxFaceCount;
    });

    if (complexMeshes.length > 0) {
      this.emit('complexMeshDetected', complexMeshes);
    }

    const hoverOperations = this.performanceMonitor.recentOperations.filter(
      (operation) => operation.operation === 'hover'
    );
    if (hoverOperations.length === 0) return;

    const total = hoverOperations.reduce((sum, operation) => sum + operation.duration, 0);
    const avgHoverTime = total / hoverOperations.length;
    if (avgHoverTime > this.performanceMonitor.responseTimeThreshold * 0.8) {
      this.options.enableHover = false;
      this.emit('hoverDisabledForPerformance');
    }
  }

  validateAndCleanMeshes() {
    const validMeshes: THREE.Mesh[] = [];
    const invalidMeshes: THREE.Mesh[] = [];

    this.meshes.forEach((mesh) => {
      if (RaycastManager.validateMesh(mesh)) validMeshes.push(mesh);
      else invalidMeshes.push(mesh);
    });

    if (invalidMeshes.length > 0) {
      this.meshes = validMeshes;
      this.emit('invalidMeshesRemoved', invalidMeshes);
    }
  }

  getPerformanceStats(): PerformanceStats {
    const operations = this.performanceMonitor.recentOperations;
    if (operations.length === 0) {
      return {
        totalOperations: 0,
        averageResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: 0,
        operationsOverThreshold: 0,
        performanceGrade: 'A',
      };
    }

    const durations = operations.map((operation) => operation.duration);
    const totalOperations = operations.length;
    const averageResponseTime = durations.reduce((sum, value) => sum + value, 0) / totalOperations;
    const maxResponseTime = Math.max(...durations);
    const minResponseTime = Math.min(...durations);
    const operationsOverThreshold = durations.filter(
      (value) => value > this.performanceMonitor.responseTimeThreshold
    ).length;
    const overThresholdRatio = operationsOverThreshold / totalOperations;

    let performanceGrade: PerformanceStats['performanceGrade'] = 'A';
    if (overThresholdRatio > 0.5) performanceGrade = 'D';
    else if (overThresholdRatio > 0.3) performanceGrade = 'C';
    else if (overThresholdRatio > 0.1) performanceGrade = 'B';

    return {
      totalOperations,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      maxResponseTime: Math.round(maxResponseTime * 100) / 100,
      minResponseTime: Math.round(minResponseTime * 100) / 100,
      operationsOverThreshold,
      overThresholdRatio: Math.round(overThresholdRatio * 100),
      performanceGrade,
      threshold: this.performanceMonitor.responseTimeThreshold,
      fallbackMode: this.errorHandler.fallbackMode,
      errorCount: this.errorHandler.errorCount,
    };
  }

  resetPerformanceStats() {
    this.performanceMonitor.recentOperations = [];
    this.errorHandler.errorCount = 0;
    this.errorHandler.lastError = null;
    this.errorHandler.fallbackMode = false;
  }

  setPerformanceConfig(config: Partial<PerformanceMonitorState>) {
    Object.assign(this.performanceMonitor, config);
  }

  validateInput(mousePosition: THREE.Vector2, meshes: THREE.Mesh[]) {
    if (
      !mousePosition ||
      typeof mousePosition.x !== 'number' ||
      typeof mousePosition.y !== 'number' ||
      Math.abs(mousePosition.x) > 1 ||
      Math.abs(mousePosition.y) > 1
    ) {
      return false;
    }

    if (!Array.isArray(meshes) || meshes.length === 0) {
      return false;
    }

    const totalFaces = meshes.reduce((total, mesh) => {
      return total + RaycastManager.getFaceCount(mesh.geometry);
    }, 0);

    if (totalFaces > this.performanceMonitor.maxFaceCount && this.options.enableErrorRecovery) {
      this.optimizeForPerformance();
    }

    return true;
  }

  destroy() {
    this.disable();
    this.eventHandler.disable();
    this.highlightRenderer.destroy();
    this.eventListeners.clear();
    this.meshes = [];
    this.currentHoverFace = null;
    this.resetPerformanceStats();
  }
}
