import * as THREE from 'three';
import type {
  SurfaceTextRuntimeObject,
  TextTransformSnapshot,
  TextTransformTarget,
} from './types';

function asTextTransformTarget(value: unknown): TextTransformTarget | null {
  if (!value || typeof value !== 'object') return null;
  return value as TextTransformTarget;
}

const EULER_ORDERS: THREE.EulerOrder[] = ['XYZ', 'YZX', 'ZXY', 'XZY', 'YXZ', 'ZYX'];

function isEulerOrder(value: unknown): value is THREE.EulerOrder {
  return typeof value === 'string' && EULER_ORDERS.includes(value as THREE.EulerOrder);
}

export function resolveTextSelectionTarget(textObject?: SurfaceTextRuntimeObject | null) {
  return asTextTransformTarget(textObject?.entityObject || textObject?.mesh || null);
}

export function resolveTextTransformTarget(textObject?: SurfaceTextRuntimeObject | null) {
  return resolveTextSelectionTarget(textObject);
}

export function applyTransformToTextTarget(
  textObject: SurfaceTextRuntimeObject | null | undefined,
  transform: TextTransformSnapshot | null | undefined
) {
  const target = resolveTextTransformTarget(textObject);
  if (!target || !transform) return;

  const { position, rotation, scale } = transform;
  if (position) {
    target.position.set(position.x, position.y, position.z);
  }
  if (rotation) {
    if (isEulerOrder(rotation.order)) {
      target.rotation.order = rotation.order;
    }
    target.rotation.set(rotation.x, rotation.y, rotation.z);
  }
  if (scale) {
    target.scale.set(scale.x, scale.y, scale.z);
  }

  target.updateMatrixWorld?.(true);
  target.markBoxDirty?.();
  target.refreshWorldBox?.(true);
}

export function readTextTargetTransformSnapshot(
  textObject: SurfaceTextRuntimeObject | null | undefined
): TextTransformSnapshot | null {
  const target = resolveTextTransformTarget(textObject);
  if (!target) return null;

  return {
    position: {
      x: target.position.x,
      y: target.position.y,
      z: target.position.z,
    },
    rotation: {
      x: target.rotation.x,
      y: target.rotation.y,
      z: target.rotation.z,
      order: target.rotation.order,
    },
    scale: {
      x: target.scale.x,
      y: target.scale.y,
      z: target.scale.z,
    },
  };
}
