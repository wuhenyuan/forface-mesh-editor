import * as THREE from 'three';
import { surfaceIdentifier } from '../SurfaceIdentifier';
import { TextGeometryGenerator } from '../TextGeometryGenerator';
import createTextEntityObject from './TextEntityObjectFactory';
import type { SurfaceFaceInfo, SurfaceInfo } from './SurfaceTextPlacement';
import type {
  SurfaceTextCreateOptions,
  SurfaceTextObject,
  SurfaceTextSelectionBridge,
} from './types';

type SurfaceTextCreationServiceOptions = {
  scene: THREE.Scene;
  geometryGenerator: TextGeometryGenerator;
  placement: {
    analyzeSurface: (faceInfo: SurfaceFaceInfo) => SurfaceInfo;
    positionTextOnCylinder: (
      textMesh: THREE.Mesh,
      faceInfo: SurfaceFaceInfo,
      surfaceInfo: SurfaceInfo
    ) => void;
    positionTextOnSurface: (textMesh: THREE.Mesh, faceInfo: SurfaceFaceInfo) => void;
  };
  getDefaultTextConfig: () => Record<string, CoreValue>;
  getMaxTextObjects: () => number;
  getTextCount: () => number;
  hasTextObject: (textId: string) => boolean;
  generateTextId: () => string;
  getEntitySelectionBridge: () => SurfaceTextSelectionBridge | null;
  addTextObject: (textId: string, textObject: SurfaceTextObject) => void;
  addMeshTextMapping: (mesh: THREE.Mesh, textId: string) => void;
  selectText: (textId: string) => void;
  emit: (eventName: string, ...args: CoreValue[]) => void;
};

/**
 * 负责把“文字实体配置”投影成场景中的可编辑文字对象。
 *
 * 这个服务只做创建，不负责后续布尔预览和编辑态切换。
 * 这样可以把“文字如何生成”与“文字如何参与布尔”彻底分开。
 */
export class SurfaceTextCreationService {
  private _options: SurfaceTextCreationServiceOptions;

  constructor(options: SurfaceTextCreationServiceOptions) {
    this._options = options;
  }

  /**
   * 创建新的文字运行时对象。
   *
   * 该流程分成四步：
   * 1. 分析目标表面；
   * 2. 生成文字几何；
   * 3. 计算文字的编辑态位姿；
   * 4. 建立运行时对象、场景挂载和关系映射。
   */
  async createTextObject(
    content: string,
    faceInfo: SurfaceFaceInfo,
    options: SurfaceTextCreateOptions = {}
  ) {
    const maxTextObjects = this._options.getMaxTextObjects();
    const textCount = this._options.getTextCount();
    if (textCount >= maxTextObjects) {
      throw new Error(`文字对象数量已达到最大限制: ${maxTextObjects}`);
    }

    const textId = (options.id as string) || this._options.generateTextId();
    if (options.id && this._options.hasTextObject(textId)) {
      return textId;
    }

    try {
      const surfaceInfo = this._options.placement.analyzeSurface(faceInfo);
      const initialConfig = {
        ...this._options.getDefaultTextConfig(),
        ...(options.config || {}),
      };

      const geometry = await this._options.geometryGenerator.generate(
        content,
        initialConfig,
        surfaceInfo
      );

      const material = new THREE.MeshPhongMaterial({
        color: initialConfig.color,
        side: THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geometry, material);

      mesh.userData = {
        isText: true,
        isTextObject: true,
        textId,
        type: 'text',
        surfaceType: surfaceInfo?.surfaceType || 'plane',
      };

      this._applyInitialTransform(mesh, faceInfo, surfaceInfo, options.transform || null);

      const entityObject = createTextEntityObject(textId, mesh);
      const surfaceId = surfaceIdentifier.generateSurfaceId(faceInfo);
      const textObject: SurfaceTextObject = {
        id: textId,
        content,
        entityObject,
        mesh,
        geometry,
        material,
        targetMesh: faceInfo.mesh,
        targetFace: faceInfo.faceIndex,
        faceInfo,
        surfaceId,
        surfaceInfo,
        config: { ...initialConfig },
        mode: 'raised',
        engraveStatus: null,
        engraveError: null,
        created: Date.now(),
        modified: Date.now(),
      };

      const entitySelectionBridge = this._options.getEntitySelectionBridge();
      if (typeof entitySelectionBridge?.addEntityObject === 'function') {
        entitySelectionBridge.addEntityObject(entityObject);
      } else {
        this._options.scene.add(entityObject);
      }

      this._options.addTextObject(textId, textObject);
      this._options.addMeshTextMapping(faceInfo.mesh, textId);
      this._options.selectText(textId);
      this._options.emit('textCreated', textObject);

      return textId;
    } catch (error) {
      this._options.emit('error', {
        type: 'textCreation',
        error,
        textId,
      });
      throw error;
    }
  }

  /**
   * 统一处理初始位姿。
   *
   * 如果调用方显式传入 transform，说明这是恢复 / 投影链路；
   * 否则由贴附服务根据目标表面自动计算位置和朝向。
   */
  private _applyInitialTransform(
    mesh: THREE.Mesh,
    faceInfo: SurfaceFaceInfo,
    surfaceInfo: SurfaceInfo,
    transform: Record<string, CoreValue> | null
  ) {
    const transformRotation = transform?.rotation ?? transform?.rotate;
    const hasExplicitTransform =
      !!transform &&
      (Array.isArray(transform?.position) ||
        Array.isArray(transformRotation) ||
        Array.isArray(transform?.scale));

    if (hasExplicitTransform) {
      if (Array.isArray(transform?.position)) {
        const [x = 0, y = 0, z = 0] = transform.position;
        mesh.position.set(x, y, z);
      }

      if (Array.isArray(transformRotation)) {
        const [x = 0, y = 0, z = 0, order] = transformRotation;
        if (typeof order === 'string') {
          mesh.rotation.order = order as THREE.EulerOrder;
        }
        mesh.rotation.set(x, y, z);
      }

      if (Array.isArray(transform?.scale)) {
        const [x = 1, y = 1, z = 1] = transform.scale;
        mesh.scale.set(x, y, z);
      }

      mesh.updateMatrixWorld(true);
      return;
    }

    if (surfaceInfo?.surfaceType === 'cylinder') {
      this._options.placement.positionTextOnCylinder(mesh, faceInfo, surfaceInfo);
      return;
    }

    this._options.placement.positionTextOnSurface(mesh, faceInfo);
  }
}

export default SurfaceTextCreationService;
