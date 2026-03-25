import * as THREE from 'three';
import type EntityBooleanService from '../../boolean/EntityBooleanService';
import type { CylinderInfo } from './SurfaceTextPlacement';
import type { SurfaceTextObject } from './types';

type SurfaceTextPreviewServiceOptions = {
  /**
   * 通用实体布尔服务。
   * PreviewService 不再直接依赖 `BooleanOperator`，
   * 而是通过通用实体层完成布尔编排和 metadata 写回。
   */
  booleanService: EntityBooleanService;

  /**
   * 圆柱文字在某些场景下需要沿径向向内扩展后再参与布尔，
   * 这里仅依赖 placement 提供的纯几何工具函数。
   */
  placement: {
    offsetCylinderTextInward: (
      geometry: THREE.BufferGeometry,
      cylinderInfo: CylinderInfo,
      depth: number
    ) => void;
  };

  /**
   * 当前所有文字运行时对象。
   */
  textObjects: Map<string, SurfaceTextObject>;

  /**
   * 目标模型与文字的关联关系表。
   */
  meshTextMap: Map<string, Set<string>>;
};

type RebuildPreviewOptions = {
  targetMesh: THREE.Mesh;
  baseGeometry: THREE.BufferGeometry;
  referenceTextObject: SurfaceTextObject;
  sourceTextObjects: SurfaceTextObject[];
  offsetCylinder: boolean;
  hideSourceMeshes?: boolean;
};

type ColorMaterial = THREE.Material & {
  color?: THREE.Color;
};

/**
 * 负责把文字实体投影成“布尔后的预览结果”。
 *
 * 这个服务不创建文字、不管理点击、不管理选择框，
 * 它只回答一个问题：
 * “给定若干文字对象和一个目标模型，如何生成当前预览态？”
 */
export class SurfaceTextPreviewService {
  private _options: SurfaceTextPreviewServiceOptions;

  /**
   * 初始化文字布尔预览服务。
   */
  constructor(options: SurfaceTextPreviewServiceOptions) {
    this._options = options;
  }

  /**
   * 从目标模型读取实体来源。
   * Preview 层只关心实体元数据，不关心 UI 或 document store。
   */
  getEntityKeyFromMesh(mesh: THREE.Object3D | null | undefined) {
    return this._options.booleanService.getEntityKeyFromObject(mesh);
  }

  /**
   * 为布尔减法生成统一 metadata。
   *
   * 这里刻意保留了 `textId` 兼容字段，
   * 但真正的主线已经切换到 `entityKey / sourceEntityId / regionOwnerEntityId`。
   */
  buildSubtractEntityMetadata(
    textObject: SurfaceTextObject,
    targetMesh: THREE.Mesh | null = null
  ) {
    return this._options.booleanService.buildSubtractMetadata({
      targetObject: targetMesh || textObject?.targetMesh || null,
      toolEntityKey: textObject?.id || null,
      regionOwnerEntityId: textObject?.id || null,
      regionRole: 'engraved',
      compatibilityTextId: textObject?.id || null,
    });
  }

  /**
   * 应用单个文字的雕刻预览。
   *
   * 这是“从编辑态进入预览态”的入口：
   * 1. 先保存目标模型的原始几何和材质；
   * 2. 再把文字转换到目标模型局部坐标；
   * 3. 最后执行布尔减法并写回 three 对象。
   */
  async applyEngravingMode(textObject: SurfaceTextObject) {
    // 第一次进入雕刻预览时，先把目标模型的原始状态快照下来。
    // 后续拖拽、重算、切换模式都会从这份原始几何重新重放布尔链。
    this._ensureOriginalTargetState(textObject);

    const baseGeometry = textObject.originalTargetGeometry?.clone();
    if (!baseGeometry) {
      throw new Error('缺少目标模型原始几何，无法应用雕刻预览');
    }

    const toolGeometry = this._createBooleanToolGeometry(textObject, {
      offsetCylinder: false,
    });

    try {
      // 这里正式进入通用布尔链路：
      // PreviewService 只负责提供 base/tool geometry 和实体 metadata，
      // 真正的序列化、worker 调度、缓存命中都在更下层完成。
      const result = await this._options.booleanService.subtract(baseGeometry, toolGeometry, {
        ...this.buildSubtractEntityMetadata(textObject),
        targetMaterial: textObject.originalTargetMaterial,
      });

      if (!result?.geometry) {
        throw new Error('布尔减法没有返回有效几何');
      }

      this._applyPreviewResult(textObject.targetMesh, result.geometry, result.materials, textObject);
      textObject.mesh.visible = false;
      return result;
    } finally {
      baseGeometry.dispose();
      toolGeometry.dispose();
    }
  }

