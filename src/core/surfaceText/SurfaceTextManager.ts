import * as THREE from 'three';
import EntityBooleanService from '../boolean/EntityBooleanService';
import { resolveEntityKeyFromObject } from '../entities/EntityHitUtils';
import { surfaceIdentifier } from './SurfaceIdentifier';
import { TextGeometryGenerator } from './TextGeometryGenerator';
import { TextInputOverlay } from './TextInputOverlay';
import SurfaceTextCreationService from './runtime/SurfaceTextCreationService';
import SurfaceTextEditSession from './runtime/SurfaceTextEditSession';
import SurfaceTextEventHub from './runtime/SurfaceTextEventHub';
import SurfaceTextHitResolver from './runtime/SurfaceTextHitResolver';
import SurfaceTextMeshRegistry from './runtime/SurfaceTextMeshRegistry';
import SurfaceTextPlacement from './runtime/SurfaceTextPlacement';
import SurfaceTextPreviewService from './runtime/SurfaceTextPreviewService';
import SurfaceTextSelectionController from './runtime/SurfaceTextSelectionController';
import {
  applyTransformToTextTarget as applyTextTargetTransform,
  readTextTargetTransformSnapshot,
  resolveTextSelectionTarget,
  resolveTextTransformTarget,
} from './runtime/TextTransformTarget';
import type { SurfaceTextSelectionBridge } from './runtime/types';

/**
 * 表面文字管理器。
 *
 * 这个类现在只保留“编排层”职责：
 * 1. 协调点击、选中、编辑态切换；
 * 2. 组织创建服务、预览服务、命中解析服务；
 * 3. 维护对外兼容 API 和事件派发。
 *
 * 具体的运行时细节已经拆分出去：
 * - `SurfaceTextCreationService` 负责创建文字投影；
 * - `SurfaceTextEditSession` 负责编辑态与预览态切换；
 * - `SurfaceTextPreviewService` 负责文字预览投影；
 * - `SurfaceTextHitResolver` 负责文字适配后的命中反解；
 * - 通用布尔能力已经下沉到 `EntityBooleanService`。
 */
export class SurfaceTextManager {
  [key: string]: CoreValue;
  constructor(scene, camera, renderer, domElement, facePicker = null) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.domElement = domElement;
    this.facePicker = facePicker; // 可选，不再强制依赖

    // 初始化子系统
    this.geometryGenerator = new TextGeometryGenerator();
    this.inputOverlay = new TextInputOverlay(domElement);
    this.booleanService = new EntityBooleanService();
    this.entitySelectionBridge = null;
    this.eventHub = new SurfaceTextEventHub();
    this.meshRegistry = new SurfaceTextMeshRegistry({
      registerMesh: (mesh) => {
        surfaceIdentifier.registerMesh(mesh);
      },
    });
    this.placement = new SurfaceTextPlacement();

    // 文字运行时状态
    this.textObjects = new Map<string, CoreValue>();
    this.selectedTextId = null;
    this.isTextMode = false;
    this.isEditing = false;
    this.isDragging = false;

    // 目标网格与文字的关联关系
    this.meshTextMap = this.meshRegistry.meshTextMap;

    // 事件系统与基础配置
    this.eventListeners = this.eventHub.listeners;
    this.config = {
      maxTextObjects: 100,
      defaultTextConfig: this.getDefaultTextConfig(),
      performanceMode: false,
    };
    this.hitResolver = new SurfaceTextHitResolver({
      textObjects: this.textObjects,
      meshTextMap: this.meshRegistry.meshTextMap,
    });
    this.previewService = new SurfaceTextPreviewService({
      booleanService: this.booleanService,
      placement: this.placement,
      textObjects: this.textObjects,
      meshTextMap: this.meshRegistry.meshTextMap,
    });
    this.creationService = new SurfaceTextCreationService({
      scene: scene as THREE.Scene,
      geometryGenerator: this.geometryGenerator,
      placement: this.placement,
      getDefaultTextConfig: () => this.config.defaultTextConfig,
      getMaxTextObjects: () => this.config.maxTextObjects,
      getTextCount: () => this.textObjects.size,
      hasTextObject: (textId) => this.textObjects.has(textId),
      generateTextId: () => this.generateTextId(),
      getEntitySelectionBridge: () => this.entitySelectionBridge,
      addTextObject: (textId, textObject) => {
        this.textObjects.set(textId, textObject);
      },
      addMeshTextMapping: (mesh, textId) => this.addMeshTextMapping(mesh, textId),
      selectText: (textId) => {
        this.selectText(textId);
      },
      emit: (eventName, ...args) => {
        this.emit(eventName, ...args);
      },
    });
    this.editSession = new SurfaceTextEditSession({
      previewService: this.previewService,
      selectText: (textId) => {
        this.selectText(textId);
      },
      emit: (eventName, ...args) => {
        this.emit(eventName, ...args);
      },
    });
    this.selectionController = new SurfaceTextSelectionController({
      scene: scene as THREE.Scene,
      camera,
      renderer,
      getSelectedTextObject: () =>
        this.selectedTextId ? this.textObjects.get(this.selectedTextId) || null : null,
      onSelectionTransformed: (textObject) => {
        this.emit('textTransformed', textObject);
      },
      onDraggingChanged: (isDragging) => {
        this.isDragging = isDragging;
      },
      onDragStart: (textObject) => {
        console.log('开始拖动文字');
        this.emit('dragStart', textObject);
      },
      onDragEnd: async (textObject) => {
        console.log('结束拖动文字');
        this.emit('dragEnd', textObject);
        await this.handleSelectedTextDragEnd(textObject);
      },
    });
    this.transformControls = this.selectionController.transformControls;

    // 射线投射器用于独立点击检测。
    this.raycaster = new THREE.Raycaster();

    // 目标网格列表由注册表持有，这里仅保留引用供旧 API 使用。
    this.targetMeshes = this.meshRegistry.targetMeshes;

