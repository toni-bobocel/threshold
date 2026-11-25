// n8ao ships no types. This covers the slice of N8AOPass the tour uses.
declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three'
  import type { Pass } from 'three/addons/postprocessing/Pass.js'

  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    configuration: {
      aoRadius: number
      distanceFalloff: number
      intensity: number
      halfRes: boolean
      // OutputPass already converts to sRGB; leaving this on washes the image out
      gammaCorrection: boolean
      color: Color
    }
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void
  }
}
