/**
 * 工具栏集成测试
 * 测试创建文字和相交检查功能的集成
 */

/**
 * 模拟工具栏按钮功能测试
 */
export async function testToolbarIntegration() {
  console.log('========== 工具栏集成测试 ==========')
  
  // 模拟场景数据
  const mockWorkspace = {
    surfaceTextManager: {
      scene: { updateMatrixWorld: () => {} },
      camera: { updateMatrixWorld: () => {} },
      targetMeshes: [
        {
          name: '测试模型',
          geometry: {
            computeBoundingBox: () => {},
            boundingBox: {
              getCenter: (target) => {
                target.set(0, 0, 0)
                return target
              }
            },
            getAttribute: () => ({ count: 1000 })
          }
        }
      ],
      createTextObject: async (content, faceInfo) => {
        console.log(`✅ 模拟创建文字: "${content}" 在位置:`, faceInfo.point)
        return {
          id: 'test-text-001',
          content: content,
          textMesh: {
            geometry: { getAttribute: () => ({ count: 500 }) },
            position: { x: 0, y: 0, z: 0, toArray: () => [0, 0, 0] },
            rotation: { x: 0, y: 0, z: 0, toArray: () => [0, 0, 0] },
            scale: { x: 1, y: 1, z: 1, toArray: () => [1, 1, 1] },
            matrixWorld: { elements: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] }
          }
        }
      }
    },
    textObjects: {
      value: []
    }
  }
  
  try {
    // 测试1: 模拟创建测试文字
    console.log('\n--- 测试1: 创建测试文字 ---')
    
    const surfaceTextManager = mockWorkspace.surfaceTextManager
    const targetMeshes = surfaceTextManager.targetMeshes
    
    console.log('🎯 找到目标网格数量:', targetMeshes.length)
    
    if (targetMeshes.length > 0) {
      const firstMesh = targetMeshes[0]
      const center = { x: 0, y: 0, z: 0 }
      
      const faceInfo = {
        mesh: firstMesh,
        faceIndex: 0,
        face: null,
        point: center,
        distance: 0,
        uv: { x: 0.5, y: 0.5 }
      }
      
      const textObject = await surfaceTextManager.createTextObject('测试文字', faceInfo)
      mockWorkspace.textObjects.value.push(textObject)
      
      console.log('✅ 文字创建成功')
      console.log('📝 当前文字对象数量:', mockWorkspace.textObjects.value.length)
    }
    
    // 测试2: 模拟相交检查
    console.log('\n--- 测试2: 相交检查 ---')
    
    const textObjects = mockWorkspace.textObjects.value
    console.log('📝 场景中文字对象数量:', textObjects.length)
    
    if (textObjects.length > 0) {
      for (let i = 0; i < textObjects.length; i++) {
        const textObject = textObjects[i]
        console.log(`\n检查文字对象 ${i + 1}:`)
        console.log('  内容:', textObject.content)
        console.log('  ID:', textObject.id)
        console.log('  顶点数:', textObject.textMesh.geometry.getAttribute().count)
        console.log('  位置:', textObject.textMesh.position.toArray())
        
        for (let j = 0; j < targetMeshes.length; j++) {
          const targetMesh = targetMeshes[j]
          console.log(`  与网格 "${targetMesh.name}" 的检查:`)
          console.log('    网格顶点数:', targetMesh.geometry.getAttribute().count)
          console.log('    模拟检查结果: 数据访问正常 ✅')
        }
      }
    }
    
    console.log('\n✅ 工具栏集成测试完成')
    
    return {
      success: true,
      textObjectsCreated: mockWorkspace.textObjects.value.length,
      targetMeshesFound: targetMeshes.length
    }
    
  } catch (error) {
    console.error('❌ 工具栏集成测试失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 测试按钮状态管理
 */
export function testButtonStates() {
  console.log('========== 按钮状态测试 ==========')
  
  // 模拟按钮状态
  const buttonStates = {
    creatingText: false,
    checkingIntersection: false
  }
  
  console.log('初始状态:', buttonStates)
  
  // 模拟创建文字按钮点击
  console.log('\n--- 模拟创建文字按钮点击 ---')
  buttonStates.creatingText = true
  console.log('创建中状态:', buttonStates)
  
  setTimeout(() => {
    buttonStates.creatingText = false
    console.log('创建完成状态:', buttonStates)
  }, 1000)
  
  // 模拟相交检查按钮点击
  setTimeout(() => {
    console.log('\n--- 模拟相交检查按钮点击 ---')
    buttonStates.checkingIntersection = true
    console.log('检查中状态:', buttonStates)
    
    setTimeout(() => {
      buttonStates.checkingIntersection = false
      console.log('检查完成状态:', buttonStates)
      console.log('\n✅ 按钮状态测试完成')
    }, 1000)
  }, 2000)
}

/**
 * 运行所有测试
 */
export async function runAllToolbarTests() {
  console.log('🚀 开始工具栏功能测试...\n')
  
  try {
    const integrationResult = await testToolbarIntegration()
    console.log('\n集成测试结果:', integrationResult)
    
    testButtonStates()
    
    console.log('\n🎉 所有工具栏测试完成')
    
  } catch (error) {
    console.error('❌ 工具栏测试失败:', error)
  }
}

// 在浏览器控制台中运行:
// import('/src/utils/surfaceText/toolbar-integration-test.js').then(m => m.runAllToolbarTests())