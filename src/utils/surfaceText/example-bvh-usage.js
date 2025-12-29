/**
 * BVH 精确相交检测使用示例
 * 展示如何在实际项目中使用改进的布尔运算检测
 */
import * as THREE from 'three'
import { BooleanOperator } from './BooleanOperator.js'

/**
 * 示例1: 文字雕刻时的精确相交检测
 */
export async function exampleTextEngraving() {
  console.log('========== 文字雕刻精确检测示例 ==========')
  
  const operator = new BooleanOperator()
  
  // 创建表面几何体（例如一个平板）
  const surfaceGeometry = new THREE.BoxGeometry(10, 1, 10)
  
  // 创建文字几何体（假设已经生成）
  const textGeometry = new THREE.BoxGeometry(2, 0.5, 0.5) // 简化的文字几何体
  
  // 文字位置矩阵
  const textMatrix = new THREE.Matrix4().makeTranslation(0, 0.5, 0) // 文字在表面上方
  
  try {
    // 使用综合检测
    const intersectionCheck = operator.checkIntersectionComprehensive(
      surfaceGeometry, 
      textGeometry, 
      textMatrix,
      {
        useBVH: true,
        fastOnly: false
      }
    )
    
    console.log('相交检测结果:')
    console.log('- 边界盒检测:', intersectionCheck.boundingBoxCheck?.intersects)
    console.log('- BVH检测:', intersectionCheck.bvhCheck?.intersects)
    console.log('- 最终结果:', intersectionCheck.finalResult)
    console.log('- 置信度:', intersectionCheck.confidence)
    
    if (intersectionCheck.finalResult) {
      console.log('✅ 文字与表面相交，可以进行雕刻')
      
      // 执行布尔减法
      const result = await operator.subtract(surfaceGeometry, textGeometry, textMatrix, {
        textId: 'example-text-001'
      })
      
      console.log('雕刻完成，结果几何体顶点数:', result.geometry.getAttribute('position').count)
      
      // 清理
      result.geometry.dispose()
      result.materials.forEach(material => material.dispose())
      
    } else {
      console.log('⚠️ 文字与表面不相交，无法雕刻')
      
      // 可以提供用户反馈，建议调整文字位置
      const reason = intersectionCheck.bvhCheck?.reason || intersectionCheck.boundingBoxCheck?.reason
      console.log('原因:', reason)
    }
    
  } catch (error) {
    console.error('文字雕刻检测失败:', error)
  } finally {
    // 清理几何体
    surfaceGeometry.dispose()
    textGeometry.dispose()
  }
}

/**
 * 示例2: 复杂几何体的性能优化检测
 */
export async function examplePerformanceOptimization() {
  console.log('========== 性能优化检测示例 ==========')
  
  const operator = new BooleanOperator()
  
  // 创建不同复杂度的几何体
  const simpleGeometry = new THREE.BoxGeometry(1, 1, 1)
  const complexGeometry = new THREE.SphereGeometry(1, 64, 64) // 高精度球体
  const veryComplexGeometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 32) // 非常复杂
  
  const testCases = [
    { name: '简单几何体', geo1: simpleGeometry, geo2: simpleGeometry },
    { name: '中等复杂度', geo1: simpleGeometry, geo2: complexGeometry },
    { name: '高复杂度', geo1: complexGeometry, geo2: veryComplexGeometry }
  ]
  
  for (const testCase of testCases) {
    console.log(`\n测试: ${testCase.name}`)
    
    // 验证几何体复杂度
    const validation1 = operator.validateGeometry(testCase.geo1)
    const validation2 = operator.validateGeometry(testCase.geo2)
    const totalFaces = validation1.faceCount + validation2.faceCount
    
    console.log(`总面数: ${totalFaces}`)
    
    // 根据复杂度选择检测策略
    let detectionOptions
    if (totalFaces < 1000) {
      detectionOptions = { useBVH: true, fastOnly: false }
      console.log('策略: 使用 BVH 精确检测')
    } else if (totalFaces < 10000) {
      detectionOptions = { useBVH: true, fastOnly: false }
      console.log('策略: 综合检测（边界盒 + BVH）')
    } else {
      detectionOptions = { useBVH: false, fastOnly: true }
      console.log('策略: 仅边界盒检测（性能优先）')
    }
    
    // 执行检测并测量性能
    const startTime = performance.now()
    const intersectionCheck = operator.checkIntersectionComprehensive(
      testCase.geo1,
      testCase.geo2,
      null,
      detectionOptions
    )
    const endTime = performance.now()
    
    console.log(`检测耗时: ${(endTime - startTime).toFixed(2)}ms`)
    console.log(`检测结果: ${intersectionCheck.finalResult}`)
    console.log(`置信度: ${intersectionCheck.confidence}`)
  }
  
  // 清理
  simpleGeometry.dispose()
  complexGeometry.dispose()
  veryComplexGeometry.dispose()
}

