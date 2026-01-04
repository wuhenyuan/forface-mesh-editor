import type * as THREE from 'three'

export interface ViewerClickEvent {
  target: THREE.Object3D | null
  targetType: 'text' | 'surface' | 'object' | 'empty'
  point?: THREE.Vector3
  faceIndex?: number
  face?: THREE.Face
  uv?: THREE.Vector2
  event: MouseEvent
  filtered?: boolean
  reason?: string
}

export interface FaceInfo {
  mesh: THREE.Mesh
  faceIndex: number
  face: THREE.Face
  point: THREE.Vector3
  normal: THREE.Vector3
  featureId?: string
  featureName?: string
  distance?: number
}

export interface RaycastResult {
  object: THREE.Object3D
  point: THREE.Vector3
  face?: THREE.Face
  faceIndex?: number
  distance: number
  uv?: THREE.Vector2
}

export interface SelectionEvent {
  selected: THREE.Object3D | null
  previous: THREE.Object3D | null
  type: 'object' | 'face' | 'text'
}

export interface TransformEvent {
  object: THREE.Object3D
  mode: 'translate' | 'rotate' | 'scale'
  position?: THREE.Vector3
  rotation?: THREE.Euler
  scale?: THREE.Vector3
}
