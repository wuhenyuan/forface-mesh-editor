import * as THREE from 'three';
import { resolveEntityKeyFromIntersection } from '../../entities/EntityHitResolver';
import { resolveEntityKeyFromMaterial } from '../../entities/EntityHitUtils';
import type { SurfaceTextObject } from './types';

type SurfaceTextHitResolverOptions = {
  /**
   * 文字运行时对象表。
   * 命中解析只关心“这个 id 是否真的是文字实体”，
   * 因此通过 Map 做一次最终校验，避免把普通模型的 entityKey 误判成文字。
   */
  textObjects: Map<string, SurfaceTextObject>;

  /**
   * 目标模型与文字的关系表。
   * 这是旧链路的兜底信息，当材质分组没有保留足够 metadata 时，
   * 仍然可以通过目标网格找到可能关联的文字集合。
   */
  meshTextMap: Map<string, Set<string>>;
};

/**
 * 负责把“点击命中了哪一块 three 几何”解析为“命中了哪个文字实体”。
 *
 * 这个模块只做一件事：命中识别。
 * 它不关心选中、不关心 UI、不关心布尔重算，
 * 只负责把 raycast 命中的 mesh / faceIndex 还原成文字实体 id。
 */
export class SurfaceTextHitResolver {
  private _options: SurfaceTextHitResolverOptions;

  constructor(options: SurfaceTextHitResolverOptions) {
    this._options = options;
  }

  /**
   * 命中解析主入口。
   *
   * 解析顺序遵循“越通用越优先”的原则：
   * 1. 先走材质 / group 上的 entityKey；
   * 2. 再走材质分组的文字区段；
   * 3. 最后才退回旧的 mesh -> textId 关系表和边界框兜底。
   */
  resolveTextEntityIdFromHit(
    mesh: THREE.Mesh,
    point: THREE.Vector3,
    _face: unknown,
    faceIndex: number | undefined
  ) {
    const hitEntityId = resolveEntityKeyFromIntersection({
      object: mesh,
      faceIndex,
    });
    if (this._isManagedTextId(hitEntityId)) {
      return hitEntityId;
    }

    const materialTextId = this.resolveTextEntityIdFromMaterialGroups(mesh, faceIndex);
    if (materialTextId) {
      return materialTextId;
    }

    return this.findTextIdFromEngravedMesh(mesh, point, faceIndex);
  }

  /**
   * 从多材质 group 中反解文字实体。
   *
   * 这一步是“统一命中链”的关键：
   * 不再把雕刻文字当成 SurfaceText 私有数据，
   * 而是把材质上的 entityKey 视为实体来源信息。
   */
  resolveTextEntityIdFromMaterialGroups(mesh: THREE.Mesh, faceIndex: number | undefined) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = mesh.geometry?.groups || [];
    if (groups.length === 0 || faceIndex === undefined || faceIndex === null) {
      return null;
    }

    const vertexIndex = faceIndex * 3;
    for (const group of groups) {
      if (vertexIndex < group.start || vertexIndex >= group.start + group.count) {
        continue;
      }

      const textId = resolveEntityKeyFromMaterial(materials[group.materialIndex]);
      if (this._isManagedTextId(textId)) {
        return textId;
      }
      break;
    }

    return null;
  }

  /**
   * 旧链路兜底逻辑。
   *
   * 当布尔结果的材质信息还不够完备时，
   * 通过 mesh -> textId 的关联表和文字边界框做最后一次命中尝试，
   * 以保持现有功能稳定。
   */
  findTextIdFromEngravedMesh(
    mesh: THREE.Mesh,
    point: THREE.Vector3,
    faceIndex: number | undefined
  ) {
    const resolvedEntityId = resolveEntityKeyFromIntersection({
      object: mesh,
      faceIndex,
    });
    if (this._isManagedTextId(resolvedEntityId)) {
      return resolvedEntityId;
    }

    const textIds = this._options.meshTextMap.get(mesh.uuid);
    const mappedTextIds = textIds || new Set<string>();

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = mesh.geometry?.groups || [];

    if (groups.length > 0 && faceIndex !== undefined) {
      const vertexIndex = faceIndex * 3;
      for (const group of groups) {
        if (vertexIndex < group.start || vertexIndex >= group.start + group.count) {
          continue;
        }

        const textId = resolveEntityKeyFromMaterial(materials[group.materialIndex]);
        if (this._isManagedTextId(textId)) {
          return textId;
        }
        break;
      }
    }

    for (const textId of mappedTextIds) {
      const textObject = this._options.textObjects.get(textId);
      if (!textObject || textObject.mode !== 'engraved') continue;

      const textBounds = new THREE.Box3();
      textObject.geometry.computeBoundingBox();
      textBounds.copy(textObject.geometry.boundingBox as THREE.Box3);
      textBounds.applyMatrix4(textObject.mesh.matrixWorld);

      // 保留少量容错，避免用户点击雕刻区域边缘时完全落空。
      textBounds.expandByScalar(0.5);

      if (textBounds.containsPoint(point)) {
        return textId;
      }
    }

    return null;
  }

  private _isManagedTextId(textId: string | null | undefined): textId is string {
    return typeof textId === 'string' && textId.length > 0 && this._options.textObjects.has(textId);
  }
}

export default SurfaceTextHitResolver;
