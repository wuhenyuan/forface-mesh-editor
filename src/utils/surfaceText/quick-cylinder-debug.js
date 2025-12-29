/**
 * 快速圆柱面检测调试脚本
 * 用于快速诊断圆柱面文字拟合问题
 */
import * as THREE from 'three'
import { cylinderSurfaceHelper } from './CylinderSurfaceHelper.js'

/**
 * 快速调试圆柱面检测
 * @param {THREE.Mesh} mesh - 要检测的网格
 * @param {boolean} verbose - 是否显示详细信息
 * @returns {Object} 调试结果
 */
export function quickDebugCylinder(mesh, verbose = true) {
  if (verbose) {
    console.log('🔍 快速圆柱面检测调试')
    console.log('目标网格:', mesh.name || 'Unnamed')
  }

  // 1. 基本几何体信息
  const geometry = mesh.geometry
  const info = {
    geometryType: geometry.type,
    vertexCount: geometry.attributes.position?.count || 0,
    hasIndex: !!geometry.index,
    indexCount: geometry.index?.count || 0
  }

  if (verbose) {
    console.log('几何体信息:', info)
  }

  // 2. 计算边界框
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox()
  }
  const bbox = geometry.boundingBox
  const size = bbox.max.clone().sub(bbox.min)

  if (verbose) {
    console.log('边界框尺寸:', {
      width: size.x.toFixed(2),
      height: size.y.toFixed(2),
      depth: size.z.toFixed(2)
    })
  }

  // 3. 检查是否可能是圆柱
  const aspectRatio = {
    xy: size.x / size.y,
    xz: size.x / size.z,
    yz: size.y / size.z
  }

  let likelyCylinder = false
  let cylinderAxis = 'unknown'

  // 判断主轴方向
  if (Math.abs(aspectRatio.xy - 1) < 0.2 && aspectRatio.yz > 1.5) {
    likelyCylinder = true
    cylinderAxis = 'Z'
  } else if (Math.abs(aspectRatio.xz - 1) < 0.2 && aspectRatio.xy > 1.5) {
    likelyCylinder = true
    cylinderAxis = 'Y'
  } else if (Math.abs(aspectRatio.yz - 1) < 0.2 && aspectRatio.xz > 1.5) {
    likelyCylinder = true
    cylinderAxis = 'X'
  }

  if (verbose) {
    console.log('形状分析:', {
      aspectRatio,
      likelyCylinder,
      cylinderAxis
    })
  }

  // 4. 执行圆柱面检测
  const startTime = performance.now()
  const cylinderInfo = cylinderSurfaceHelper.detectCylinder(geometry)
  const detectionTime = performance.now() - startTime

  if (verbose) {
    console.log(`检测耗时: ${detectionTime.toFixed(2)}ms`)
  }

  // 5. 分析检测结果
  const result = {
    success: !!cylinderInfo,
    detectionTime: detectionTime,
    geometryInfo: info,
    boundingBox: { size, center: bbox.getCenter(new THREE.Vector3()) },
    shapeAnalysis: { aspectRatio, likelyCylinder, cylinderAxis },
    cylinderInfo: cylinderInfo
  }

  if (cylinderInfo) {
    if (verbose) {
      console.log('✅ 检测成功:', {
        center: cylinderInfo.center,
        axis: cylinderInfo.axis,
        radius: cylinderInfo.radius.toFixed(2),
        height: cylinderInfo.height.toFixed(2),
        confidence: (cylinderInfo.confidence * 100).toFixed(1) + '%'
      })
    }
  } else {
    if (verbose) {
      console.log('❌ 检测失败')
      
      // 分析可能的失败原因
      const issues = []
      
      if (info.vertexCount < 6) {
        issues.push('顶点数量不足')
      }
      
      if (!likelyCylinder) {
        issues.push('形状不像圆柱体')
      }
      
      if (size.x < 0.1 || size.y < 0.1 || size.z < 0.1) {
        issues.push('几何体过小')
      }
      
      if (issues.length > 0) {
        console.log('可能的问题:', issues)
      }
    }
  }

  return result
}

/**
 * 测试标准圆柱几何体
 * @returns {Object} 测试结果
 */
