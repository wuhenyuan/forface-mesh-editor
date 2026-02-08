import * as THREE from 'three';

export interface MouseState {
  isDown: boolean;
  startPosition: { x: number; y: number };
  cameraPosition: THREE.Vector3 | null;
  button: number;
}

export interface ClickEvent {
  type: 'click';
  event: MouseEvent;
  position: { x: number; y: number };
}

export interface DragEvent {
  type: 'dragStart' | 'dragEnd';
  event: MouseEvent;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
}

type MouseEventCallback = (data: ClickEvent | DragEvent) => void;

/**
 * 统一鼠标事件管理器
 * 职责：区分点击和拖拽，发出统一事件
 */
export class MouseManager {
  private domElement: HTMLElement;
  private camera: THREE.Camera;
  private mouseState: MouseState;
  private listeners: Map<string, Set<MouseEventCallback>>;
  private dragThreshold = 5; // 像素阈值

  constructor(domElement: HTMLElement, camera: THREE.Camera) {
    this.domElement = domElement;
    this.camera = camera;
    this.listeners = new Map();
    this.mouseState = {
      isDown: false,
      startPosition: { x: 0, y: 0 },
      cameraPosition: null,
      button: -1,
    };

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
  }

  /**
   * 启用鼠标监听
   */
  enable(): void {
    this.domElement.addEventListener('mousedown', this.onMouseDown, true);
    this.domElement.addEventListener('mouseup', this.onMouseUp, true);
  }

  /**
   * 禁用鼠标监听
   */
  disable(): void {
    this.domElement.removeEventListener('mousedown', this.onMouseDown, true);
    this.domElement.removeEventListener('mouseup', this.onMouseUp, true);
    this.mouseState.isDown = false;
  }

  /**
   * 更新相机引用
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * 监听事件
   */
  on(event: 'click' | 'dragStart' | 'dragEnd', callback: MouseEventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * 移除监听
   */
  off(event: 'click' | 'dragStart' | 'dragEnd', callback: MouseEventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * 发出事件
   */
  private emit(event: string, data: ClickEvent | DragEvent): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        console.error(`[MouseManager] Error in ${event} callback:`, e);
      }
    });
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // 只处理左键

    this.mouseState.isDown = true;
    this.mouseState.button = event.button;
    this.mouseState.startPosition = { x: event.clientX, y: event.clientY };
    this.mouseState.cameraPosition = this.camera.position.clone();
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button !== 0) return;
    if (!this.mouseState.isDown) return;

    const endPosition = { x: event.clientX, y: event.clientY };
    const deltaX = Math.abs(endPosition.x - this.mouseState.startPosition.x);
    const deltaY = Math.abs(endPosition.y - this.mouseState.startPosition.y);
    const mouseMoved = deltaX > this.dragThreshold || deltaY > this.dragThreshold;

    // 检测相机是否移动
    let cameraMoved = false;
    if (this.mouseState.cameraPosition) {
      cameraMoved = this.camera.position.distanceTo(this.mouseState.cameraPosition) > 0.0001;
    }

    // 重置状态
    this.mouseState.isDown = false;

    // 判断是点击还是拖拽
    if (!mouseMoved && !cameraMoved) {
      // 点击
      this.emit('click', {
        type: 'click',
        event,
        position: endPosition,
      });
    } else {
      // 拖拽结束
      this.emit('dragEnd', {
        type: 'dragEnd',
        event,
        startPosition: this.mouseState.startPosition,
        endPosition,
      });
    }
  }

  /**
   * 销毁
   */
  dispose(): void {
    this.disable();
    this.listeners.clear();
  }
}

export default MouseManager;
