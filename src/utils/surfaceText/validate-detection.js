/**
 * 圆柱面检测算法验证脚本
 * 用于验证改进后的检测算法的效果
 */
import * as THREE from 'three'
import { cylinderSurfaceHelper } from './CylinderSurfaceHelper.js'

export class DetectionValidator {
  constructor() {
    this.testResults = []
  }

  /**
   * 运行完整的验证测试
   */
  async runValidation() {
    console.log('🔍 开始验证圆柱面检测算法...')

    const testSuites = [
      this.testStandardCylinders,
      this.testEdgeCases,
      this.testNonCylinders,
      this.testPerformance
    ]

    for (const testSuite of testSuites) {
      try {
        const results = await testSuite.call(this)
        this.testResults.push(...results)
      } catch (error) {
        console.error(`测试套件失败:`, error)
      }
    }

    this.generateReport()
    return this.testResults
  }

  /**
   * 测试标准圆柱体
   */
  testStandardCylinders() {
    console.log('📐 测试标准圆柱体...')

    const testCases = [
      { name: '标准圆柱', r: 5, h: 10, segments: 16 },
      { name: '细长圆柱', r: 2, h: 20, segments: 12 },
      { name: '粗短圆柱', r: 8, h: 4, segments: 24 },
      { name: '高精度圆柱', r: 3, h: 6, segments: 32 },
      { name: '低精度圆柱', r: 4, h: 8, segments: 8 }
    ]

    const results = []

    for (const testCase of testCases) {
      const startTime = performance.now()
      
      // 创建几何体
      const geometry = new THREE.CylinderGeometry(
        testCase.r, testCase.r, testCase.h, testCase.segments
      )

      // 检测圆柱面
      const detected = cylinderSurfaceHelper.detectCylinder(geometry)
      
      const endTime = performance.now()
      const duration = endTime - startTime

      // 计算误差
      const radiusError = detected ? 
        Math.abs(detected.radius - testCase.r) / testCase.r * 100 : 100
      const heightError = detected ? 
        Math.abs(detected.height - testCase.h) / testCase.h * 100 : 100

      const result = {
        category: '标准圆柱',
        name: testCase.name,
        expected: { radius: testCase.r, height: testCase.h },
        detected: detected,
        success: detected && detected.confidence > 0.7,
        confidence: detected?.confidence || 0,
        radiusError: radiusError,
        heightError: heightError,
        duration: duration,
        vertexCount: geometry.attributes.position.count
      }

      results.push(result)

      console.log(`  ${testCase.name}: ${result.success ? '✅' : '❌'} ` +
        `(置信度: ${(result.confidence * 100).toFixed(1)}%, ` +
        `半径误差: ${radiusError.toFixed(1)}%, ` +
        `耗时: ${duration.toFixed(1)}ms)`)
    }

    return results
  }

  /**
   * 测试边界情况
   */
  testEdgeCases() {
    console.log('⚠️ 测试边界情况...')

    const testCases = [
      {
        name: '极细圆柱',
        geometry: new THREE.CylinderGeometry(0.5, 0.5, 10, 8),
        shouldDetect: true
      },
      {
        name: '极短圆柱',
        geometry: new THREE.CylinderGeometry(5, 5, 0.5, 16),
        shouldDetect: false // 太短，可能被拒绝
      },
      {
        name: '截锥体',
        geometry: new THREE.CylinderGeometry(3, 5, 8, 16),
        shouldDetect: false // 不是标准圆柱
      },
      {
        name: '三角柱',
        geometry: new THREE.CylinderGeometry(4, 4, 6, 3),
        shouldDetect: false // 面数太少
      }
    ]

    const results = []

    for (const testCase of testCases) {
      const startTime = performance.now()
      const detected = cylinderSurfaceHelper.detectCylinder(testCase.geometry)
      const endTime = performance.now()

      const actuallyDetected = detected && detected.confidence > 0.7
      const success = actuallyDetected === testCase.shouldDetect

      const result = {
        category: '边界情况',
        name: testCase.name,
        shouldDetect: testCase.shouldDetect,
        actuallyDetected: actuallyDetected,
        success: success,
        confidence: detected?.confidence || 0,
        duration: endTime - startTime
      }

      results.push(result)

      console.log(`  ${testCase.name}: ${result.success ? '✅' : '❌'} ` +
        `(期望: ${testCase.shouldDetect ? '检测' : '拒绝'}, ` +
        `实际: ${actuallyDetected ? '检测' : '拒绝'}, ` +
        `置信度: ${(result.confidence * 100).toFixed(1)}%)`)
    }

    return results
  }

