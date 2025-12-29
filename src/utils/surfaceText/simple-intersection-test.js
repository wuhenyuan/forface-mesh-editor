/**
 * 简化的相交检查测试
 * 直接测试方形和文字几何体的相交检查
 */
import * as THREE from 'three'
import { BooleanOperator } from './BooleanOperator.js'

/**
 * 简单的相交检查测试
 */
export async function simpleIntersectionTest() {
  console.log('========== 简化相交检查测试 ==========')
  
  try {
    // 创建布尔操作器
    const booleanOperator = new BooleanOperator()
    
    if (!booleanOperator.isReady()) {
      throw new Error('布尔操作器未准备就绪')
    }
    
    console.log('✅ 布尔操作器初始化成功')
    
    // 创建方形几何体
    const cubeGeometry = new THREE.BoxGeometry(2, 2, 2)
    console.log('📦 方形几何体创建完成 (2x2x2)')
    console.log('   顶点数:', cubeGeometry.getAttribute('position').count)
    
    // 创建文字几何体（简化）
    const textGeometry = new THREE.BoxGeometry(0.8, 0.3, 0.2)
    console.log('📝 文字几何体创建完成 (0.8x0.3x0.2)')
    console.log('   顶点数:', textGeometry.getAttribute('position').count)
    
    // 测试相交情况
    console.log('\n🧪 测试1: 文字在方形中心（应该相交）')
    const centerMatrix = new THREE.Matrix4().makeTranslation(0, 0, 0)
    
    const result1 = booleanOperator.checkIntersectionComprehensive(
      cubeGeometry,
      textGeometry,
      centerMatrix,
      { useBVH: true, fastOnly: false }
    )
    
    console.log('结果:', result1.finalResult ? '✅ 相交' : '❌ 不相交')
    console.log('置信度:', result1.confidence)
    console.log('方法:', result1.method)
    
    // 测试不相交情况
    console.log('\n🧪 测试2: 文字距离方形很远（应该不相交）')
    const farMatrix = new THREE.Matrix4().makeTranslation(5, 0, 0)
    
    const result2 = booleanOperator.checkIntersectionComprehensive(
      cubeGeometry,
      textGeometry,
      farMatrix,
      { useBVH: true, fastOnly: false }
    )
    
    console.log('结果:', result2.finalResult ? '✅ 相交' : '❌ 不相交')
    console.log('置信度:', result2.confidence)
    if (result2.boundingBoxCheck?.distance) {
      console.log('距离:', result2.boundingBoxCheck.distance.toFixed(2))
    }
    
    // 测试边界情况
    console.log('\n🧪 测试3: 文字在方形边缘（边界情况）')
    const edgeMatrix = new THREE.Matrix4().makeTranslation(1.2, 0, 0)
    
    const result3 = booleanOperator.checkIntersectionComprehensive(
      cubeGeometry,
      textGeometry,
      edgeMatrix,
      { useBVH: true, fastOnly: false }
    )
    
    console.log('结果:', result3.finalResult ? '✅ 相交' : '❌ 不相交')
    console.log('置信度:', result3.confidence)
    
    // 清理资源
    cubeGeometry.dispose()
    textGeometry.dispose()
    
    console.log('\n✅ 简化相交检查测试完成')
    
    return {
      test1: result1.finalResult,
      test2: !result2.finalResult, // 应该不相交
      test3: result3.finalResult,
      allPassed: result1.finalResult && !result2.finalResult
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error)
    return { error: error.message }
  }
}

/**
 * 模拟工具栏按钮的功能
 */
export async function simulateToolbarButton() {
  console.log('========== 模拟工具栏按钮功能 ==========')
  
  try {
    // 创建测试几何体
    const cubeGeometry = new THREE.BoxGeometry(2, 2, 2)
    const textGeometry = new THREE.BoxGeometry(0.8, 0.3, 0.2)
    
    console.log('📦 创建测试几何体完成')
    console.log('   方形: 2x2x2, 顶点数:', cubeGeometry.getAttribute('position').count)
    console.log('   文字: 0.8x0.3x0.2, 顶点数:', textGeometry.getAttribute('position').count)
    
    // 创建布尔操作器
    const { BooleanOperator } = await import('./BooleanOperator.js')
    const booleanOperator = new BooleanOperator()
    
    if (!booleanOperator.isReady()) {
      throw new Error('布尔操作器未准备就绪')
    }
    
    console.log('✅ 布尔操作器准备就绪')
    
    // 测试多种情况
    const testCases = [
      { name: '中心相交', pos: [0, 0, 0], expected: true },
      { name: '部分重叠', pos: [0.8, 0, 0], expected: true },
      { name: '边缘接触', pos: [1.1, 0, 0], expected: false },
      { name: '完全分离', pos: [3, 0, 0], expected: false }
    ]
    
    console.log(`\n🧪 开始测试 ${testCases.length} 种情况...`)
    
    for (const testCase of testCases) {
      console.log(`\n--- ${testCase.name} ---`)
      
      const matrix = new THREE.Matrix4().makeTranslation(...testCase.pos)
      console.log(`位置: (${testCase.pos.join(', ')})`)
      
      const result = booleanOperator.checkIntersectionComprehensive(
        cubeGeometry,
        textGeometry,
        matrix,
        { useBVH: true, fastOnly: false }
      )
      
      const isCorrect = result.finalResult === testCase.expected
      console.log('相交:', result.finalResult ? '✅ 是' : '❌ 否')
      console.log('预期:', testCase.expected ? '相交' : '不相交')
      console.log('验证:', isCorrect ? '✅ 正确' : '⚠️ 错误')
      console.log('置信度:', result.confidence)
      
      if (result.boundingBoxCheck?.distance) {
        console.log('距离:', result.boundingBoxCheck.distance.toFixed(2))
      }
    }
    
    // 清理
    cubeGeometry.dispose()
    textGeometry.dispose()
    
    console.log('\n✅ 工具栏按钮功能测试完成')
    
  } catch (error) {
    console.error('❌ 模拟测试失败:', error)
  }
}

// 在浏览器控制台中运行:
// import('/src/utils/surfaceText/simple-intersection-test.js').then(m => m.simpleIntersectionTest())
// import('/src/utils/surfaceText/simple-intersection-test.js').then(m => m.simulateToolbarButton())