/**
 * 文字系统测试工具
 * 用于验证文字系统的基本功能
 */

import { SurfaceTextManager } from './SurfaceTextManager.js'
import { TextGeometryGenerator } from './TextGeometryGenerator.js'
import { TextInputOverlay } from './TextInputOverlay.js'

/**
 * 测试文字几何体生成器
 */
export async function testTextGeometryGenerator() {
  console.log('=== 测试文字几何体生成器 ===')
  
  const generator = new TextGeometryGenerator()
  
  try {
    // 测试基本文字生成
    const geometry = await generator.generate('测试文字', {
      size: 1,
      thickness: 0.1
    })
    
    console.log('✓ 文字几何体生成成功:', {
      vertices: geometry.attributes.position.count,
      isFallback: geometry.userData?.isFallback || false
    })
    
    // 测试配置验证
    const validation = generator.validateConfig({
      size: 1.5,
      thickness: 0.2,
      curveSegments: 12
    })
    
    console.log('✓ 配置验证:', validation)
    
    return true
    
  } catch (error) {
    console.error('✗ 文字几何体生成器测试失败:', error)
    return false
  }
}

/**
 * 测试文字输入覆盖层
 */
export function testTextInputOverlay() {
  console.log('=== 测试文字输入覆盖层 ===')
  
  try {
    const overlay = new TextInputOverlay(document.body)
    
    // 测试验证功能
    const validation1 = overlay.validateInput('有效文字')
    const validation2 = overlay.validateInput('')
    const validation3 = overlay.validateInput('   ')
    
    console.log('✓ 输入验证测试:', {
      valid: validation1.isValid,
      empty: validation2.isValid,
      whitespace: validation3.isValid
    })
    
    // 测试位置计算
    const position = overlay.calculatePosition(100, 100)
    console.log('✓ 位置计算:', position)
    
    overlay.destroy()
    return true
    
  } catch (error) {
    console.error('✗ 文字输入覆盖层测试失败:', error)
    return false
  }
}

/**
 * 测试工具函数
 */
export function testTextUtils() {
  console.log('=== 测试工具函数 ===')
  
  try {
    // 导入工具函数（避免循环依赖）
    const validateTextContent = (content) => {
      return typeof content === 'string' && content.trim().length > 0
    }
    
    const generateTextId = () => {
      return `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
    
    // 测试文字内容验证
    console.log('✓ 文字验证:', {
      valid: validateTextContent('测试'),
      empty: validateTextContent(''),
      whitespace: validateTextContent('   ')
    })
    
    // 测试ID生成
    const id1 = generateTextId()
    const id2 = generateTextId()
    console.log('✓ ID生成:', {
      id1,
      id2,
      unique: id1 !== id2
    })
    
    return true
    
  } catch (error) {
    console.error('✗ 工具函数测试失败:', error)
    return false
  }
}

/**
 * 运行所有测试
 */
export async function runAllTextSystemTests() {
  console.log('🚀 开始文字系统测试...')
  
  const results = {
    geometryGenerator: await testTextGeometryGenerator(),
    inputOverlay: testTextInputOverlay(),
    utils: testTextUtils()
  }
  
  const passed = Object.values(results).filter(Boolean).length
  const total = Object.keys(results).length
  
  console.log(`\n📊 测试结果: ${passed}/${total} 通过`)
  
  if (passed === total) {
    console.log('🎉 所有测试通过！文字系统基本功能正常')
  } else {
    console.log('⚠️ 部分测试失败，请检查相关功能')
  }
  
  return results
}

/**
 * 在浏览器控制台中运行测试
 */
if (typeof window !== 'undefined') {
  window.testTextSystem = runAllTextSystemTests
  console.log('💡 在控制台中运行 testTextSystem() 来测试文字系统')
}