    // 只绑定一次点击处理器，确保 add/removeEventListener 使用同一个引用。
    this._boundOnClick = this._onCanvasClick.bind(this);

    this.setTargetMeshes = (meshes) => {
      this.meshRegistry.setTargetMeshes(meshes);
      console.log('已设置目标网格数量:', this.targetMeshes.length);
    };
    this.addTargetMesh = (mesh) => {
      this.meshRegistry.addTargetMesh(mesh);
    };
    this.removeTargetMesh = (mesh) => {
      this.meshRegistry.removeTargetMesh(mesh);
    };
    this.analyzeSurface = this.placement.analyzeSurface.bind(this.placement);
    this.positionTextOnCylinder = this.placement.positionTextOnCylinder.bind(this.placement);
    this.moveVerticesInward = this.placement.moveVerticesInward.bind(this.placement);
    this.moveTextOutwardXZ = this.placement.moveTextOutwardXZ.bind(this.placement);
    this.moveTextRadially = this.placement.moveTextRadially.bind(this.placement);
    this.offsetCylinderTextInward = this.placement.offsetCylinderTextInward.bind(this.placement);
    this.calculateCylinderTangent = this.placement.calculateCylinderTangent.bind(this.placement);
    this.positionTextOnSurface = this.placement.positionTextOnSurface.bind(this.placement);
    this.on = (eventName, callback) => {
      this.eventHub.on(eventName, callback);
    };
    this.off = (eventName, callback) => {
      this.eventHub.off(eventName, callback);
    };
    this.emit = (eventName, ...args) => {
      this.eventHub.emit(eventName, ...args);
    };

