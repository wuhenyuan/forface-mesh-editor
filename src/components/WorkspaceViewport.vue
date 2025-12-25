<template>
  <div class="viewport" ref="root">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
export default {
  name: 'WorkspaceViewport',
  setup() {
    const root = ref(null)
    const canvas = ref(null)
    let renderer, scene, camera, controls, animationId
    const init = () => {
      const rect = root.value.getBoundingClientRect()
      renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true })
      renderer.setSize(rect.width, rect.height)
      renderer.setPixelRatio(window.devicePixelRatio)
      scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf2f3f5)
      camera = new THREE.PerspectiveCamera(60, rect.width / rect.height, 0.1, 1000)
      camera.position.set(3, 3, 6)
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
      scene.add(hemi)
      const ambient = new THREE.AmbientLight(0xffffff, 0.35)
      scene.add(ambient)
      const dir = new THREE.DirectionalLight(0xffffff, 0.6)
      dir.position.set(5, 10, 7.5)
      scene.add(dir)
      const grid = new THREE.GridHelper(20, 20, 0xcccccc, 0xeeeeee)
      scene.add(grid)
      const geo = new THREE.BoxGeometry(1, 1, 1)
      const mat = new THREE.MeshStandardMaterial({ color: 0x409eff })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.y = 0.5
      scene.add(mesh)
      const loader = new STLLoader()
      const robotUrl = new URL('../assets/model/机器人.stl', import.meta.url).href
      loader.load(robotUrl, geometry => {
        geometry.center()
        const mat2 = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8, metalness: 0.1 })
        const robot = new THREE.Mesh(geometry, mat2)
        const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position)
        const size = new THREE.Vector3()
        box.getSize(size)
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const target = 4
        const scaleFactor = target / maxDim
        robot.scale.setScalar(scaleFactor)
        scene.add(robot)
      })
      animate()
      window.addEventListener('resize', onResize)
    }
    const onResize = () => {
      const rect = root.value.getBoundingClientRect()
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
      renderer.setSize(rect.width, rect.height)
    }
    const animate = () => {
      animationId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    onMounted(init)
    onBeforeUnmount(() => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', onResize)
      renderer && renderer.dispose()
      controls && controls.dispose()
    })
    return { root, canvas }
  }
}
</script>

<style scoped>
.viewport {
  height: 100%;
  width: 100%;
  position: relative;
  background: #fff;
}
canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
