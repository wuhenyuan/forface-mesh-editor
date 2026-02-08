import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

/**
 * 选中管理器
 * 职责：管理选中高亮、变换控制
 */
export class SelectionManager {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;

  // 变换控制器
  transformControls: TransformControls | null = null;

  // 当前选中的对象
  selectedObject: THREE.Object3D | null = null;

  // 高亮材质
  private originalMaterials: Map<THREE.Object3D, THREE.Material | THREE.Material[]> = new Map();

  // 选中边框
  private selectionBox: THREE.BoxHelper | null = null;

  // 事件监听
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.initTransformControls();
  }

  /**
   * 初始化变换控制器
   */
  private initTransformControls(): void {
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode('translate');
    this.transformControls.setSize(0.8);
    this.scene.add(this.transformControls as unknown as THREE.Object3D);

    // 监听变换事件
    this.transformControls.addEventListener('change', () => {
      this.updateSelectionBox();
      this.emit('change', { object: this.selectedObject });
    });

    this.transformControls.addEventListener('dragging-changed', (event: any) => {
      this.emit('dragging-changed', { dragging: event.value });
    });

    this.transformControls.addEventListener('objectChange', () => {
      this.emit('objectChange', { object: this.selectedObject });
    });
  }

  /**
   * 选中对象
   */
  select(object: THREE.Object3D): void {
    if (this.selectedObject === object) return;

    // 先取消之前的选中
    if (this.selectedObject) {
      this.deselect();
    }

    this.selectedObject = object;

    // 附加变换控制器
    if (this.transformControls) {
      this.transformControls.attach(object);
    }

    // 创建选中边框
    this.createSelectionBox(object);

    // 添加高亮效果
    this.addHighlight(object);

    this.emit('selected', { object });
  }

  /**
   * 取消选中
   */
  deselect(): void {
    if (!this.selectedObject) return;

    const object = this.selectedObject;

    // 移除变换控制器
    if (this.transformControls) {
      this.transformControls.detach();
    }

    // 移除选中边框
    this.removeSelectionBox();

    // 移除高亮效果
    this.removeHighlight(object);

    this.selectedObject = null;

    this.emit('deselected', { object });
  }

  /**
   * 创建选中边框
   */
  private createSelectionBox(object: THREE.Object3D): void {
    this.removeSelectionBox();

    this.selectionBox = new THREE.BoxHelper(object, 0x00ff00);
    this.selectionBox.name = 'SelectionBox';
    this.scene.add(this.selectionBox);
  }

  /**
   * 更新选中边框
   */
  private updateSelectionBox(): void {
    if (this.selectionBox && this.selectedObject) {
      this.selectionBox.update();
    }
  }

  /**
   * 移除选中边框
   */
  private removeSelectionBox(): void {
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.dispose();
      this.selectionBox = null;
    }
  }

  /**
   * 添加高亮效果
   */
  private addHighlight(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        // 保存原始材质
        this.originalMaterials.set(child, child.material);

        // 创建高亮材质
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => {
            const newMat = m.clone();
            if (newMat instanceof THREE.MeshStandardMaterial) {
              newMat.emissive = new THREE.Color(0x333333);
            }
            return newMat;
          });
        } else {
          const newMat = child.material.clone();
          if (newMat instanceof THREE.MeshStandardMaterial) {
            newMat.emissive = new THREE.Color(0x333333);
          }
          child.material = newMat;
        }
      }
    });
  }

  /**
   * 移除高亮效果
   */
  private removeHighlight(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && this.originalMaterials.has(child)) {
        // 销毁临时材质
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }

        // 恢复原始材质
        child.material = this.originalMaterials.get(child)!;
        this.originalMaterials.delete(child);
      }
    });
  }

  /**
   * 设置变换模式
   */
  setMode(mode: 'translate' | 'rotate' | 'scale'): void {
    if (this.transformControls) {
      this.transformControls.setMode(mode);
    }
  }

  /**
   * 获取当前变换模式
   */
  getMode(): string {
    return this.transformControls?.mode || 'translate';
  }

  /**
   * 设置变换控制器大小
   */
  setSize(size: number): void {
    if (this.transformControls) {
      this.transformControls.setSize(size);
    }
  }

  /**
   * 启用/禁用变换控制器
   */
  setEnabled(enabled: boolean): void {
    if (this.transformControls) {
      this.transformControls.enabled = enabled;
    }
  }

  /**
   * 事件监听
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * 移除事件监听
   */
  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * 发出事件
   */
  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        console.error(`[SelectionManager] Error in ${event} callback:`, e);
      }
    });
  }

  /**
   * 销毁
   */
  dispose(): void {
    this.deselect();

    if (this.transformControls) {
      this.scene.remove(this.transformControls as unknown as THREE.Object3D);
      this.transformControls.dispose();
      this.transformControls = null;
    }

    this.originalMaterials.clear();
    this.listeners.clear();
  }
}

export default SelectionManager;
