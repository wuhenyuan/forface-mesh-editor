/**
 * 调试文字定位的可视化工具
 */
import * as THREE from 'three'

/**
 * 在浏览器控制台中可用的调试函数
 */
window.debugTextPositioning = function() {
  console.log('🔍 调试文字定位')
  
  // 查找场景中的文字对象
  if (!window.scene) {
    console.log('❌ 未找到场景对象')
    return
  }
  
  const textObjects = []
  window.scene.traverse((child) => {
    if (child.userData && child.userData.isTextObject) {
      textObjects.push(child)
    }
  })
  
  if (textObjects.length === 0) {
    console.log('❌ 未找到文字对象')
    return
  }
  
  console.log(`📝 找到 ${textObjects.length} 个文字对象`)
  
  textObjects.forEach((textMesh, index) => {
    console.log(`\n文字对象 ${index + 1}:`, {
      position: textMesh.position,
      rotation: textMesh.rotation,
      scale: textMesh.scale,
      userData: textMesh.userData
    })
    
    // 创建调试可视化
    createPositionDebugVisuals(textMesh, index)
  })
}

/**
 * 创建位置调试可视化
 */
function createPositionDebugVisuals(textMesh, index) {
  if (!window.scene) return
  
  const debugGroup = new THREE.Group()
  debugGroup.name = `TextDebug_${index}`
  
  // 1. 位置标记（红色球）
  const positionMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.1),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  )
  positionMarker.position.copy(textMesh.position)
  debugGroup.add(positionMarker)
  
  // 2. 坐标轴
  const axesHelper = new THREE.AxesHelper(1)
  axesHelper.position.copy(textMesh.position)
  axesHelper.rotation.copy(textMesh.rotation)
  debugGroup.add(axesHelper)
  
  // 3. 边界框
  const bbox = new THREE.Box3().setFromObject(textMesh)
  const bboxHelper = new THREE.Box3Helper(bbox, 0x00ff00)
  debugGroup.add(bboxHelper)
  
  window.scene.add(debugGroup)
  
  // 5秒后自动清理
  setTimeout(() => {
    window.scene.remove(debugGroup)
    debugGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) child.material.dispose()
    })
  }, 5000)
  
  console.log(`✅ 已为文字对象 ${index + 1} 创建调试可视化（5秒后自动清理）`)
}

/**
 * 重置文字位置到点击位置
 */
window.resetTextPosition = function() {
  console.log('🔄 重置文字位置')
  
  if (!window.textManager) {
    console.log('❌ 未找到textManager')
    return
  }
  
  const selectedText = window.textManager.getSelectedTextObject()
  if (!selectedText) {
    console.log('❌ 未选中任何文字对象')
    return
  }
  
  // 获取原始点击位置
  const originalPoint = selectedText.faceInfo?.point
  if (!originalPoint) {
    console.log('❌ 未找到原始点击位置')
    return
  }
  
  console.log('📍 原始点击位置:', originalPoint)
  
  // 重置位置
  selectedText.mesh.position.copy(originalPoint)
  selectedText.mesh.rotation.set(0, 0, 0)
  
  console.log('✅ 文字位置已重置到点击位置')
}

/**
 * 手动调整文字朝向
 */
window.adjustTextOrientation = function(rotX = 0, rotY = 0, rotZ = 0) {
  console.log('🔄 调整文字朝向')
  
  if (!window.textManager) {
    console.log('❌ 未找到textManager')
    return
  }
  
  const selectedText = window.textManager.getSelectedTextObject()
  if (!selectedText) {
    console.log('❌ 未选中任何文字对象')
    return
  }
  
  selectedText.mesh.rotation.x += rotX * Math.PI / 180
  selectedText.mesh.rotation.y += rotY * Math.PI / 180
  selectedText.mesh.rotation.z += rotZ * Math.PI / 180
  
  console.log('✅ 文字朝向已调整:', {
    rotationDegrees: {
      x: rotX,
      y: rotY,
      z: rotZ
    },
    currentRotation: selectedText.mesh.rotation
  })
}

console.log('🔧 文字定位调试工具已加载')
console.log('可用函数:')
console.log('  - debugTextPositioning(): 调试当前文字位置')
console.log('  - resetTextPosition(): 重置文字到点击位置')
console.log('  - adjustTextOrientation(x, y, z): 调整文字朝向（度数）')
console.log('')
console.log('💡 使用示例:')
console.log('  debugTextPositioning()  // 查看文字位置')
console.log('  resetTextPosition()     // 重置位置')
console.log('  adjustTextOrientation(0, 180, 0)  // 翻转文字')