/**
 * 示例3: 实时相交检测（用于UI反馈）
 */
export function exampleRealTimeDetection(scene, targetMesh, toolMesh) {
  console.log('========== 实时相交检测示例 ==========')
  
  const operator = new BooleanOperator()
  
  // 创建检测函数
  function updateIntersectionFeedback() {
    try {
      // 快速检测（适合实时更新）
      const quickCheck = operator.checkIntersectionComprehensive(
        targetMesh.geometry,
        toolMesh.geometry,
        toolMesh.matrixWorld,
        {
          useBVH: false, // 实时检测时关闭 BVH 以提高性能
          fastOnly: true
        }
      )
      
      // 更新视觉反馈
      if (quickCheck.finalResult) {
        // 相交 - 绿色表示可以执行布尔运算
        toolMesh.material.color.setHex(0x00ff00)
        toolMesh.material.opacity = 0.7
      } else {
        // 不相交 - 红色表示无法执行布尔运算
        toolMesh.material.color.setHex(0xff0000)
        toolMesh.material.opacity = 0.5
      }
      
      // 可选：显示距离信息
      if (quickCheck.boundingBoxCheck?.distance) {
        console.log(`几何体距离: ${quickCheck.boundingBoxCheck.distance.toFixed(2)}`)
      }
      
    } catch (error) {
      console.warn('实时检测失败:', error)
      // 默认显示为不确定状态
      toolMesh.material.color.setHex(0xffff00)
      toolMesh.material.opacity = 0.6
    }
  }
  
  // 返回更新函数，可以在动画循环中调用
  return updateIntersectionFeedback
}

/**
 * 示例4: 批量布尔运算的预检测
 */
export async function exampleBatchOperationPrecheck() {
  console.log('========== 批量运算预检测示例 ==========')
  
  const operator = new BooleanOperator()
  
  // 基础几何体
  const baseGeometry = new THREE.BoxGeometry(5, 5, 5)
  
  // 多个工具几何体
  const tools = [
    { 
      geometry: new THREE.SphereGeometry(0.8, 16, 16), 
      matrix: new THREE.Matrix4().makeTranslation(1, 0, 0),
      operation: 'subtract',
      id: 'hole-1'
    },
    { 
      geometry: new THREE.SphereGeometry(0.6, 16, 16), 
      matrix: new THREE.Matrix4().makeTranslation(-1.5, 0, 0),
      operation: 'subtract',
      id: 'hole-2'
    },
    { 
      geometry: new THREE.CylinderGeometry(0.3, 0.3, 6, 16), 
      matrix: new THREE.Matrix4().makeTranslation(0, 0, 2),
      operation: 'subtract',
      id: 'hole-3'
    }
  ]
  
  console.log(`准备执行 ${tools.length} 个布尔运算`)
  
  // 预检测每个工具
  const validTools = []
  const invalidTools = []
  
  for (const tool of tools) {
    const intersectionCheck = operator.checkIntersectionComprehensive(
      baseGeometry,
      tool.geometry,
      tool.matrix,
      {
        useBVH: true,
        fastOnly: false
      }
    )
    
    if (intersectionCheck.finalResult) {
      validTools.push(tool)
      console.log(`✅ ${tool.id}: 相交检测通过 (${intersectionCheck.confidence}置信度)`)
    } else {
      invalidTools.push(tool)
      const reason = intersectionCheck.bvhCheck?.reason || intersectionCheck.boundingBoxCheck?.reason
      console.log(`❌ ${tool.id}: 不相交 - ${reason}`)
    }
  }
  
  console.log(`\n预检测结果: ${validTools.length}个有效, ${invalidTools.length}个无效`)
  
  if (validTools.length > 0) {
    console.log('执行批量布尔运算...')
    
    try {
      const result = await operator.batchOperation(baseGeometry, validTools)
      console.log('批量运算完成，结果顶点数:', result.getAttribute('position').count)
      
      // 清理
      result.dispose()
    } catch (error) {
      console.error('批量运算失败:', error)
    }
  }
  
  // 清理几何体
  baseGeometry.dispose()
  tools.forEach(tool => tool.geometry.dispose())
}

/**
 * 运行所有示例
 */
export async function runAllExamples() {
  console.log('========== BVH 精确检测使用示例 ==========\n')
  
  try {
    await exampleTextEngraving()
    console.log('\n' + '='.repeat(50) + '\n')
    
    await examplePerformanceOptimization()
    console.log('\n' + '='.repeat(50) + '\n')
    
    await exampleBatchOperationPrecheck()
    console.log('\n' + '='.repeat(50) + '\n')
    
    console.log('✅ 所有示例运行完成')
    
  } catch (error) {
    console.error('示例运行失败:', error)
  }
}

// 在浏览器控制台中运行示例:
// import('/src/utils/surfaceText/example-bvh-usage.js').then(m => m.runAllExamples())