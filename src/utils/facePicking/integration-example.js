/**
 * 优化面拾取系统集成示例
 * 展示如何使用基于 BVH + Feature 预处理的高性能面拾取
 */

import * as THREE from 'three'
import { OptimizedFacePicker } from './OptimizedFacePicker.js'
import { FeaturePool } from './FeaturePool.js'

/**
 * 创建优化的面拾取系统
 * @param {THREE.Scene} scene - 场景
 * @param {THREE.Camera} camera - 相机
 * @param {THREE.WebGLRenderer} renderer - 渲染器
 * @param {HTMLElement} domElement - DOM元素
 * @returns {Promise<OptimizedFacePicker>} 优化面拾取器实例
 */
export async function createOptimizedFacePicker(scene, camera, renderer, domElement) {
  console.log('创建优化面拾取系统...')
  
  // 创建优化面拾取器
  const facePicker = new OptimizedFacePicker(scene, camera, renderer, domElement)
  
  // 配置优化参数
  facePicker.config = {
    enableFeatureDetection: true,    // 启用特征检测
    enableBVHAcceleration: true,     // 启用BVH加速
    enablePreprocessing: true,       // 启用预处理
    maxPreprocessingTime: 5000,      // 最大预处理时间
    batchSize: 3,                    // 批处理大小
    enableAsyncProcessing: true      // 启用异步处理
  }
  
  // 设置事件监听器
  setupEventListeners(facePicker)
  
  return facePicker
}

/**
 * 设置事件监听器
 * @param {OptimizedFacePicker} facePicker - 面拾取器
 */
function setupEventListeners(facePicker) {
  // 初始化完成事件
  facePicker.on('initialized', (data) => {
    console.log(`面拾取系统初始化完成: ${data.meshCount} 个网格, 耗时: ${data.initTime.toFixed(2)}ms`)
  })
  
  // 面选择事件
  facePicker.on('faceSelected', (faceInfo, originalEvent, featureInfo) => {
    console.log('面已选择:', {
      meshName: faceInfo.mesh.name,
      faceIndex: faceInfo.faceIndex,
      feature: featureInfo
    })
    
    // 如果选择了特征，可以进行特征级操作
    if (featureInfo) {
      console.log(`选择了 ${featureInfo.type} 特征: ${featureInfo.id}`)
      
      // 可以选择整个特征的所有面
      if (originalEvent && originalEvent.shiftKey) {
        const meshId = facePicker.getMeshId(faceInfo.mesh)
        facePicker.selectFeature(meshId, featureInfo.id)
      }
    }
  })
  
  // 特征选择事件
  facePicker.on('featureSelected', (data) => {
    console.log('特征已选择:', {
      meshId: data.meshId,
      featureId: data.featureId,
      faceCount: data.faces ? data.faces.length : 0
    })
  })
  
  // 悬停事件
  facePicker.on('faceHover', (faceInfo, featureInfo) => {
    if (featureInfo) {
      console.log(`悬停在 ${featureInfo.type} 特征上: ${featureInfo.id}`)
    }
  })
  
  // 性能警告事件
  facePicker.on('performanceWarning', (data) => {
    console.warn(`性能警告: ${data.operation} 操作耗时 ${data.duration.toFixed(2)}ms`)
  })
  
  // 错误事件
  facePicker.on('error', (errorData) => {
    console.error('面拾取错误:', errorData)
  })
}

/**
 * 使用示例：完整的工作流程
 */
export async function demonstrateOptimizedWorkflow() {
  console.log('=== 优化面拾取工作流程演示 ===')
  
  // 1. 创建场景和基本组件
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  const renderer = new THREE.WebGLRenderer()
  const domElement = renderer.domElement
  
  // 2. 创建测试网格（模拟复杂模型）
  const meshes = createTestMeshes(scene)
  console.log(`创建了 ${meshes.length} 个测试网格`)
  
  // 3. 创建优化面拾取器
  const facePicker = await createOptimizedFacePicker(scene, camera, renderer, domElement)
  
  // 4. 设置网格并初始化（这里会执行预处理）
  console.log('开始初始化网格...')
  const initStart = performance.now()
  
  await facePicker.setMeshes(meshes)
  
  const initTime = performance.now() - initStart
  console.log(`初始化完成，总耗时: ${initTime.toFixed(2)}ms`)
  
  // 5. 启用面拾取
  facePicker.enable()
  
  // 6. 获取性能统计
  const stats = facePicker.getPerformanceStats()
  console.log('性能统计:', stats)
  
  // 7. 演示特征查询
  demonstrateFeatureQueries(facePicker, meshes)
  
  return facePicker
}

