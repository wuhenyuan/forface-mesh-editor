/**
 * 高亮渲染演示和测试
 * 展示面高亮功能的使用方法
 */

import * as THREE from 'three'
import { HighlightRenderer } from './HighlightRenderer.js'

/**
 * 创建高亮渲染演示
 */
export function createHighlightDemo() {
  console.log('🎨 创建高亮渲染演示...')
  
  // 创建场景
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf0f0f0)
  
  // 创建相机
  const camera = new THREE.PerspectiveCamera(75, 800/600, 0.1, 1000)
  camera.position.set(3, 3, 5)
  camera.lookAt(0, 0, 0)
  
  // 创建渲染器
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(800, 600)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  
  // 添加光照
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
  scene.add(ambientLight)
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(5, 10, 5)
  directionalLight.castShadow = true
  scene.add(directionalLight)
  
  // 创建测试网格
  const testMeshes = createTestMeshes()
  testMeshes.forEach(mesh => scene.add(mesh))
  
  // 创建高亮渲染器
  const highlightRenderer = new HighlightRenderer(scene)
  
  // 演示不同的高亮效果
  demonstrateHighlightEffects(highlightRenderer, testMeshes)
  
  return {
    scene,
    camera,
    renderer,
    highlightRenderer,
    testMeshes,
    
    // 渲染循环
    render() {
      renderer.render(scene, camera)
    },
    
    // 清理资源
    dispose() {
      highlightRenderer.destroy()
      testMeshes.forEach(mesh => {
        mesh.geometry.dispose()
        mesh.material.dispose()
      })
      renderer.dispose()
    }
  }
}

/**
 * 创建测试网格
 */
function createTestMeshes() {
  const meshes = []
  
  // 立方体
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  const boxMaterial = new THREE.MeshStandardMaterial({ color: 0x409eff })
  const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial)
  boxMesh.position.set(-2, 0, 0)
  boxMesh.name = 'TestBox'
  meshes.push(boxMesh)
  
  // 球体
  const sphereGeometry = new THREE.SphereGeometry(0.8, 16, 12)
  const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0x67c23a })
  const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial)
  sphereMesh.position.set(0, 0, 0)
  sphereMesh.name = 'TestSphere'
  meshes.push(sphereMesh)
  
  // 圆柱体
  const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8)
  const cylinderMaterial = new THREE.MeshStandardMaterial({ color: 0xe6a23c })
  const cylinderMesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial)
  cylinderMesh.position.set(2, 0, 0)
  cylinderMesh.name = 'TestCylinder'
  meshes.push(cylinderMesh)
  
  return meshes
}

/**
 * 演示高亮效果
 */
function demonstrateHighlightEffects(highlightRenderer, testMeshes) {
  console.log('🌟 演示高亮效果...')
  
  // 演示选择高亮
  setTimeout(() => {
    console.log('  ✨ 高亮立方体的第一个面')
    highlightRenderer.highlightFace(testMeshes[0], 0)
  }, 1000)
  
  setTimeout(() => {
    console.log('  ✨ 高亮球体的多个面')
    highlightRenderer.highlightFace(testMeshes[1], 5)
    highlightRenderer.highlightFace(testMeshes[1], 10)
  }, 2000)
  
  setTimeout(() => {
    console.log('  ✨ 显示圆柱体的悬停效果')
    highlightRenderer.showHoverEffect(testMeshes[2], 2)
  }, 3000)
  
  setTimeout(() => {
    console.log('  ✨ 更新高亮颜色')
    highlightRenderer.updateColors({
      selection: 0xff1744,  // 红色
      hover: 0x00e676       // 绿色
    })
  }, 4000)
  
  setTimeout(() => {
    console.log('  ✨ 清除所有高亮')
    highlightRenderer.clearAllHighlights(true)
  }, 6000)
  
  setTimeout(() => {
    const stats = highlightRenderer.getHighlightStats()
    console.log('  📊 高亮统计:', stats)
  }, 7000)
}

/**
 * 测试高亮渲染功能
 */
export function testHighlightRenderer() {
  console.log('🧪 测试高亮渲染功能...')
  
  const results = {
    creation: testHighlightCreation(),
    materials: testMaterialCreation(),
    highlighting: testHighlightOperations(),
    cleanup: testCleanup()
  }
  
  const allPassed = Object.values(results).every(result => result.passed)
  
  console.log('📊 高亮渲染测试结果:')
  Object.entries(results).forEach(([test, result]) => {
    console.log(`  ${result.passed ? '✅' : '❌'} ${test}: ${result.message}`)
  })
  
  return { allPassed, results }
}

