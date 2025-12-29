/**
 * 圆柱面文字拟合集成测试
 * 用于测试完整的圆柱面文字创建流程
 */
import * as THREE from 'three'
import { cylinderSurfaceHelper } from './CylinderSurfaceHelper.js'
import { TextGeometryGenerator } from './TextGeometryGenerator.js'

/**
 * 集成测试：完整的圆柱面文字创建流程
 */
export async function testCylinderTextIntegration() {
  console.log('🧪 开始圆柱面文字拟合集成测试')

  try {
    // 1. 创建测试圆柱
    console.log('步骤1: 创建测试圆柱')
    const cylinderGeometry = new THREE.CylinderGeometry(2, 2, 4, 16)
    const cylinderMesh = new THREE.Mesh(cylinderGeometry)
    cylinderMesh.name = 'TestCylinder'
    
    console.log('圆柱几何体信息:', {
      type: cylinderGeometry.type,
      vertices: cylinderGeometry.attributes.position.count,
      hasIndex: !!cylinderGeometry.index
    })

    // 2. 模拟点击检测
    console.log('步骤2: 模拟射线投射')
    const clickPoint = new THREE.Vector3(2, 0, 0) // 圆柱表面上的点
    const faceInfo = {
      mesh: cylinderMesh,
      point: clickPoint,
      faceIndex: 0,
      face: { normal: new THREE.Vector3(1, 0, 0) }
    }

    // 3. 表面类型分析
    console.log('步骤3: 表面类型分析')
    const cylinderInfo = cylinderSurfaceHelper.detectCylinder(cylinderGeometry)
    
    if (!cylinderInfo) {
      console.error('❌ 圆柱面检测失败')
      return { success: false, error: '圆柱面检测失败' }
    }

    console.log('✅ 圆柱面检测成功:', {
      radius: cylinderInfo.radius.toFixed(2),
      height: cylinderInfo.height.toFixed(2),
      confidence: (cylinderInfo.confidence * 100).toFixed(1) + '%'
    })

    const surfaceInfo = {
      surfaceType: 'cylinder',
      cylinderInfo: cylinderInfo,
      attachPoint: clickPoint
    }

    // 4. 文字几何体生成
    console.log('步骤4: 生成文字几何体')
    const geometryGenerator = new TextGeometryGenerator()
    
    // 等待默认字体加载
    await new Promise(resolve => setTimeout(resolve, 1000))

    const textConfig = {
      size: 1,
      thickness: 0.1,
      font: 'helvetiker'
    }

    const textGeometry = await geometryGenerator.generate(
      'TEST',
      textConfig,
      surfaceInfo
    )

    if (!textGeometry) {
      console.error('❌ 文字几何体生成失败')
      return { success: false, error: '文字几何体生成失败' }
    }

    console.log('✅ 文字几何体生成成功:', {
      vertices: textGeometry.attributes.position?.count || 0,
      type: textGeometry.type
    })

    // 5. 验证几何体
    console.log('步骤5: 验证几何体')
    textGeometry.computeBoundingBox()
    const bbox = textGeometry.boundingBox
    
    if (!bbox || bbox.isEmpty()) {
      console.error('❌ 生成的几何体为空')
      return { success: false, error: '生成的几何体为空' }
    }

    console.log('✅ 几何体验证通过:', {
      boundingBox: {
        width: (bbox.max.x - bbox.min.x).toFixed(2),
        height: (bbox.max.y - bbox.min.y).toFixed(2),
        depth: (bbox.max.z - bbox.min.z).toFixed(2)
      }
    })

    // 6. 创建完整的文字网格
    console.log('步骤6: 创建文字网格')
    const textMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 })
    const textMesh = new THREE.Mesh(textGeometry, textMaterial)
    textMesh.position.copy(clickPoint)

    console.log('✅ 集成测试完成')
    return {
      success: true,
      cylinderMesh: cylinderMesh,
      textMesh: textMesh,
      cylinderInfo: cylinderInfo,
      surfaceInfo: surfaceInfo
    }

  } catch (error) {
    console.error('❌ 集成测试失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 调试圆柱面检测置信度
 */
export function debugCylinderConfidence() {
  console.log('🔍 调试圆柱面检测置信度')

  const testCases = [
    { name: '标准圆柱', geometry: new THREE.CylinderGeometry(2, 2, 4, 16) },
    { name: '高分辨率圆柱', geometry: new THREE.CylinderGeometry(2, 2, 4, 32) },
    { name: '低分辨率圆柱', geometry: new THREE.CylinderGeometry(2, 2, 4, 8) },
    { name: '细长圆柱', geometry: new THREE.CylinderGeometry(0.5, 0.5, 8, 16) },
    { name: '扁平圆柱', geometry: new THREE.CylinderGeometry(4, 4, 1, 16) }
  ]

  const results = []

  for (const testCase of testCases) {
    const info = cylinderSurfaceHelper.detectCylinder(testCase.geometry)
    results.push({
      name: testCase.name,
      detected: !!info,
      confidence: info ? (info.confidence * 100).toFixed(1) + '%' : 'N/A',
      radius: info ? info.radius.toFixed(2) : 'N/A',
      height: info ? info.height.toFixed(2) : 'N/A'
    })
  }

  console.table(results)
  return results
}

/**
 * 测试不同置信度阈值的影响
 */
export function testConfidenceThreshold() {
  console.log('📊 测试置信度阈值影响')

  const geometry = new THREE.CylinderGeometry(2, 2, 4, 16)
  const info = cylinderSurfaceHelper.detectCylinder(geometry)

  if (!info) {
    console.log('❌ 基础检测失败')
    return
  }

  const thresholds = [0.5, 0.6, 0.7, 0.8, 0.9]
  const currentConfidence = info.confidence

  console.log(`当前检测置信度: ${(currentConfidence * 100).toFixed(1)}%`)

  for (const threshold of thresholds) {
    const wouldPass = currentConfidence >= threshold
    console.log(`阈值 ${(threshold * 100).toFixed(0)}%: ${wouldPass ? '✅ 通过' : '❌ 不通过'}`)
  }

  // 建议的阈值
  if (currentConfidence >= 0.8) {
    console.log('💡 建议: 当前阈值 80% 合适')
  } else if (currentConfidence >= 0.7) {
    console.log('💡 建议: 考虑降低阈值到 70%')
  } else {
    console.log('💡 建议: 几何体可能不是标准圆柱，需要改进检测算法')
  }
}

/**
 * 快速诊断函数
 */
export async function quickDiagnosis() {
  console.log('🚀 快速诊断圆柱面文字拟合问题')

  // 1. 测试圆柱面检测
  console.log('\n1️⃣ 测试圆柱面检测')
  debugCylinderConfidence()

  // 2. 测试置信度阈值
  console.log('\n2️⃣ 测试置信度阈值')
  testConfidenceThreshold()

  // 3. 集成测试
  console.log('\n3️⃣ 集成测试')
  const integrationResult = await testCylinderTextIntegration()

  // 4. 总结
  console.log('\n📋 诊断总结:')
  if (integrationResult.success) {
    console.log('✅ 圆柱面文字拟合功能正常')
    console.log('💡 如果在实际使用中遇到问题，请检查:')
    console.log('   - 目标几何体是否为标准圆柱')
    console.log('   - 置信度阈值是否过高 (当前80%)')
    console.log('   - 字体是否正确加载')
  } else {
    console.log('❌ 发现问题:', integrationResult.error)
    console.log('💡 建议检查:')
    console.log('   - CylinderSurfaceHelper.js 中的检测算法')
    console.log('   - TextGeometryGenerator.js 中的字体加载')
    console.log('   - CurvedTextGeometry.js 中的几何体生成')
  }

  return integrationResult
}

// 导出测试函数
export default {
  testCylinderTextIntegration,
  debugCylinderConfidence,
  testConfidenceThreshold,
  quickDiagnosis
}