  /**
   * 根据当前目标模型上所有雕刻文字，重建一次完整预览。
   *
   * 这是“预览态重投影”的统一入口：
   * 无论是拖拽结束、编辑态退出、还是多文字重算，
   * 最终都应该走这条统一的派生链，而不是在 manager 中到处复制循环。
   */
  async reapplyEngraving(textObject: SurfaceTextObject) {
    if (!textObject.originalTargetGeometry) return;

    const engravedTexts = this.getEngravedTextObjectsOnMesh(textObject.targetMesh);
    if (engravedTexts.length === 0) return;

    await this._rebuildPreview({
      targetMesh: textObject.targetMesh,
      baseGeometry: textObject.originalTargetGeometry.clone(),
      referenceTextObject: textObject,
      sourceTextObjects: engravedTexts,
      offsetCylinder: false,
      hideSourceMeshes: true,
    });
  }

  /**
   * 从雕刻态切回凸起态。
   *
   * 当前文字不再参与布尔，但其它仍处于雕刻态的文字需要保留，
   * 因此这里不是简单恢复原始模型，而是“恢复原始模型后再重放剩余文字的布尔结果”。
   */
  async applyRaisedMode(textObject: SurfaceTextObject) {
    if (!(textObject.mode === 'engraved' && textObject.originalTargetGeometry)) {
      textObject.mesh.visible = true;
      return;
    }

    if (textObject.engravedMaterial) {
      textObject.engravedMaterial.dispose();
      textObject.engravedMaterial = null;
    }

    textObject.mesh.visible = true;
    const otherEngravedTexts = this.getEngravedTextObjectsOnMesh(textObject.targetMesh, textObject.id);

    if (otherEngravedTexts.length === 0) {
      this.restoreOriginalTarget(textObject);
      return;
    }

    await this._rebuildPreview({
      targetMesh: textObject.targetMesh,
      baseGeometry: textObject.originalTargetGeometry.clone(),
      referenceTextObject: otherEngravedTexts[0],
      sourceTextObjects: otherEngravedTexts,
      offsetCylinder: true,
      hideSourceMeshes: true,
    });
  }

  /**
   * 删除文字前清理预览态。
   *
   * 删除本身属于 manager 的生命周期职责，
   * 这里仅负责把当前预览恢复到“删除该文字后的正确结果”。
   */
  async removeTextPreview(textObject: SurfaceTextObject) {
    if (!(textObject.mode === 'engraved' && textObject.originalTargetGeometry)) {
      return;
    }

    const otherEngravedTexts = this.getEngravedTextObjectsOnMesh(textObject.targetMesh, textObject.id);
    if (otherEngravedTexts.length === 0) {
      this.restoreOriginalTarget(textObject);
      return;
    }

    await this._rebuildPreview({
      targetMesh: textObject.targetMesh,
      baseGeometry: textObject.originalTargetGeometry.clone(),
      referenceTextObject: otherEngravedTexts[0],
      sourceTextObjects: otherEngravedTexts,
      offsetCylinder: true,
      hideSourceMeshes: false,
    });
  }

