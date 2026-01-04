import type * as THREE from 'three'

export interface TextConfig {
  font: string
  size: number
  thickness: number
  mode: 'raised' | 'engraved' | 'flat'
  color: string | number
  curveSegments?: number
  bevelEnabled?: boolean
  bevelThickness?: number
  bevelSize?: number
}

export interface TextObject {
  id: string
  content: string
  displayName: string
  mesh: THREE.Mesh
  config: TextConfig
  mode: 'raised' | 'engraved' | 'flat'
  featureName?: string
  attachedSurface?: string
  position?: THREE.Vector3
  rotation?: THREE.Euler
}

export interface TextListItem {
  id: string
  content: string
  displayName: string
}

export interface TextCreateOptions {
  content: string
  config?: Partial<TextConfig>
  position?: THREE.Vector3
  rotation?: THREE.Euler
  attachToSurface?: string
}

export interface TextUpdateOptions {
  content?: string
  config?: Partial<TextConfig>
  position?: THREE.Vector3
  rotation?: THREE.Euler
}