export function testStandardCylinder() {
  console.log('🧪 测试标准圆柱几何体')
  
  // 创建不同类型的圆柱
  const testCases = [
    {
      name: '标准圆柱 (r=2, h=5)',
      geometry: new THREE.CylinderGeometry(2, 2, 5, 16)
    },
    {
      name: '高分辨率圆柱 (r=1, h=3, segments=32)',
      geometry: new THREE.CylinderGeometry(1, 1, 3, 32)
    },
    {
      name: '低分辨率圆柱 (r=1.5, h=4, segments=8)',
      geometry: new THREE.CylinderGeometry(1.5, 1.5, 4, 8)
    },
    {
      name: '椭圆柱 (不应该检测成功)',
      geometry: new THREE.CylinderGeometry(2, 1, 3, 16)
    }
  ]

  const results = []

  for (const testCase of testCases) {
    console.log(`\n测试: ${testCase.name}`)
    const mesh = new THREE.Mesh(testCase.geometry)
    const result = quickDebugCylinder(mesh, false)
    
    results.push({
      name: testCase.name,
      success: result.success,
      confidence: result.cylinderInfo?.confidence || 0,
      detectionTime: result.detectionTime
    })

    console.log(result.success ? '✅ 通过' : '❌ 失败')
    if (result.cylinderInfo) {
      console.log(`   置信度: ${(result.cylinderInfo.confidence * 100).toFixed(1)}%`)
    }
  }

  console.log('\n📊 测试总结:')
  console.table(results)

  return results
}

/**
 * 分析表面信息（模拟SurfaceTextManager中的analyzeSurface方法）
 * @param {Object} faceInfo - 面信息
 * @returns {Object} 表面分析结果
 */
export function analyzeSurfaceDebug(faceInfo) {
  console.log('🔬 表面分析调试')
  console.log('面信息:', {
    meshName: faceInfo.mesh.name,
    faceIndex: faceInfo.faceIndex,
    point: faceInfo.point,
    hasNormal: !!faceInfo.face?.normal
  })

  const { mesh } = faceInfo
  
  // 检测圆柱面
  const startTime = performance.now()
  const cylinderInfo = cylinderSurfaceHelper.detectCylinder(mesh.geometry)
  const detectionTime = performance.now() - startTime

  console.log(`圆柱面检测耗时: ${detectionTime.toFixed(2)}ms`)

  if (cylinderInfo && cylinderInfo.confidence > 0.8) {
    console.log('✅ 检测到圆柱面:', {
      confidence: (cylinderInfo.confidence * 100).toFixed(1) + '%',
      radius: cylinderInfo.radius.toFixed(2),
      height: cylinderInfo.height.toFixed(2)
    })
    
    return {
      surfaceType: 'cylinder',
      cylinderInfo: cylinderInfo,
      attachPoint: faceInfo.point.clone(),
      detectionTime: detectionTime
    }
  } else {
    console.log('❌ 未检测到圆柱面')
    if (cylinderInfo) {
      console.log(`   置信度过低: ${(cylinderInfo.confidence * 100).toFixed(1)}% < 80%`)
    }
    
    return {
      surfaceType: 'plane',
      attachPoint: faceInfo.point.clone(),
      detectionTime: detectionTime
    }
  }
}

/**
 * 创建测试场景并进行批量检测
 * @param {THREE.Scene} scene - Three.js场景
 * @returns {Array} 测试结果
 */
export function createTestScene(scene) {
  console.log('🏗️ 创建测试场景')

  const testObjects = []
  const results = []

  // 创建不同类型的几何体
  const geometries = [
    {
      name: '标准圆柱',
      geometry: new THREE.CylinderGeometry(2, 2, 4, 16),
      position: [-6, 0, 0],
      color: 0xff4444
    },
    {
      name: '高分辨率圆柱',
      geometry: new THREE.CylinderGeometry(1.5, 1.5, 3, 32),
      position: [-2, 0, 0],
      color: 0x44ff44
    },
    {
      name: '低分辨率圆柱',
      geometry: new THREE.CylinderGeometry(1, 1, 2, 8),
      position: [2, 0, 0],
      color: 0x4444ff
    },
    {
      name: '立方体',
      geometry: new THREE.BoxGeometry(2, 2, 2),
      position: [6, 0, 0],
      color: 0xffff44
    },
    {
      name: '球体',
      geometry: new THREE.SphereGeometry(1.5, 16, 12),
      position: [0, 0, 4],
      color: 0xff44ff
    }
  ]

  for (const item of geometries) {
    const material = new THREE.MeshStandardMaterial({ 
      color: item.color,
      wireframe: true
    })
    const mesh = new THREE.Mesh(item.geometry, material)
    mesh.position.set(...item.position)
    mesh.name = item.name

    scene.add(mesh)
    testObjects.push(mesh)

    // 执行检测
    const result = quickDebugCylinder(mesh, false)
    results.push({
      name: item.name,
      success: result.success,
      confidence: result.cylinderInfo?.confidence || 0
    })
  }

  console.log('📊 批量检测结果:')
  console.table(results)

  return { testObjects, results }
}

// 导出调试函数
export default {
  quickDebugCylinder,
  testStandardCylinder,
  analyzeSurfaceDebug,
  createTestScene
}