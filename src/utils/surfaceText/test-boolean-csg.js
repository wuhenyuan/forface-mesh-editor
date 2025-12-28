/**
 * three-bvh-csg 布尔操作测试
 * 在浏览器控制台中运行: import('/src/utils/surfaceText/test-boolean-csg.js').then(m => m.runTests())
 */
import * as THREE from 'three'
import { BooleanOperator } from './BooleanOperator.js'

/**
 * 运行所有测试
 */
export async function runTests () {
  console.log('========== three-bvh-csg 布尔操作测试 ==========')

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  }

  // 测试1: 初始化
  try {
    const operator = new BooleanOperator()
    const isReady = operator.isReady()

    if (isReady) {
      console.log('✅ 测试1: BooleanOperator 初始化成功')
      results.passed++
      results.tests.push({ name: '初始化', passed: true })
    } else {
      throw new Error('BooleanOperator 未就绪')
    }
  } catch (error) {
    console.error('❌ 测试1: BooleanOperator 初始化失败', error)
    results.failed++
    results.tests.push({ name: '初始化', passed: false, error: error.message })
  }

  // 测试2: 布尔减法 (立方体 - 球体)
  try {
    const operator = new BooleanOperator()

    const boxGeometry = new THREE.BoxGeometry(2, 2, 2)
    const sphereGeometry = new THREE.SphereGeometry(0.8, 16, 16)

    const result = await operator.subtract(boxGeometry, sphereGeometry)

    if (result && result.isBufferGeometry) {
      const vertexCount = result.getAttribute('position').count
      console.log(`✅ 测试2: 布尔减法成功，结果顶点数: ${vertexCount}`)
      results.passed++
      results.tests.push({ name: '布尔减法', passed: true, vertexCount })
    } else {
      throw new Error('布尔减法返回无效结果')
    }

    // 清理
    boxGeometry.dispose()
    sphereGeometry.dispose()
    result.dispose()

  } catch (error) {
    console.error('❌ 测试2: 布尔减法失败', error)
    results.failed++
    results.tests.push({ name: '布尔减法', passed: false, error: error.message })
  }

  // 测试3: 布尔加法 (立方体 + 圆柱体)
  try {
    const operator = new BooleanOperator()

    const boxGeometry = new THREE.BoxGeometry(2, 2, 2)
    const cylinderGeometry = new THREE.CylinderGeometry(0.3, 0.3, 3, 16)

    const result = await operator.union(boxGeometry, cylinderGeometry)

    if (result && result.isBufferGeometry) {
      const vertexCount = result.getAttribute('position').count
      console.log(`✅ 测试3: 布尔加法成功，结果顶点数: ${vertexCount}`)
      results.passed++
      results.tests.push({ name: '布尔加法', passed: true, vertexCount })
    } else {
      throw new Error('布尔加法返回无效结果')
    }

    // 清理
    boxGeometry.dispose()
    cylinderGeometry.dispose()
    result.dispose()

  } catch (error) {
    console.error('❌ 测试3: 布尔加法失败', error)
    results.failed++
    results.tests.push({ name: '布尔加法', passed: false, error: error.message })
  }

  // 测试4: 布尔交集 (立方体 ∩ 球体)
  try {
    const operator = new BooleanOperator()

    const boxGeometry = new THREE.BoxGeometry(2, 2, 2)
    const sphereGeometry = new THREE.SphereGeometry(1.2, 16, 16)

    const result = await operator.intersect(boxGeometry, sphereGeometry)

    if (result && result.isBufferGeometry) {
      const vertexCount = result.getAttribute('position').count
      console.log(`✅ 测试4: 布尔交集成功，结果顶点数: ${vertexCount}`)
      results.passed++
      results.tests.push({ name: '布尔交集', passed: true, vertexCount })
    } else {
      throw new Error('布尔交集返回无效结果')
    }

    // 清理
    boxGeometry.dispose()
    sphereGeometry.dispose()
    result.dispose()

  } catch (error) {
    console.error('❌ 测试4: 布尔交集失败', error)
    results.failed++
    results.tests.push({ name: '布尔交集', passed: false, error: error.message })
  }

  // 测试5: 带变换矩阵的布尔操作
  try {
    const operator = new BooleanOperator()

    const boxGeometry = new THREE.BoxGeometry(2, 2, 2)
    const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16)

    // 创建变换矩阵，将球体移动到立方体角落
    const matrix = new THREE.Matrix4()
    matrix.makeTranslation(0.8, 0.8, 0.8)

    const result = await operator.subtract(boxGeometry, sphereGeometry, matrix)

    if (result && result.isBufferGeometry) {
      const vertexCount = result.getAttribute('position').count
      console.log(`✅ 测试5: 带变换矩阵的布尔操作成功，结果顶点数: ${vertexCount}`)
      results.passed++
      results.tests.push({ name: '带变换矩阵', passed: true, vertexCount })
    } else {
      throw new Error('带变换矩阵的布尔操作返回无效结果')
    }

    // 清理
    boxGeometry.dispose()
    sphereGeometry.dispose()
    result.dispose()

  } catch (error) {
    console.error('❌ 测试5: 带变换矩阵的布尔操作失败', error)
    results.failed++
    results.tests.push({ name: '带变换矩阵', passed: false, error: error.message })
  }

  // 测试6: 批量布尔操作
  try {
    const operator = new BooleanOperator()

    const boxGeometry = new THREE.BoxGeometry(3, 3, 3)
    const sphere1 = new THREE.SphereGeometry(0.4, 12, 12)
    const sphere2 = new THREE.SphereGeometry(0.4, 12, 12)
    const sphere3 = new THREE.SphereGeometry(0.4, 12, 12)

    const operations = [
      { geometry: sphere1, matrix: new THREE.Matrix4().makeTranslation(1, 0, 0), operation: 'subtract' },
      { geometry: sphere2, matrix: new THREE.Matrix4().makeTranslation(-1, 0, 0), operation: 'subtract' },
      { geometry: sphere3, matrix: new THREE.Matrix4().makeTranslation(0, 1, 0), operation: 'subtract' }
    ]

    const result = await operator.batchOperation(boxGeometry, operations)

    if (result && result.isBufferGeometry) {
      const vertexCount = result.getAttribute('position').count
      console.log(`✅ 测试6: 批量布尔操作成功，结果顶点数: ${vertexCount}`)
      results.passed++
      results.tests.push({ name: '批量操作', passed: true, vertexCount })
    } else {
      throw new Error('批量布尔操作返回无效结果')
    }

    // 清理
    boxGeometry.dispose()
    sphere1.dispose()
    sphere2.dispose()
    sphere3.dispose()
    result.dispose()

  } catch (error) {
    console.error('❌ 测试6: 批量布尔操作失败', error)
    results.failed++
    results.tests.push({ name: '批量操作', passed: false, error: error.message })
  }

  // 测试7: 几何体验证
  try {
    const operator = new BooleanOperator()

    const validGeometry = new THREE.BoxGeometry(1, 1, 1)
    const validation = operator.validateGeometry(validGeometry)

    if (validation.isValid) {
      console.log(`✅ 测试7: 几何体验证成功，面数: ${validation.faceCount}`)
      results.passed++
      results.tests.push({ name: '几何体验证', passed: true })
    } else {
      throw new Error('有效几何体验证失败')
    }

    validGeometry.dispose()

  } catch (error) {
    console.error('❌ 测试7: 几何体验证失败', error)
    results.failed++
    results.tests.push({ name: '几何体验证', passed: false, error: error.message })
  }

  // 测试8: 获取统计信息
  try {
    const operator = new BooleanOperator()
    const stats = operator.getStats()

    if (stats.libraryLoaded && stats.libraryName === 'three-bvh-csg' && !stats.isSimulated) {
      console.log('✅ 测试8: 统计信息正确', stats)
      results.passed++
      results.tests.push({ name: '统计信息', passed: true, stats })
    } else {
      throw new Error('统计信息不正确')
    }

  } catch (error) {
    console.error('❌ 测试8: 统计信息测试失败', error)
    results.failed++
    results.tests.push({ name: '统计信息', passed: false, error: error.message })
  }

  // 输出总结
  console.log('\n========== 测试结果总结 ==========')
  console.log(`通过: ${results.passed}`)
  console.log(`失败: ${results.failed}`)
  console.log(`总计: ${results.passed + results.failed}`)

  if (results.failed === 0) {
    console.log('\n🎉 所有测试通过！three-bvh-csg 布尔操作已正确接入。')
  } else {
    console.log('\n⚠️ 部分测试失败，请检查错误信息。')
  }

  return results
}

// 导出单独的测试函数
export { BooleanOperator }