/**
 * 创建测试网格
 * @param {THREE.Scene} scene - 场景
 * @returns {Array<THREE.Mesh>} 网格数组
 */
function createTestMeshes(scene) {
  const meshes = []
  
  // 创建不同类型的几何体来测试特征检测
  
  // 1. 立方体（平面特征）
  const boxGeometry = new THREE.BoxGeometry(2, 2, 2, 10, 10, 10)
  const boxMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 })
  const box = new THREE.Mesh(boxGeometry, boxMaterial)
  box.position.set(-3, 0, 0)
  box.name = 'TestBox'
  scene.add(box)
  meshes.push(box)
  
  // 2. 圆柱体（圆柱面特征）
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 3, 16, 8)
  const cylinderMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff })
  const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial)
  cylinder.position.set(0, 0, 0)
  cylinder.name = 'TestCylinder'
  scene.add(cylinder)
  meshes.push(cylinder)
  
  // 3. 球体（复杂曲面）
  const sphereGeometry = new THREE.SphereGeometry(1.5, 32, 16)
  const sphereMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 })
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
  sphere.position.set(3, 0, 0)
  sphere.name = 'TestSphere'
  scene.add(sphere)
  meshes.push(sphere)
  
  // 4. 复杂几何体（多个平面）
  const complexGeometry = new THREE.DodecahedronGeometry(1.2, 2)
  const complexMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00 })
  const complex = new THREE.Mesh(complexGeometry, complexMaterial)
  complex.position.set(0, 3, 0)
  complex.name = 'TestComplex'
  scene.add(complex)
  meshes.push(complex)
  
  return meshes
}

/**
 * 演示特征查询功能
 * @param {OptimizedFacePicker} facePicker - 面拾取器
 * @param {Array<THREE.Mesh>} meshes - 网格数组
 */
function demonstrateFeatureQueries(facePicker, meshes) {
  console.log('\n=== 特征查询演示 ===')
  
  meshes.forEach((mesh, index) => {
    const meshId = facePicker.getMeshId(mesh)
    if (!meshId) return
    
    // 获取网格特征
    const features = facePicker.featurePool.getMeshFeatures(meshId)
    if (!features) {
      console.log(`网格 ${mesh.name}: 特征数据未找到`)
      return
    }
    
    console.log(`\n网格 ${mesh.name} (${meshId}):`)
    console.log(`  - 平面特征: ${features.planes.length} 个`)
    console.log(`  - 圆柱特征: ${features.cylinders.length} 个`)
    console.log(`  - 总三角形: ${features.triangleCount} 个`)
    
    // 演示面到特征的查询
    if (features.triangleCount > 0) {
      const testFaceIndex = Math.floor(features.triangleCount / 2)
      const feature = facePicker.featurePool.getFeatureByFace(meshId, testFaceIndex)
      
      if (feature) {
        console.log(`  - 面 ${testFaceIndex} 属于 ${feature.type} 特征: ${feature.id}`)
        
        // 获取特征的所有面
        const relatedFaces = facePicker.getFeatureRelatedFaces(meshId, feature.id)
        console.log(`  - 该特征包含 ${relatedFaces.length} 个面`)
      } else {
        console.log(`  - 面 ${testFaceIndex} 不属于任何特征`)
      }
    }
  })
}

/**
 * 性能基准测试
 * @param {OptimizedFacePicker} facePicker - 面拾取器
 * @returns {Object} 基准测试结果
 */
