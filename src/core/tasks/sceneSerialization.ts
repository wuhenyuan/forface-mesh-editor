import * as THREE from 'three';
import type {
  BooleanOperationType,
  SerializedBooleanSource,
  SerializedMeshData,
  SerializedTextureFile,
} from './types';
import {
  collectMeshTransferables,
  collectTextureTransferables,
  resolveTextureName,
  serializeBufferGeometry,
  serializeMaterialDescriptor,
  serializeMatrix4,
} from './serialization';

type TextureCarrierMaterial = THREE.Material & {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
  aoMap?: THREE.Texture;
  emissiveMap?: THREE.Texture;
};

export async function serializeTextureFilesFromObject(root: THREE.Object3D) {
  const files = new Map<string, SerializedTextureFile>();
  const seen = new Set<string>();
  const pending: Promise<void>[] = [];

  const trackTexture = async (texture: THREE.Texture | null | undefined, propName: string) => {
    if (!texture?.image) return;
    const name = resolveTextureName(texture, propName);
    if (seen.has(name)) return;
    seen.add(name);
    const blob = await textureToBlob(texture);
    if (!blob) return;
    files.set(name, {
      name,
      type: blob.type || 'image/jpeg',
      size: blob.size,
      buffer: await blob.arrayBuffer(),
    });
  };

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      const typed = material as TextureCarrierMaterial;
      pending.push(trackTexture(typed.map, 'map'));
      pending.push(trackTexture(typed.normalMap, 'normalMap'));
      pending.push(trackTexture(typed.roughnessMap, 'roughnessMap'));
      pending.push(trackTexture(typed.metalnessMap, 'metalnessMap'));
      pending.push(trackTexture(typed.aoMap, 'aoMap'));
      pending.push(trackTexture(typed.emissiveMap, 'emissiveMap'));
    });
  });

  await Promise.all(pending);
  return Array.from(files.values());
}

export function serializeMeshForWorker(mesh: THREE.Mesh): SerializedMeshData | null {
  if (!mesh?.isMesh || !mesh.geometry) return null;
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  return {
    id: mesh.uuid,
    name: mesh.name || mesh.uuid,
    geometry: serializeBufferGeometry(geometry),
    matrixWorld: serializeMatrix4(mesh.matrixWorld),
    materials: materials.filter(Boolean).map((material) => serializeMaterialDescriptor(material)),
  };
}

export function serializeObjectTreeToMeshes(
  objects: THREE.Object3D | THREE.Object3D[]
): SerializedMeshData[] {
  const meshes: SerializedMeshData[] = [];
  const sourceObjects = Array.isArray(objects) ? objects : [objects];

  sourceObjects.forEach((object) => {
    object?.updateMatrixWorld?.(true);
    object?.traverse?.((child: THREE.Object3D) => {
      const mesh = child as THREE.Mesh;
      if (!mesh?.isMesh || !mesh.visible || !mesh.geometry) return;
      const serialized = serializeMeshForWorker(mesh);
      if (serialized) {
        meshes.push(serialized);
      }
    });
  });

  return meshes;
}

export function collectMeshPayloadTransferables(meshes: SerializedMeshData[]) {
  const transferables: Transferable[] = [];
  meshes.forEach((mesh) => {
    collectMeshTransferables(mesh, transferables);
  });
  return transferables;
}

export function collectExportPayloadTransferables(
  meshes: SerializedMeshData[],
  textureFiles: SerializedTextureFile[]
) {
  const transferables = collectMeshPayloadTransferables(meshes);
  collectTextureTransferables(textureFiles, transferables);
  return transferables;
}

export function serializeBinaryBooleanSources(
  geometryA: THREE.BufferGeometry,
  geometryB: THREE.BufferGeometry,
  operation: BooleanOperationType,
  options: {
    sourceAId?: string | null;
    sourceBId?: string | null;
    sourceAVersion?: string | number;
    sourceBVersion?: string | number;
    sourceACacheKey?: string;
    sourceBCacheKey?: string;
    matrixA?: THREE.Matrix4 | null;
    matrixB?: THREE.Matrix4 | null;
    materialsA?: THREE.Material[];
    materialsB?: THREE.Material[];
  } = {}
): SerializedBooleanSource[] {
  return [
    {
      id: options.sourceAId || 'boolean_source_a',
      version: options.sourceAVersion,
      cacheKey: options.sourceACacheKey,
      op: 'union',
      geometry: serializeBufferGeometry(geometryA),
      matrixWorld: options.matrixA ? serializeMatrix4(options.matrixA) : null,
      materials: (options.materialsA || []).map((material) => serializeMaterialDescriptor(material)),
    },
    {
      id: options.sourceBId || 'boolean_source_b',
      version: options.sourceBVersion,
      cacheKey: options.sourceBCacheKey,
      op: operation,
      geometry: serializeBufferGeometry(geometryB),
      matrixWorld: options.matrixB ? serializeMatrix4(options.matrixB) : null,
      materials: (options.materialsB || []).map((material) => serializeMaterialDescriptor(material)),
    },
  ];
}

export function collectBooleanSourceTransferables(sources: SerializedBooleanSource[]) {
  const transferables: Transferable[] = [];
  sources.forEach((source) => {
    if (source.geometry) {
      collectMeshTransferables(
        {
          id: source.id,
          name: source.id,
          geometry: source.geometry,
          matrixWorld: source.matrixWorld || new Float32Array(16),
          materials: [],
        },
        transferables
      );
      return;
    }

    (source.meshes || []).forEach((mesh) => {
      collectMeshTransferables(mesh, transferables);
    });
  });
  return transferables;
}

export function serializeObjectSourceForBoolean(
  id: string,
  object: THREE.Object3D,
  op: BooleanOperationType,
  options: {
    version?: string | number;
    cacheKey?: string;
  } = {}
): SerializedBooleanSource | null {
  const meshes = serializeObjectTreeToMeshes(object);
  if (meshes.length === 0) return null;
  return {
    id,
    version: options.version,
    cacheKey: options.cacheKey,
    op,
    meshes,
  };
}

async function textureToBlob(texture: THREE.Texture): Promise<Blob | null> {
  const image = texture.image;
  if (!image) return null;

  try {
    const canvas = document.createElement('canvas');
    const width =
      typeof image === 'object' && image && 'width' in image && typeof image.width === 'number'
        ? image.width
        : 256;
    const height =
      typeof image === 'object' && image && 'height' in image && typeof image.height === 'number'
        ? image.height
        : 256;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(image as CanvasImageSource, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/jpeg', 0.92);
    });

    return blob;
  } catch (error) {
    console.warn('Texture export failed:', error);
    return null;
  }
}
