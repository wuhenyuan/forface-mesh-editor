/**
 * 3D 鍦烘櫙鏌ョ湅鍣? * 灏佽 Three.js 鍦烘櫙绠＄悊鍜屾墍鏈?3D 浜や簰閫昏緫
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { EventManager } from './EventManager';
import { OptimizedFacePicker } from './facePicking/OptimizedFacePicker';
import { FeatureDetector } from './facePicking/FeatureDetector';
import { FeatureBasedNaming } from './facePicking/FeatureBasedNaming';

type ViewerEventBus = {
  on: (event: string, callback: (...args: CoreValue[]) => void) => CoreValue;
  emit: (event: string, payload?: CoreValue) => void;
  clear: () => void;
};

type ViewerOptions = Record<string, CoreValue> & {
  backgroundColor?: number;
  enableShadow?: boolean;
  enableGrid?: boolean;
};

type ViewerMesh = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
  castShadow?: boolean;
  receiveShadow?: boolean;
  userData: Record<string, CoreValue> & { isHelper?: boolean };
};

type FacePickerLike = {
  on: (eventName: string, callback: (...args: CoreValue[]) => void) => CoreValue;
  setMeshes: (meshes: ViewerMesh[]) => CoreValue;
  addMesh?: (mesh: ViewerMesh) => CoreValue;
  removeMesh?: (mesh: ViewerMesh) => CoreValue;
  selectFeature?: (meshId: string, featureId: string) => void;
  getPerformanceStats?: () => Record<string, CoreValue>;
  clearSelection?: () => void;
  enable: () => void;
  disable: () => void;
  destroy: () => void;
};

export class Viewer {
  [key: string]: CoreValue;
  container: HTMLElement;
  options: ViewerOptions;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  entityGroup: THREE.Group;
  csgGroup: THREE.Group;
  events: ViewerEventBus;
  _animationId: number | null;
  _isDisposed: boolean;
  _meshes: ViewerMesh[];
  _selectableObjects: ViewerMesh[];
  _selectedObject: ViewerMesh | null;
  _hoveredObject: ViewerMesh | null;
  _raycaster: THREE.Raycaster;
  _mouse: THREE.Vector2;
  _facePicker: FacePickerLike | null;
  _surfaceTextManager: CoreValue;
  _objectSelectionManager: CoreValue;
  _featureDetector: FeatureDetector;
  _featureNaming: FeatureBasedNaming;
  _featureOnlyMode: boolean;
  _detectedFeatures: Map<string, CoreValue>;

  constructor(container: HTMLElement, options: ViewerOptions = {}) {
    const { events, ...viewerOptions } = options;

    this.container = container;
    this.options = {
      backgroundColor: 0xf2f3f5,
      enableShadow: true,
      enableGrid: true,
      ...viewerOptions,
    };

    // 鏍稿績瀵硅薄
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.entityGroup = null;
    this.csgGroup = null;

    this.events = (events as ViewerEventBus) || (new EventManager() as CoreValue as ViewerEventBus);

    this._animationId = null;
    this._isDisposed = false;

    // 瀵硅薄绠＄悊
    this._meshes = [];
    this._selectableObjects = [];
    this._selectedObject = null;
    this._hoveredObject = null;

    // 浜や簰
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();

    // 瀛愮郴缁燂紙寤惰繜鍒濆鍖栵級
    this._facePicker = null;
    this._surfaceTextManager = null;
    this._objectSelectionManager = null;

    this._featureDetector = new FeatureDetector();
    this._featureNaming = new FeatureBasedNaming();
    this._featureOnlyMode = false;
    this._detectedFeatures = new Map();

    this._init();
    this._bindEvents();
    this._animate();
  }

  // ==================== 鍒濆鍖?====================

  _init() {
    const rect = this.container.getBoundingClientRect();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(rect.width, rect.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = this.options.enableShadow;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 鍦烘櫙
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.backgroundColor);

    this.entityGroup = new THREE.Group();
    this.entityGroup.name = 'entityGroup';
    this.scene.add(this.entityGroup);

    this.csgGroup = new THREE.Group();
    this.csgGroup.name = 'csgGroup';
    this.scene.add(this.csgGroup);

    // 鐩告満
    this.camera = new THREE.PerspectiveCamera(60, rect.width / rect.height, 0.1, 1000);
    this.camera.position.set(30, 30, 60);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;

    // 榛樿鍦烘櫙璁剧疆
    this._setupLighting();
    if (this.options.enableGrid) {
      this._setupGrid();
    }

    this._initFacePicker();
  }

  /**
   * 鍒濆鍖栭潰鎷惧彇鍣?   */
  _initFacePicker() {
    this._facePicker = new OptimizedFacePicker(
      this.scene,
      this.camera,
      this.renderer,
      this.renderer.domElement
    );

    this._facePicker.on('faceSelected', (faceInfo, event) => {
      this.events.emit('faceSelected', { faceInfo, event });
    });

    this._facePicker.on('faceDeselected', (faceInfo, event) => {
      this.events.emit('faceDeselected', { faceInfo, event });
    });

    this._facePicker.on('featureSelected', (data) => {
      this.events.emit('featureSelected', data);
    });

    this._facePicker.on('selectionChanged', (summary) => {
      this.events.emit('faceSelectionChanged', summary);
    });
  }

  _setupLighting() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7.5);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    this.scene.add(dir);
  }

  _setupGrid() {
    const grid = new THREE.GridHelper(20, 20, 0xcccccc, 0xeeeeee);
    grid.userData.isHelper = true;
    this.scene.add(grid);
  }

  // ==================== 浜嬩欢缁戝畾 ====================

  _bindEvents() {
    const canvas = this.renderer.domElement;

    this._onClick = this._onClick.bind(this);
    this._onDblClick = this._onDblClick.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    canvas.addEventListener('click', this._onClick);
    canvas.addEventListener('dblclick', this._onDblClick);
    canvas.addEventListener('contextmenu', this._onContextMenu);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mouseup', this._onMouseUp);

    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    const canvas = this.renderer.domElement;

    canvas.removeEventListener('click', this._onClick);
    canvas.removeEventListener('dblclick', this._onDblClick);
    canvas.removeEventListener('contextmenu', this._onContextMenu);
    canvas.removeEventListener('mousemove', this._onMouseMove);
    canvas.removeEventListener('mousedown', this._onMouseDown);
    canvas.removeEventListener('mouseup', this._onMouseUp);

    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  // ==================== 浜嬩欢澶勭悊 ====================

  _updateMouse(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _raycast(objects = null) {
    this._raycaster.setFromCamera(this._mouse, this.camera);
    const targets = objects || this._selectableObjects.filter((obj) => obj.visible);
    return this._raycaster.intersectObjects(targets, true);
  }

  _getTargetType(object) {
    if (!object) return 'empty';
    if (object.userData.isText) return 'text';
    if (object.userData.isSurface || object.userData.isMesh) return 'surface';
    return 'object';
  }

  _findSelectableParent(object) {
    let current = object;
    while (current) {
      if (this._selectableObjects.includes(current)) {
        return current;
      }
      current = current.parent;
    }
    return object;
  }

  _onClick(event) {
    this._updateMouse(event);
    const intersects = this._raycast();

    if (intersects.length > 0) {
      const hit = intersects[0];
      const target = this._findSelectableParent(hit.object);

      if (this._featureOnlyMode && hit.faceIndex !== undefined) {
        const feature = this.getFeatureByFace(hit.object, hit.faceIndex);
        if (!feature) {
          console.log('[Viewer] feature-only mode ignored a non-feature face click');
          this.events.emit('click', {
            target: null,
            targetType: 'empty',
            event,
            filtered: true,
            reason: 'not_a_feature',
          });
          return;
        }
      }

      this.events.emit('click', {
        target,
        targetType: this._getTargetType(target),
        point: hit.point,
        faceIndex: hit.faceIndex,
        face: hit.face,
        uv: hit.uv,
        event,
      });
    } else {
      this.events.emit('click', { target: null, targetType: 'empty', event });
    }
  }

  _onDblClick(event) {
    this._updateMouse(event);
    const intersects = this._raycast();

    if (intersects.length > 0) {
      const hit = intersects[0];
      const target = this._findSelectableParent(hit.object);

      this.events.emit('dblclick', {
        target,
        targetType: this._getTargetType(target),
        point: hit.point,
        faceIndex: hit.faceIndex,
        face: hit.face,
        event,
      });
    }
  }

  _onContextMenu(event) {
    event.preventDefault();
    this._updateMouse(event);
    const intersects = this._raycast();

    let target = null;
    let targetType = 'empty';
    let point = null;
    let faceIndex = null;

    if (intersects.length > 0) {
      const hit = intersects[0];
      target = this._findSelectableParent(hit.object);
      targetType = this._getTargetType(target);
      point = hit.point;
      faceIndex = hit.faceIndex;
    }

    this.events.emit('contextmenu', {
      x: event.clientX,
      y: event.clientY,
      target,
      targetType,
      point,
      faceIndex,
      event,
    });
  }

  _onMouseMove(event) {
    this._updateMouse(event);
    const intersects = this._raycast();

    const newHovered =
      intersects.length > 0 ? this._findSelectableParent(intersects[0].object) : null;

    if (newHovered !== this._hoveredObject) {
      if (this._hoveredObject) {
        this.events.emit('hoverEnd', { target: this._hoveredObject });
      }

      this._hoveredObject = newHovered;

      if (newHovered) {
        this.events.emit('hover', {
          target: newHovered,
          targetType: this._getTargetType(newHovered),
          point: intersects[0]?.point,
          event,
        });
      }
    }

    this.events.emit('mousemove', { event, intersects });
  }

  _onMouseDown(event) {
    this.events.emit('mousedown', { event });
  }

  _onMouseUp(event) {
    this.events.emit('mouseup', { event });
  }

  _onResize() {
    const rect = this.container.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height);

    this.events.emit('resize', { width: rect.width, height: rect.height });
  }

  _onKeyDown(event) {
    this.events.emit('keydown', { key: event.key, event });

    if (event.key === 'Escape') {
      this.clearSelection();
      this.events.emit('escape');
    }

    if (event.key === 'Delete' && this._selectedObject) {
      this.events.emit('deleteRequest', { target: this._selectedObject });
    }
  }

  // ==================== 鍚庡鐞?====================

  // ==================== 娓叉煋寰幆 ====================

  _animate() {
    if (this._isDisposed) return;

    // this._animationId = requestAnimationFrame(() => this._animate());
    // this.controls.update();
    // this._renderFrame();/
  }

  // ==================== 瀵硅薄绠＄悊 ====================

  /**
   * 娣诲姞缃戞牸鍒板満鏅?   */
  addMesh(mesh: ViewerMesh, options: Record<string, CoreValue> = {}) {
    const {
      selectable = true,
      castShadow = true,
      receiveShadow = true,
      group = 'entity',
    } = options;

    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;

    const targetGroup =
      group === 'scene'
        ? this.scene
        : group === 'csg'
          ? this.csgGroup || this.scene
          : this.entityGroup || this.scene;

    targetGroup.add(mesh);
    this._meshes.push(mesh);

    if (selectable && !mesh.userData.isHelper) {
      this._selectableObjects.push(mesh);
    }

    this.events.emit('meshAdded', { mesh });
    return mesh;
  }

  /**
   * 绉婚櫎缃戞牸
   */
  removeMesh(mesh) {
    mesh?.parent?.remove?.(mesh);

    const meshIndex = this._meshes.indexOf(mesh);
    if (meshIndex > -1) this._meshes.splice(meshIndex, 1);

    const selectableIndex = this._selectableObjects.indexOf(mesh);
    if (selectableIndex > -1) this._selectableObjects.splice(selectableIndex, 1);

    if (this._selectedObject === mesh) {
      this._selectedObject = null;
    }

    // 娓呯悊璧勬簮
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }

    this.events.emit('meshRemoved', { mesh });
  }

  /**
   * 鑾峰彇鎵€鏈夌綉鏍?   */
  getMeshes() {
    return [...this._meshes];
  }

  /**
   * 鏍规嵁鍚嶇О鏌ユ壘缃戞牸
   */
  getMeshByName(name) {
    return this._meshes.find((m) => m.name === name);
  }

  // ==================== 妯″瀷鍔犺浇 ====================

  /**
   * 鍔犺浇 STL 妯″瀷
   */
  loadSTL(url: string, options: Record<string, CoreValue> = {}) {
    return new Promise((resolve, reject) => {
      const loader = new STLLoader();

      const {
        color = 0x999999,
        roughness = 0.8,
        metalness = 0.1,
        scale = null,
        targetSize = 4,
        position = [0, 0, 0],
        name = 'STLModel',
      } = options;

      loader.load(
        url,
        (geometry) => {
          geometry.center();

          const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
          const mesh = new THREE.Mesh(geometry, material);

          // 鑷姩缂╂斁
          if (scale) {
            mesh.scale.setScalar(scale);
          } else {
            const box = new THREE.Box3().setFromBufferAttribute(
              geometry.attributes.position as THREE.BufferAttribute
            );
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            mesh.scale.setScalar(targetSize / maxDim);
          }

          mesh.position.set(position[0], position[1], position[2]);
          mesh.name = name;

          this.addMesh(mesh);
          this.events.emit('modelLoaded', { mesh, type: 'stl' });
          resolve(mesh);
        },
        (progress) => {
          const percent = progress.total ? (progress.loaded / progress.total) * 100 : 0;
          this.events.emit('loadProgress', { percent, type: 'stl' });
        },
        (error) => {
          this.events.emit('loadError', { error, type: 'stl' });
          reject(error);
        }
      );
    });
  }

  // ==================== 鍑犱綍浣撳垱寤?====================

  /**
   * 鍒涘缓鍦嗘煴浣?   */
  createCylinder(options: Record<string, CoreValue> = {}) {
    const {
      radiusTop = 5,
      radiusBottom = 5,
      height = 15,
      segments = 256,
      color = 0x67c23a,
      position = [0, 7.5, 0],
      name = 'Cylinder',
    } = options;

    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.name = name;
    mesh.userData.isSurface = true;

    return this.addMesh(mesh);
  }

  /**
   * 鍒涘缓绔嬫柟浣?   */
  createBox(options: Record<string, CoreValue> = {}) {
    const {
      width = 5,
      height = 5,
      depth = 5,
      color = 0x409eff,
      position = [0, 2.5, 0],
      name = 'Box',
    } = options;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.name = name;
    mesh.userData.isSurface = true;

    return this.addMesh(mesh);
  }

  /**
   * 鍒涘缓鐞冧綋
   */
  createSphere(options: Record<string, CoreValue> = {}) {
    const {
      radius = 3,
      segments = 64,
      color = 0xe6a23c,
      position = [0, 3, 0],
      name = 'Sphere',
    } = options;

    const geometry = new THREE.SphereGeometry(radius, segments, segments);
    const material = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.name = name;
    mesh.userData.isSurface = true;

    return this.addMesh(mesh);
  }

  // ==================== 閫夋嫨绠＄悊 ====================

  /**
   * 閫変腑瀵硅薄
   */
  select(object) {
    if (this._selectedObject === object) return;

    const previous = this._selectedObject;
    this._selectedObject = object;

    if (previous) {
      this.events.emit('deselect', { target: previous });
    }

    if (object) {
      this.events.emit('select', {
        target: object,
        targetType: this._getTargetType(object),
      });
    }
  }

  /**
   * 娓呴櫎閫夋嫨
   */
  clearSelection() {
    if (this._selectedObject) {
      const previous = this._selectedObject;
      this._selectedObject = null;
      this.events.emit('deselect', { target: previous });
      this.events.emit('selectionCleared');
    }
  }

  /**
   * 鑾峰彇閫変腑瀵硅薄
   */
  getSelectedObject() {
    return this._selectedObject;
  }

  // ==================== 鐩告満鎺у埗 ====================

  /**
   * 閲嶇疆瑙嗗浘
   */
  resetView() {
    this.camera.position.set(30, 30, 60);
    this.camera.lookAt(0, 0, 0);
    this.controls.reset();
    this.events.emit('viewReset');
  }

  /**
   * 鑱氱劍鍒板璞?   */
  focusOn(object) {
    if (!object) return;

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const distance = maxDim * 2;
    this.camera.position.set(center.x + distance, center.y + distance, center.z + distance);
    this.controls.target.copy(center);
    this.controls.update();

    this.events.emit('focusChanged', { target: object });
  }

  /**
   * 鍚敤/绂佺敤鐩告満鎺у埗
   */
  setControlsEnabled(enabled) {
    this.controls.enabled = enabled;
  }

  // ==================== 鏉愯川鎿嶄綔 ====================

  /**
   * 淇敼瀵硅薄棰滆壊
   */
  setObjectColor(object, color) {
    if (!object || !object.material) return;

    const colorValue = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;

    if (Array.isArray(object.material)) {
      object.material.forEach((m) => m.color.setHex(colorValue));
    } else {
      object.material.color.setHex(colorValue);
    }

    this.events.emit('colorChanged', { object, color: colorValue });
  }

  /**
   * 璁剧疆瀵硅薄鍙鎬?   */
  setObjectVisible(object, visible) {
    if (!object) return;
    object.visible = visible;
    this.events.emit('visibilityChanged', { object, visible });
  }

  // ==================== 宸ュ叿鏂规硶 ====================

  /**
   * 鑾峰彇 canvas 鍏冪礌
   */
  getCanvas() {
    return this.renderer.domElement;
  }

  /**
   * 鑾峰彇瀹瑰櫒灏哄
   */
  getSize() {
    const rect = this.container.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /**
   * 鎴浘
   */
  screenshot(options: Record<string, CoreValue> = {}) {
    const { width, height, type = 'image/png', quality = 1 } = options;

    // 濡傛灉鎸囧畾浜嗗昂瀵革紝涓存椂璋冩暣
    if (width && height) {
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
    }

    const dataUrl = this.renderer.domElement.toDataURL(type, quality);

    if (width && height) {
      this._onResize();
    }

    return dataUrl;
  }

  // ==================== 鐗瑰緛妫€娴嬬郴缁?====================

  /**
   * 涓虹綉鏍兼娴嬬壒寰侊紙骞抽潰銆佸渾鏌遍潰绛夛級
   * @param {THREE.Mesh} mesh - 缃戞牸瀵硅薄
   * @returns {Promise<Object>} 鐗瑰緛鏁版嵁
   */
  async detectFeatures(mesh) {
    if (!mesh || !mesh.geometry) {
      console.warn('[Viewer] invalid mesh for feature detection');
      return null;
    }

    const meshId = this._featureDetector.generateMeshId(mesh);

    if (this._detectedFeatures.has(meshId)) {
      return this._detectedFeatures.get(meshId);
    }

    console.log(`[Viewer] 寮€濮嬫娴嬬綉鏍肩壒寰? ${mesh.name || meshId}`);

    try {
      const features = await this._featureDetector.preprocessMesh(mesh);

      // 鐢熸垚鐗瑰緛鍛藉悕
      const namedFeatures = this._featureNaming.detectAndNameFeatures(mesh, meshId);

      // 鍚堝苟缁撴灉
      const result = {
        meshId,
        meshName: mesh.name,
        ...features,
        namedFeatures,
      };

      // 缂撳瓨缁撴灉
      this._detectedFeatures.set(meshId, result);

      // 鏇存柊闈㈡嬀鍙栧櫒
      if (this._facePicker) {
        await this._facePicker.setMeshes([mesh]);
      }

      this.events.emit('featuresDetected', { mesh, features: result });

      console.log(
        `[Viewer] 鐗瑰緛妫€娴嬪畬鎴? ${features.planes.length} 涓钩闈? ${features.cylinders.length} 涓渾鏌遍潰`
      );

      return result;
    } catch (error) {
      console.error('[Viewer] 鐗瑰緛妫€娴嬪け璐?', error);
      this.events.emit('featureDetectionError', { mesh, error });
      return null;
    }
  }

  /**
   * 鎵归噺妫€娴嬪涓綉鏍肩殑鐗瑰緛
   * @param {THREE.Mesh[]} meshes - 缃戞牸鏁扮粍
   * @returns {Promise<Map>} meshId -> features 鐨勬槧灏?   */
  async detectFeaturesForMeshes(meshes) {
    const results = new Map();

    for (const mesh of meshes) {
      const features = await this.detectFeatures(mesh);
      if (features) {
        results.set(features.meshId, features);
      }
    }

    // 鏇存柊闈㈡嬀鍙栧櫒
    if (this._facePicker && meshes.length > 0) {
      await this._facePicker.setMeshes(meshes);
    }

    return results;
  }

  /**
   * 鏍规嵁闈㈢储寮曡幏鍙栫壒寰佷俊鎭?   * @param {THREE.Mesh} mesh - 缃戞牸瀵硅薄
   * @param {number} faceIndex - 闈㈢储寮?   * @returns {Object|null} 鐗瑰緛淇℃伅
   */
  getFeatureByFace(mesh, faceIndex) {
    const meshId = this._featureDetector.generateMeshId(mesh);

    const featureName = this._featureNaming.getFeatureNameByTriangle(meshId, faceIndex);
    if (featureName) {
      return this._featureNaming.getFeatureByName(featureName);
    }

    // 浠庣壒寰佹娴嬪櫒鑾峰彇
    return this._featureDetector.getFeatureByFaceIndex(meshId, faceIndex);
  }

  /**
   * 鑾峰彇缃戞牸鐨勬墍鏈夌壒寰?   * @param {THREE.Mesh} mesh - 缃戞牸瀵硅薄
   * @returns {Object|null} 鐗瑰緛鏁版嵁
   */
  getMeshFeatures(mesh) {
    const meshId = this._featureDetector.generateMeshId(mesh);
    return this._detectedFeatures.get(meshId) || null;
  }

  /**
   * 鑾峰彇鐗瑰緛鐨勬墍鏈変笁瑙掑舰绱㈠紩
   * @param {string} featureName - 鐗瑰緛鍚嶅瓧
   * @returns {Array} 涓夎褰㈢储寮曟暟缁?   */
  getFeatureTriangles(featureName) {
    return this._featureNaming.getFeatureTriangles(featureName);
  }

  /**
   * 閫夋嫨鏁翠釜鐗瑰緛锛堥€変腑鐗瑰緛鍖呭惈鐨勬墍鏈夐潰锛?   * @param {THREE.Mesh} mesh - 缃戞牸瀵硅薄
   * @param {string} featureId - 鐗瑰緛ID
   */
  selectFeature(mesh, featureId) {
    if (!this._facePicker) return;

    const meshId = this._featureDetector.generateMeshId(mesh);
    this._facePicker.selectFeature?.(meshId, featureId);
  }

  /**
   * 璁剧疆鐗瑰緛闈㈣繃婊ゆā寮?   * @param {boolean} enabled - 鏄惁鍙厑璁搁€変腑璇嗗埆鍑虹殑鐗瑰緛闈?   */
  setFeatureOnlyMode(enabled) {
    this._featureOnlyMode = enabled;
    console.log('[Viewer] feature-only mode: ' + (enabled ? 'enabled' : 'disabled'));
    this.events.emit('featureOnlyModeChanged', { enabled });
  }

  /**
   * 鑾峰彇鐗瑰緛闈㈣繃婊ゆā寮忕姸鎬?   * @returns {boolean} 鏄惁寮€鍚?   */
  isFeatureOnlyMode() {
    return this._featureOnlyMode;
  }

  /**
   * 鍚敤闈㈡嬀鍙栧姛鑳?   */
  enableFacePicking() {
    if (this._facePicker) {
      this._facePicker.enable();
      console.log('[Viewer] 闈㈡嬀鍙栧姛鑳藉凡鍚敤');
    }
  }

  /**
   * 绂佺敤闈㈡嬀鍙栧姛鑳?   */
  disableFacePicking() {
    if (this._facePicker) {
      this._facePicker.disable();
      console.log('[Viewer] 闈㈡嬀鍙栧姛鑳藉凡绂佺敤');
    }
  }

  /**
   * 鑾峰彇闈㈡嬀鍙栧櫒瀹炰緥
   * @returns {OptimizedFacePicker|null}
   */
  getFacePicker() {
    return this._facePicker;
  }

  /**
   * 鑾峰彇鐗瑰緛妫€娴嬪櫒瀹炰緥
   * @returns {FeatureDetector}
   */
  getFeatureDetector() {
    return this._featureDetector;
  }

  /**
   * 鑾峰彇鐗瑰緛鍛藉悕绯荤粺瀹炰緥
   * @returns {FeatureBasedNaming}
   */
  getFeatureNaming() {
    return this._featureNaming;
  }

  /**
   * 娓呴櫎鐗瑰緛缂撳瓨
   * @param {THREE.Mesh} mesh - 缃戞牸瀵硅薄锛堝彲閫夛紝涓嶄紶鍒欐竻闄ゆ墍鏈夛級
   */
  clearFeatureCache(mesh = null) {
    if (mesh) {
      const meshId = this._featureDetector.generateMeshId(mesh);
      this._detectedFeatures.delete(meshId);
      this._featureDetector.clearCache(meshId);
    } else {
      this._detectedFeatures.clear();
      this._featureDetector.clearCache();
      this._featureNaming.clearCache();
    }
    console.log('[Viewer] feature cache cleared');
  }

  /**
   * 鑾峰彇鐗瑰緛妫€娴嬬粺璁′俊鎭?   * @returns {Object} 缁熻淇℃伅
   */
  getFeatureStats() {
    const detectorStats = this._featureDetector.getCacheStats();
    const facePickerStats = this._facePicker?.getPerformanceStats() || {};

    return {
      detector: detectorStats,
      facePicker: facePickerStats,
      cachedMeshes: this._detectedFeatures.size,
      featureOnlyMode: this._featureOnlyMode,
    };
  }

  // ==================== 閿€姣?====================

  dispose() {
    this._isDisposed = true;

    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
    }

    this._unbindEvents();
    this.events.clear();

    // 娓呯悊闈㈡嬀鍙栧櫒
    if (this._facePicker) {
      this._facePicker.destroy();
      this._facePicker = null;
    }

    this._featureDetector.clearCache();
    this._featureNaming.clearCache();
    this._detectedFeatures.clear();

    this._meshes.forEach((mesh) => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    this._meshes = [];
    this._selectableObjects = [];

    this.controls.dispose();
    this.renderer.dispose();

    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.events.emit('disposed');
  }
}

export default Viewer;