export async function runPerformanceBenchmark(facePicker) {
  console.log('\n=== 性能基准测试 ===')
  
  const testCount = 1000
  const results = {
    raycastTime: 0,
    featureLookupTime: 0,
    totalTime: 0
  }
  
  // 模拟随机点击测试
  for (let i = 0; i < testCount; i++) {
    const startTime = performance.now()
    
    // 生成随机鼠标位置
    const mousePosition = new THREE.Vector2(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    )
    
    // 执行射线投射
    const intersection = facePicker.performOptimizedRaycast(mousePosition)
    
    if (intersection) {
      // 执行特征查询
      const featureInfo = facePicker.getFeatureInfo(intersection)
    }
    
    results.totalTime += performance.now() - startTime
  }
  
  // 计算平均时间
  results.averageTime = results.totalTime / testCount
  results.fps = 1000 / results.averageTime // 理论FPS
  
  console.log('基准测试结果:')
  console.log(`  - 总测试次数: ${testCount}`)
  console.log(`  - 总耗时: ${results.totalTime.toFixed(2)}ms`)
  console.log(`  - 平均耗时: ${results.averageTime.toFixed(4)}ms`)
  console.log(`  - 理论FPS: ${results.fps.toFixed(1)}`)
  
  // 获取详细统计
  const detailedStats = facePicker.getPerformanceStats()
  console.log('详细性能统计:', detailedStats)
  
  return results
}

/**
 * 特征检测配置优化示例
 * @param {OptimizedFacePicker} facePicker - 面拾取器
 */
export function optimizeFeatureDetection(facePicker) {
  console.log('\n=== 特征检测配置优化 ===')
  
  // 获取当前配置
  const currentConfig = facePicker.featurePool.getDetectorConfig()
  console.log('当前配置:', currentConfig)
  
  // 针对不同场景的优化配置
  const optimizations = {
    // 高精度配置（适合精密建模）
    highPrecision: {
      planeAngleTolerance: 0.05,
      planeDistanceTolerance: 0.005,
      cylinderAngleTolerance: 0.08,
      cylinderRadiusTolerance: 0.005,
      minPlaneTriangles: 5,
      minCylinderTriangles: 8
    },
    
    // 高性能配置（适合实时交互）
    highPerformance: {
      planeAngleTolerance: 0.2,
      planeDistanceTolerance: 0.02,
      cylinderAngleTolerance: 0.25,
      cylinderRadiusTolerance: 0.02,
      minPlaneTriangles: 2,
      minCylinderTriangles: 4,
      maxTrianglesPerFeature: 5000
    },
    
    // 平衡配置（默认推荐）
    balanced: {
      planeAngleTolerance: 0.1,
      planeDistanceTolerance: 0.01,
      cylinderAngleTolerance: 0.15,
      cylinderRadiusTolerance: 0.01,
      minPlaneTriangles: 3,
      minCylinderTriangles: 6,
      maxTrianglesPerFeature: 10000
    }
  }
  
  // 应用平衡配置
  facePicker.featurePool.updateDetectorConfig(optimizations.balanced)
  console.log('已应用平衡配置')
  
  return optimizations
}

// 在浏览器控制台中运行的快速测试
export async function quickTest() {
  try {
    const facePicker = await demonstrateOptimizedWorkflow()
    
    // 运行性能测试
    await runPerformanceBenchmark(facePicker)
    
    // 优化配置
    optimizeFeatureDetection(facePicker)
    
    console.log('\n✅ 优化面拾取系统测试完成！')
    
    // 返回实例供进一步测试
    window.optimizedFacePicker = facePicker
    
    return facePicker
    
  } catch (error) {
    console.error('测试失败:', error)
    throw error
  }
}

// 导出工具函数
export const OptimizedFacePickingUtils = {
  createOptimizedFacePicker,
  demonstrateOptimizedWorkflow,
  runPerformanceBenchmark,
  optimizeFeatureDetection,
  quickTest
}

// 在浏览器控制台中运行:
// import('/src/utils/facePicking/integration-example.js').then(m => m.quickTest())