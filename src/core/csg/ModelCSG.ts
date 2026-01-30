import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Brush } from 'three-bvh-csg';

export type ModelBooleanOp = 'union' | 'subtract' | 'intersect' | 'difference';

export function normalizeModelBooleanOp(value: unknown): ModelBooleanOp | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  switch (normalized) {
    case 'union':
    case 'add':
    case 'addition':
    case 'merge':
      return 'union';
    case 'substract': // common typo
    case 'subtract':
    case 'subtraction':
    case 'minus':
      return 'subtract';
    case 'intersect':
    case 'intersection':
      return 'intersect';
    case 'difference':
    case 'diff':
    case 'xor':
      return 'difference';
    default:
      return null;
  }
}

function sliceBufferAttribute(
  attribute: THREE.BufferAttribute,
  start: number,
  count: number
): THREE.BufferAttribute {
  const itemSize = attribute.itemSize;
  const begin = start * itemSize;
  const end = (start + count) * itemSize;
  const array = (attribute.array as any).slice(begin, end);
  return new THREE.BufferAttribute(array, itemSize, attribute.normalized);
}

function ensureAttribute(
  geometry: THREE.BufferGeometry,
  name: 'uv',
  itemSize: number,
  vertexCount: number
) {
  if (geometry.getAttribute(name)) return;
  geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(vertexCount * itemSize), itemSize));
}

function buildSubGeometriesFromMesh(mesh: THREE.Mesh): Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> {
  const sourceGeometry = mesh.geometry as THREE.BufferGeometry | undefined;
  if (!sourceGeometry) return [];

  const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const fallbackMaterial =
    (meshMaterials.find(Boolean) as THREE.Material | undefined) || new THREE.MeshStandardMaterial();

  const worldGeometry = sourceGeometry.clone();
  worldGeometry.applyMatrix4(mesh.matrixWorld);

  // Use a non-indexed geometry so group ranges can be sliced directly.
  const nonIndexed = worldGeometry.toNonIndexed();

  const position = nonIndexed.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!position) {
    if (nonIndexed !== worldGeometry) {
      nonIndexed.dispose();
    }
    worldGeometry.dispose();
    return [];
  }

  const normal = nonIndexed.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const uv = nonIndexed.getAttribute('uv') as THREE.BufferAttribute | undefined;

  const vertexCount = position.count;
  const groups =
    nonIndexed.groups && nonIndexed.groups.length > 0
      ? nonIndexed.groups
      : [{ start: 0, count: vertexCount, materialIndex: 0 }];

  const results: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> = [];

  for (const group of groups) {
    const start = typeof group.start === 'number' ? group.start : 0;
    const rawCount = typeof group.count === 'number' ? group.count : vertexCount - start;
    const count = Number.isFinite(rawCount) ? Math.max(0, Math.min(rawCount, vertexCount - start)) : vertexCount - start;
    if (count <= 0 || start < 0 || start >= vertexCount) continue;

    const materialIndex = typeof group.materialIndex === 'number' ? group.materialIndex : 0;
    const material =
      (meshMaterials[materialIndex] as THREE.Material | undefined) ||
      (meshMaterials[0] as THREE.Material | undefined) ||
      fallbackMaterial;

    const sub = new THREE.BufferGeometry();
    sub.setAttribute('position', sliceBufferAttribute(position, start, count));
    if (normal) sub.setAttribute('normal', sliceBufferAttribute(normal, start, count));
    if (uv) sub.setAttribute('uv', sliceBufferAttribute(uv, start, count));

    ensureAttribute(sub, 'uv', 2, count);
    if (!sub.getAttribute('normal')) {
      sub.computeVertexNormals();
    }

    sub.clearGroups();
    results.push({ geometry: sub, material });
  }

  if (nonIndexed !== worldGeometry) {
    nonIndexed.dispose();
  }
  worldGeometry.dispose();
  return results;
}

export function createBrushFromObject(object: THREE.Object3D): Brush | null {
  if (!object) return null;

  object.updateMatrixWorld(true);

  const parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> = [];
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh?.isMesh) return;
    if (!mesh.visible) return;
    if (!mesh.geometry) return;
    parts.push(...buildSubGeometriesFromMesh(mesh));
  });

  if (parts.length === 0) return null;

  const geometries = parts.map((p) => p.geometry);
  const merged = BufferGeometryUtils.mergeGeometries(geometries, true);

  geometries.forEach((g) => g.dispose());

  if (!merged) return null;

  const materials = parts.map((p) => p.material);
  const brush = new Brush(merged, materials);
  brush.updateMatrixWorld(true);
  return brush;
}
