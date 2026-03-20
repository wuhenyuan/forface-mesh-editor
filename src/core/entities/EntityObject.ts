import * as THREE from 'three';

export type EntityTransform = {
  position?: number[];
  rotation?: number[];
  scale?: number[];
};

export type ResolveTransformOptions = {
  baseTransform?: EntityTransform | null;
  patch?: Record<string, any> | null;
  entity?: EntityLike | null;
};

export type EntityLike = {
  id?: string;
  position?: number[];
  rotation?: number[];
  scale?: number[];
  color?: string | number;
  boolean?: unknown;
  content?: string;
  resource?: unknown;
  size?: unknown;
  depth?: unknown;
  direction?: unknown;
  letterSpacing?: unknown;
  curvingStrength?: unknown;
  startAngle?: unknown;
  textType?: unknown;
  [key: string]: unknown;
};

type ColorMaterial = THREE.Material & {
  color?: THREE.Color;
  needsUpdate?: boolean;
};

export class EntityObject extends THREE.Object3D {
  entityId: string;
  entity: EntityLike | null;
  node: THREE.Object3D | null;

  constructor(entityId: string, entity: EntityLike | null = null) {
    super();

    this.entityId = entityId;
    this.entity = entity;
    this.node = null;
    this.name = `EntityObject:${entityId}`;

    this.userData = {
      ...(this.userData || {}),
      entityKey: entityId,
      isEntityObject: true,
    };
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
    loadModel: (source: unknown, options?: Record<string, any>) => Promise<Record<string, any>>,
    source: unknown,
    options: Record<string, any> = {}
  ) {
    const result = await loadModel(source, options);
    const model = result?.model as THREE.Object3D | undefined;
    if (model) {
      this.attachNode(model);
    }
    return result;
  }

  attachNode(node?: THREE.Object3D | null) {
    if (this.node && this.node.parent === this) {
      this.remove(this.node);
    }
    this.node = node || null;
    if (this.node) {
      this.add(this.node);
    }
    this._syncEntityKey();
    return this.node;
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
  }

  getTransformFromPatch(patch?: Record<string, any> | null): EntityTransform | null {
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

    if (node.parent === this) {
      this.remove(node);
    }
    this.node = null;
    this.updateMatrixWorld(true);
  }

  private _syncEntityKey() {
    const key = this.entityId;
    this.userData = {
      ...(this.userData || {}),
      entityKey: key,
      isEntityObject: true,
    };
    this.traverse((object: THREE.Object3D) => {
      object.userData = object.userData || {};
      object.userData.entityKey = key;
    });
  }
}

export default EntityObject;
