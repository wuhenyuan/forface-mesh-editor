import * as THREE from 'three';
import type {
  SerializedAttributeData,
  SerializedBox3,
  SerializedGeometryData,
  SerializedMaterialData,
  SerializedMeshData,
  SerializedTextureFile,
  TypedArrayName,
  TypedArrayValue,
} from './types';

type TypedArrayConstructor = {
  new (buffer: ArrayBufferLike): TypedArrayValue;
  new (arrayLike: ArrayLike<number>): TypedArrayValue;
};

const TYPED_ARRAY_CTORS: Record<TypedArrayName, TypedArrayConstructor> = {
  Float32Array,
  Float64Array,
  Uint32Array,
  Int32Array,
  Uint16Array,
  Int16Array,
  Uint8Array,
  Int8Array,
  Uint8ClampedArray,
};

export function getTypedArrayName(array: ArrayLike<number>): TypedArrayName {
  if (array instanceof Float32Array) return 'Float32Array';
  if (array instanceof Float64Array) return 'Float64Array';
  if (array instanceof Uint32Array) return 'Uint32Array';
  if (array instanceof Int32Array) return 'Int32Array';
  if (array instanceof Uint16Array) return 'Uint16Array';
  if (array instanceof Int16Array) return 'Int16Array';
  if (array instanceof Uint8Array) return 'Uint8Array';
  if (array instanceof Int8Array) return 'Int8Array';
  if (array instanceof Uint8ClampedArray) return 'Uint8ClampedArray';
  throw new Error('Unsupported typed array');
}

export function cloneTypedArray<T extends TypedArrayValue>(array: T): T {
  const Ctor = array.constructor as {
    new (source: ArrayLike<number>): T;
  };
  return new Ctor(array);
}

export function serializeBufferAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
): SerializedAttributeData {
  return {
    type: getTypedArrayName(attribute.array),
    array: cloneTypedArray(attribute.array as TypedArrayValue),
    itemSize: attribute.itemSize,
    normalized: !!attribute.normalized,
  };
}

export function hydrateBufferAttribute(attribute: SerializedAttributeData): THREE.BufferAttribute {
  const Ctor = TYPED_ARRAY_CTORS[attribute.type];
  const array = new Ctor(attribute.array);
  return new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized);
}

export function serializeBox3(box: THREE.Box3 | null | undefined): SerializedBox3 | null {
  if (!box) return null;
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}

export function hydrateBox3(box: SerializedBox3 | null | undefined): THREE.Box3 | null {
  if (!box) return null;
  return new THREE.Box3(
    new THREE.Vector3(box.min[0], box.min[1], box.min[2]),
    new THREE.Vector3(box.max[0], box.max[1], box.max[2])
  );
}

export function serializeBufferGeometry(geometry: THREE.BufferGeometry): SerializedGeometryData {
  const clone = geometry.clone();
  if (!clone.boundingBox) {
    clone.computeBoundingBox();
  }

  const attributes: SerializedGeometryData['attributes'] = {};
  for (const [name, attribute] of Object.entries(clone.attributes)) {
    attributes[name] = serializeBufferAttribute(attribute as THREE.BufferAttribute);
  }

  const serialized: SerializedGeometryData = {
    attributes,
    index: clone.index ? serializeBufferAttribute(clone.index) : null,
    groups: Array.isArray(clone.groups)
      ? clone.groups.map((group) => ({
          start: group.start,
          count: group.count,
          materialIndex: group.materialIndex || 0,
        }))
      : [],
    boundingBox: serializeBox3(clone.boundingBox),
  };

  clone.dispose();
  return serialized;
}

export function hydrateBufferGeometry(serialized: SerializedGeometryData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();

  for (const [name, attribute] of Object.entries(serialized.attributes || {})) {
    if (!attribute) continue;
    geometry.setAttribute(name, hydrateBufferAttribute(attribute));
  }

  if (serialized.index) {
    geometry.setIndex(hydrateBufferAttribute(serialized.index));
  }

  geometry.clearGroups();
  (serialized.groups || []).forEach((group) => {
    geometry.addGroup(group.start, group.count, group.materialIndex || 0);
  });

  const box = hydrateBox3(serialized.boundingBox);
  if (box) {
    geometry.boundingBox = box;
  } else {
    geometry.computeBoundingBox();
  }

  return geometry;
}

