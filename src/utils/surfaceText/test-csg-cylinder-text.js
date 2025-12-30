/**
 * CSG 圆柱面文字测试
 * 
 * 测试新的 CSG 方案生成圆柱面文字
 */
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { CSGCylinderText } from './CSGCylinderText.js'

export async function testCSGCylinderText(scene) {
  console.log('🧪 开始测试 CSG 圆柱面文字生成')

  // 加载字体
  const fontLoader = new FontLoader()
  const font = await new Promise((resolve, reject) => {
    fontLoader.load(
      '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json',
      resolve,
      undefined,
      reject
    )
  })

  console.log('✅ 字体加载完成')

  // 创建测试圆柱
  const cylinderRadius = 2
  const cylinderHeight = 5
  const cylinderGeometry = new THREE.CylinderGeometry(
    cylinderRadius, cylinderRadius, cylinderHeight, 32
  )
  const cylinderMaterial = new THREE.MeshStandardMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  })
  const cylinderMesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial)
  cylinderMesh.position.set(0, cylinderHeight / 2, 0)
  scene.add(cylinderMesh)

  console.log('✅ 测试圆柱创建完成')

  // 圆柱信息
  const cylinderInfo = {
    center: new THREE.Vector3(0, cylinderHeight / 2, 0),
    axis: new THREE.Vector3(0, 1, 0),
    radius: cylinderRadius,
    height: cylinderHeight
  }

  // 文字附着点（圆柱表面上的一点）
  const attachPoint = new THREE.Vector3(cylinderRadius, cylinderHeight / 2, 0)

  // 创建 CSG 文字生成器
  const csgGenerator = new CSGCylinderText()

  // 测试配置
  const config = {
    size: 0.5,
    thickness: 0.2,
    textHeight: 30,
    cylinderSegments: 64
  }

  console.log('🔧 开始生成 CSG 圆柱面文字...')

  try {
    // 方法1：使用完整版本
    const textGeometry1 = csgGenerator.generate(
      'HELLO',
      font,
      cylinderInfo,
      attachPoint,
      config
    )

    const textMaterial1 = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      metalness: 0.3,
      roughness: 0.7
    })
    const textMesh1 = new THREE.Mesh(textGeometry1, textMaterial1)
    scene.add(textMesh1)

    console.log('✅ 完整版本文字生成成功')

    // 方法2：使用简化版本（在不同位置）
    const attachPoint2 = new THREE.Vector3(
      cylinderRadius * Math.cos(Math.PI / 2),
      cylinderHeight / 2,
      cylinderRadius * Math.sin(Math.PI / 2)
    )

    const textGeometry2 = csgGenerator.generateSimple(
      'WORLD',
      font,
      cylinderInfo,
      attachPoint2,
      config
    )

    const textMaterial2 = new THREE.MeshStandardMaterial({
      color: 0x44ff44,
      metalness: 0.3,
      roughness: 0.7
    })
    const textMesh2 = new THREE.Mesh(textGeometry2, textMaterial2)
    scene.add(textMesh2)

    console.log('✅ 简化版本文字生成成功')

    // 添加辅助对象
    addHelpers(scene, cylinderInfo, attachPoint, attachPoint2)

    return {
      success: true,
      meshes: [cylinderMesh, textMesh1, textMesh2]
    }

  } catch (error) {
    console.error('❌ CSG 圆柱面文字生成失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 添加辅助对象
 */
function addHelpers(scene, cylinderInfo, attachPoint1, attachPoint2) {
  // 圆柱轴线
  const axisHelper = new THREE.ArrowHelper(
    cylinderInfo.axis,
    cylinderInfo.center.clone().sub(cylinderInfo.axis.clone().multiplyScalar(cylinderInfo.height / 2)),
    cylinderInfo.height,
    0xffff00
  )
  scene.add(axisHelper)

  // 附着点标记
  const sphereGeometry = new THREE.SphereGeometry(0.1)
  
  const sphere1 = new THREE.Mesh(
    sphereGeometry,
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  )
  sphere1.position.copy(attachPoint1)
  scene.add(sphere1)

  const sphere2 = new THREE.Mesh(
    sphereGeometry,
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  )
  sphere2.position.copy(attachPoint2)
  scene.add(sphere2)
}

/**
 * 性能测试
 */
export async function benchmarkCSGCylinderText(scene) {
  console.log('🏃 开始性能测试...')

  const fontLoader = new FontLoader()
  const font = await new Promise((resolve, reject) => {
    fontLoader.load(
      '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json',
      resolve,
      undefined,
      reject
    )
  })

  const cylinderInfo = {
    center: new THREE.Vector3(0, 2.5, 0),
    axis: new THREE.Vector3(0, 1, 0),
    radius: 2,
    height: 5
  }

  const attachPoint = new THREE.Vector3(2, 2.5, 0)
  const csgGenerator = new CSGCylinderText()

  const testCases = [
    { text: 'A', segments: 32 },
    { text: 'AB', segments: 32 },
    { text: 'ABC', segments: 32 },
    { text: 'ABCD', segments: 32 },
    { text: 'ABCDE', segments: 32 },
    { text: 'ABC', segments: 64 },
    { text: 'ABC', segments: 128 }
  ]

  const results = []

  for (const testCase of testCases) {
    const config = {
      size: 0.5,
      thickness: 0.2,
      textHeight: 30,
      cylinderSegments: testCase.segments
    }

    const startTime = performance.now()
    
    try {
      const geometry = csgGenerator.generateSimple(
        testCase.text,
        font,
        cylinderInfo,
        attachPoint,
        config
      )
      
      const endTime = performance.now()
      const duration = endTime - startTime

      results.push({
        text: testCase.text,
        segments: testCase.segments,
        duration: duration.toFixed(2) + 'ms',
        vertices: geometry.attributes.position.count,
        success: true
      })

      geometry.dispose()

    } catch (error) {
      results.push({
        text: testCase.text,
        segments: testCase.segments,
        error: error.message,
        success: false
      })
    }
  }

  console.log('📊 性能测试结果:')
  console.table(results)

  return results
}

// 导出测试函数
export default testCSGCylinderText
