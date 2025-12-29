/**
 * 专门测试16段圆柱检测的脚本
 */
import * as THREE from 'three'
import { cylinderSurfaceHelper } from './CylinderSurfaceHelper.js'

/**
 * 测试16段圆柱检测
 */
export function test16SegmentCylinder() {
  console.log('🧪 专门测试16段圆柱检测')
  
  // 创建与你相同的16段圆柱
  const geometry = new THREE.CylinderGeometry(2, 2, 4, 16)
  
  console.log('圆柱几何体信息:', {
    type: geometry.type,
    vertices: geometry.attributes.position.count,
    segments: 16,
    radius: 2,
    height: 4
  })

  // 执行检测
  console.log('🔍 开始检测...')
  const startTime = performance.now()
  const cylinderInfo = cylinderSurfaceHelper.detectCylinder(geometry)
  const detectionTime = performance.now() - startTime

  console.log(`⏱️ 检测耗时: ${detectionTime.toFixed(2)}ms`)

  if (cylinderInfo) {
    console.log('✅ 检测成功!', {
      radius: cylinderInfo.radius.toFixed(3),
      height: cylinderInfo.height.toFixed(3),
      confidence: (cylinderInfo.confidence * 100).toFixed(1) + '%',
      center: cylinderInfo.center,
      axis: cylinderInfo.axis
    })
    
    return {
      success: true,
      cylinderInfo: cylinderInfo,
      detectionTime: detectionTime
    }
  } else {
    console.log('❌ 检测失败')
    
    // 进行详细分析
    console.log('🔍 进行详细失败分析...')
    analyzeFailure(geometry)
    
    return {
      success: false,
      detectionTime: detectionTime
    }
  }
}

/**
 * 分析检测失败的原因
 */
function analyzeFailure(geometry) {
  const positions = geometry.attributes.position.array
  const vertexCount = positions.length / 3
  
  // 采样分析
  const sampleSize = Math.min(100, vertexCount)
  const step = Math.floor(vertexCount / sampleSize)
  const samples = []

  for (let i = 0; i < sampleSize; i++) {
    const idx = i * step * 3
    samples.push(new THREE.Vector3(
      positions[idx],
      positions[idx + 1], 
      positions[idx + 2]
    ))
  }

  console.log('采样信息:', {
    totalVertices: vertexCount,
    sampleSize: samples.length,
    step: step
  })

  // 分析点分布
  const bbox = new THREE.Box3().setFromPoints(samples)
  const center = bbox.getCenter(new THREE.Vector3())
  
  // 计算径向距离
  const radialDistances = []
  for (const point of samples) {
    const toPoint = point.clone().sub(center)
    const radialDistance = Math.sqrt(toPoint.x * toPoint.x + toPoint.z * toPoint.z)
    radialDistances.push(radialDistance)
  }

  const avgRadius = radialDistances.reduce((a, b) => a + b, 0) / radialDistances.length
  const radiusVariance = radialDistances.reduce((sum, r) => sum + Math.pow(r - avgRadius, 2), 0) / radialDistances.length
  const radiusStdDev = Math.sqrt(radiusVariance)

  console.log('径向分析:', {
    averageRadius: avgRadius.toFixed(3),
    standardDeviation: radiusStdDev.toFixed(3),
    consistency: (1 - radiusStdDev / avgRadius).toFixed(3),
    range: {
      min: Math.min(...radialDistances).toFixed(3),
      max: Math.max(...radialDistances).toFixed(3)
    }
  })

  // 尝试直接调用PCA方法
  console.log('🔧 尝试PCA方法...')
  try {
    const pcaResult = cylinderSurfaceHelper.pcaCylinderFit(samples)
    if (pcaResult) {
      console.log('✅ PCA成功:', {
        radius: pcaResult.radius.toFixed(3),
        confidence: pcaResult.confidence.toFixed(3)
      })
    } else {
      console.log('❌ PCA也失败了')
    }
  } catch (error) {
    console.log('❌ PCA出错:', error.message)
  }
}

/**
 * 比较修复前后的效果
 */
export function compareBeforeAfter() {
  console.log('📊 比较修复前后的检测效果')
  
  const testCases = [
    { segments: 8, name: '8段' },
    { segments: 12, name: '12段' },
    { segments: 16, name: '16段' },
    { segments: 20, name: '20段' },
    { segments: 24, name: '24段' },
    { segments: 32, name: '32段' }
  ]

  const results = []

  for (const testCase of testCases) {
    const geometry = new THREE.CylinderGeometry(2, 2, 4, testCase.segments)
    const info = cylinderSurfaceHelper.detectCylinder(geometry)
    
    results.push({
      segments: testCase.segments,
      name: testCase.name,
      detected: !!info,
      confidence: info ? (info.confidence * 100).toFixed(1) + '%' : 'N/A',
      radius: info ? info.radius.toFixed(2) : 'N/A'
    })
  }

  console.table(results)
  
  const successCount = results.filter(r => r.detected).length
  console.log(`📈 成功率: ${successCount}/${results.length} (${(successCount/results.length*100).toFixed(1)}%)`)
  
  return results
}

// 在浏览器控制台中可用的函数
if (typeof window !== 'undefined') {
  window.test16SegmentCylinder = test16SegmentCylinder
  window.compareDetectionResults = compareBeforeAfter
  
  console.log('🔧 16段圆柱检测测试工具已加载')
  console.log('可用函数:')
  console.log('  - test16SegmentCylinder(): 测试16段圆柱')
  console.log('  - compareDetectionResults(): 比较不同分辨率')
}

export default {
  test16SegmentCylinder,
  compareBeforeAfter
}