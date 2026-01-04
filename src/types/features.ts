import type * as THREE from 'three'

export interface PlaneFeature {
  type: 'plane'
  id: string
  name: string
  normal: THREE.Vector3
  center: THREE.Vector3
  triangles: number[]
  area?: number
}

export interface CylinderFeature {
  type: 'cylinder'
  id: string
  name: string
  axis: THREE.Vector3
  center: THREE.Vector3
  radius: number
  triangles: number[]
  height?: number
}

export interface SphereFeature {
  type: 'sphere'
  id: string
  name: string
  center: THREE.Vector3
  radius: number
  triangles: number[]
}

export type Feature = PlaneFeature | CylinderFeature | SphereFeature

export interface MeshFeatures {
  meshId: string
  meshName: string
  planes: PlaneFeature[]
  cylinders: CylinderFeature[]
  spheres?: SphereFeature[]
  namedFeatures: Map<string, Feature>
}

export interface FeatureDetectionOptions {
  angleTolerance?: number
  minTriangles?: number
  radiusTolerance?: number
}

export interface FeaturePoolEntry {
  feature: Feature
  mesh: THREE.Mesh
  lastAccessed: number
}
