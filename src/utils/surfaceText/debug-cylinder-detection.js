/**
 * 圆柱面检测调试工具
 * 用于调试和验证圆柱面检测功能
 */
import * as THREE from 'three'
import { cylinderSurfaceHelper } from './CylinderSurfaceHelper.js'

export class CylinderDetectionDebugger {
  constructor(scene) {
    this.scene = scene
    this.debugObjects = []
  }

  /**
   * 调试圆柱面检测
   * @param {THREE.Mesh} mesh - 要检测的网格
   * @returns {Object} 调试结果
   */
  debugCylinderDetection(mesh) {
    console.log('=== 圆柱面检测调试 ===')
    console.log('网格信息:', {
      name: mesh.name,
      type: mesh.type,
      geometryType: mesh.geometry.type,
      vertexCount: mesh.geometry.attributes.position?.count,
      hasIndex: !!mesh.geometry.index,
      boundingBox: mesh.geometry.boundingBox
    })

    // 计算边界框
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox()
    }
    const bbox = mesh.geometry.boundingBox
    console.log('边界框:', bbox)

    // 尝试检测圆柱面
    const cylinderInfo = cylinderSurfaceHelper.detectCylinder(mesh.geometry)
    
    if (cylinderInfo) {
      console.log('✅ 检测到圆柱面:', cylinderInfo)
      
      // 可视化圆柱面参数
      this.visualizeCylinderInfo(cylinderInfo)
      
      return {
        success: true,
        cylinderInfo: cylinderInfo,
        message: '成功检测到圆柱面'
      }
    } else {
      console.log('❌ 未检测到圆柱面')
      
      // 尝试分析为什么检测失败
      const analysis = this.analyzeCylinderDetectionFailure(mesh.geometry)
      console.log('失败分析:', analysis)
      
      return {
        success: false,
        cylinderInfo: null,
        analysis: analysis,
        message: '未检测到圆柱面'
      }
    }
  }

  /**
   * 分析圆柱面检测失败的原因
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {Object} 分析结果
   */
  analyzeCylinderDetectionFailure(geometry) {
    const analysis = {
      issues: [],
      suggestions: []
    }

    // 检查顶点数量
    const vertexCount = geometry.attributes.position?.count || 0
    if (vertexCount < 6) {
      analysis.issues.push(`顶点数量不足: ${vertexCount} < 6`)
      analysis.suggestions.push('需要至少6个顶点才能检测圆柱面')
    }

    // 检查几何体类型
    if (geometry.type !== 'CylinderGeometry' && geometry.type !== 'BufferGeometry') {
      analysis.issues.push(`几何体类型可能不支持: ${geometry.type}`)
    }

    // 检查是否有位置属性
    if (!geometry.attributes.position) {
      analysis.issues.push('缺少位置属性')
      analysis.suggestions.push('几何体必须有position属性')
    }

    // 尝试手动采样和分析
    if (geometry.attributes.position) {
      const positions = geometry.attributes.position.array
      const sampleSize = Math.min(20, vertexCount)
      const samples = []

      for (let i = 0; i < sampleSize; i++) {
        const idx = Math.floor(i * vertexCount / sampleSize) * 3
        samples.push(new THREE.Vector3(
          positions[idx],
          positions[idx + 1],
          positions[idx + 2]
        ))
      }

      // 分析点的分布
      const distribution = this.analyzePointDistribution(samples)
      analysis.distribution = distribution

      if (distribution.variance > 10) {
        analysis.issues.push('点分布方差过大，可能不是规则圆柱')
      }

      if (distribution.range.x < 0.1 || distribution.range.y < 0.1 || distribution.range.z < 0.1) {
        analysis.issues.push('几何体在某个轴向上过于扁平')
      }
    }

    return analysis
  }

  /**
   * 分析点分布
   * @param {THREE.Vector3[]} points - 点集
   * @returns {Object} 分布分析
   */
  analyzePointDistribution(points) {
    if (points.length === 0) return null

    // 计算质心
    const centroid = new THREE.Vector3()
    for (const point of points) {
      centroid.add(point)
    }
    centroid.divideScalar(points.length)

    // 计算范围
    const min = points[0].clone()
    const max = points[0].clone()
    
    for (const point of points) {
      min.min(point)
      max.max(point)
    }

    const range = max.clone().sub(min)

    // 计算方差
    let variance = 0
    for (const point of points) {
      variance += point.distanceToSquared(centroid)
    }
    variance /= points.length

    return {
      centroid: centroid,
      range: range,
      variance: variance,
      pointCount: points.length
    }
  }

  /**
   * 可视化圆柱面信息
   * @param {Object} cylinderInfo - 圆柱面信息
   */
  visualizeCylinderInfo(cylinderInfo) {
    // 清理之前的调试对象
    this.clearDebugObjects()

    const { center, axis, radius, height } = cylinderInfo

    // 1. 显示圆柱轴线
    const axisGeometry = new THREE.BufferGeometry().setFromPoints([
      center.clone().sub(axis.clone().multiplyScalar(height / 2)),
      center.clone().add(axis.clone().multiplyScalar(height / 2))
    ])
    const axisMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 })
    const axisLine = new THREE.Line(axisGeometry, axisMaterial)
    axisLine.name = 'CylinderAxis'
    this.scene.add(axisLine)
    this.debugObjects.push(axisLine)

    // 2. 显示圆柱中心点
    const centerGeometry = new THREE.SphereGeometry(0.1)
    const centerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    const centerSphere = new THREE.Mesh(centerGeometry, centerMaterial)
    centerSphere.position.copy(center)
    centerSphere.name = 'CylinderCenter'
    this.scene.add(centerSphere)
    this.debugObjects.push(centerSphere)

    // 3. 显示圆柱轮廓（线框）
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, height, 16, 1, true)
    const cylinderMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x0000ff, 
      wireframe: true,
      transparent: true,
      opacity: 0.5
    })
    const cylinderMesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial)
    
    // 定位圆柱
    cylinderMesh.position.copy(center)
    
    // 计算旋转使圆柱轴对齐
    const up = new THREE.Vector3(0, 1, 0)
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, axis.normalize())
    cylinderMesh.setRotationFromQuaternion(quaternion)
    
    cylinderMesh.name = 'CylinderWireframe'
    this.scene.add(cylinderMesh)
    this.debugObjects.push(cylinderMesh)

    console.log('圆柱面可视化已添加到场景')
  }

  /**
   * 清理调试对象
   */
  clearDebugObjects() {
    for (const obj of this.debugObjects) {
      this.scene.remove(obj)
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) obj.material.dispose()
    }
    this.debugObjects = []
  }

  /**
   * 测试标准圆柱几何体
   * @returns {Object} 测试结果
   */
  testStandardCylinder() {
    console.log('=== 测试标准圆柱几何体 ===')
    
    // 创建标准圆柱几何体
    const geometry = new THREE.CylinderGeometry(2, 2, 5, 16, 1)
    const material = new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'TestCylinder'
    
    // 添加到场景
    this.scene.add(mesh)
    this.debugObjects.push(mesh)
    
    // 测试检测
    const result = this.debugCylinderDetection(mesh)
    
    return {
      mesh: mesh,
      result: result
    }
  }

  /**
   * 创建测试场景
   * @returns {Array} 测试对象数组
   */
  createTestScene() {
    const testObjects = []

    // 1. 标准圆柱
    const cylinder1 = new THREE.CylinderGeometry(1, 1, 3, 12)
    const mesh1 = new THREE.Mesh(cylinder1, new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true }))
    mesh1.position.set(-4, 0, 0)
    mesh1.name = 'StandardCylinder'
    this.scene.add(mesh1)
    testObjects.push(mesh1)

    // 2. 高分辨率圆柱
    const cylinder2 = new THREE.CylinderGeometry(1.5, 1.5, 2, 32)
    const mesh2 = new THREE.Mesh(cylinder2, new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true }))
    mesh2.position.set(0, 0, 0)
    mesh2.name = 'HighResCylinder'
    this.scene.add(mesh2)
    testObjects.push(mesh2)

    // 3. 椭圆柱（应该检测失败）
    const cylinder3 = new THREE.CylinderGeometry(2, 1, 2, 16)
    const mesh3 = new THREE.Mesh(cylinder3, new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true }))
    mesh3.position.set(4, 0, 0)
    mesh3.name = 'ConeCylinder'
    this.scene.add(mesh3)
    testObjects.push(mesh3)

    // 4. 立方体（应该检测失败）
    const box = new THREE.BoxGeometry(2, 2, 2)
    const mesh4 = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true }))
    mesh4.position.set(0, 0, 4)
    mesh4.name = 'Box'
    this.scene.add(mesh4)
    testObjects.push(mesh4)

    this.debugObjects.push(...testObjects)

    // 测试每个对象
    console.log('=== 批量测试圆柱检测 ===')
    for (const mesh of testObjects) {
      console.log(`\n测试: ${mesh.name}`)
      this.debugCylinderDetection(mesh)
    }

    return testObjects
  }

  /**
   * 销毁调试器
   */
  destroy() {
    this.clearDebugObjects()
    console.log('圆柱面检测调试器已销毁')
  }
}

// 导出单例
export const cylinderDetectionDebugger = new CylinderDetectionDebugger()