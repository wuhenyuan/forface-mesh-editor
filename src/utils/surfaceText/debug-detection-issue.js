/**
 * 调试圆柱面检测失败的具体原因
 */
import * as THREE from 'three'
import { cylinderSurfaceHelper } from './CylinderSurfaceHelper.js'

/**
 * 详细调试圆柱面检测失败的原因
 * @param {THREE.BufferGeometry} geometry - 几何体
 */
export function debugDetectionFailure(geometry) {
  console.log('🔍 详细调试圆柱面检测失败原因')
  
  // 1. 基本信息
  const positions = geometry.attributes.position.array
  const vertexCount = positions.length / 3
  
  console.log('基本信息:', {
    geometryType: geometry.type,
    vertexCount: vertexCount,
    positionsLength: positions.length,
    hasIndex: !!geometry.index,
    indexCount: geometry.index?.count || 0
  })

  // 2. 检查采样过程
  const sampleSize = Math.min(100, vertexCount)
  const step = Math.floor(vertexCount / sampleSize)
  const samples = []

  console.log('采样信息:', {
    sampleSize: sampleSize,
    step: step,
    willSample: sampleSize
  })

  for (let i = 0; i < sampleSize; i++) {
    const idx = i * step * 3
    if (idx + 2 < positions.length) {
      samples.push(new THREE.Vector3(
        positions[idx],
        positions[idx + 1], 
        positions[idx + 2]
      ))
    }
  }

  console.log('实际采样数量:', samples.length)

  if (samples.length < 6) {
    console.log('❌ 采样点不足，无法检测圆柱面')
    return
  }

  // 3. 分析采样点分布
  const bbox = new THREE.Box3().setFromPoints(samples)
  const size = bbox.max.clone().sub(bbox.min)
  const center = bbox.getCenter(new THREE.Vector3())

  console.log('采样点分布:', {
    boundingBox: {
      min: bbox.min,
      max: bbox.max,
      size: size,
      center: center
    }
  })

  // 4. 检查点的径向分布
  const radialDistances = []
  const heights = []
  
  for (const point of samples) {
    const toPoint = point.clone().sub(center)
    const height = toPoint.y // 假设Y轴是圆柱轴
    const radialDistance = Math.sqrt(toPoint.x * toPoint.x + toPoint.z * toPoint.z)
    
    radialDistances.push(radialDistance)
    heights.push(height)
  }

  const avgRadius = radialDistances.reduce((a, b) => a + b, 0) / radialDistances.length
  const radiusVariance = radialDistances.reduce((sum, r) => sum + Math.pow(r - avgRadius, 2), 0) / radialDistances.length
  const radiusStdDev = Math.sqrt(radiusVariance)

  console.log('径向分析:', {
    averageRadius: avgRadius.toFixed(3),
    radiusStdDev: radiusStdDev.toFixed(3),
    radiusVariance: radiusVariance.toFixed(3),
    radiusRange: {
      min: Math.min(...radialDistances).toFixed(3),
      max: Math.max(...radialDistances).toFixed(3)
    }
  })

  // 5. 检查高度分布
  const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length
  const heightRange = {
    min: Math.min(...heights),
    max: Math.max(...heights)
  }

  console.log('高度分析:', {
    averageHeight: avgHeight.toFixed(3),
    heightRange: {
      min: heightRange.min.toFixed(3),
      max: heightRange.max.toFixed(3),
      span: (heightRange.max - heightRange.min).toFixed(3)
    }
  })

  // 6. 计算置信度指标
  const radiusConsistency = 1 - (radiusStdDev / avgRadius)
  const isLikelyCylinder = radiusConsistency > 0.8 && avgRadius > 0.1

  console.log('置信度分析:', {
    radiusConsistency: radiusConsistency.toFixed(3),
    isLikelyCylinder: isLikelyCylinder,
    threshold: 0.8
  })

  // 7. 尝试手动拟合
  console.log('🔧 尝试手动拟合...')
  
  try {
    // 使用PCA方法
    const pcaResult = cylinderSurfaceHelper.pcaCylinderFit(samples)
    if (pcaResult) {
      console.log('✅ PCA拟合成功:', {
        radius: pcaResult.radius.toFixed(3),
        height: pcaResult.height.toFixed(3),
        confidence: pcaResult.confidence.toFixed(3)
      })
    } else {
      console.log('❌ PCA拟合失败')
    }
  } catch (error) {
    console.log('❌ PCA拟合出错:', error.message)
  }

  // 8. 建议
  console.log('💡 建议:')
  if (radiusStdDev / avgRadius > 0.2) {
    console.log('   - 径向一致性较差，可能需要更高分辨率的圆柱')
  }
  if (samples.length < 20) {
    console.log('   - 采样点较少，建议增加圆柱分段数')
  }
  if (avgRadius < 1) {
    console.log('   - 圆柱半径较小，可能影响检测精度')
  }
}

/**
 * 测试不同分辨率的圆柱检测效果
 */
export function testDifferentResolutions() {
  console.log('🧪 测试不同分辨率圆柱的检测效果')
  
  const testCases = [
    { segments: 8, name: '8段圆柱' },
    { segments: 12, name: '12段圆柱' },
    { segments: 16, name: '16段圆柱' },
    { segments: 24, name: '24段圆柱' },
    { segments: 32, name: '32段圆柱' }
  ]

  const results = []

  for (const testCase of testCases) {
    const geometry = new THREE.CylinderGeometry(2, 2, 4, testCase.segments)
    const info = cylinderSurfaceHelper.detectCylinder(geometry)
    
    const result = {
      segments: testCase.segments,
      name: testCase.name,
      detected: !!info,
      confidence: info ? (info.confidence * 100).toFixed(1) + '%' : 'N/A',
      radius: info ? info.radius.toFixed(2) : 'N/A',
      vertices: geometry.attributes.position.count
    }
    
    results.push(result)
    
    if (!info) {
      console.log(`❌ ${testCase.name} 检测失败`)
      debugDetectionFailure(geometry)
    } else {
      console.log(`✅ ${testCase.name} 检测成功 (${result.confidence})`)
    }
  }

  console.table(results)
  return results
}

/**
 * 在浏览器控制台中运行的快速调试函数
 */
window.debugCylinderDetection = function() {
  console.log('🔍 快速调试当前圆柱检测问题')
  
  // 创建16段圆柱（与你的情况相同）
  const geometry = new THREE.CylinderGeometry(2, 2, 4, 16)
  console.log('创建16段圆柱进行调试...')
  
  debugDetectionFailure(geometry)
  
  console.log('\n📊 测试不同分辨率:')
  testDifferentResolutions()
}

// 导出调试函数
export default {
  debugDetectionFailure,
  testDifferentResolutions
}