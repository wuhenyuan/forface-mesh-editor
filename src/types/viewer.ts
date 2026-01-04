import type * as THREE from 'three'

export interface ViewerOptions {
  backgroundColor?: number
  enableShadow?: boolean
  enableGrid?: boolean
  enableAxes?: boolean
  antialias?: boolean
  pixelRatio?: number
}

export interface AddMeshOptions {
  selectable?: boolean
  castShadow?: boolean
  receiveShadow?: boolean
  name?: string
  userData?: Record<string, unknown>
}

export interface LoadSTLOptions {
  color?: number
  roughness?: number
  metalness?: number
  scale?: number | null
  targetSize?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  name?: string
  selectable?: boolean
}

export interface ScreenshotOptions {
  width?: number
  height?: number
  type?: string
  quality?: number
  transparent?: boolean
}

export interface CameraState {
  position: THREE.Vector3
  target: THREE.Vector3
  zoom?: number
}

export interface ViewerState {
  camera: CameraState
  selectedObject: THREE.Object3D | null
  highlightedObject: THREE.Object3D | null
}

export interface GridOptions {
  size?: number
  divisions?: number
  color1?: number
  color2?: number
}

export interface LightOptions {
  ambient?: {
    color?: number
    intensity?: number
  }
  directional?: {
    color?: number
    intensity?: number
    position?: [number, number, number]
    castShadow?: boolean
  }
}
