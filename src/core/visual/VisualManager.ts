import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EntityManager } from '../Document/EntityManager';
import { Entity, TextEntity, ModelEntity } from '../Document/Entity';
import { MouseManager } from '../interaction/MouseManager';
import { EntityRenderer } from './EntityRenderer';
import { SelectionManager } from './SelectionManager';

export interface VisualManagerOptions {
  container: HTMLElement;
  entityManager: EntityManager;
}

/**
 * 可视化管理器
 * 职责：管理 Three.js 场景、渲染、选中状态、编辑模式切换
 */
export class VisualManager {
  container: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;

  entityManager: EntityManager;
  entityRenderer: EntityRenderer;
  selectionManager: SelectionManager;
  mouseManager: MouseManager;

  // 实体组（所有原始实体的 Three.js 对象）
  entityGroup: THREE.Group;
  // 布尔结果网格
  booleanResultMesh: THREE.Mesh | null = null;

  // 实体 ID -> Three.js Object 的映射
  entityMeshMap: Map<string, THREE.Object3D>;

  // 选中状态
  selectedEntityId: string | null = null;
  isEditMode = false;

  private animationId: number | null = null;

  constructor(options: VisualManagerOptions) {
    this.container = options.container;
    this.entityManager = options.entityManager;
    this.entityMeshMap = new Map();

    // 初始化 Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    const rect = this.container.getBoundingClientRect();
    this.camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 1000);
    this.camera.position.set(10, 10, 10);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(rect.width, rect.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;

    // 创建实体组
    this.entityGroup = new THREE.Group();
    this.entityGroup.name = 'EntityGroup';
    this.scene.add(this.entityGroup);

    // 初始化子模块
    this.entityRenderer = new EntityRenderer();
    this.selectionManager = new SelectionManager(this.scene, this.camera, this.renderer);
    this.mouseManager = new MouseManager(this.renderer.domElement, this.camera);

    // 设置灯光
    this.setupLights();

    // 订阅事件
    this.subscribeToDocument();
    this.setupMouseEvents();

    // 开始渲染循环
    this.startRenderLoop();
  }

  /**
   * 设置灯光
   */
  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    this.scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-10, -10, -10);
    this.scene.add(directionalLight2);
  }

  /**
   * 订阅 Document 事件
   */
  private subscribeToDocument(): void {
    this.entityManager.on('entityAdded', (payload) => {
      this.onEntityAdded(payload.entity);
    });

    this.entityManager.on('entityUpdated', (payload) => {
      this.onEntityUpdated(payload.entity, payload.patch);
    });

    this.entityManager.on('entityRemoved', (payload) => {
      this.onEntityRemoved(payload.entity);
    });
  }

  /**
   * 设置鼠标事件
   */
  private setupMouseEvents(): void {
    this.mouseManager.enable();

    this.mouseManager.on('click', (data) => {
      if (data.type !== 'click') return;
      this.handleClick(data.event);
    });
  }

  /**
   * 处理点击事件
   */
  private handleClick(event: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    // 获取所有可点击的对象
    const objects = Array.from(this.entityMeshMap.values());
    const intersects = raycaster.intersectObjects(objects, true);

    if (intersects.length > 0) {
      // 找到实体 ID
      let targetObject = intersects[0].object;
      while (targetObject && !targetObject.userData.entityId) {
        targetObject = targetObject.parent as THREE.Object3D;
      }

      if (targetObject?.userData.entityId) {
        this.selectEntity(targetObject.userData.entityId);
      }
    } else {
      // 点击空白区域
      this.deselectEntity();
    }
  }

  /**
   * 选中实体
   */
  selectEntity(id: string): void {
    if (this.selectedEntityId === id) return;

    // 取消之前的选中
    if (this.selectedEntityId) {
      this.selectionManager.deselect();
    }

    this.selectedEntityId = id;
    this.isEditMode = true;

    const mesh = this.entityMeshMap.get(id);
    if (mesh) {
      this.selectionManager.select(mesh);
    }

    this.updateDisplayMode();
  }

  /**
   * 取消选中
   */
  deselectEntity(): void {
    if (!this.selectedEntityId) return;

    this.selectionManager.deselect();
    this.selectedEntityId = null;
    this.isEditMode = false;

    this.updateDisplayMode();
  }

  /**
   * 更新显示模式（编辑/非编辑切换）
   */
  updateDisplayMode(): void {
    if (this.isEditMode) {
      // 编辑模式：显示所有原始实体
      this.entityGroup.visible = true;
      if (this.booleanResultMesh) {
        this.booleanResultMesh.visible = false;
      }
    } else {
      // 非编辑模式：如果有布尔结果，显示布尔结果
      if (this.booleanResultMesh) {
        this.entityGroup.visible = false;
        this.booleanResultMesh.visible = true;
      } else {
        this.entityGroup.visible = true;
      }
    }
  }

  /**
   * 设置布尔结果
   */
  setBooleanResult(mesh: THREE.Mesh | null): void {
    if (this.booleanResultMesh) {
      this.scene.remove(this.booleanResultMesh);
      this.booleanResultMesh.geometry.dispose();
    }

    this.booleanResultMesh = mesh;
    if (mesh) {
      mesh.name = 'BooleanResult';
      this.scene.add(mesh);
    }

    this.updateDisplayMode();
  }

  /**
   * 实体添加回调
   */
  private async onEntityAdded(entity: Entity): Promise<void> {
    const object = await this.entityRenderer.createObject(entity);
    if (object) {
      object.userData.entityId = entity.id;
      this.entityGroup.add(object);
      this.entityMeshMap.set(entity.id, object);
    }
  }

  /**
   * 实体更新回调
   */
  private async onEntityUpdated(entity: Entity, patch: any): Promise<void> {
    const object = this.entityMeshMap.get(entity.id);
    if (!object) return;

    // 更新变换
    if (patch.position) {
      object.position.fromArray(entity.position);
    }
    if (patch.rotation) {
      object.rotation.fromArray(entity.rotation);
    }
    if (patch.scale) {
      object.scale.fromArray(entity.scale);
    }

    // 如果是文字实体且文字内容变化，需要重新生成几何体
    if (entity.type === 'text' && (patch.text || patch.fontType || patch.size || patch.depth)) {
      await this.entityRenderer.updateTextGeometry(object as THREE.Mesh, entity as TextEntity);
    }

    // 更新颜色
    if (patch.color !== undefined) {
      this.entityRenderer.updateColor(object, entity.color);
    }
  }

  /**
   * 实体移除回调
   */
  private onEntityRemoved(entity: Entity): void {
    const object = this.entityMeshMap.get(entity.id);
    if (object) {
      this.entityGroup.remove(object);
      this.entityMeshMap.delete(entity.id);

      // 清理几何体和材质
      if (object instanceof THREE.Mesh) {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose());
        } else {
          object.material?.dispose();
        }
      }
    }

    // 如果删除的是选中的实体
    if (this.selectedEntityId === entity.id) {
      this.deselectEntity();
    }
  }

  /**
   * 开始渲染循环
   */
  private startRenderLoop(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  /**
   * 调整大小
   */
  resize(): void {
    const rect = this.container.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height);
  }

  /**
   * 销毁
   */
  dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.mouseManager.dispose();
    this.selectionManager.dispose();
    this.controls.dispose();
    this.renderer.dispose();

    this.entityMeshMap.clear();
    this.container.removeChild(this.renderer.domElement);
  }
}

export default VisualManager;
