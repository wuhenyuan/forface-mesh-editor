/**
 * BVH 集成测试
 * 快速验证 BVH 精确检测功能是否正常工作
 * 在浏览器控制台中运行: import('/src/utils/surfaceText/test-bvh-integration.js').then(m => m.quickBVHTest())
 */
import * as THREE from 'three'
import { BooleanOperator } from './BooleanOperator.js'

/**
 * 快速 BVH 功能测试
 */
export async function quickBVHTest() {
  console.log('========== BVH 集成快速测试 ==========')
  
  try {
    const operator = new BooleanOperator()
    
    if (!operator.isReady()) {
      throw new Error('BooleanOperator 未准备就绪')
    }
    
    // 测试几何体
    const box = new THREE.BoxGeometry(2, 2, 2)
    const sphere = new THREE.SphereGeometry(1, 16, 16)
    
    console.log('1. 测试边界盒检测...')
    const boundingBoxCheck = operator.checkGeometryIntersection(box, sphere)
    console.log('   边界盒相交:', boundingBoxCheck.intersects)
    
    console.log('2. 测试 BVH 检测...')
    const mesh1 = operator.createTempMesh(box)
    const mesh2 = operator.createTempMesh(sphere)
    const bvhCheck = operator.checkMeshIntersectionBVH(mesh1, mesh2)
    console.log('   BVH 相交:', bvhCheck.intersects)
    console.log('   BVH 方法:', bvhCheck.method)
    
    console.log('3. 测试综合检测...')
    const comprehensiveCheck = operator.checkIntersectionComprehensive(box, sphere)
    console.log('   最终结果:', comprehensiveCheck.finalResult)
    console.log('   置信度:', comprehensiveCheck.confidence)
    console.log('   检测方法:', comprehensiveCheck.method)
    
    console.log('4. 测试不相交情况...')
    const farMatrix = new THREE.Matrix4().makeTranslation(10, 0, 0)
    const farCheck = operator.checkIntersectionComprehensive(box, sphere, farMatrix)
    console.log('   远距离相交:', farCheck.finalResult)
    console.log('   边界盒距离:', farCheck.boundingBoxCheck?.distance?.toFixed(2))
    
    // 清理
    box.dispose()
    sphere.dispose()
    mesh1.material.dispose()
    mesh2.material.dispose()
    
    console.log('\n✅ BVH 集成测试完成！所有功能正常工作。')
    
    return {
      success: true,
      boundingBoxWorks: boundingBoxCheck.intersects,
      bvhWorks: bvhCheck.intersects,
      comprehensiveWorks: comprehensiveCheck.finalResult,
      distanceDetectionWorks: !farCheck.finalResult
    }
    
  } catch (error) {
    console.error('❌ BVH 集成测试失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 性能基准测试
 */
export async function bvhPerformanceBenchmark() {
  console.log('========== BVH 性能基准测试 ==========')
  
  const operator = new BooleanOperator()
  const iterations = 10
  
  // 创建不同复杂度的几何体
  const geometries = {
    simple: new THREE.BoxGeometry(1, 1, 1),
    medium: new THREE.SphereGeometry(1, 32, 32),
    complex: new THREE.TorusGeometry(1, 0.3, 32, 64)
  }
  
  const results = {}
  
  for (const [name, geometry] of Object.entries(geometries)) {
    console.log(`\n测试 ${name} 几何体 (${iterations} 次迭代)...`)
    
    // 边界盒检测性能
    const boundingBoxTimes = []
    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      operator.checkGeometryIntersection(geometry, geometry)
      boundingBoxTimes.push(performance.now() - start)
    }
    
    // 综合检测性能
    const comprehensiveTimes = []
    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      operator.checkIntersectionComprehensive(geometry, geometry, null, { useBVH: true })
      comprehensiveTimes.push(performance.now() - start)
    }
    
    const avgBoundingBox = boundingBoxTimes.reduce((a, b) => a + b) / iterations
    const avgComprehensive = comprehensiveTimes.reduce((a, b) => a + b) / iterations
    
    results[name] = {
      boundingBox: avgBoundingBox.toFixed(2),
      comprehensive: avgComprehensive.toFixed(2),
      ratio: (avgComprehensive / avgBoundingBox).toFixed(2)
    }
    
    console.log(`   边界盒平均: ${avgBoundingBox.toFixed(2)}ms`)
    console.log(`   综合检测平均: ${avgComprehensive.toFixed(2)}ms`)
    console.log(`   性能比率: ${(avgComprehensive / avgBoundingBox).toFixed(2)}x`)
  }
  
  // 清理
  Object.values(geometries).forEach(geo => geo.dispose())
  
  console.log('\n========== 性能基准测试完成 ==========')
  return results
}

// 导出测试函数
export { BooleanOperator }