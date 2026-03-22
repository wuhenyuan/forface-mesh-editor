import * as THREE from 'three';
import type TextEntityObject from '../../entities/TextEntityObject';
import type { SurfaceFaceInfo, SurfaceInfo } from './SurfaceTextPlacement';

export type TextTransformSnapshot = {
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; order?: THREE.EulerOrder | string };
  scale?: { x: number; y: number; z: number };
};

export type TextTransformTarget = THREE.Object3D & {
  markBoxDirty?: () => void;
  refreshWorldBox?: (force?: boolean) => THREE.Box3;
};

export type SurfaceTextRuntimeObject = {
  id?: string;
  mesh?: THREE.Object3D | null;
  entityObject?: TextEntityObject | TextTransformTarget | null;
};

/**
 * 文字模式分为两种：
 * `raised` 表示编辑态下直接可见的独立文字，
 * `engraved` 表示该文字会参与布尔减法并投影到目标模型上。
 */
export type SurfaceTextMode = 'raised' | 'engraved';

/**
 * 文字配置在当前工程中仍然是开放结构。
 * 这里列出运行时真正会用到的核心字段，其余字段继续透传，
 * 这样既不破坏现有功能，也为后续收紧类型留下清晰边界。
 */
export type SurfaceTextConfig = Record<string, CoreValue> & {
  font?: string;
  size?: number;
  thickness?: number;
  color?: number;
  mode?: SurfaceTextMode;
};

/**
 * 这是 surfaceText 运行时内部统一使用的文字对象结构。
 * 它不是 UI 对象，也不是持久化实体，而是“文字实体在 three 场景中的投影记录”。
 */
export type SurfaceTextObject = SurfaceTextRuntimeObject & {
  id: string;
  content: string;
  mesh: THREE.Mesh;
  entityObject: TextEntityObject | TextTransformTarget | null;
  geometry: THREE.BufferGeometry;
  material: THREE.Material & {
    color?: THREE.Color;
  };
  targetMesh: THREE.Mesh;
  targetFace?: number | null;
  faceInfo: SurfaceFaceInfo;
  surfaceId?: string | null;
  surfaceInfo?: SurfaceInfo | null;
  config: SurfaceTextConfig;
  mode: SurfaceTextMode;
  engraveStatus?: 'success' | 'failed' | null;
  engraveError?: string | null;
  originalTargetGeometry?: THREE.BufferGeometry | null;
  originalTargetMaterial?: THREE.Material | null;
  engravedMaterial?: THREE.Material | null;
  originalPosition?: THREE.Vector3 | null;
  materialIndex?: number;
  constrainToSurface?: boolean;
  created?: number;
  modified?: number;
  [key: string]: CoreValue;
};

/**
 * 文字创建时允许指定恢复用的 id / config / transform。
 * 该结构由撤销重做、快照恢复和实体投影共同使用。
 */
export type SurfaceTextCreateOptions = Record<string, CoreValue> & {
  id?: string;
  config?: SurfaceTextConfig;
  transform?: Record<string, CoreValue> | null;
};

export type SurfaceTextSelectionBridge = {
  addEntityObject?: (entityObject: THREE.Object3D) => void;
  removeEntityObject?: (entityObject: THREE.Object3D | null) => void;
  selectEntityObject?: (entityObject: THREE.Object3D | null) => void;
  clearEntitySelection?: (entityObject?: THREE.Object3D | null) => void;
  refreshEntityObjectSession?: (entityObject: THREE.Object3D | null) => void;
};