    // 绑定事件处理器
    this.setupEventHandlers();
  }

  /**
   * 设置可点击的目标网格
   * @param {THREE.Mesh[]} meshes - 网格数组
   */
  setTargetMeshes(meshes) {
    this.meshRegistry.setTargetMeshes(meshes);

    // 注册所有网格到表面标识器
    this.targetMeshes.forEach((mesh) => {
      surfaceIdentifier.registerMesh(mesh);
    });

    console.log('已设置目标网格数量:', this.targetMeshes.length);
  }

  setEntitySelectionBridge(bridge: SurfaceTextSelectionBridge | null = null) {
    this.entitySelectionBridge = bridge || null;
    this.selectionController?.setEntitySelectionBridge?.(this.entitySelectionBridge);
  }

  getTextSelectionTarget(textObject) {
    return resolveTextSelectionTarget(textObject);
  }

  getTextTransformTarget(textObject) {
    return resolveTextTransformTarget(textObject);
  }

  applyTransformToTextTarget(textObject, transform) {
    applyTextTargetTransform(textObject, transform);
  }

  getEntityKeyFromMesh(mesh) {
    return this.previewService.getEntityKeyFromMesh(mesh);
  }

  buildSubtractEntityMetadata(textObject, targetMesh = null) {
    return this.previewService.buildSubtractEntityMetadata(textObject, targetMesh);
  }

  resolveTextEntityIdFromHit(mesh, point, face, faceIndex) {
    return this.hitResolver.resolveTextEntityIdFromHit(mesh, point, face, faceIndex);
  }

  resolveTextEntityIdFromMaterialGroups(mesh, faceIndex) {
    return this.hitResolver.resolveTextEntityIdFromMaterialGroups(mesh, faceIndex);
  }

  /**
   * 添加目标网格
   * @param {THREE.Mesh} mesh - 网格
   */
  addTargetMesh(mesh) {
    this.meshRegistry.addTargetMesh(mesh);
  }

  /**
   * 移除目标网格
   * @param {THREE.Mesh} mesh - 网格
   */
  removeTargetMesh(mesh) {
    this.meshRegistry.removeTargetMesh(mesh);
  }

  /**
   * 启用文字添加模式（可以创建新文字）
   */
  enableTextMode() {
    if (this.isTextMode) return;
    this.isTextMode = true;
    console.log('文字添加模式已启用');
    this.emit('textModeEnabled');
  }

  /**
   * 禁用文字添加模式（只能选择/编辑已有文字）
   */
  disableTextMode() {
    if (!this.isTextMode) return;
    this.isTextMode = false;
    this.inputOverlay.hide();
    console.log('文字添加模式已禁用');
    this.emit('textModeDisabled');
  }

  /**
   * 启用点击监听（初始化时调用）
   */
  enableClickListener() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', this._boundOnClick, true);
    console.log('点击监听已启用');
  }

  /**
   * 禁用点击监听（销毁时调用）
   */
  disableClickListener() {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('click', this._boundOnClick, true);
    console.log('点击监听已禁用');
  }

  /**
   * 画布点击事件处理（始终监听，不管文字模式是否开启）
   * @param {MouseEvent} event - 鼠标事件
   */
  async _onCanvasClick(event) {
    // 计算归一化设备坐标（相对于 canvas）
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    // 设置射线
    this.raycaster.setFromCamera(mouse, this.camera);

    // 收集所有可检测的对象：目标网格 + 可见的文字网格
    const textMeshes = Array.from(this.textObjects.values() as Iterable<CoreValue>)
      .map((t: CoreValue) => t.mesh)
      .filter((m: CoreValue) => m.visible);
    const allMeshes = [...this.targetMeshes, ...textMeshes];

    // 执行射线检测
    const intersects = this.raycaster.intersectObjects(allMeshes, false);

    if (intersects.length === 0) {
      // 点击空白区域，取消选择
      if (this.selectedTextId) {
        await this.deselectText();
      }
      return;
    }

    const hit = intersects[0];
    const hitMesh = hit.object;

    // 构造 faceInfo
    const faceInfo = {
      mesh: hitMesh,
      faceIndex: hit.faceIndex,
      face: hit.face,
      point: hit.point.clone(),
      distance: hit.distance,
      uv: hit.uv,
    };

    // 处理点击
    await this._handleClick(faceInfo, event);
  }

  /**
   * 处理点击逻辑
   * @param {Object} faceInfo - 面信息
   * @param {MouseEvent} event - 原始鼠标事件
   */
  async _handleClick(faceInfo, event) {
    try {
      // 1. 检查是否点击了凸起模式的文字对象
      if (faceInfo.mesh.userData && faceInfo.mesh.userData.isTextObject) {
        const textId =
          resolveEntityKeyFromObject(faceInfo.mesh) || faceInfo.mesh.userData.textId || null;
        if (textId && this.textObjects.has(textId)) {
          if (event) (event as CoreValue).__surfaceTextHandled = true;
          this.selectText(textId);
        }
        return;
      }

      // 2. 检查是否点击了包含内嵌文字的目标网格（通过材质组判断）
      const textIdFromEngraved = this.resolveTextEntityIdFromHit(
        faceInfo.mesh,
        faceInfo.point,
        faceInfo.face,
        faceInfo.faceIndex
      );
      if (textIdFromEngraved) {
        if (event) (event as CoreValue).__surfaceTextHandled = true;
        // 点击的是内嵌文字区域，进入编辑模式
        this.enterEditMode(textIdFromEngraved);
        return;
      }

      // 3. 如果不是文字模式，点击普通表面不做任何事
      if (!this.isTextMode) {
        // 取消当前选择
        if (this.selectedTextId) {
          await this.deselectText();
        }
        return;
      }

      // 4. 文字模式下，点击普通表面创建新文字
      if (event) (event as CoreValue).__surfaceTextHandled = true;

      const screenPosition = {
        x: event.clientX,
        y: event.clientY,
      };

      // 显示输入覆盖层
      const textContent = await this.inputOverlay.show(screenPosition.x, screenPosition.y);

      if (textContent && this.validateTextContent(textContent)) {
        // 创建文字对象
        await this.createTextObject(textContent, faceInfo);
      }
    } catch (error) {
      console.error('处理点击失败:', error);
      this.emit('error', { type: 'click', error });
    }
  }

  /**
   * 处理面选择事件（保留用于兼容）
   * @param {Object} faceInfo - 面信息
   * @param {MouseEvent} originalEvent - 原始鼠标事件
   * @deprecated 使用内部 _handleClick 代替
   */
  async handleFaceSelected(faceInfo, originalEvent = null) {
    await this._handleClick(faceInfo, originalEvent || { clientX: 0, clientY: 0 });
  }

  /**
   * 从雕刻预览网格中解析对应的文字实体。
   *
   * Manager 不再自己处理材质组和边界框细节，
   * 这里只保留对外兼容入口，真正的命中解析已经下沉到 HitResolver。
   * @param {THREE.Mesh} mesh - 被点击的网格
   * @param {THREE.Vector3} point - 点击位置
   * @param {THREE.Face} face - 点击的面
   * @param {number} faceIndex - 点击的面索引
   * @returns {string|null} 文字ID或null
   */
  findTextIdFromEngravedMesh(mesh, point, _face, faceIndex) {
    return this.hitResolver.findTextIdFromEngravedMesh(mesh, point, faceIndex);
  }

  /**
   * 进入文字编辑态。
   *
   * 对 manager 来说，“编辑态”只是一种工作流状态；
   * 具体如何恢复原始模型、如何把文字从雕刻位置抬回表面，
   * 由 `SurfaceTextEditSession` 负责。
   * @param {string} textId - 文字ID
   */
  enterEditMode(textId) {
    const textObject = this.textObjects.get(textId);
    if (!textObject) {
      console.warn(`文字对象不存在: ${textId}`);
      return;
    }

    this.isEditing = textObject.mode === 'engraved';
    this.editSession.enterEditMode(textObject);
  }

  /**
   * 退出编辑态并回到预览态。
   *
   * 这里不再关心“如何重放雕刻布尔”这样的运行时细节，
   * manager 只负责在正确的时机调用 editSession 并维护状态位。
   * @param {boolean} applyChanges - 是否应用更改（重新执行布尔操作）
   */
  async exitEditMode(applyChanges = true) {
    if (!this.isEditing || !this.selectedTextId) {
      return;
    }

    const textObject = this.textObjects.get(this.selectedTextId);
    if (!textObject || textObject.mode !== 'engraved') {
      this.isEditing = false;
      return;
    }

    try {
      await this.editSession.exitEditMode(textObject, applyChanges);
    } catch (error) {
      console.error('退出编辑模式失败:', error);
      this.emit('error', { type: 'exitEditMode', error });
    } finally {
      this.isEditing = false;
    }
  }

  /**
   * 重新生成某个目标模型上的雕刻预览。
   *
   * 这是预览层的派生计算，不再由 manager 自己维护布尔循环。
   * @param {Object} textObject - 文字对象
   */
  async reapplyEngraving(textObject) {
    try {
      return await this.previewService.reapplyEngraving(textObject);
    } catch (error) {
      console.error('重新应用内嵌效果失败:', error);
      throw error;
    }
  }

  /**
   * 创建文字对象。
   *
   * 文字几何生成、表面分析和初始位姿计算已经下沉到 CreationService；
   * manager 只保留调用入口和兼容旧 API 的职责。
   * @param {string} content - 文字内容
   * @param {Object} faceInfo - 面信息
   * @param {Object} options - 可选项（用于撤销/重做恢复）
   * @param {string} options.id - 指定文字ID
   * @param {Object} options.config - 指定文字配置（会与默认配置合并）
   * @returns {Promise<string>} 文字对象ID
   */
  async createTextObject(content, faceInfo, options: Record<string, CoreValue> = {}) {
    return this.creationService.createTextObject(content, faceInfo, options);
  }

  /**
   * 分析目标表面。
   *
   * 具体算法已经下沉到 `SurfaceTextPlacement`，
   * manager 只保留兼容入口，避免外部直接依赖旧实现。
   * @param {Object} faceInfo - 面信息
   * @returns {Object|null} 表面信息
   */
  analyzeSurface(faceInfo) {
    return this.placement.analyzeSurface(faceInfo);
  }

  /**
   * 在圆柱面上定位文字。
   *
   * 真正的几何放置逻辑已经归属到 placement 服务。
   * @param {THREE.Mesh} textMesh - 文字网格
   * @param {Object} faceInfo - 面信息
   * @param {Object} surfaceInfo - 表面信息
   */
  positionTextOnCylinder(textMesh, faceInfo, surfaceInfo) {
    return this.placement.positionTextOnCylinder(textMesh, faceInfo, surfaceInfo);
  }

  /**
   * 将几何体沿径向向内移动。
   *
   * 这类几何工具函数已经统一交由 placement 维护，
   * manager 仅做兼容转发。
   * @param {THREE.BufferGeometry} geometry - 几何体（世界坐标系）
   * @param {Object} cylinderInfo - 圆柱信息
   * @param {number} distance - 向内移动的距离
   */
  moveVerticesInward(geometry, cylinderInfo, distance) {
    return this.placement.moveVerticesInward(geometry, cylinderInfo, distance);
  }

  /**
   * 沿 XZ 平面把文字几何向外偏移。
   * @param {THREE.BufferGeometry} geometry - 几何体（局部坐标系）
   * @param {number} distance - 偏移距离
   */
  moveTextOutwardXZ(geometry, distance) {
    return this.placement.moveTextOutwardXZ(geometry, distance);
  }

  /**
   * 沿圆柱径向移动文字几何。
   * @param {THREE.BufferGeometry} geometry - 几何体（局部坐标系）
   * @param {Object} cylinderInfo - 圆柱信息（局部坐标系）
   * @param {number} distance - 移动距离（正值向外，负值向内）
   */
  moveTextRadially(geometry, cylinderInfo, distance) {
    return this.placement.moveTextRadially(geometry, cylinderInfo, distance);
  }

  /**
   * 将圆柱面文字偏移到布尔运算所需位置。
   *
   * 这一步本质上属于“几何预处理”，
   * 因此统一交给 placement 服务，而不是放在 manager 中维护。
   * @param {THREE.BufferGeometry} geometry - 文字几何体（世界坐标系）
   * @param {Object} cylinderInfo - 圆柱信息（世界坐标系）
   * @param {number} depth - 内嵌深度
   */
  offsetCylinderTextInward(geometry, cylinderInfo, depth) {
    return this.placement.offsetCylinderTextInward(geometry, cylinderInfo, depth);
  }

  /**
   * 计算圆柱切线方向。
   * @param {number} theta - 角度
   * @param {Object} cylinderInfo - 圆柱信息
   * @returns {THREE.Vector3} 切线向量
   */
  calculateCylinderTangent(theta, cylinderInfo) {
    return this.placement.calculateCylinderTangent(theta, cylinderInfo);
  }

  /**
   * 添加网格与文字的映射关系
   * @param {THREE.Mesh} mesh - 目标网格
   * @param {string} textId - 文字ID
   */
  addMeshTextMapping(mesh, textId) {
    if (!this.meshTextMap.has(mesh.uuid)) {
      this.meshTextMap.set(mesh.uuid, new Set());
    }
    this.meshTextMap.get(mesh.uuid).add(textId);
  }

  /**
   * 移除网格与文字的映射关系
   * @param {THREE.Mesh} mesh - 目标网格
   * @param {string} textId - 文字ID
   */
  removeMeshTextMapping(mesh, textId) {
    const textIds = this.meshTextMap.get(mesh.uuid);
    if (textIds) {
      textIds.delete(textId);
      if (textIds.size === 0) {
        this.meshTextMap.delete(mesh.uuid);
      }
    }
  }

  /**
   * 在平面表面上定位文字。
   * @param {THREE.Mesh} textMesh - 文字网格
   * @param {Object} faceInfo - 面信息
   */
  positionTextOnSurface(textMesh, faceInfo) {
    return this.placement.positionTextOnSurface(textMesh, faceInfo);
  }

  /**
   * 计算3D点的屏幕位置
   * @param {THREE.Vector3} worldPosition - 世界坐标位置
   * @returns {Object} 屏幕坐标 {x, y}
   */
  calculateScreenPosition(worldPosition) {
    const vector = worldPosition.clone();
    vector.project(this.camera);

    // 转换为全屏坐标（不是相对于DOM元素）
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (vector.y * -0.5 + 0.5) * window.innerHeight;

    return { x, y };
  }

  /**
   * 选中文字对象
   * @param {string} textId - 文字ID
   */
  selectText(textId, options: Record<string, CoreValue> = {}) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`);
      return;
    }

    const textObject = this.textObjects.get(textId);

    if (this.selectedTextId === textId) {
      this.selectionController?.select?.(textObject, options);
      return textObject;
    }

    // 取消之前的选择
    if (this.selectedTextId) {
      this.deselectText();
    }

    this.selectedTextId = textId;
    this.selectionController?.select?.(textObject, options);

    console.log(`文字对象已选中: ${textId}`);
    this.emit('textSelected', textObject);
  }

  /**
   * 取消选中文字对象
   * @param {boolean} applyChanges - 是否应用更改（仅对编辑模式有效）
   */
  async deselectText(applyChanges = true, options: Record<string, CoreValue> = {}) {
    if (!this.selectedTextId) return;

    const textObject = this.textObjects.get(this.selectedTextId);

    // 如果处于编辑模式，先退出编辑模式
    if (this.isEditing && textObject.mode === 'engraved') {
      await this.exitEditMode(applyChanges);
    }

    this.selectionController?.deselect?.(textObject, options);

    console.log(`文字对象已取消选中: ${this.selectedTextId}`);
    this.emit('textDeselected', textObject);

    this.selectedTextId = null;
  }

  /**
   * 编辑态拖拽结束后的统一提交入口。
   *
   * 只有雕刻文字在编辑态下才需要“重新生成预览态”，
   * 其它情况直接忽略即可。
   */
  async handleSelectedTextDragEnd(textObject) {
    if (!(this.isEditing && textObject?.mode === 'engraved')) {
      return;
    }

    try {
      return await this.editSession.handleSelectedTextDragEnd(textObject);
    } catch (error) {
      console.error('重新应用布尔操作失败:', error);
      this.emit('error', { type: 'reapplyEngraving', error });
    }
  }

  /**
   * 删除文字对象
   * @param {string} textId - 文字ID
   */
  async deleteText(textId) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`);
      return;
    }

    const textObject = this.textObjects.get(textId);

    // 删除选中项时，先退出选中态，避免 selection controller 继续持有悬空引用。
    if (this.selectedTextId === textId) {
      await this.deselectText(false);
    }

    // 删除雕刻文字前，先把宿主模型的预览态恢复到“删掉它以后”的结果。
    if (textObject.mode === 'engraved' && textObject.originalTargetGeometry) {
      try {
        await this.previewService.removeTextPreview(textObject);
      } catch (error) {
        console.error('删除文字时恢复预览失败:', error);
        this.emit('error', { type: 'deleteTextPreview', error, textId });
      }
    }

    this.removeMeshTextMapping(textObject.targetMesh, textId);

    if (textObject.engravedMaterial) {
      textObject.engravedMaterial.dispose();
      textObject.engravedMaterial = null;
    }

    if (textObject.originalTargetGeometry) {
      textObject.originalTargetGeometry.dispose();
      textObject.originalTargetGeometry = null;
    }

    const selectionTarget = this.getTextSelectionTarget(textObject);
    if (selectionTarget && typeof this.entitySelectionBridge?.removeEntityObject === 'function') {
      this.entitySelectionBridge.removeEntityObject(selectionTarget);
    } else if (textObject.entityObject?.parent) {
      textObject.entityObject.parent.remove(textObject.entityObject);
    } else {
      this.scene.remove(textObject.mesh);
    }

    textObject.geometry.dispose();
    textObject.material.dispose();

    this.textObjects.delete(textId);

    console.log(`文字对象已删除: ${textId}`);
    this.emit('textDeleted', { id: textId, textObject });
  }

  /**
   * 更新文字内容
   * @param {string} textId - 文字ID
   * @param {string} newContent - 新内容
   */
  async updateTextContent(textId, newContent) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`);
      return;
    }

    if (!this.validateTextContent(newContent)) {
      throw new Error('无效的文字内容');
    }

    const textObject = this.textObjects.get(textId);
    const oldContent = textObject.content;

    try {
      // 生成新的几何体（使用当前配置）
      const newGeometry = await this.geometryGenerator.generate(newContent, textObject.config);

      // 更新网格几何体
      textObject.mesh.geometry.dispose(); // 清理旧几何体
      textObject.mesh.geometry = newGeometry;
      textObject.geometry = newGeometry;
      textObject.content = newContent;
      textObject.modified = Date.now();
      if (this.selectedTextId === textId) {
        this.selectionController?.syncSelection?.(textObject);
      }

      console.log(`文字内容已更新: ${textId}`, { oldContent, newContent });
      this.emit('textContentUpdated', { textObject, oldContent, newContent });
    } catch (error) {
      console.error('更新文字内容失败:', error);
      this.emit('error', { type: 'contentUpdate', error, textId });
      throw error;
    }
  }

  /**
   * 更新文字配置并重新生成几何体
   * @param {string} textId - 文字ID
   * @param {Object} configUpdates - 配置更新
   */
  async updateTextConfig(textId, configUpdates) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`);
      return;
    }

    const textObject = this.textObjects.get(textId);
    const oldConfig = { ...textObject.config };

    try {
      // 更新配置
      Object.assign(textObject.config, configUpdates);

      // 重新生成几何体
      const newGeometry = await this.geometryGenerator.generate(
        textObject.content,
        textObject.config
      );

      // 更新网格几何体
      textObject.mesh.geometry.dispose();
      textObject.mesh.geometry = newGeometry;
      textObject.geometry = newGeometry;
      textObject.modified = Date.now();
      if (this.selectedTextId === textId) {
        this.selectionController?.syncSelection?.(textObject);
      }

      console.log(`文字配置已更新: ${textId}`, { oldConfig, newConfig: textObject.config });
      this.emit('textConfigUpdated', { textObject, oldConfig, newConfig: textObject.config });
    } catch (error) {
      console.error('更新文字配置失败:', error);
      // 回滚配置
      textObject.config = oldConfig;
      this.emit('error', { type: 'configUpdate', error, textId });
      throw error;
    }
  }

  /**
   * 更新文字颜色
   * @param {string} textId - 文字ID
   * @param {number} color - 新颜色
   */
  updateTextColor(textId, color) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`);
      return;
    }

    const textObject = this.textObjects.get(textId);
    const oldColor = textObject.material.color.getHex();

    // 更新原始材质颜色（用于凸起模式）
    textObject.material.color.setHex(color);
    textObject.config.color = color;
    textObject.modified = Date.now();

    // 如果是内嵌模式，更新雕刻材质颜色
    if (textObject.mode === 'engraved' && textObject.engravedMaterial) {
      textObject.engravedMaterial.color.setHex(color);
      console.log(`内嵌文字颜色已更新: ${textId}`);
    }

    // 如果文字当前被选中，需要更新高亮材质的颜色
    if (this.selectedTextId === textId) {
      const mesh = textObject.mesh;
      // 检查是否有高亮材质
      if (mesh.userData.originalMaterial) {
        // 更新原始材质颜色
        mesh.userData.originalMaterial.color.setHex(color);

        // 重新创建高亮材质以反映新颜色
        const highlightMaterial = mesh.userData.originalMaterial.clone();
        highlightMaterial.emissive.setHex(0x444444); // 添加发光效果
        highlightMaterial.emissiveIntensity = 0.3;

        mesh.material = highlightMaterial;
      }
    }

    console.log(`文字颜色已更新: ${textId}`, { oldColor, newColor: color });
    this.emit('textColorUpdated', { textObject, oldColor, newColor: color });
  }

  /**
   * 切换文字模式（凸起/内嵌）
   * @param {string} textId - 文字ID
   * @param {string} mode - 模式 ('raised' | 'engraved')
   */
  async switchTextMode(textId, mode) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`);
      return;
    }

    if (!['raised', 'engraved'].includes(mode)) {
      throw new Error(`无效的文字模式: ${mode}`);
    }

    const textObject = this.textObjects.get(textId);
    const oldMode = textObject.mode;

    if (oldMode === mode) return; // 模式相同，无需切换

    // 检查圆柱面文字是否支持内嵌模式
    const isCylinderText = textObject.surfaceInfo?.surfaceType === 'cylinder';
    if (mode === 'engraved' && isCylinderText) {
      // 检查几何体是否是闭合流形
      const isManifold = textObject.geometry?.userData?.isManifold;
      if (!isManifold) {
        console.warn('⚠️ 圆柱面文字几何体非闭合流形，尝试继续执行布尔操作...');
        // 不再阻止操作，让布尔操作库自己处理
      } else {
        console.log('✅ 圆柱面文字使用闭合流形几何体，支持内嵌模式');
      }
    }

    try {
      if (mode === 'engraved') {
        // 先更新 mode，这样 updateMeshMaterials 才能正确识别内嵌文字
        textObject.mode = 'engraved';

        // 切换到内嵌模式，执行布尔操作
        await this.applyEngravingMode(textObject);
        textObject.engraveStatus = 'success';
        textObject.engraveError = null;
      } else {
        // 注意：这里先保持旧 mode（通常是 engraved），以便 applyRaisedMode 能正确恢复几何体
        // 切换到凸起模式，恢复原始状态
        await this.applyRaisedMode(textObject);
        textObject.mode = 'raised';
        textObject.engraveStatus = null;
        textObject.engraveError = null;
      }

      textObject.modified = Date.now();

      console.log(`文字模式已切换: ${textId}`, { oldMode, newMode: mode });
      this.emit('textModeChanged', {
        textObject,
        oldMode,
        newMode: mode,
        engraveStatus: textObject.engraveStatus,
        engraveError: textObject.engraveError,
      });
    } catch (error) {
      console.error('切换文字模式失败:', error);

      // 需求：失败时 UI 仍保持为 engraved（但提示失败）
      if (mode === 'engraved') {
        textObject.mode = 'engraved';
        textObject.engraveStatus = 'failed';
        textObject.engraveError = error?.message || String(error);
        textObject.modified = Date.now();

        this.emit('textModeChanged', {
          textObject,
          oldMode,
          newMode: 'engraved',
          engraveStatus: 'failed',
          engraveError: textObject.engraveError,
        });

        this.emit('error', { type: 'modeSwitch', error, textId });
        return;
      }

      // 其他情况按原逻辑回滚并抛出
      textObject.mode = oldMode;
      this.emit('error', { type: 'modeSwitch', error, textId });
      throw error;
    }
  }

  /**
   * 应用雕刻预览。
   *
   * 具体的布尔与材质分组逻辑已经收敛到 PreviewService。
   * @param {Object} textObject - 文字对象
   */
  async applyEngravingMode(textObject) {
    return this.previewService.applyEngravingMode(textObject);
  }

  /**
   * 同步目标网格的多材质信息。
   *
   * 这一步的真实目的不是“改颜色”，
   * 而是把 `entityKey` 等命中 metadata 保留在材质分组上。
   * @param {THREE.Mesh} mesh - 目标网格
   * @param {Object} newTextObject - 新添加的文字对象
   */
  updateMeshMaterials(mesh, newTextObject) {
    return this.previewService.updateMeshMaterials(mesh, newTextObject);
  }

  /**
   * 应用凸起模式。
   *
   * 从 manager 的视角看，这就是“退出布尔预览”；
   * PreviewService 会决定是恢复原模型，还是保留其它雕刻文字后的结果。
   * @param {Object} textObject - 文字对象
   */
  async applyRaisedMode(textObject) {
    return this.previewService.applyRaisedMode(textObject);
  }

  /**
   * 获取所有文字对象
   * @returns {Array} 文字对象数组
   */
  getAllTextObjects() {
    return Array.from(this.textObjects.values() as Iterable<CoreValue>);
  }

  /**
   * 获取选中的文字对象
   * @returns {Object|null} 文字对象或null
   */
  getSelectedTextObject() {
    return this.selectedTextId ? this.textObjects.get(this.selectedTextId) : null;
  }

  /**
   * 获取文字对象快照（用于撤销/重做）
   * @param {string} textId - 文字ID
   * @returns {Object|null} 可序列化快照
   */
  getTextSnapshot(textId) {
    const textObject = this.textObjects.get(textId);
    if (!textObject) return null;

    const faceInfo = textObject.faceInfo || {};
    const normal = faceInfo.face?.normal;
    const point = faceInfo.point;
    const uv = faceInfo.uv;

    const meshTransform = readTextTargetTransformSnapshot(textObject);

    return {
      version: 1,
      id: textObject.id,
      content: textObject.content,
      mode: textObject.mode,
      engraveStatus: textObject.engraveStatus || null,
      engraveError: textObject.engraveError || null,
      config: { ...textObject.config },

      surfaceId: textObject.surfaceId || null,
      targetMeshUuid: textObject.targetMesh?.uuid || null,
      targetMeshName: textObject.targetMesh?.name || null,
      faceIndex: textObject.targetFace ?? null,

      point: point ? { x: point.x, y: point.y, z: point.z } : null,
      normal: normal ? { x: normal.x, y: normal.y, z: normal.z } : null,
      uv: uv ? { x: uv.x, y: uv.y } : null,

      meshTransform,
    };
  }

  /**
   * 从快照恢复文字（用于撤销/重做）
   * @param {Object} snapshot - 文字快照
   * @returns {Promise<string>} 文字ID
   */
  async restoreText(snapshot) {
    if (!snapshot?.id) {
      throw new Error('Invalid text snapshot');
    }

    if (this.textObjects.has(snapshot.id)) {
      return snapshot.id;
    }

    const targetMesh =
      (snapshot.targetMeshUuid
        ? this.targetMeshes.find((m) => m.uuid === snapshot.targetMeshUuid)
        : null) ||
      (snapshot.targetMeshUuid
        ? this.scene.getObjectByProperty('uuid', snapshot.targetMeshUuid)
        : null);

    if (!targetMesh) {
      throw new Error(
        `Target mesh not found for text restore: ${snapshot.targetMeshUuid || snapshot.targetMeshName}`
      );
    }

    const point = snapshot.point
      ? new THREE.Vector3(snapshot.point.x, snapshot.point.y, snapshot.point.z)
      : new THREE.Vector3();

    const normal = snapshot.normal
      ? new THREE.Vector3(snapshot.normal.x, snapshot.normal.y, snapshot.normal.z)
      : null;

    const uv = snapshot.uv ? new THREE.Vector2(snapshot.uv.x, snapshot.uv.y) : null;

    const faceInfo = {
      mesh: targetMesh,
      faceIndex: snapshot.faceIndex ?? 0,
      face: normal ? { normal } : null,
      point,
      distance: 0,
      uv,
    };

    const textId = await this.createTextObject(snapshot.content, faceInfo, {
      id: snapshot.id,
      config: snapshot.config || {},
    });

    const textObject = this.textObjects.get(textId);
    if (!textObject) return textId;

    // 恢复变换
    if (snapshot.meshTransform) {
      this.applyTransformToTextTarget(textObject, snapshot.meshTransform);
    }

    // 恢复模式（成功态重跑一次，失败态只恢复失败标记）
    if (snapshot.mode === 'engraved') {
      if (snapshot.engraveStatus === 'failed') {
        textObject.mode = 'engraved';
        textObject.engraveStatus = 'failed';
        textObject.engraveError = snapshot.engraveError || 'CSG failed';
        this.emit('textModeChanged', {
          textObject,
          oldMode: 'raised',
          newMode: 'engraved',
          engraveStatus: 'failed',
          error: textObject.engraveError,
        });
      } else {
        await this.switchTextMode(textId, 'engraved');
      }
    }

    return textId;
  }

  /**
   * 设置事件处理器
   */
  setupEventHandlers() {
    this.inputOverlay.on('cancel', () => {
      console.log('文字输入已取消');
    });
  }

  /**
   * 添加事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName).push(callback);
  }

  /**
   * 移除事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(eventName, callback) {
    if (!this.eventListeners.has(eventName)) return;

    const listeners = this.eventListeners.get(eventName);
    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * 发出事件
   * @param {string} eventName - 事件名称
   * @param {...CoreValue} args - 事件参数
   */
  emit(eventName, ...args) {
    if (!this.eventListeners.has(eventName)) return;

    const listeners = this.eventListeners.get(eventName);
    listeners.forEach((callback) => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error);
      }
    });
  }

  /**
   * 导出文字配置（符合config.js格式）
   * @returns {Object} 文字配置数据
   */
  exportTextConfig() {
    const texts = [];

    this.textObjects.forEach((textObject, textId) => {
      const transformTarget = this.getTextTransformTarget(textObject) || textObject.mesh;
      const config = {
        // id
        id: textObject.content,
        // uuid 标识， 查找管理
        index: textId,
        // 字体类型
        type: textObject.config.font || 'Ailias',
        // 文字内容
        text: textObject.content,
        // 字体大小（转换为毫米）
        size: Math.round(textObject.config.size * 1000), // 米转毫米
        // 字体深度（转换为毫米）
        depth: Math.round(textObject.config.thickness * 1000), // 米转毫米
        // 文字效果： 浮雕 / 刻字
        effect: textObject.mode === 'raised' ? 'Embossed' : 'Engraved',
        // 字体颜色
        color: `#${textObject.material.color.getHexString()}`,
        // 字体坐标
        position: transformTarget.position.toArray(),
        // 字体旋转
        rotate: transformTarget.rotation.toArray(),
        // 文字贴合方式
        wrap: 'surface Project',
        // 在那个表面上添加文字
        attachmentSurface: textObject.surfaceId,
      };

      texts.push(config);
    });

    return texts;
  }

  /**
   * 导入文字配置（从config.js格式）
   * @param {Array} textsConfig - 文字配置数组
   */
  async importTextConfig(textsConfig) {
    if (!Array.isArray(textsConfig)) {
      console.warn('文字配置格式错误');
      return;
    }

    for (const textConfig of textsConfig) {
      try {
        // 恢复表面信息
        const faceInfo = surfaceIdentifier.restoreSurfaceInfo(textConfig.attachmentSurface);
        if (!faceInfo) {
          console.warn('无法恢复表面信息:', textConfig.attachmentSurface);
          continue;
        }

        // 转换配置格式
        const config = {
          font: textConfig.type || 'helvetiker',
          size: (textConfig.size || 33) / 1000, // 毫米转米
          thickness: (textConfig.depth || 3) / 1000, // 毫米转米
          color: parseInt(textConfig.color?.replace('#', '') || 'ff00ff', 16),
        };

        // 创建文字对象
        const textId = await this.createTextObject(textConfig.text, faceInfo);
        const textObject = this.textObjects.get(textId);

        if (textObject) {
          // 应用位置和旋转
          const transformTarget = this.getTextTransformTarget(textObject) || textObject.mesh;
          if (textConfig.position) {
            transformTarget.position.fromArray(textConfig.position);
          }
          if (textConfig.rotate) {
            transformTarget.rotation.fromArray(textConfig.rotate);
          }
          transformTarget.updateMatrixWorld?.(true);
          transformTarget.markBoxDirty?.();
          transformTarget.refreshWorldBox?.(true);

          // 应用效果模式
          if (textConfig.effect === 'Engraved') {
            await this.switchTextMode(textId, 'engraved');
          }

          // 更新配置
          textObject.config = { ...textObject.config, ...config };
          textObject.material.color.setHex(config.color);
        }
      } catch (error) {
        console.error('导入文字配置失败:', textConfig, error);
      }
    }
  }

  /**
   * 导出完整的表面标识配置
   * @returns {Object} 表面标识配置
   */
  exportSurfaceConfig() {
    return surfaceIdentifier.exportConfig();
  }

  /**
   * 导入表面标识配置
   * @param {Object} config - 表面标识配置
   */
  importSurfaceConfig(config) {
    surfaceIdentifier.importConfig(config);
  }

  /**
   * 销毁管理器，清理资源
   */
  async destroy() {
    // 禁用点击监听
    this.disableClickListener();
    this.selectionController?.dispose?.();

    // 禁用文字模式
    this.disableTextMode();

    // 删除所有文字对象
    const textIds = Array.from(this.textObjects.keys());
    for (const id of textIds) {
      await this.deleteText(id);
    }

    // 清理子系统
    this.inputOverlay.destroy();

    // 清理事件监听器
    this.meshRegistry.clear();
    this.eventHub.clear();
    this.entitySelectionBridge = null;
    this.selectionController = null;
    this.transformControls = null;

    console.log('表面文字管理器已销毁');
  }

  /**
   * 验证文字内容
   * @param {string} content - 文字内容
   * @returns {boolean} 是否有效
   */
  validateTextContent(content) {
    return typeof content === 'string' && content.trim().length > 0;
  }

  /**
   * 生成唯一文字ID
   * @returns {string} 唯一ID
   */
  generateTextId() {
    return `text_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 获取默认文字配置
   * @returns {Object} 默认配置
   */
  getDefaultTextConfig() {
    return {
      font: 'helvetiker',
      size: 3, // 字体大小设置为3
      thickness: 0.5, // 深度设置为0.5
      color: 0x333333,
      mode: 'raised', // 'raised' | 'engraved'
      curveSegments: 12,
      bevelEnabled: false,
      bevelThickness: 0.02, // 倒角厚度
      bevelSize: 0.01, // 倒角大小
      bevelOffset: 0,
      bevelSegments: 5,
    };
  }

  /**
   * 设置圆柱面文字生成方法
   * @param {string} method - 'csg' | 'mapping'
   *   - 'csg': 使用 CSG 布尔操作（更精确，文字完美贴合曲面）
   *   - 'mapping': 使用坐标映射（较快，但可能有轻微变形）
   */
  setCylinderTextMethod(method) {
    this.geometryGenerator.setCylinderTextMethod(method);
  }

  /**
   * 获取当前圆柱面文字生成方法
   * @returns {string} 'csg' | 'mapping'
   */
  getCylinderTextMethod() {
    return this.geometryGenerator.getCylinderTextMethod();
  }

  /**
   * 检查是否处于编辑模式
   * @returns {boolean} 是否处于编辑模式
   */
  isInEditMode() {
    return this.isEditing;
  }

  /**
   * 检查是否正在拖动
   * @returns {boolean} 是否正在拖动
   */
  isCurrentlyDragging() {
    return this.isDragging;
  }

  /**
   * 获取指定网格上的所有文字对象
   * @param {THREE.Mesh} mesh - 目标网格
   * @returns {Array} 文字对象数组
   */
  getTextObjectsOnMesh(mesh) {
    const textIds = this.meshTextMap.get(mesh.uuid);
    if (!textIds) return [];

    return Array.from(textIds)
      .map((id) => this.textObjects.get(id) as CoreValue)
      .filter((obj): obj is CoreValue => obj !== undefined);
  }

  /**
   * 获取指定网格上的内嵌文字对象
   * @param {THREE.Mesh} mesh - 目标网格
   * @returns {Array} 内嵌文字对象数组
   */
  getEngravedTextObjectsOnMesh(mesh) {
    return this.getTextObjectsOnMesh(mesh).filter((obj) => obj.mode === 'engraved');
  }

  /**
   * 手动触发重新应用所有内嵌效果
   * @param {THREE.Mesh} targetMesh - 目标网格（可选，不传则处理所有）
   */
  async refreshAllEngravings(targetMesh = null) {
    const textObjects = targetMesh
      ? this.getEngravedTextObjectsOnMesh(targetMesh)
      : this.getAllTextObjects().filter((obj) => obj.mode === 'engraved');

    for (const textObject of textObjects) {
      try {
        await this.reapplyEngraving(textObject);
      } catch (error) {
        console.error(`刷新内嵌效果失败: ${textObject.id}`, error);
      }
    }

    console.log(`已刷新 ${textObjects.length} 个内嵌文字效果`);
  }

  /**
   * 限制文字移动在目标表面上
   * @param {string} textId - 文字ID
   * @param {boolean} constrain - 是否限制
   */
  setConstrainToSurface(textId, constrain) {
    if (!this.textObjects.has(textId)) return;

    const textObject = this.textObjects.get(textId);
    textObject.constrainToSurface = constrain;

    // TODO: 实现表面约束逻辑
    console.log(`文字 ${textId} 表面约束: ${constrain}`);
  }
}
