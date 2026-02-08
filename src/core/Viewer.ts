/**
 * 3D 场景查看器
 * 简化版本 - 封装 Three.js 场景管理
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { EventManager } from './EventManager';

export class Viewer {
  [key: string]: any;

  container: HTMLElement;
  options: Record<string, any>;
  scene: THREE.Scene | null = null;
  camera: THREE.PerspectiveCamera | null = null;
  renderer: THREE.WebGLRenderer | null = null;
  controls: OrbitControls | null = null;
  entityGroup: THREE.Group | null = null;
  csgGroup: THREE.Group | null = null;
  events: EventManager;

  _animationId: number | null = null;
  _isDisposed = false;
  _meshes: THREE.Mesh[] = [];
  _selectableObjects: THREE.Object3D[] = [];
  _selectedObject: THREE.Object3D | null = null;
  _hoveredObject: THREE.Object3D | null = null;

  _raycaster = new THREE.Raycaster();
  _mouse = new THREE.Vector2();

  _mouseState = {
    isDown: false,
    startPosition: { x: 0, y: 0 },
    dragThreshold: 10,
    hasDragged: false,
  };

  constructor(container: HTMLElement, options: Record<string, any> = {}) {
    const { events, ...viewerOptions } = options;

    this.container = container;
    this.options = {
      backgroundColor: 0xf2f3f5,
      enableShadow: true,
      enableGrid: true,
      ...viewerOptions,
    };

    this.events = events || new EventManager();

    this._init();
    this._bindEvents();
    this._animate();
  }

  // ==================== 初始化 ====================

  _init() {
    const rect = this.container.getBoundingClientRect();

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(rect.width, rect.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = this.options.enableShadow;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.backgroundColor);

    // 实体与布尔结果分组
    this.entityGroup = new THREE.Group();
    this.entityGroup.name = 'entityGroup';
    this.scene.add(this.entityGroup);

    this.csgGroup = new THREE.Group();
    this.csgGroup.name = 'csgGroup';
    this.scene.add(this.csgGroup);

    // 相机
    this.camera = new THREE.PerspectiveCamera(60, rect.width / rect.height, 0.1, 1000);
    this.camera.position.set(30, 30, 60);

    // 控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;

    // 默认场景设置
    this._setupLighting();
    if (this.options.enableGrid) {
      this._setupGrid();
    }
  }

  _setupLighting() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene!.add(hemi);

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene!.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7.5);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    this.scene!.add(dir);
  }

  _setupGrid() {
    const grid = new THREE.GridHelper(20, 20, 0xcccccc, 0xeeeeee);
    grid.userData.isHelper = true;
    this.scene!.add(grid);
  }

  // ==================== 事件绑定 ====================

  _bindEvents() {
    const canvas = this.renderer!.domElement;

    this._onDblClick = this._onDblClick.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onResize = this._onResize.bind(this);

    canvas.addEventListener('dblclick', this._onDblClick);
    canvas.addEventListener('contextmenu', this._onContextMenu);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('resize', this._onResize);
  }

  _unbindEvents() {
    const canvas = this.renderer!.domElement;

    canvas.removeEventListener('dblclick', this._onDblClick);
    canvas.removeEventListener('contextmenu', this._onContextMenu);
    canvas.removeEventListener('mousemove', this._onMouseMove);
    canvas.removeEventListener('mousedown', this._onMouseDown);
    canvas.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('resize', this._onResize);
  }

  // ==================== 事件处理 ====================

  _updateMouse(event: MouseEvent) {
    const rect = this.renderer!.domElement.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _raycast(objects: THREE.Object3D[] | null = null) {
    this._raycaster.setFromCamera(this._mouse, this.camera!);
    const targets = objects || this._selectableObjects.filter((obj) => obj.visible);
    return this._raycaster.intersectObjects(targets, true);
  }

  _findSelectableParent(object: THREE.Object3D) {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (this._selectableObjects.includes(current)) {
        return current;
      }
      current = current.parent;
    }
    return object;
  }

  _onDblClick(event: MouseEvent) {
    this._updateMouse(event);
    const intersects = this._raycast();

    if (intersects.length > 0) {
      const hit = intersects[0];
      const target = this._findSelectableParent(hit.object);

      this.events.emit('dblclick', {
        target,
        point: hit.point,
        faceIndex: hit.faceIndex,
        face: hit.face,
        event,
      });
    }
  }

  _onContextMenu(event: MouseEvent) {
    event.preventDefault();
    this._updateMouse(event);
    const intersects = this._raycast();

    let target = null;
    let point = null;

    if (intersects.length > 0) {
      const hit = intersects[0];
      target = this._findSelectableParent(hit.object);
      point = hit.point;
    }

    this.events.emit('contextmenu', {
      x: event.clientX,
      y: event.clientY,
      target,
      point,
      event,
    });
  }

  _onMouseMove(event: MouseEvent) {
    if (this._mouseState.isDown && !this._mouseState.hasDragged) {
      const deltaX = Math.abs(event.clientX - this._mouseState.startPosition.x);
      const deltaY = Math.abs(event.clientY - this._mouseState.startPosition.y);

      if (deltaX > this._mouseState.dragThreshold || deltaY > this._mouseState.dragThreshold) {
        this._mouseState.hasDragged = true;
      }
    }

    this._updateMouse(event);
    this.events.emit('mousemove', { event });
  }

  _onMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;

    this._mouseState.isDown = true;
    this._mouseState.startPosition = { x: event.clientX, y: event.clientY };
    this._mouseState.hasDragged = false;

    this.events.emit('mousedown', { event });
  }

  _onMouseUp(event: MouseEvent) {
    if (event.button !== 0) {
      this.events.emit('mouseup', { event });
      return;
    }

    if (this._mouseState.isDown) {
      const deltaX = Math.abs(event.clientX - this._mouseState.startPosition.x);
      const deltaY = Math.abs(event.clientY - this._mouseState.startPosition.y);
      const hasDragged = deltaX > this._mouseState.dragThreshold || deltaY > this._mouseState.dragThreshold;

      if (!hasDragged) {
        this._performClick(event);
      }
    }

    this._mouseState.isDown = false;
    this._mouseState.hasDragged = false;
    this.events.emit('mouseup', { event });
  }

  _performClick(event: MouseEvent) {
    this._updateMouse(event);
    const intersects = this._raycast();

    if (intersects.length > 0) {
      const hit = intersects[0];
      const target = this._findSelectableParent(hit.object);

      this.events.emit('click', {
        target,
        point: hit.point,
        faceIndex: hit.faceIndex,
        event,
      });
    } else {
      this.events.emit('click', { target: null, event });
    }
  }

  _onResize() {
    const rect = this.container.getBoundingClientRect();
    this.camera!.aspect = rect.width / rect.height;
    this.camera!.updateProjectionMatrix();
    this.renderer!.setSize(rect.width, rect.height);
    this.events.emit('resize', { width: rect.width, height: rect.height });
  }

  // ==================== 渲染循环 ====================

  _animate() {
    if (this._isDisposed) return;

    this._animationId = requestAnimationFrame(() => this._animate());
    this.controls?.update();
    this.renderer!.render(this.scene!, this.camera!);
  }

  // ==================== 网格管理 ====================

  addMesh(mesh: THREE.Object3D, options: Record<string, any> = {}) {
    const { selectable = true, addToEntityGroup = true } = options;

    if (addToEntityGroup && this.entityGroup) {
      this.entityGroup.add(mesh);
    } else {
      this.scene!.add(mesh);
    }

    if (mesh instanceof THREE.Mesh) {
      this._meshes.push(mesh);
    }

    if (selectable) {
      this._selectableObjects.push(mesh);
    }

    this.events.emit('meshAdded', { mesh });
    return mesh;
  }

  removeMesh(mesh: THREE.Object3D) {
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }

    const meshIndex = this._meshes.indexOf(mesh as THREE.Mesh);
    if (meshIndex !== -1) {
      this._meshes.splice(meshIndex, 1);
    }

    const selectableIndex = this._selectableObjects.indexOf(mesh);
    if (selectableIndex !== -1) {
      this._selectableObjects.splice(selectableIndex, 1);
    }

    this.events.emit('meshRemoved', { mesh });
  }

  getMeshes() {
    return [...this._meshes];
  }

  // ==================== 选中管理 ====================

  getSelectedObject() {
    return this._selectedObject;
  }

  selectObject(object: THREE.Object3D | null) {
    if (this._selectedObject === object) return;

    const previous = this._selectedObject;
    this._selectedObject = object;

    this.events.emit('selectionChanged', { previous, current: object });
  }

  clearSelection() {
    this.selectObject(null);
  }

  // ==================== 控制器 ====================

  setControlsEnabled(enabled: boolean) {
    if (this.controls) {
      this.controls.enabled = enabled;
    }
  }

  resetCamera() {
    this.camera!.position.set(30, 30, 60);
    this.camera!.lookAt(0, 0, 0);
    this.controls?.reset();
  }

  focusOnObject(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2;

    this.camera!.position.copy(center).add(new THREE.Vector3(distance, distance, distance));
    this.camera!.lookAt(center);
    this.controls!.target.copy(center);
    this.controls!.update();
  }

  // ==================== STL 加载 ====================

  loadSTL(url: string, options: Record<string, any> = {}) {
    return new Promise((resolve, reject) => {
      const loader = new STLLoader();
      const {
        color = 0x999999,
        roughness = 0.8,
        metalness = 0.1,
        position = [0, 0, 0],
        name = 'STLModel',
      } = options;

      loader.load(
        url,
        (geometry) => {
          geometry.center();

          const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = name;
          mesh.position.fromArray(position);
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          this.addMesh(mesh);
          resolve(mesh);
        },
        undefined,
        (error) => reject(error)
      );
    });
  }

  // ==================== 销毁 ====================

  dispose() {
    this._isDisposed = true;

    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
    }

    this._unbindEvents();

    this._meshes.forEach((mesh) => {
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material?.dispose();
      }
    });
    this._meshes = [];
    this._selectableObjects = [];

    this.controls?.dispose();
    this.renderer?.dispose();

    if (this.renderer?.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    this.events.emit('disposed');
  }
}

export default Viewer;
