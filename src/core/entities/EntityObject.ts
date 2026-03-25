import * as THREE from 'three';
import { annotateEntityMaterials } from './EntityHitUtils';

export type EntityTransform = {
  position?: number[];
  rotation?: number[];
  scale?: number[];
};

export type ResolveTransformOptions = {
  baseTransform?: EntityTransform | null;
  patch?: Record<string, CoreValue> | null;
  entity?: EntityLike | null;
};

export type EntityLike = {
  id?: string;
  position?: number[];
  rotation?: number[];
  scale?: number[];
  color?: string | number;
  boolean?: CoreValue;
  content?: string;
  resource?: CoreValue;
  size?: CoreValue;
  depth?: CoreValue;
  direction?: CoreValue;
  letterSpacing?: CoreValue;
  curvingStrength?: CoreValue;
  startAngle?: CoreValue;
  textType?: CoreValue;
  [key: string]: CoreValue;
};

type ColorMaterial = THREE.Material & {
  color?: THREE.Color;
  needsUpdate?: boolean;
};

type GeometryObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
};

function expandWorldBoxFromObject(
  object: THREE.Object3D | null | undefined,
  target: THREE.Box3,
  tmpBox: THREE.Box3
) {
  if (!object || object.userData?.isHelper) {
    return target;
  }

  object.updateMatrixWorld(true);

  const geometry = (object as GeometryObject).geometry;
  if (geometry) {
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (geometry.boundingBox) {
      target.union(tmpBox.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld));
    }
  }

  object.children.forEach((child) => {
    expandWorldBoxFromObject(child, target, tmpBox);
  });

  return target;
}

function containsHelperObject(object: THREE.Object3D | null | undefined): boolean {
  if (!object) return false;
  if (object.userData?.isHelper) return true;
  return object.children.some((child) => containsHelperObject(child));
}

export class EntityObject extends THREE.Group {
  entityId: string;
  entity: EntityLike | null;
  contentGroup: THREE.Group;
  node: THREE.Object3D | null;
  worldBox: THREE.Box3;
  worldBoxDirty: boolean;

  private _tmpWorldBox: THREE.Box3;

  constructor(entityId: string, entity: EntityLike | null = null) {
    super();

    this.entityId = entityId;
    this.entity = entity;
    this.node = null;
    this.worldBox = new THREE.Box3();
    this.worldBoxDirty = true;
    this._tmpWorldBox = new THREE.Box3();
    this.name = `EntityObject:${entityId}`;

    this.userData = {
      ...(this.userData || {}),
      entityKey: entityId,
      isEntityObject: true,
    };

    this.contentGroup = new THREE.Group();
    this.contentGroup.name = `EntityContent:${entityId}`;
    this.contentGroup.userData = {
      ...(this.contentGroup.userData || {}),
      entityKey: entityId,
      isEntityContentGroup: true,
    };
    this.add(this.contentGroup);

    this._syncEntityKey();
  }

  setEntity(entity: EntityLike | null) {
    if (entity) {
      this.entity = entity;
      if (typeof entity.id === 'string' && entity.id) {
        this.entityId = entity.id;
      }
    }
    this._syncEntityKey();
    return this;
  }

  async loadNode(
    loadModel: (
      source: CoreValue,
      options?: Record<string, CoreValue>
    ) => Promise<Record<string, CoreValue>>,
    source: CoreValue,
    options: Record<string, CoreValue> = {}
  ) {
    const result = await loadModel(source, options);
    const model = result?.model as THREE.Object3D | undefined;
    if (model) {
      this.attachNode(model);
    }
    return result;
  }

  attachNode(node?: THREE.Object3D | null) {
    if (this.node?.parent === this.contentGroup) {
      this.contentGroup.remove(this.node);
    }

    this.node = node || null;
    if (this.node) {
      this.contentGroup.add(this.node);
    }

    this.markBoxDirty();
    this._syncEntityKey();
    return this.node;
  }

  resetContentOffset() {
    this.contentGroup.position.set(0, 0, 0);
    this.contentGroup.quaternion.identity();
    this.contentGroup.scale.set(1, 1, 1);
    this.contentGroup.updateMatrixWorld(true);
    this.markBoxDirty();
    return this.contentGroup;
  }

  centerContentAtOrigin() {
    const boxSource = this.getWorldBoxSource();
    if (!boxSource) return null;

    this.resetContentOffset();
    this.updateMatrixWorld(true);

    const contentBox = this._computeContentWorldBox(new THREE.Box3());
    if (contentBox.isEmpty()) {
      return null;
    }

    const worldCenter = contentBox.getCenter(new THREE.Vector3());
    const localCenter = this.worldToLocal(worldCenter.clone());
    this.contentGroup.position.sub(localCenter);
    this.contentGroup.updateMatrixWorld(true);
    this.markBoxDirty();
    this.refreshWorldBox(true);
    return localCenter;
  }