  /**
   * 更新目标模型的多材质数组，使每个雕刻区域都带有自己的实体元数据。
   *
   * 这是命中统一的基础：
   * 点击布尔结果时，会通过 material.userData.entityKey 反向命中对应实体。
   */
  updateMeshMaterials(mesh: THREE.Mesh, referenceTextObject: SurfaceTextObject) {
    const textIds = this._options.meshTextMap.get(mesh.uuid);
    if (!textIds) return;

    const materials: THREE.Material[] = [];
    const originalMaterial = referenceTextObject.originalTargetMaterial as THREE.Material;
    this._options.booleanService.annotateBaseMaterial(originalMaterial, {
      targetObject: mesh,
      regionRole: 'base',
    });
    materials.push(originalMaterial);

    let materialIndex = 1;
    for (const textId of textIds) {
      const textObject = this._options.textObjects.get(textId);
      if (!textObject || textObject.mode !== 'engraved') continue;

      const baseColor = (originalMaterial as ColorMaterial)?.color?.getHex?.() || 0x409eff;
      const engravedColor = this._buildEngravedColor(baseColor);

      if (!textObject.engravedMaterial) {
        textObject.engravedMaterial = new THREE.MeshStandardMaterial({
          color: engravedColor,
          roughness: 0.9,
          metalness: 0.0,
        });
      } else {
        (textObject.engravedMaterial as ColorMaterial)?.color?.setHex?.(engravedColor);
      }

      this._options.booleanService.annotateToolMaterial(textObject.engravedMaterial, {
        toolEntityKey: textObject.id,
        regionOwnerEntityId: textObject.id,
        compatibilityTextId: textObject.id,
        materialIndex,
        regionRole: 'engraved',
      });

      materials.push(textObject.engravedMaterial);
      textObject.materialIndex = materialIndex;
      materialIndex += 1;
    }

    mesh.material = materials.length > 1 ? materials : materials[0];
  }

  /**
   * 恢复目标模型到最初的编辑态显示。
   */
  restoreOriginalTarget(textObject: SurfaceTextObject) {
    if (!textObject.originalTargetGeometry) return;

    textObject.targetMesh.geometry.dispose();
    textObject.targetMesh.geometry = textObject.originalTargetGeometry.clone();

    if (textObject.originalTargetMaterial) {
      textObject.targetMesh.material = textObject.originalTargetMaterial;
    }
  }

  /**
   * 获取某个目标模型上的所有雕刻文字。
   * `excludeTextId` 用于删除 / 切换模式时排除当前文字自身。
   */
  getEngravedTextObjectsOnMesh(targetMesh: THREE.Mesh, excludeTextId: string | null = null) {
    const textIds = this._options.meshTextMap.get(targetMesh.uuid);
    if (!textIds) return [];

    const engravedTexts: SurfaceTextObject[] = [];
    for (const textId of textIds) {
      if (excludeTextId && textId === excludeTextId) continue;
      const textObject = this._options.textObjects.get(textId);
      if (textObject && textObject.mode === 'engraved') {
        engravedTexts.push(textObject);
      }
    }
    return engravedTexts;
  }

  /**
   * 确保第一次进入雕刻预览时，会保存目标模型的原始状态。
   */
  private _ensureOriginalTargetState(textObject: SurfaceTextObject) {
    if (textObject.originalTargetGeometry) {
      return;
    }

    textObject.originalTargetGeometry = textObject.targetMesh.geometry.clone();
    textObject.originalTargetMaterial = Array.isArray(textObject.targetMesh.material)
      ? textObject.targetMesh.material[0]
      : textObject.targetMesh.material;
  }

  /**
   * 统一重建目标模型的预览几何。
   *
   * 这里隐藏了“对每个文字循环做一次布尔减法”的实现细节。
   * 对 manager 来说，它看到的只是“根据当前雕刻文字集合重新生成预览态”。
   */
  private async _rebuildPreview(options: RebuildPreviewOptions) {
    const {
      targetMesh,
      baseGeometry,
      referenceTextObject,
      sourceTextObjects,
      offsetCylinder,
      hideSourceMeshes = true,
    } = options;

    let currentGeometry = baseGeometry;
    try {
      for (const textObject of sourceTextObjects) {
        // 多文字雕刻的本质就是把“上一步布尔结果”继续作为下一步的宿主几何，
        // 按顺序把整条减法链重放一遍。
        const toolGeometry = this._createBooleanToolGeometry(textObject, {
          offsetCylinder,
        });

        try {
          const result = await this._options.booleanService.subtract(currentGeometry, toolGeometry, {
            ...this.buildSubtractEntityMetadata(textObject),
          });

          if (result?.geometry) {
            if (currentGeometry !== baseGeometry) {
              currentGeometry.dispose();
            }
            currentGeometry = result.geometry;
          }
        } finally {
          toolGeometry.dispose();
        }

        if (hideSourceMeshes) {
          textObject.mesh.visible = false;
        }
      }

      targetMesh.geometry.dispose();
      targetMesh.geometry = currentGeometry;
      this.updateMeshMaterials(targetMesh, referenceTextObject);
    } catch (error) {
      if (currentGeometry !== baseGeometry) {
        currentGeometry.dispose();
      }
      targetMesh.geometry.dispose();
      targetMesh.geometry = baseGeometry.clone();
      if (referenceTextObject.originalTargetMaterial) {
        targetMesh.material = referenceTextObject.originalTargetMaterial;
      }
      throw error;
    } finally {
      baseGeometry.dispose();
    }
  }

