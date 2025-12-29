/**
 * 快速验证相交检查功能
 */
import * as THREE from 'three'
import { BooleanOperator } from './BooleanOperator.js'

export async function quickTest() {
  console.log('🚀 快速验证开始...')
  
  try {
    // 1. 测试 BooleanOperator 初始化
    const operator = new BooleanOperator()
    if (!operator.isReady()) {
      throw new Error('BooleanOperator 初始化失败')
    }
    console.log('✅ BooleanOperator 初始化成功')
    
    // 2. 创建简单几何体
    const cube = new THREE.BoxGeometry(1, 1, 1)
    const text = new THREE.BoxGeometry(0.5, 0.2, 0.1)
    console.log('✅ 几何体创建成功')
    
    // 3. 测试相交检查
    const result = operator.checkIntersectionComprehensive(cube, text)
    console.log('✅ 相交检查执行成功')
    console.log('   结果:', result.finalResult ? '相交' : '不相交')
    console.log('   置信度:', result.confidence)
    
    // 4. 清理
    cube.dispose()
    text.dispose()
    
    console.log('🎉 快速验证完成 - 所有功能正常！')
    return true
    
  } catch (error) {
    console.error('❌ 快速验证失败:', error.message)
    return false
  }
}

// 自动运行
// quickTest()