  /**
   * 测试非圆柱几何体
   */
  testNonCylinders() {
    console.log('🚫 测试非圆柱几何体...')

    const testCases = [
      {
        name: '立方体',
        geometry: new THREE.BoxGeometry(5, 5, 5)
      },
      {
        name: '球体',
        geometry: new THREE.SphereGeometry(5, 16, 12)
      },
      {
        name: '平面',
        geometry: new THREE.PlaneGeometry(10, 10, 10, 10)
      },
      {
        name: '环面',
        geometry: new THREE.TorusGeometry(5, 2, 8, 16)
      },
      {
        name: '八面体',
        geometry: new THREE.OctahedronGeometry(5)
      }
    ]

    const results = []

    for (const testCase of testCases) {
      const startTime = performance.now()
      const detected = cylinderSurfaceHelper.detectCylinder(testCase.geometry)
      const endTime = performance.now()

      const incorrectlyDetected = detected && detected.confidence > 0.5
      const success = !incorrectlyDetected

      const result = {
        category: '非圆柱几何体',
        name: testCase.name,
        incorrectlyDetected: incorrectlyDetected,
        success: success,
        confidence: detected?.confidence || 0,
        duration: endTime - startTime
      }

      results.push(result)

      console.log(`  ${testCase.name}: ${result.success ? '✅' : '❌'} ` +
        `(${incorrectlyDetected ? '错误检测' : '正确拒绝'}, ` +
        `置信度: ${(result.confidence * 100).toFixed(1)}%)`)
    }

    return results
  }