  /**
   * 把文字几何转换成可参与布尔运算的“工具几何”。
   *
   * 这里统一完成：
   * 1. 是否需要对圆柱文字向内扩展；
   * 2. 从世界坐标转换到目标模型局部坐标；
   * 3. 平面文字与圆柱文字的差异适配。
   */
  private _createBooleanToolGeometry(
    textObject: SurfaceTextObject,
    options: { offsetCylinder: boolean }
  ) {
    // worker 侧不理解场景树和控制器状态，
    // 所以这里要先把文字几何整理成“目标模型局部坐标系里的工具几何”。
    const geometry = textObject.geometry.clone();
    const isCylinderText = textObject.surfaceInfo?.surfaceType === 'cylinder';

    if (isCylinderText) {
      if (options.offsetCylinder && textObject.surfaceInfo?.cylinderInfo) {
        this._options.placement.offsetCylinderTextInward(
          geometry,
          textObject.surfaceInfo.cylinderInfo as CylinderInfo,
          (textObject.config.thickness as number) || 0.5
        );
      }

      const targetInverseMatrix = new THREE.Matrix4()
        .copy(textObject.targetMesh.matrixWorld)
        .invert();
      geometry.applyMatrix4(targetInverseMatrix);
      return geometry;
    }

    geometry.applyMatrix4(textObject.mesh.matrixWorld);
    const targetInverseMatrix = new THREE.Matrix4()
      .copy(textObject.targetMesh.matrixWorld)
      .invert();
    geometry.applyMatrix4(targetInverseMatrix);
    return geometry;
  }

  /**
   * 把布尔结果写回 three 对象，并补齐材质 metadata。
   */
  private _applyPreviewResult(
    targetMesh: THREE.Mesh,
    geometry: THREE.BufferGeometry,
    materials: THREE.Material[] | undefined,
    textObject: SurfaceTextObject
  ) {
    // 到这里说明布尔链已经完成，接下来只做结果回写：
    // 替换目标几何、补齐材质 metadata，并把雕刻文字自身隐藏。
    targetMesh.geometry.dispose();
    targetMesh.geometry = geometry;

    if (!materials || materials.length <= 1) {
      this.updateMeshMaterials(targetMesh, textObject);
      return;
    }

    const baseEntityKey = this.getEntityKeyFromMesh(targetMesh) || undefined;
    const baseColor = (textObject.originalTargetMaterial as ColorMaterial)?.color?.getHex?.() || 0x409eff;
    const engravedColor = this._buildEngravedColor(baseColor);

    (materials[0] as ColorMaterial)?.color?.setHex?.(baseColor);
    (materials[1] as ColorMaterial)?.color?.setHex?.(engravedColor);

    this._options.booleanService.annotateSubtractResultMaterials(materials, {
      targetObject: targetMesh,
      targetEntityKey: baseEntityKey,
      toolEntityKey: textObject.id,
      regionOwnerEntityId: textObject.id,
      compatibilityTextId: textObject.id,
      regionRole: 'engraved',
    });

    targetMesh.material = materials;
    textObject.engravedMaterial = materials[1];
  }

  /**
   * 生成雕刻区域的颜色。
   * 当前先保留旧策略：在宿主颜色基础上压暗，保证预览层级可见。
   */
  private _buildEngravedColor(baseColor: number) {
    const r = ((baseColor >> 16) & 0xff) * 0.4;
    const g = ((baseColor >> 8) & 0xff) * 0.4;
    const b = (baseColor & 0xff) * 0.4;
    return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
  }
}

export default SurfaceTextPreviewService;
