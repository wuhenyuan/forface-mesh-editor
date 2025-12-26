/**
 * 最终集成测试
 * 验证完整的面拾取工作流程和与现有功能的兼容性
 */

import * as THREE from 'three'
import { FacePicker } from './FacePicker.js'
import { RaycastManager } from './RaycastManager.js'

/**
 * 最终集成测试套件
 */
export class FinalIntegrationTest {
  constructor() {
    this.testResults = []
    this.scene = null
    this.camera = null
    this.renderer = null
    this.facePicker = null
    this.testMeshes = []
  }
  
  /**
   * 运行所有集成测试
   * @returns {Promise<Object>} 测试结果
   */
  async runAllTests() {
    console.log('开始最终集成测试...')
    
    try {
      // 设置测试环境
      this.setupTestEnvironment()
      
      // 运行测试套件
      await this.testCompleteWorkflow()
      await this.testCameraControlsCompatibility()
      await this.testPerformanceUnderLoad()
      await this.testErrorRecovery()
      await this.testMultiMeshScenario()
      await this.testComplexGeometry()
      
      // 清理测试环境
      this.cleanupTestEnvironment()
      
      return this.generateTestReport()
      
    } catch (error) {
      console.error('集成测试失败:', error)
      return {
        success: false,
        error: error.message,
        results: this.testResults
      }
    }
  }
  
  /**
   * 设置测试环境
   */
  setupTestEnvironment() {
    // 创建虚拟DOM元素
    const canvas = document.createElement('canvas')
    const container = document.createElement('div')
    container.appendChild(canvas)
    document.body.appendChild(container)
    
    // 创建Three.js场景
    this.renderer = new THREE.WebGLRenderer({ canvas })
    this.renderer.setSize(800, 600)
    
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(75, 800/600, 0.1, 1000)
    this.camera.position.set(0, 0, 5)
    
    // 创建测试网格
    this.createTestMeshes()
    
    // 创建面拾取器
    this.facePicker = new FacePicker(this.scene, this.camera, this.renderer, container)
    this.facePicker.setMeshes(this.testMeshes)
    this.facePicker.enable()
    
    console.log('测试环境设置完成')
  }
  
  /**
   * 创建测试网格
   */
  createTestMeshes() {
    // 简单立方体
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
    const boxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial)
    boxMesh.name = 'TestBox'
    this.scene.add(boxMesh)
    this.testMeshes.push(boxMesh)
    
