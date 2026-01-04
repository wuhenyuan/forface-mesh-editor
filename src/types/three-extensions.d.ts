import * as THREE from 'three'

declare module 'three' {
  interface Object3D {
    userData: {
      isHelper?: boolean
      isText?: boolean
      isSurface?: boolean
      isMesh?: boolean
      surfaceType?: 'plane' | 'cylinder' | 'sphere'
      featureId?: string
      featureName?: string
      textId?: string
      textContent?: string
      attachedSurface?: string
      selectable?: boolean
      [key: string]: unknown
    }
  }
}

export {}