  getWorldBoxSource() {
    return this.contentGroup || this.node || null;
  }

  applyTransform(transform?: EntityTransform | null) {
    if (!transform) return;

    const { position, rotation, scale } = transform;
    if (Array.isArray(position)) {
      const [x = 0, y = 0, z = 0] = position;
      this.position.set(x, y, z);
    }
    if (Array.isArray(rotation)) {
      const [x = 0, y = 0, z = 0] = rotation;
      this.rotation.set(x, y, z);
    }
    if (Array.isArray(scale)) {
      const [x = 1, y = 1, z = 1] = scale;
      this.scale.set(x, y, z);
    }

    this.updateMatrixWorld(true);
    this.markBoxDirty();
  }

  markBoxDirty() {
    this.worldBoxDirty = true;
  }

  refreshWorldBox(force = false) {
    if (!force && !this.worldBoxDirty) {
      return this.worldBox;
    }

    this.updateMatrixWorld(true);
    this.worldBox.makeEmpty();
    this._computeContentWorldBox(this.worldBox);
    this.worldBoxDirty = false;
    return this.worldBox;
  }

  getWorldBox(force = false) {
    return this.refreshWorldBox(force);
  }

  getTransformFromPatch(patch?: Record<string, CoreValue> | null): EntityTransform | null {
    if (!patch) return null;
    if (patch.transform && typeof patch.transform === 'object') {
      return patch.transform as EntityTransform;
    }

    const transform: EntityTransform = {};
    if (patch.position) transform.position = patch.position;
    if (patch.rotation) transform.rotation = patch.rotation;
    if (patch.scale) transform.scale = patch.scale;

    return Object.keys(transform).length > 0 ? transform : null;
  }

  getTransformFromEntity(entity?: EntityLike | null): EntityTransform | null {
    if (!entity) return null;

    const transform: EntityTransform = {};
    if (entity.position) transform.position = entity.position;
    if (entity.rotation) transform.rotation = entity.rotation;
    if (entity.scale) transform.scale = entity.scale;

    return Object.keys(transform).length > 0 ? transform : null;
  }

  resolveNextTransform(options: ResolveTransformOptions = {}): EntityTransform | null {
    const { baseTransform, patch, entity } = options;
    const sourceEntity = entity || this.entity;
    const base = baseTransform || this.getTransformFromEntity(sourceEntity);
    const patchTransform = this.getTransformFromPatch(patch);
    if (!patchTransform) return base;
    return { ...(base || {}), ...patchTransform };
  }

  applyTransformPatch(options: ResolveTransformOptions = {}): EntityTransform | null {
    const next = this.resolveNextTransform(options);
    if (next) {
      this.applyTransform(next);
    }
    return next;
  }

  applyColor(color: string | number) {
    if (color === undefined || color === null) return;
    const nextColor = new THREE.Color(color);

    this.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        const colorMaterial = material as ColorMaterial;
        if (colorMaterial.color) {
          colorMaterial.color.set(nextColor);
          colorMaterial.needsUpdate = true;
        }
      });
    });
  }

  disposeNode() {
    const node = this.node;
    if (!node) return;

    node.traverse((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose?.();
      if (!mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material?.dispose?.());
    });

    if (node.parent === this.contentGroup) {
      this.contentGroup.remove(node);
    }
    this.node = null;
    this.updateMatrixWorld(true);
    this.markBoxDirty();
  }

  private _syncEntityKey() {
    const key = this.entityId;
    this.userData = {
      ...(this.userData || {}),
      entityKey: key,
      isEntityObject: true,
    };

    this.contentGroup.userData = {
      ...(this.contentGroup.userData || {}),
      entityKey: key,
      isEntityContentGroup: true,
    };

    this.traverse((object: THREE.Object3D) => {
      object.userData = object.userData || {};
      object.userData.entityKey = key;
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      annotateEntityMaterials(
        mesh.material,
        {
          entityKey: key,
          sourceEntityId: key,
        },
        { overwrite: false }
      );
    });
  }

  private _computeContentWorldBox(target: THREE.Box3) {
    target.makeEmpty();

    const boxSource = this.getWorldBoxSource();
    if (!boxSource) {
      return target;
    }

    if (containsHelperObject(boxSource)) {
      expandWorldBoxFromObject(boxSource, target, this._tmpWorldBox);
      return target;
    }

    return target.setFromObject(boxSource);
  }
}

export default EntityObject;