/**
 * 测试高亮创建
 */
function testHighlightCreation() {
  try {
    const scene = new THREE.Scene()
    const highlightRenderer = new HighlightRenderer(scene)
    
    // 检查高亮组是否正确添加到场景
    const highlightGroup = scene.getObjectByName('FaceHighlightGroup')
    const hoverGroup = scene.getObjectByName('FaceHoverGroup')
    
    if (highlightGroup && hoverGroup) {
      console.log('  ✅ 高亮组创建正常')
      highlightRenderer.destroy()
      return { passed: true, message: '高亮渲染器创建成功' }
    } else {
      throw new Error('高亮组创建失败')
    }
  } catch (error) {
    return { passed: false, message: error.message }
  }
}

/**
 * 测试材质创建
 */
function testMaterialCreation() {
  try {
    const scene = new THREE.Scene()
    const highlightRenderer = new HighlightRenderer(scene)
    
    // 创建测试材质
    const originalMaterial = new THREE.MeshStandardMaterial({ color: 0x409eff })
    
    // 测试选择材质创建
    const selectionMaterial = highlightRenderer.createHighlightMaterial(originalMaterial, 0xff6b35, false)
    if (!selectionMaterial || !selectionMaterial.isMaterial) {
      throw new Error('选择材质创建失败')
    }
    
    // 测试悬停材质创建
    const hoverMaterial = highlightRenderer.createHighlightMaterial(originalMaterial, 0x4fc3f7, true)
    if (!hoverMaterial || !hoverMaterial.isMaterial) {
      throw new Error('悬停材质创建失败')
    }
    
    console.log('  ✅ 高亮材质创建正常')
    highlightRenderer.destroy()
    return { passed: true, message: '材质创建成功' }
  } catch (error) {
    return { passed: false, message: error.message }
  }
}

/**
 * 测试高亮操作
 */
function testHighlightOperations() {
  try {
    const scene = new THREE.Scene()
    const highlightRenderer = new HighlightRenderer(scene)
    
    // 创建测试网格
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial({ color: 0x409eff })
    const mesh = new THREE.Mesh(geometry, material)
    
    // 测试高亮添加
    const success1 = highlightRenderer.highlightFace(mesh, 0)
    if (!success1) {
      throw new Error('高亮添加失败')
    }
    
    // 测试悬停效果
    const success2 = highlightRenderer.showHoverEffect(mesh, 1)
    if (!success2) {
      throw new Error('悬停效果添加失败')
    }
    
    // 测试统计信息
    const stats = highlightRenderer.getHighlightStats()
    if (stats.selectionHighlights !== 1 || stats.hoverHighlights !== 1) {
      throw new Error('统计信息不正确')
    }
    
    // 测试清除操作
    highlightRenderer.clearAllHighlights(true)
    const statsAfterClear = highlightRenderer.getHighlightStats()
    if (statsAfterClear.totalHighlights !== 0) {
      throw new Error('清除操作失败')
    }
    
    console.log('  ✅ 高亮操作正常')
    highlightRenderer.destroy()
    return { passed: true, message: '高亮操作成功' }
  } catch (error) {
    return { passed: false, message: error.message }
  }
}

/**
 * 测试资源清理
 */
function testCleanup() {
  try {
    const scene = new THREE.Scene()
    const highlightRenderer = new HighlightRenderer(scene)
    
    // 添加一些高亮
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial({ color: 0x409eff })
    const mesh = new THREE.Mesh(geometry, material)
    
    highlightRenderer.highlightFace(mesh, 0)
    highlightRenderer.showHoverEffect(mesh, 1)
    
    // 销毁渲染器
    highlightRenderer.destroy()
    
    // 检查场景是否清理干净
    const highlightGroup = scene.getObjectByName('FaceHighlightGroup')
    const hoverGroup = scene.getObjectByName('FaceHoverGroup')
    
    if (highlightGroup || hoverGroup) {
      throw new Error('场景清理不完整')
    }
    
    console.log('  ✅ 资源清理正常')
    return { passed: true, message: '资源清理成功' }
  } catch (error) {
    return { passed: false, message: error.message }
  }
}