import * as THREE from 'three';
import type { ExportManager } from '../../ExportManager';
import type { FeatureDetector } from '../../facePicking/FeatureDetector';

export type PrimitiveValue = string | number | boolean | null | undefined;
export type OptionValue = PrimitiveValue | PrimitiveValue[] | THREE.Material;
export type LooseRecord = Record<string, OptionValue>;
export type TextMode = 'raised' | 'engraved' | string;
export type ModelSource = string | File | Blob;

export type ProjectConfigLike = {
  models?: {
    origin?: { path?: string };
    base?: { path?: string };
  };
  originModelPath?: string;
  baseModelPath?: string;
  texts?: Array<Record<string, PrimitiveValue | number[]>>;
};

export type ProjectDataLike = {
  config?: ProjectConfigLike;
};

export type ViewerEventPayload =
  | PrimitiveValue
  | THREE.Object3D
  | THREE.Vector2
  | THREE.Vector3
  | THREE.Euler
  | THREE.Intersection
  | Record<string, PrimitiveValue | number[] | THREE.Object3D | object | null>
  | Array<Record<string, PrimitiveValue | number[]>>;

export type DetectFeatureOptions = Record<string, PrimitiveValue>;

export type FeatureLike = {
  id?: string;
  type?: string;
  [key: string]: PrimitiveValue | number[] | object | null | undefined;
};

export type FeatureDetectionResult = {
  meshId?: string;
  triangleCount?: number;
  planes?: FeatureLike[];
  cylinders?: FeatureLike[];
  namedFeatures?: FeatureLike[];
  [key: string]:
    | PrimitiveValue
    | FeatureLike[]
    | Map<number, FeatureLike>
    | Record<string, PrimitiveValue>
    | undefined;
};

export type LoadModelOptions = {
  addToScene?: boolean;
  detectFeatures?: boolean;
  modelId?: string;
  centerModel?: boolean;
  material?: THREE.Material | null;
  mtlUrl?: string;
  name?: string;
};

export type AddMeshOptions = {
  selectable?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  group?: 'entity' | 'scene' | 'csg';
};

export type ExportOptions = Parameters<ExportManager['export']>[2];

export type CreateProjectOptions = {
  name?: string;
  originModelPath?: string;
};

export type ProjectPackageOptions = {
  includeModels?: boolean | string[];
  format?: 'v3' | 'config2';
  projectFileName?: string;
  fetchOptions?: RequestInit;
};

export type ViewerEventBus = {
  emit: (event: string, payload?: ViewerEventPayload) => void;
  on: (event: string, callback: (payload?: ViewerEventPayload) => void) => () => void;
};

export type EditorViewerOptions = {
  backgroundColor?: number;
  enableShadow?: boolean;
  enableGrid?: boolean;
  events?: ViewerEventBus;
  [key: string]: PrimitiveValue | PrimitiveValue[] | object | undefined;
};

export type FeatureDetectorLike = FeatureDetector & {
  detect?: (
    model: THREE.Object3D,
    modelId?: string,
    options?: DetectFeatureOptions
  ) => Promise<FeatureDetectionResult | null>;
  getFeatureAtIntersection?: (
    modelId: string,
    intersection: THREE.Intersection
  ) => FeatureLike | null;
  getModelFeatures?: (modelId: string) => FeatureDetectionResult | null;
  getTextableSurfaces?: (modelId: string, options?: DetectFeatureOptions) => FeatureLike[];
};

export type TextObjectConfig = {
  font?: string;
  size?: number;
  thickness?: number;
  direction?: string;
  letterSpacing?: number;
  curvingStrength?: number;
  startAngle?: number;
  color?: string | number;
};

export type EditorTextObject = {
  id?: string;
  displayName?: string;
  content?: string;
  config?: TextObjectConfig;
  mode?: TextMode;
  entityObject?: {
    position?: { toArray?: () => number[] };
    rotation?: { toArray?: () => number[] };
  };
  material?: {
    color?: {
      getHexString?: () => string;
    };
  };
  mesh?: {
    position?: { toArray?: () => number[] };
    rotation?: { toArray?: () => number[] };
  };
  featureName?: string;
};

export type EditorViewerMesh = THREE.Object3D & {
  userData: Record<string, PrimitiveValue | number[] | object> & { isHelper?: boolean };
};

export type ViewerClickPayload = {
  event?: MouseEvent;
  [key: string]: PrimitiveValue | number[] | object | null | undefined;
};
