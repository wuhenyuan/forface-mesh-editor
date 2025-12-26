/**
 * 面拾取调试工具
 * 用于诊断面拾取功能的问题
 */

export function debugFacePicking(facePicker, meshes) {
  console.log('=== 面拾取调试信息 ===')
  
  // 1. 检查面拾取器状态
  console.log('面拾取器状态:')
  console.log('- 是否启用:', facePicker?.enabled)
  console.log('- 网格数量:', facePicker?.meshes?.length || 0)
  console.log('- DOM元素:', facePicker?.domElement)
  
  // 2. 检查网格信息
  console.log('\n网格信息:')
  meshes.forEach((mesh, index) => {
    console.log(`网格 ${index}:`)
    console.log('- 名称:', mesh.name || 'Unnamed')
    console.log('- 可见:', mesh.visible)
    console.log('- 几何体类型:', mesh.geometry?.constructor?.name)
    console.log('- 面数:', getFaceCount(mesh.geometry))
    console.log('- 位置:', mesh.position)
    console.log('- 是否有效:', validateMesh(mesh))
  })
  
  // 3. 检查事件监听器
  console.log('\n事件监听器:')
  if (facePicker?.eventHandler) {
    console.log('- EventHandler 存在:', !!facePicker.eventHandler)
    console.log('- EventHandler 状态:', facePicker.eventHandler.getState?.())
  }
  
  // 4. 测试射线投射
  console.log('\n射线投射测试:')
  if (facePicker?.raycastManager) {
    // 测试屏幕中心点击
    const centerPosition = { x: 0, y: 0 }
    const intersection = facePicker.raycastManager.intersectFaces(centerPosition, meshes)
    console.log('- 屏幕中心射线投射结果:', intersection)
  }
  
  console.log('========================')
}

function getFaceCount(geometry) {
  if (!geometry) return 0
  
  if (geometry.isBufferGeometry) {
    const positionAttribute = geometry.getAttribute('position')
    if (!positionAttribute) return 0
    
    const indexAttribute = geometry.getIndex()
    return indexAttribute 
      ? indexAttribute.count / 3 
      : positionAttribute.count / 3
  }
  
  if (geometry.isGeometry) {
    return geometry.faces ? geometry.faces.length : 0
  }
  
  return 0
}

function validateMesh(mesh) {
  if (!mesh || !mesh.geometry) {
    return false
  }
  
  if (!mesh.visible) {
    return false
  }
  
  const geometry = mesh.geometry
  
  if (geometry.isBufferGeometry) {
    const positionAttribute = geometry.getAttribute('position')
    if (!positionAttribute || positionAttribute.count === 0) {
      return false
    }
    
    const indexAttribute = geometry.getIndex()
    const faceCount = indexAttribute 
      ? indexAttribute.count / 3 
      : positionAttribute.count / 3
    
    return faceCount >= 1
  }
  
  if (geometry.isGeometry) {
    return geometry.vertices?.length > 0 && geometry.faces?.length > 0
  }
  
  return false
}

/**
 * 手动测试面拾取
 */
export function testFacePicking(facePicker, meshes) {
  console.log('开始手动测试面拾取...')
  
  if (!facePicker) {
    console.error('面拾取器不存在')
    return
  }
  
  // 测试不同位置的点击
  const testPositions = [
    { x: 0, y: 0, name: '屏幕中心' },
    { x: 0.2, y: 0.2, name: '右上' },
    { x: -0.2, y: -0.2, name: '左下' },
    { x: 0.5, y: 0, name: '右中' }
  ]
  
  testPositions.forEach(pos => {
    console.log(`测试位置 ${pos.name} (${pos.x}, ${pos.y}):`)
    
    try {
      const faceInfo = facePicker.raycastManager.intersectFaces(pos, meshes)
      if (faceInfo) {
        console.log('✓ 检测到面:', {
          mesh: faceInfo.mesh.name,
          faceIndex: faceInfo.faceIndex,
          distance: faceInfo.distance
        })
      } else {
        console.log('✗ 未检测到面')
      }
    } catch (error) {
      console.error('✗ 射线投射错误:', error.message)
    }
  })
}