  /**
   * 测试性能
   */
  testPerformance() {
    console.log('⚡ 测试性能...')

    const testCases = [
      { name: '低精度', segments: 8, count: 100 },
      { name: '中精度', segments: 16, count: 50 },
      { name: '高精度', segments: 32, count: 20 },
      { name: '超高精度', segments: 64, count: 10 }
    ]

    const results = []

    for (const testCase of testCases) {
      const durations = []
      
      for (let i = 0; i < testCase.count; i++) {
        const geometry = new THREE.CylinderGeometry(5, 5, 10, testCase.segments)
        
        const startTime = performance.now()
        cylinderSurfaceHelper.detectCylinder(geometry)
        const endTime = performance.now()
        
        durations.push(endTime - startTime)
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      const maxDuration = Math.max(...durations)
      const minDuration = Math.min(...durations)

      const result = {
        category: '性能测试',
        name: testCase.name,
        segments: testCase.segments,
        testCount: testCase.count,
        avgDuration: avgDuration,
        maxDuration: maxDuration,
        minDuration: minDuration,
        success: avgDuration < 50 // 期望平均耗时小于50ms
      }

      results.push(result)

      console.log(`  ${testCase.name} (${testCase.segments}面): ` +
        `平均 ${avgDuration.toFixed(1)}ms, ` +
        `最大 ${maxDuration.toFixed(1)}ms, ` +
        `最小 ${minDuration.toFixed(1)}ms`)
    }

    return results
  }

  /**
   * 生成测试报告
   */
  generateReport() {
    console.log('\n📊 测试报告汇总:')

    const categories = [...new Set(this.testResults.map(r => r.category))]
    
    for (const category of categories) {
      const categoryResults = this.testResults.filter(r => r.category === category)
      const successCount = categoryResults.filter(r => r.success).length
      const totalCount = categoryResults.length
      const successRate = (successCount / totalCount * 100).toFixed(1)

      console.log(`\n${category}:`)
      console.log(`  成功率: ${successCount}/${totalCount} (${successRate}%)`)

      if (category === '标准圆柱') {
        const avgConfidence = categoryResults
          .filter(r => r.detected)
          .reduce((sum, r) => sum + r.confidence, 0) / 
          categoryResults.filter(r => r.detected).length

        const avgRadiusError = categoryResults
          .filter(r => r.detected)
          .reduce((sum, r) => sum + r.radiusError, 0) / 
          categoryResults.filter(r => r.detected).length

        console.log(`  平均置信度: ${(avgConfidence * 100).toFixed(1)}%`)
        console.log(`  平均半径误差: ${avgRadiusError.toFixed(1)}%`)
      }

      if (category === '性能测试') {
        const avgDuration = categoryResults
          .reduce((sum, r) => sum + r.avgDuration, 0) / categoryResults.length

        console.log(`  平均检测耗时: ${avgDuration.toFixed(1)}ms`)
      }
    }

    // 总体统计
    const totalSuccess = this.testResults.filter(r => r.success).length
    const totalTests = this.testResults.length
    const overallSuccessRate = (totalSuccess / totalTests * 100).toFixed(1)

    console.log(`\n🎯 总体成功率: ${totalSuccess}/${totalTests} (${overallSuccessRate}%)`)

    // 性能统计
    const performanceResults = this.testResults.filter(r => r.duration !== undefined)
    if (performanceResults.length > 0) {
      const avgPerformance = performanceResults
        .reduce((sum, r) => sum + r.duration, 0) / performanceResults.length
      console.log(`⚡ 平均检测耗时: ${avgPerformance.toFixed(1)}ms`)
    }
  }

  /**
   * 创建可视化测试场景
   */
  createVisualValidation(scene) {
    console.log('🎨 创建可视化验证场景...')

    const testObjects = []

    // 创建各种测试几何体
    const geometries = [
      { 
        name: '标准圆柱', 
        geometry: new THREE.CylinderGeometry(3, 3, 6, 16),
        position: new THREE.Vector3(-8, 3, 0),
        color: 0x409eff
      },
      { 
        name: '细长圆柱', 
        geometry: new THREE.CylinderGeometry(1.5, 1.5, 8, 12),
        position: new THREE.Vector3(-4, 4, 0),
        color: 0x67c23a
      },
      { 
        name: '粗短圆柱', 
        geometry: new THREE.CylinderGeometry(4, 4, 2, 20),
        position: new THREE.Vector3(0, 1, 0),
        color: 0xe6a23c
      },
      { 
        name: '立方体', 
        geometry: new THREE.BoxGeometry(4, 4, 4),
        position: new THREE.Vector3(4, 2, 0),
        color: 0xf56c6c
      },
      { 
        name: '球体', 
        geometry: new THREE.SphereGeometry(2.5, 16, 12),
        position: new THREE.Vector3(8, 2.5, 0),
        color: 0x909399
      }
    ]

    for (const config of geometries) {
      // 创建网格
      const material = new THREE.MeshStandardMaterial({
        color: config.color,
        transparent: true,
        opacity: 0.8
      })
      
      const mesh = new THREE.Mesh(config.geometry, material)
      mesh.position.copy(config.position)
      mesh.name = config.name
      
      scene.add(mesh)
      testObjects.push(mesh)

      // 检测圆柱面
      const detected = cylinderSurfaceHelper.detectCylinder(config.geometry)
      
      // 添加检测结果标记
      const isDetected = detected && detected.confidence > 0.7
      const markerColor = isDetected ? 0x00ff00 : 0xff0000
      
      const markerGeometry = new THREE.SphereGeometry(0.2, 8, 6)
      const markerMaterial = new THREE.MeshBasicMaterial({ color: markerColor })
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      
      marker.position.copy(config.position)
      marker.position.y += 4
      
      scene.add(marker)
      testObjects.push(marker)

      console.log(`${config.name}: ${isDetected ? '✅ 检测到' : '❌ 未检测'} ` +
        `(置信度: ${detected ? (detected.confidence * 100).toFixed(1) : 0}%)`)
    }

    return testObjects
  }
}

// 导出验证器
export const detectionValidator = new DetectionValidator()