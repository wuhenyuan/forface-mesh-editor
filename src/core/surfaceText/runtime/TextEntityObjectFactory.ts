import type * as THREE from 'three';
import TextEntityObject from '../../entities/TextEntityObject';

export function createTextEntityObject(textId: string, mesh: THREE.Object3D) {
  const entityObject = new TextEntityObject(textId, {
    id: textId,
    type: 'text',
  });

  entityObject.userData = {
    ...(entityObject.userData || {}),
    isTextObject: true,
    isText: true,
    textId,
    type: 'text',
  };

  // 文字的实体对象负责真实 transform；mesh 作为内容节点保持本地 TRS 干净。
  entityObject.position.copy(mesh.position);
  entityObject.quaternion.copy(mesh.quaternion);
  entityObject.scale.copy(mesh.scale);

  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);

  entityObject.attachNode(mesh);
  entityObject.updateMatrixWorld(true);
  entityObject.markBoxDirty?.();
  entityObject.refreshWorldBox?.(true);

  return entityObject;
}

export default createTextEntityObject;
