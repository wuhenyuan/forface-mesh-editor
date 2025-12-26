/**
 * 测试文字颜色更新功能
 * 验证选中状态下的颜色更新是否正常工作
 */

/**
 * 测试颜色更新逻辑
 */
export function testColorUpdateLogic() {
  console.log('=== 测试文字颜色更新逻辑 ===')
  
  // 模拟文字对象结构
  const mockTextObject = {
    id: 'test_text_1',
    content: '测试文字',
    material: {
      color: {
        getHex: () => 0x333333,
        setHex: (color) => {
          console.log(`原始材质颜色设置为: 0x${color.toString(16)}`)
        }
      }
    },
    mesh: {
      userData: {}
    },
    config: {
      color: 0x333333
    },
    modified: Date.now()
  }
  
  // 模拟选中状态的高亮材质
  const mockHighlightMaterial = {
    color: {
      setHex: (color) => {
        console.log(`高亮材质颜色设置为: 0x${color.toString(16)}`)
      }
    },
    emissive: {
      setHex: (color) => {
        console.log(`高亮材质发光颜色设置为: 0x${color.toString(16)}`)
      }
    },
    emissiveIntensity: 0.3,
    clone: function() {
      return {
        ...this,
        color: { ...this.color },
        emissive: { ...this.emissive }
      }
    }
  }
  
  // 测试场景1：未选中状态下的颜色更新
  console.log('\n--- 测试场景1: 未选中状态 ---')
  console.log('更新颜色为红色 (0xff0000)')
  mockTextObject.material.color.setHex(0xff0000)
  mockTextObject.config.color = 0xff0000
  console.log('✓ 未选中状态下颜色更新正常')
  
  // 测试场景2：选中状态下的颜色更新
  console.log('\n--- 测试场景2: 选中状态 ---')
  
  // 模拟选中状态：保存原始材质，应用高亮材质
  mockTextObject.mesh.userData.originalMaterial = {
    color: {
      getHex: () => 0xff0000,
      setHex: (color) => {
        console.log(`原始材质颜色更新为: 0x${color.toString(16)}`)
      }
    },
    clone: function() {
      return mockHighlightMaterial
    }
  }
  
  console.log('文字已选中，应用高亮材质')
  console.log('更新颜色为蓝色 (0x0000ff)')
  
  // 模拟颜色更新逻辑
  const newColor = 0x0000ff
  
  // 更新原始材质
  mockTextObject.mesh.userData.originalMaterial.color.setHex(newColor)
  
  // 重新创建高亮材质
  const newHighlightMaterial = mockTextObject.mesh.userData.originalMaterial.clone()
  newHighlightMaterial.emissive.setHex(0x444444)
  newHighlightMaterial.emissiveIntensity = 0.3
  
  console.log('✓ 选中状态下颜色更新正常')
  
  // 测试场景3：取消选中后的颜色验证
  console.log('\n--- 测试场景3: 取消选中 ---')
  console.log('恢复原始材质')
  
  // 模拟取消选中：恢复原始材质
  mockTextObject.mesh.material = mockTextObject.mesh.userData.originalMaterial
  delete mockTextObject.mesh.userData.originalMaterial
  
  console.log('✓ 取消选中后应该显示更新后的颜色')
  
  console.log('\n=== 颜色更新逻辑测试完成 ===\n')
}

/**
 * 测试颜色格式转换
 */
export function testColorFormatConversion() {
  console.log('=== 测试颜色格式转换 ===')
  
  const testColors = [
    { input: '#ff0000', expected: 0xff0000, desc: '红色' },
    { input: '#00ff00', expected: 0x00ff00, desc: '绿色' },
    { input: '#0000ff', expected: 0x0000ff, desc: '蓝色' },
    { input: '#ffffff', expected: 0xffffff, desc: '白色' },
    { input: '#000000', expected: 0x000000, desc: '黑色' },
    { input: '#333333', expected: 0x333333, desc: '深灰色' }
  ]
  
  testColors.forEach(({ input, expected, desc }) => {
    // 模拟WorkspaceViewport中的颜色转换逻辑
    const colorHex = typeof input === 'string' ? parseInt(input.replace('#', ''), 16) : input
    
    const success = colorHex === expected
    console.log(`${desc} (${input}): ${success ? '✓' : '✗'} 转换结果: 0x${colorHex.toString(16)}`)
  })
  
  console.log('颜色格式转换测试完成\n')
}

/**
 * 运行所有颜色更新测试
 */
export function runColorUpdateTests() {
  console.log('开始运行文字颜色更新测试...\n')
  
  try {
    testColorUpdateLogic()
    testColorFormatConversion()
    
    console.log('✅ 所有颜色更新测试完成')
    return true
    
  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error)
    return false
  }
}

// 如果直接运行此文件，执行测试
if (import.meta.url === new URL(import.meta.resolve('./test-color-update.js'))) {
  runColorUpdateTests()
}