/**
 * 相交检查演示
 * 用于测试工具栏相交检查按钮的功能
 */
import * as THREE from 'three'
import { BooleanOperator } from './BooleanOperator.js'

/**
 * 创建测试用的几何体和场景
 */
export function createTestScene() {
  // 创建正方体（目标网格）
  const cubeGeometry = new THREE.BoxGeometry(2, 2, 2)
  const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x409eff })
  const cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial)
  cubeMesh.name = '测试正方体'
  
  // 创建文字几何体（简化版）
  const textGeometry = new THREE.BoxGeometry(0.5, 0.2, 0.1)
  const textMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b6b })
  const textMesh = new THREE.Mesh(textGeometry, textMaterial)
  textMesh.name = '测试文字'
  
  // 模拟文字对象结构
  const mockTextObject = {
    id: 'demo-text-001',
    content: '测试文字',
    textMesh: textMesh,
    config: {
      font: 'Arial',
      size: 1,
      thickness: 0.1,
      color: 0xff6b6b
    }
  }
  
  return {
    cubeMesh,
    textMesh,
    mockTextObject
  }
}

/**
 * 演示相交检查的不同情况
 */
export async function demonstrateIntersectionChecks() {
  console.log('========== 相交检查演示 ==========')
  
  const booleanOperator = new BooleanOperator()
  
  if (!booleanOperator.isReady()) {
    console.error('❌ 布尔操作器未准备就绪')
    return
  }
  
  const { cubeMesh, textMesh, mockTextObject } = createTestScene()
  
  // 测试场景1: 文字与正方体相交
  console.log('\n--- 场景1: 文字与正方体相交 ---')
  textMesh.position.set(0, 0, 0) // 文字在正方体中心
  textMesh.updateMatrixWorld()
  
  let result = booleanOperator.checkIntersectionComprehensive(
    cubeMesh.geometry,
    textMesh.geometry,
    textMesh.matrixWorld
  )
  
  console.log('📊 相交结果:', result.finalResult ? '✅ 相交' : '❌ 不相交')
  console.log('📊 置信度:', result.confidence)
  console.log('📊 检测方法:', result.method)
  
  // 测试场景2: 文字距离正方体较远
  console.log('\n--- 场景2: 文字距离正方体较远 ---')
  textMesh.position.set(5, 0, 0) // 文字远离正方体
  textMesh.updateMatrixWorld()
  
  result = booleanOperator.checkIntersectionComprehensive(
    cubeMesh.geometry,
    textMesh.geometry,
    textMesh.matrixWorld
  )
  
  console.log('📊 相交结果:', result.finalResult ? '✅ 相交' : '❌ 不相交')
  console.log('📊 置信度:', result.confidence)
  if (result.boundingBoxCheck?.distance) {
    console.log('📊 距离:', result.boundingBoxCheck.distance.toFixed(2))
  }
  
  // 测试场景3: 文字刚好接触正方体表面
  console.log('\n--- 场景3: 文字接触正方体表面 ---')
  textMesh.position.set(1.05, 0, 0) // 文字刚好接触正方体表面
  textMesh.updateMatrixWorld()
  
  result = booleanOperator.checkIntersectionComprehensive(
    cubeMesh.geometry,
    textMesh.geometry,
    textMesh.matrixWorld
  )
  
  console.log('📊 相交结果:', result.finalResult ? '✅ 相交' : '❌ 不相交')
  console.log('📊 置信度:', result.confidence)
  console.log('📊 边界情况处理:', result.bvhCheck ? 'BVH检测' : '边界盒检测')
  
  // 清理资源
  cubeMesh.geometry.dispose()
  cubeMesh.material.dispose()
  textMesh.geometry.dispose()
  textMesh.material.dispose()
  
  console.log('\n✅ 相交检查演示完成')
}

/**
 * 模拟工具栏按钮的相交检查逻辑
 */
export async function simulateToolbarIntersectionCheck(selectedTextObject, targetMeshes) {
  console.log('========== 模拟工具栏相交检查 ==========')
  
  if (!selectedTextObject) {
    console.warn('⚠️ 没有选中的文字对象')
    return { success: false, reason: '没有选中文字' }
  }
  
  if (!targetMeshes || targetMeshes.length === 0) {
    console.warn('⚠️ 没有目标网格')
    return { success: false, reason: '没有目标网格' }
  }
  
  console.log('📝 检查文字:', selectedTextObject.content)
  console.log('🎯 目标网格数量:', targetMeshes.length)
  
  const booleanOperator = new BooleanOperator()
  const results = []
  
  for (let i = 0; i < targetMeshes.length; i++) {
    const targetMesh = targetMeshes[i]
    console.log(`\n--- 检查目标网格 ${i + 1}: ${targetMesh.name || '未命名'} ---`)
    
    const textMatrix = selectedTextObject.textMesh.matrixWorld
    
    const intersectionResult = booleanOperator.checkIntersectionComprehensive(
      targetMesh.geometry,
      selectedTextObject.textMesh.geometry,
      textMatrix,
      {
        useBVH: true,
        fastOnly: false
      }
    )
    
    results.push({
      targetMesh: targetMesh.name || `网格${i + 1}`,
      intersects: intersectionResult.finalResult,
      confidence: intersectionResult.confidence,
      method: intersectionResult.method,
      details: intersectionResult
    })
    
    console.log('📊 相交状态:', intersectionResult.finalResult ? '✅ 相交' : '❌ 不相交')
    console.log('📊 置信度:', intersectionResult.confidence)
  }
  
  return { success: true, results }
}

/**
 * 在浏览器控制台中运行演示
 */
export async function runIntersectionDemo() {
  try {
    await demonstrateIntersectionChecks()
    
    // 创建模拟数据测试工具栏逻辑
    const { cubeMesh, mockTextObject } = createTestScene()
    const result = await simulateToolbarIntersectionCheck(mockTextObject, [cubeMesh])
    
    console.log('\n========== 工具栏检查结果 ==========')
    console.log('成功:', result.success)
    if (result.results) {
      result.results.forEach((r, i) => {
        console.log(`结果${i + 1}:`, r.targetMesh, r.intersects ? '相交' : '不相交')
      })
    }
    
  } catch (error) {
    console.error('演示失败:', error)
  }
}

// 在浏览器控制台中运行:
// import('/src/utils/surfaceText/intersection-check-demo.js').then(m => m.runIntersectionDemo())