export function serializeMatrix4(matrix: THREE.Matrix4 | null | undefined): Float32Array {
  const next = new Float32Array(16);
  if (matrix) {
    next.set(matrix.elements);
  } else {
    next.set(new THREE.Matrix4().elements);
  }
  return next;
}

export function hydrateMatrix4(matrix: Float32Array | ArrayLike<number> | null | undefined) {
  const next = new THREE.Matrix4();
  if (!matrix) {
    return next;
  }
  next.fromArray(Array.from(matrix));
  return next;
}

export function serializeMaterialDescriptor(
  material: THREE.Material | null | undefined
): SerializedMaterialData {
  const typed = material as THREE.Material & {
    color?: THREE.Color;
    roughness?: number;
    metalness?: number;
    opacity?: number;
    transparent?: boolean;
    emissive?: THREE.Color;
    map?: THREE.Texture;
    normalMap?: THREE.Texture;
    roughnessMap?: THREE.Texture;
    metalnessMap?: THREE.Texture;
    aoMap?: THREE.Texture;
    emissiveMap?: THREE.Texture;
  };

  return {
    id: material?.uuid || `material_${Math.random().toString(36).slice(2, 10)}`,
    name:
      material?.name ||
      (material?.uuid ? `material_${material.uuid.substring(0, 8)}` : 'material_default'),
    color: typed?.color?.getHex?.(),
    roughness: typeof typed?.roughness === 'number' ? typed.roughness : undefined,
    metalness: typeof typed?.metalness === 'number' ? typed.metalness : undefined,
    opacity: typeof typed?.opacity === 'number' ? typed.opacity : undefined,
    transparent: typeof typed?.transparent === 'boolean' ? typed.transparent : undefined,
    emissive: typed?.emissive?.getHex?.(),
    mapName: typed?.map ? resolveTextureName(typed.map, 'map') : undefined,
    normalMapName: typed?.normalMap ? resolveTextureName(typed.normalMap, 'normalMap') : undefined,
    roughnessMapName: typed?.roughnessMap
      ? resolveTextureName(typed.roughnessMap, 'roughnessMap')
      : undefined,
    metalnessMapName: typed?.metalnessMap
      ? resolveTextureName(typed.metalnessMap, 'metalnessMap')
      : undefined,
    aoMapName: typed?.aoMap ? resolveTextureName(typed.aoMap, 'aoMap') : undefined,
    emissiveMapName: typed?.emissiveMap
      ? resolveTextureName(typed.emissiveMap, 'emissiveMap')
      : undefined,
  };
}

export function hydrateMaterialDescriptor(material: SerializedMaterialData): THREE.Material {
  const next = new THREE.MeshStandardMaterial({
    color: typeof material.color === 'number' ? material.color : 0xffffff,
    roughness: typeof material.roughness === 'number' ? material.roughness : 0.6,
    metalness: typeof material.metalness === 'number' ? material.metalness : 0,
    opacity: typeof material.opacity === 'number' ? material.opacity : 1,
    transparent: !!material.transparent,
    emissive: typeof material.emissive === 'number' ? material.emissive : 0x000000,
  });
  next.name = material.name || `material_${material.id.slice(0, 8)}`;
  return next;
}

export function collectGeometryTransferables(
  geometry: SerializedGeometryData,
  transferables: Transferable[] = []
) {
  Object.values(geometry.attributes || {}).forEach((attribute) => {
    if (!attribute) return;
    transferables.push(attribute.array.buffer);
  });
  if (geometry.index) {
    transferables.push(geometry.index.array.buffer);
  }
  return transferables;
}

export function collectMeshTransferables(
  mesh: SerializedMeshData,
  transferables: Transferable[] = []
) {
  collectGeometryTransferables(mesh.geometry, transferables);
  transferables.push(mesh.matrixWorld.buffer);
  return transferables;
}

export function collectTextureTransferables(
  textureFiles: SerializedTextureFile[],
  transferables: Transferable[] = []
) {
  textureFiles.forEach((texture) => {
    transferables.push(texture.buffer);
  });
  return transferables;
}

export function resolveTextureName(texture: THREE.Texture, propName: string) {
  if (texture.name) {
    const dot = texture.name.lastIndexOf('.');
    return dot > 0 ? `${texture.name.slice(0, dot)}.jpg` : `${texture.name}.jpg`;
  }
  return `${propName}_${texture.uuid.substring(0, 8)}.jpg`;
}
