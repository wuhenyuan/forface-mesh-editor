/**
 * 圆柱面文字功能快速测试
 * 用于验证功能是否正常工作
 */
import * as THREE from 'three'
import { cylinderSurfaceHelper } from './CylinderSurfaceHelper.js'

export class QuickTest {
  constructor() {
    this.results = []
  }

  /**
   * 运行快速测试
   */
  async runQuickTest() {
    console.log('🚀 开始圆柱面文字功能快速测试...')

    const tests = [
      this.testBasicCylinderDetection,
      this.testCoordinateConversion,
      this.testPathGeneration
    ]

    for (const test of tests) {
      try {
        const result = await test.call(this)
        this.results.push(result)
        console.log(`✅ ${result.name}: 通过`)
      } catch (error) {
        const result = {
          name: test.name,
          status: 'FAILED',
          error: error.message
        }
        this.results.push(result)
        console.error(`❌ ${result.name}: ${result.error}`)
      }
    }

    const passedCount = this.results.filter(r => r.status !== 'FAILED').length
    const totalCount = this.results.length
    
    console.log(`\n📊 测试结果: ${passedCount}/${totalCount} 通过`)
    
    if (passedCount === totalCount) {
      console.log('🎉 所有测试通过！圆柱面文字功能应该可以正常使用。')
      return true
    } else {
      console.log('⚠️ 部分测试失败，可能存在问题。')
      return false
    }
  }

  /**
   * 测试基础圆柱检测
   */
  testBasicCylinderDetection() {
    // 创建标准圆柱几何体
    const geometry = new THREE.CylinderGeometry(3, 3, 6, 16)
    
    // 检测圆柱面
    const result = cylinderSurfaceHelper.detectCylinder(geometry)
    
    if (!result) {
      throw new Error('未能检测到圆柱面')
    }

    if (result.confidence < 0.5) {
      throw new Error(`检测置信度过低: ${result.confidence}`)
    }

    return {
      name: '基础圆柱检测',
      status: 'PASSED',
      confidence: result.confidence,
      radius: result.radius,
      height: result.height
    }
  }

  /**
   * 测试坐标转换
   */
  testCoordinateConversion() {
    const cylinderInfo = {
      center: new THREE.Vector3(0, 0, 0),
      axis: new THREE.Vector3(0, 1, 0),
      radius: 3,
      height: 6
    }

    // 测试点
    const testPoint = new THREE.Vector3(3, 1, 0)

    // 世界坐标 → 圆柱坐标
    const cylinderCoords = cylinderSurfaceHelper.worldToCylinderCoords(testPoint, cylinderInfo)
    
    // 圆柱坐标 → 世界坐标
    const backToWorld = cylinderSurfaceHelper.cylinderToWorldCoords(
      cylinderCoords.theta, 
      cylinderCoords.height, 
      cylinderInfo
    )

    // 检查转换精度
    const distance = testPoint.distanceTo(backToWorld)
    
    if (distance > 0.1) {
      throw new Error(`坐标转换误差过大: ${distance}`)
    }

    return {
      name: '坐标转换',
      status: 'PASSED',
      error: distance
    }
  }

  /**
   * 测试路径生成
   */
  testPathGeneration() {
    const cylinderInfo = {
      center: new THREE.Vector3(0, 0, 0),
      axis: new THREE.Vector3(0, 1, 0),
      radius: 3,
      height: 6
    }

    const startPoint = new THREE.Vector3(3, 0, 0)
    const text = 'TEST'

    // 生成文字路径
    const path = cylinderSurfaceHelper.generateTextPath(
      text, 
      startPoint, 
      cylinderInfo,
      { fontSize: 1, letterSpacing: 0.2 }
    )

    if (path.length !== text.length) {
      throw new Error(`路径点数量不匹配: 期望${text.length}, 实际${path.length}`)
    }

    // 检查每个路径点是否在圆柱表面上
    for (const pathPoint of path) {
      const distance = cylinderSurfaceHelper.distanceTocylinder(pathPoint.position, cylinderInfo)
      if (distance > 0.2) {
        throw new Error(`路径点偏离圆柱表面: 距离${distance}`)
      }
    }

    return {
      name: '路径生成',
      status: 'PASSED',
      pathLength: path.length
    }
  }
}

// 导出快速测试函数
export async function runQuickTest() {
  const tester = new QuickTest()
  return await tester.runQuickTest()
}

// 如果直接运行此文件，执行测试
if (typeof window !== 'undefined') {
  window.runCylinderTextQuickTest = runQuickTest
}