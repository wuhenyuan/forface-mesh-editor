import * as THREE from 'three';
import type { SurfaceTextObject } from './types';

type SurfaceTextEditSessionOptions = {
  /**
   * 预览服务负责真正的布尔重建。
   * 编辑流程只负责决定“什么时候进入编辑态、什么时候提交到预览态”。
   */
  previewService: {
    reapplyEngraving: (textObject: SurfaceTextObject) => Promise<void>;
  };
  selectText: (textId: string) => void;
  emit: (eventName: string, ...args: CoreValue[]) => void;
};

/**
 * 负责雕刻文字的编辑态流程。
 *
 * 这里刻意把“编辑态位移”和“预览态布尔结果”拆开：
 * - 编辑态：显示原始模型 + 可编辑文字；
 * - 预览态：显示布尔后的结果模型。
 *
 * 这样 SurfaceTextManager 不需要再关心每一步如何移动文字，
 * 只需要决定当前处于哪一种状态。
 */
export class SurfaceTextEditSession {
  private _options: SurfaceTextEditSessionOptions;

  constructor(options: SurfaceTextEditSessionOptions) {
    this._options = options;
  }

  /**
   * 进入雕刻文字编辑态。
   *
   * 进入编辑态时要做两件事：
   * 1. 暂时恢复目标模型的原始几何，方便用户看清真实文字；
   * 2. 把文字从雕刻内部抬回表面位置，交给 transform 控件编辑。
   */
  enterEditMode(textObject: SurfaceTextObject) {
    if (textObject.mode !== 'engraved') {
      this._options.selectText(textObject.id);
      return;
    }

    if (textObject.originalTargetGeometry) {
      textObject.targetMesh.geometry.dispose();
      textObject.targetMesh.geometry = textObject.originalTargetGeometry.clone();

      if (textObject.originalTargetMaterial) {
        textObject.targetMesh.material = textObject.originalTargetMaterial;
      }
    }

    textObject.mesh.visible = true;
    if (!textObject.originalPosition) {
      textObject.originalPosition = textObject.mesh.position.clone();
    }

    const depth = (textObject.config.thickness as number) || 0.5;
    this._offsetTextAlongSurfaceNormal(textObject, -depth, textObject.originalPosition.clone());
    this._options.selectText(textObject.id);
    this._options.emit('editModeEntered', textObject);
  }

  /**
   * 退出编辑态并提交到预览态。
   *
   * 当前实现里，无论 applyChanges 是否为 true，
   * 都会重建一次预览结果；区别只在于未来是否要接入真正的“编辑态快照回滚”。
   * 这里保留该参数，是为了不破坏现有对外行为。
   */
  async exitEditMode(textObject: SurfaceTextObject, _applyChanges = true) {
    const depth = (textObject.config.thickness as number) || 0.5;
    this._offsetTextAlongSurfaceNormal(textObject, depth);
    textObject.originalPosition = textObject.mesh.position.clone();
    await this._options.previewService.reapplyEngraving(textObject);
    this._options.emit('editModeExited', textObject);
  }

  /**
   * 拖拽结束后，把编辑态文字重新提交为预览态布尔结果。
   */
  async handleSelectedTextDragEnd(textObject: SurfaceTextObject) {
    const depth = (textObject.config.thickness as number) || 0.5;

    // 先把文字抬回表面位置做布尔，再压回雕刻显示位置。
    this._offsetTextAlongSurfaceNormal(textObject, depth);
    await this._options.previewService.reapplyEngraving(textObject);
    this._offsetTextAlongSurfaceNormal(textObject, -depth);
  }

  /**
   * 沿表面法线移动文字。
   *
   * `distance > 0` 表示从雕刻位置抬回表面，
   * `distance < 0` 表示从表面压回雕刻内部。
   */
  private _offsetTextAlongSurfaceNormal(
    textObject: SurfaceTextObject,
    distance: number,
    basePosition: THREE.Vector3 | null = null
  ) {
    const normal = textObject.faceInfo?.face?.normal?.clone?.();
    if (!normal) return;

    normal.transformDirection(textObject.targetMesh.matrixWorld);
    normal.normalize();

    const nextPosition = (basePosition || textObject.mesh.position.clone()).add(
      normal.multiplyScalar(distance)
    );
    textObject.mesh.position.copy(nextPosition);
  }
}

export default SurfaceTextEditSession;
