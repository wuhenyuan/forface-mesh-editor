/**
 * 测试简单圆柱检测器
 */
import * as THREE from 'three'
import { simpleCylinderDetector } from './SimpleCylinderDetector.js'

/**
 * 测试简单检测器的效果
 */
export function testSimpleDetector() {
  console.log('🧪 测试简单圆柱检测器')
  
  const testCases = [
    { name: '8段圆柱', geometry: new THREE.CylinderGeometry(2, 2, 4, 8) },
    { name: '16段圆柱', geometry: new THREE.CylinderGeometry(2, 2, 4, 16) },
    { name: '32段圆柱', geometry: new THREE.CylinderGeometry(2, 2, 4, 32) },
    { name: '64段圆柱', geometry: new THREE.CylinderGeometry(2, 2, 4, 64) },
    { name: '256段圆柱', geometry: new THREE.CylinderGeometry(2, 2, 4, 256) },
    { name: '立方体', geometry: new THREE.BoxGeometry(2, 2, 2) },
    { name: '球体', geometry: new THREE.SphereGeometry(2, 16, 12) }
  ]

  const results = []

  for (const testCase of testCases) {
    console.log(`\n测试: ${testCase.name}`)
    
    const startTime = performance.now()
    const info = simpleCylinderDetector.detectCylinder(testCase.geometry)
    const detectionTime = performance.now() - startTime
    
    const isValid = simpleCylinderDetector.quickValidate(info)
    
    const result = {
      name: testCase.name,
      detected: !!info,
      valid: isValid,
      confidence: info ? (info.confidence * 100).toFixed(1) + '%' : 'N/A',
      radius: info ? info.radius.toFixed(2) : 'N/A',
      height: info ? info.height.toFixed(2) : 'N/A',
      time: detectionTime.toFixed(2) + 'ms'
    }
    
    results.push(result)
    
    if (isValid) {
      console.log(`✅ ${testCase.name} - 检测成功`)
    } else {
      console.log(`❌ ${testCase.name} - 检测失败`)
    }
  }

  console.log('\n📊 测试结果汇总:')
  console.table(results)
  
  const cylinderTests = results.filter(r => r.name.includes('圆柱'))
  const successCount = cylinderTests.filter(r => r.valid).length
  
  console.log(`🎯 圆柱检测成功率: ${successCount}/${cylinderTests.length} (${(successCount/cylinderTests.length*100).toFixed(1)}%)`)
  
  return results
}

// 在浏览器控制台中可用
if (typeof window !== 'undefined') {
  window.testSimpleDetector = testSimpleDetector
  console.log('🔧 简单检测器测试工具已加载')
  console.log('运行: testSimpleDetector()')
}

export default testSimpleDetector