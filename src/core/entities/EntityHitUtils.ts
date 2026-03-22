import * as THREE from 'three';

type MaterialLike = THREE.Material & {
  userData?: Record<string, unknown>;
};

type ObjectLike = THREE.Object3D & {
  userData?: Record<string, unknown>;
};

export type EntityMaterialMetadata = {
  entityKey?: string;
  sourceEntityId?: string;
  regionOwnerEntityId?: string;
  regionRole?: string;
  textId?: string;
  materialIndex?: number;
  isEngravedText?: boolean;
};

type AnnotationOptions = {
  overwrite?: boolean;
};

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function annotateEntityMaterial(
  material: THREE.Material | null | undefined,
  metadata: EntityMaterialMetadata = {},
  options: AnnotationOptions = {}
) {
  if (!material) return material;

  const userData = (((material as MaterialLike).userData || {}) as Record<string, unknown>);
  const overwrite = options.overwrite === true;

  Object.entries(metadata).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (!overwrite && userData[key] !== undefined) return;
    userData[key] = value;
  });

  (material as MaterialLike).userData = userData;
  return material;
}

export function annotateEntityMaterials(
  material: THREE.Material | THREE.Material[] | null | undefined,
  metadata: EntityMaterialMetadata = {},
  options: AnnotationOptions = {}
) {
  if (!material) return material;
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((item) => annotateEntityMaterial(item, metadata, options));
  return material;
}

export function resolveEntityKeyFromMaterial(material: THREE.Material | null | undefined) {
  const userData = (material as MaterialLike | null | undefined)?.userData || {};
  return (
    readString(userData.entityKey) ||
    readString(userData.regionOwnerEntityId) ||
    readString(userData.sourceEntityId) ||
    readString(userData.textId)
  );
}

export function resolveEntityKeyFromObject(object: THREE.Object3D | null | undefined) {
  const userData = (object as ObjectLike | null | undefined)?.userData || {};
  return readString(userData.entityKey) || readString(userData.textId);
}

export function resolveMaterialIndexFromFace(
  geometry: THREE.BufferGeometry | null | undefined,
  faceIndex: number | null | undefined
) {
  if (!geometry || typeof faceIndex !== 'number' || !Number.isFinite(faceIndex)) {
    return 0;
  }

  const groups = geometry.groups || [];
  if (groups.length === 0) return 0;

  const triangleStart = faceIndex * 3;
  for (const group of groups) {
    const start = typeof group.start === 'number' ? group.start : 0;
    const count = typeof group.count === 'number' ? group.count : 0;
    if (triangleStart >= start && triangleStart < start + count) {
      return typeof group.materialIndex === 'number' ? group.materialIndex : 0;
    }
  }

  return 0;
}

export function resolveEntityKeyFromMeshHit(
  object: THREE.Object3D | null | undefined,
  faceIndex: number | null | undefined = null
) {
  const mesh = object as THREE.Mesh | null | undefined;
  if (mesh?.isMesh && mesh.material) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materialIndex = resolveMaterialIndexFromFace(mesh.geometry, faceIndex);
    const fromMaterial =
      resolveEntityKeyFromMaterial(materials[materialIndex]) ||
      resolveEntityKeyFromMaterial(materials[0]);
    if (fromMaterial) return fromMaterial;
  }

  return resolveEntityKeyFromObject(object);
}