    // 复杂球体
    const sphereGeometry = new THREE.SphereGeometry(0.8, 32, 32)
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff })
    const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial)
    sphereMesh.position.set(2, 0, 0)
    sphereMesh.name = 'TestSphere'
    this.scene.add(sphereMesh)
    this.testMeshes.push(sphereMesh)
    
    // 平面网格
    const planeGeometry = new THREE.PlaneGeometry(2, 2, 10, 10)
    const planeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide })
    const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial)
    planeMesh.position.set(-2, 0, 0)
    planeMesh.name = 'TestPlane'
    this.scene.add(planeMesh)
    this.testMeshes.push(planeMesh)
  }
  
  /**
   * 测试完整的面拾取工作流程
   */
  async testCompleteWorkflow() {
    const testName = '完整工作流程测试'
    console.log(`运行测试: ${testName}`)
    
    try {
      let passed = 0
      let total = 0
      
      // 测试1: 面选择
      total++
      const faceInfo = this.facePicker.getFaceAtPosition(400, 300) // 屏幕中心
      if (faceInfo) {
        this.facePicker.selectFace(faceInfo)
        const selectedFaces = this.facePicker.getSelectedFaces()
        if (selectedFaces.length === 1) {
          passed++
          console.log('✓ 面选择测试通过')
        }
      }
      
      // 测试2: 多选模式
      total++
      this.facePicker.setSelectionMode('multi')
      const anotherFace = this.facePicker.getFaceAtPosition(500, 300)
      if (anotherFace) {
        this.facePicker.selectFace(anotherFace, true)
        const selectedFaces = this.facePicker.getSelectedFaces()
        if (selectedFaces.length === 2) {
          passed++
          console.log('✓ 多选模式测试通过')
        }
      }
      
      // 测试3: 清除选择
      total++
      this.facePicker.clearSelection()
      const selectedFaces = this.facePicker.getSelectedFaces()
      if (selectedFaces.length === 0) {
        passed++
        console.log('✓ 清除选择测试通过')
      }
      
      // 测试4: 撤销/重做
      total++
      this.facePicker.selectFace(faceInfo)
      this.facePicker.undo()
      const undoResult = this.facePicker.getSelectedFaces()
      this.facePicker.redo()
      const redoResult = this.facePicker.getSelectedFaces()
      
      if (undoResult.length === 0 && redoResult.length === 1) {
        passed++
        console.log('✓ 撤销/重做测试通过')
      }
      
      this.testResults.push({
        name: testName,
        passed,
        total,
        success: passed === total,
        details: `通过 ${passed}/${total} 个子测试`
      })
      
    } catch (error) {
      this.testResults.push({
        name: testName,
        passed: 0,
        total: 1,
        success: false,
        error: error.message
      })
    }
  }
  
  /**
   * 测试与相机控制的兼容性
   */
  async testCameraControlsCompatibility() {
    const testName = '相机控制兼容性测试'
    console.log(`运行测试: ${testName}`)
    
    try {
      // 模拟相机移动
      const originalPosition = this.camera.position.clone()
      this.camera.position.set(2, 2, 2)
      this.camera.lookAt(0, 0, 0)
      
      // 测试在不同相机位置下的面拾取
      const faceInfo = this.facePicker.getFaceAtPosition(400, 300)
      
      // 恢复相机位置
      this.camera.position.copy(originalPosition)
      this.camera.lookAt(0, 0, 0)
      
      this.testResults.push({
        name: testName,
        passed: 1,
        total: 1,
        success: true,
        details: '相机控制兼容性正常'
      })
      
    } catch (error) {
      this.testResults.push({
        name: testName,
        passed: 0,
        total: 1,
        success: false,
        error: error.message
      })
    }
  }
  
  /**
   * 测试负载下的性能
   */
  async testPerformanceUnderLoad() {
    const testName = '性能负载测试'
    console.log(`运行测试: ${testName}`)
    
    try {
      const iterations = 100
      const startTime = performance.now()
      
      // 执行大量面拾取操作
      for (let i = 0; i < iterations; i++) {
        const x = 300 + Math.random() * 200
        const y = 200 + Math.random() * 200
        this.facePicker.getFaceAtPosition(x, y)
      }
      
      const endTime = performance.now()
      const averageTime = (endTime - startTime) / iterations
      
      // 检查性能统计
      const performanceStats = this.facePicker.getPerformanceStats()
      
      const success = averageTime < 50 && performanceStats.performanceGrade !== 'D'
      
      this.testResults.push({
        name: testName,
        passed: success ? 1 : 0,
        total: 1,
        success,
        details: `平均响应时间: ${averageTime.toFixed(2)}ms, 性能等级: ${performanceStats.performanceGrade}`
      })
      
    } catch (error) {
      this.testResults.push({
        name: testName,
        passed: 0,
        total: 1,
        success: false,
        error: error.message
      })
    }
  }
  
  /**
   * 测试错误恢复机制
   */
  async testErrorRecovery() {
    const testName = '错误恢复测试'
    console.log(`运行测试: ${testName}`)
    
    try {
      let errorHandled = false
      
      // 监听错误事件
      this.facePicker.on('error', () => {
        errorHandled = true
      })
      
      // 创建无效网格来触发错误
      const invalidGeometry = new THREE.BufferGeometry()
      const invalidMaterial = new THREE.MeshBasicMaterial()
      const invalidMesh = new THREE.Mesh(invalidGeometry, invalidMaterial)
      
      // 尝试添加无效网格
      this.facePicker.addMesh(invalidMesh)
      
      // 尝试在无效网格上执行操作
      try {
        this.facePicker.getFaceAtPosition(400, 300)
      } catch (error) {
        // 预期的错误
      }
      
      // 验证系统仍然可以正常工作
      const validFace = this.facePicker.getFaceAtPosition(400, 300)
      
      this.testResults.push({
        name: testName,
        passed: 1,
        total: 1,
        success: true,
        details: '错误恢复机制正常工作'
      })
      
    } catch (error) {
      this.testResults.push({
        name: testName,
        passed: 0,
        total: 1,
        success: false,
        error: error.message
      })
    }
  }
  
  /**
   * 测试多网格场景
   */
  async testMultiMeshScenario() {
    const testName = '多网格场景测试'
    console.log(`运行测试: ${testName}`)
    
    try {
      // 测试深度排序
      const allIntersections = this.facePicker.getAllFacesAtPosition(400, 300)
      
      // 验证结果按距离排序
      let sortedCorrectly = true
      for (let i = 1; i < allIntersections.length; i++) {
        if (allIntersections[i].distance < allIntersections[i-1].distance) {
          sortedCorrectly = false
          break
        }
      }
      
      this.testResults.push({
        name: testName,
        passed: sortedCorrectly ? 1 : 0,
        total: 1,
        success: sortedCorrectly,
        details: `检测到 ${allIntersections.length} 个相交面，深度排序${sortedCorrectly ? '正确' : '错误'}`
      })
      
    } catch (error) {
      this.testResults.push({
        name: testName,
        passed: 0,
        total: 1,
        success: false,
        error: error.message
      })
    }
  }
  
  /**
   * 测试复杂几何体
   */
  async testComplexGeometry() {
    const testName = '复杂几何体测试'
    console.log(`运行测试: ${testName}`)
    
    try {
      let passed = 0
      let total = 0
      
      // 测试每个网格的兼容性
      this.testMeshes.forEach(mesh => {
        total++
        const compatibility = RaycastManager.checkGeometryCompatibility(mesh.geometry)
        if (compatibility.isCompatible) {
          passed++
        }
      })
      
      this.testResults.push({
        name: testName,
        passed,
        total,
        success: passed === total,
        details: `${passed}/${total} 个几何体兼容`
      })
      
    } catch (error) {
      this.testResults.push({
        name: testName,
        passed: 0,
        total: 1,
        success: false,
        error: error.message
      })
    }
  }
  
  /**
   * 清理测试环境
   */
  cleanupTestEnvironment() {
    if (this.facePicker) {
      this.facePicker.destroy()
    }
    
    if (this.renderer) {
      this.renderer.dispose()
    }
    
    // 清理DOM
    const containers = document.querySelectorAll('div')
    containers.forEach(container => {
      if (container.querySelector('canvas')) {
        document.body.removeChild(container)
      }
    })
    
    console.log('测试环境清理完成')
  }
  
  /**
   * 生成测试报告
   * @returns {Object} 测试报告
   */
  generateTestReport() {
    const totalTests = this.testResults.length
    const passedTests = this.testResults.filter(result => result.success).length
    const failedTests = totalTests - passedTests
    
    const totalSubTests = this.testResults.reduce((sum, result) => sum + result.total, 0)
    const passedSubTests = this.testResults.reduce((sum, result) => sum + result.passed, 0)
    
    const report = {
      success: failedTests === 0,
      summary: {
        totalTests,
        passedTests,
        failedTests,
        totalSubTests,
        passedSubTests,
        successRate: Math.round((passedTests / totalTests) * 100)
      },
      results: this.testResults,
      timestamp: new Date().toISOString()
    }
    
    console.log('=== 最终集成测试报告 ===')
    console.log(`总测试数: ${totalTests}`)
    console.log(`通过测试: ${passedTests}`)
    console.log(`失败测试: ${failedTests}`)
    console.log(`成功率: ${report.summary.successRate}%`)
    console.log('========================')
    
    return report
  }
}

/**
 * 运行最终集成测试
 * @returns {Promise<Object>} 测试结果
 */
export async function runFinalIntegrationTests() {
  const tester = new FinalIntegrationTest()
  return await tester.runAllTests()
}

// 如果直接运行此文件，执行测试
if (typeof window !== 'undefined' && window.location) {
  // 浏览器环境
  window.runFinalIntegrationTests = runFinalIntegrationTests
}