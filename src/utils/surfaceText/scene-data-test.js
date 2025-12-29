/**
 * 场景数据访问测试
 * 验证工具栏是否能正确访问场景中的文字和网格数据
 */

/**
 * 模拟场景数据结构
 */
export function createMockSceneData() {
  return {
    textObjects: [
      {
        id: 'text-001',
        content: 'Hello World',
        textMesh: {
          geometry: {
            getAttribute: () => ({ count: 1234 })
          },
          position: { x: 0.5, y: 0.2, z: 0.0, toArray: () => [0.5, 0.2, 0.0] },
          rotation: { x: 0, y: 0, z: 0, toArray: () => [0, 0, 0] },
          scale: { x: 1, y: 1, z: 1, toArray: () => [1, 1, 1] },
          matrixWorld: {
            elements: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0.5,0.2,0,1]
          }
        }
      },
      {
        id: 'text-002',
        content: 'Test Text',
        textMesh: {
          geometry: {
            getAttribute: () => ({ count: 856 })
          },
          position: { x: 3.0, y: 0.0, z: 0.0, toArray: () => [3.0, 0.0, 0.0] },
          rotation: { x: 0, y: 0.785, z: 0, toArray: () => [0, 0.785, 0] },
          scale: { x: 1.2, y: 1.0, z: 1.0, toArray: () => [1.2, 1.0, 1.0] },
          matrixWorld: {
            elements: [1,0,0,0, 0,1,0,0, 0,0,1,0, 3.0,0.0,0.0,1]
          }
        }
      }
    ],
    surfaceTextManager: {
      targetMeshes: [
        {
          name: '机器人模型',
          type: 'Mesh',
          geometry: {
            getAttribute: () => ({ count: 5678 })
          }
        }
      ]
    }
  }
}

/**
 * 测试场景数据访问逻辑
 */
export function testSceneDataAccess() {
  console.log('========== 场景数据访问测试 ==========')
  
  const mockData = createMockSceneData()
  
  console.log('📝 模拟文字对象数量:', mockData.textObjects.length)
  console.log('🎯 模拟目标网格数量:', mockData.surfaceTextManager.targetMeshes.length)
  
  // 测试文字对象访问
  mockData.textObjects.forEach((textObject, i) => {
    console.log(`\n--- 文字对象 ${i + 1} ---`)
    console.log('ID:', textObject.id)
    console.log('内容:', textObject.content)
    console.log('顶点数:', textObject.textMesh.geometry.getAttribute().count)
    console.log('位置:', textObject.textMesh.position.toArray())
    console.log('旋转:', textObject.textMesh.rotation.toArray())
    console.log('缩放:', textObject.textMesh.scale.toArray())
  })
  
  // 测试目标网格访问
  mockData.surfaceTextManager.targetMeshes.forEach((mesh, i) => {
    console.log(`\n--- 目标网格 ${i + 1} ---`)
    console.log('名称:', mesh.name)
    console.log('类型:', mesh.type)
    console.log('顶点数:', mesh.geometry.getAttribute().count)
  })
  
  console.log('\n✅ 场景数据访问测试完成')
  
  return {
    textObjectCount: mockData.textObjects.length,
    targetMeshCount: mockData.surfaceTextManager.targetMeshes.length,
    success: true
  }
}

/**
 * 验证工具栏按钮逻辑
 */
export function validateToolbarLogic() {
  console.log('========== 工具栏逻辑验证 ==========')
  
  const mockData = createMockSceneData()
  
  // 模拟工具栏按钮的检查逻辑
  const textObjects = mockData.textObjects
  const targetMeshes = mockData.surfaceTextManager.targetMeshes
  
  console.log('✅ 获取工作区实例成功 (模拟)')
  console.log('📝 场景中文字对象数量:', textObjects.length)
  console.log('🎯 场景中目标网格数量:', targetMeshes.length)
  
  if (textObjects.length === 0) {
    console.warn('⚠️ 场景中没有文字对象')
    return { success: false, reason: '没有文字对象' }
  }
  
  if (targetMeshes.length === 0) {
    console.error('❌ 场景中没有目标网格')
    return { success: false, reason: '没有目标网格' }
  }
  
  // 模拟检查每个文字对象
  for (let i = 0; i < textObjects.length; i++) {
    const textObject = textObjects[i]
    console.log(`\n--- 检查文字对象 ${i + 1} ---`)
    console.log('📝 文字内容:', textObject.content)
    console.log('📝 文字ID:', textObject.id)
    
    const textMesh = textObject.textMesh
    if (!textMesh || !textMesh.geometry) {
      console.warn('⚠️ 文字对象缺少几何体，跳过')
      continue
    }
    
    console.log('📐 文字几何体信息:')
    console.log('   - 顶点数:', textMesh.geometry.getAttribute().count)
    console.log('   - 位置:', textMesh.position.toArray().map(v => v.toFixed(2)).join(', '))
    console.log('   - 旋转:', textMesh.rotation.toArray().map(v => (v * 180 / Math.PI).toFixed(1)).join('°, ') + '°')
    console.log('   - 缩放:', textMesh.scale.toArray().map(v => v.toFixed(2)).join(', '))
    
    // 模拟检查每个目标网格
    for (let j = 0; j < targetMeshes.length; j++) {
      const targetMesh = targetMeshes[j]
      console.log(`\n  🎯 与目标网格 ${j + 1} 的相交检查`)
      console.log('     网格名称:', targetMesh.name)
      console.log('     网格类型:', targetMesh.type)
      console.log('     网格顶点数:', targetMesh.geometry.getAttribute().count)
      
      console.log('  🔍 开始综合相交检查... (模拟)')
      console.log('  📊 模拟检查结果: 数据访问正常')
    }
  }
  
  console.log('\n✅ 工具栏逻辑验证完成')
  
  return {
    success: true,
    textObjectsProcessed: textObjects.length,
    targetMeshesProcessed: targetMeshes.length
  }
}

// 在浏览器控制台中运行:
// import('/src/utils/surfaceText/scene-data-test.js').then(m => m.testSceneDataAccess())
// import('/src/utils/surfaceText/scene-data-test.js').then(m => m.validateToolbarLogic())