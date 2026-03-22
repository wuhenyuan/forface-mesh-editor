import * as THREE from 'three';
import { resolveEntityKeyFromMeshHit, resolveEntityKeyFromObject } from './EntityHitUtils';

type RaycastIntersectionLike = {
  object?: THREE.Object3D | null;
  faceIndex?: number;
};

/**
 * 从一次 three 命中结果中提取实体主键。
 *
 * 解析顺序遵循统一规则：
 * 1. 优先读取 mesh/material group 上的 entityKey；
 * 2. 如果没有分组 metadata，再退回对象本身的 entityKey。
 *
 * 这样“点到布尔后的多材质区域”和“点到普通实体对象”
 * 都会走同一条实体命中链。
 */
export function resolveEntityKeyFromIntersection(
  intersection: RaycastIntersectionLike | null | undefined
) {
  const object = intersection?.object || null;
  if (!object) {
    return null;
  }

  const hitEntityKey = resolveEntityKeyFromMeshHit(object as THREE.Mesh, intersection?.faceIndex);
  if (typeof hitEntityKey === 'string' && hitEntityKey.length > 0) {
    return hitEntityKey;
  }

  return resolveEntityKeyFromObject(object);
}

/**
 * 根据实体主键，从可选对象集合中找到真正应该被选中的 EntityObject。
 *
 * 这里会同时检查 selectable object 自身和其子节点，
 * 以支持“根对象可选，但命中的是子 mesh”的场景。
 */
export function findSelectableObjectByEntityKey(
  selectableObjects: THREE.Object3D[],
  entityKey: string | null | undefined
) {
  if (typeof entityKey !== 'string' || !entityKey) {
    return null;
  }

  return (
    selectableObjects.find((object) => {
      if (resolveEntityKeyFromObject(object) === entityKey) {
        return true;
      }

      let matched = false;
      object.traverse?.((child: THREE.Object3D) => {
        if (matched) return;
        if (resolveEntityKeyFromObject(child) === entityKey) {
          matched = true;
        }
      });

      return matched;
    }) || null
  );
}

/**
 * 按旧规则从命中对象向上回溯到可选根节点。
 *
 * 这是实体主键解析失败时的保底行为，
 * 目的是兼容尚未补齐 entity metadata 的旧对象。
 */
export function findSelectableRoot(
  object: THREE.Object3D | null | undefined,
  selectableObjects: THREE.Object3D[]
) {
  let targetObject = object || null;
  while (targetObject?.parent && !selectableObjects.includes(targetObject)) {
    targetObject = targetObject.parent;
  }

  return targetObject && selectableObjects.includes(targetObject) ? targetObject : null;
}

/**
 * 从一次命中结果中直接解析出最终应选中的对象。
 *
 * 这层函数把“实体主键命中优先，场景树回溯兜底”的规则固定下来，
 * 避免不同选择器再各自维护一套近似实现。
 */
export function resolveSelectableObjectFromIntersection(
  intersection: RaycastIntersectionLike | null | undefined,
  selectableObjects: THREE.Object3D[]
) {
  const entityKey = resolveEntityKeyFromIntersection(intersection);
  if (entityKey) {
    const entityObject = findSelectableObjectByEntityKey(selectableObjects, entityKey);
    if (entityObject) {
      return entityObject;
    }
  }

  return findSelectableRoot(intersection?.object || null, selectableObjects);
}
