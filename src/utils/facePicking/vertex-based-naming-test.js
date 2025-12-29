import * as THREE from 'three'
import { FeatureBasedNaming } from './FeatureBasedNaming.js'
import { VertexBasedIdentifier } from './VertexBasedIdentifier.js'

/**
 * 基于顶点索引的稳定命名测试
 * 
 * 验证基于原始模型顶点索引的稳定命名方法
 */

/**
 * 创建测试圆柱
 * @param {number} radius - 半径
 * @param {number} height - 高度
 * @param {number} segments - 分段数
 * @param {THREE.Vector3} position - 位置
 * @returns {THREE.Mesh} 圆柱网格
 */
function createTestCylinder(radius, height, segments, position = new THREE.Vector3()) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments)
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(position)
  mesh.updateMatrixWorld()
  return mesh
}

/**
 * 测试顶点索引压缩功能
 */
function testVertexIndexCompression() {
  console.log('🔧 测试顶点索引压缩功能...')
  
  const identifier = new VertexBasedIdentifier()
  
  // 测试用例
  const testCases = [
    {
      name: '连续索引',
      indices: [100, 101, 102, 103, 104, 105],
      expected: 'i100i105'
    },
    {
      name: '单个索引',
      indices: [50],
      expected: 'i50'
    },
    {
      name: '多段连续',
      indices: [10, 11, 12, 20, 21, 22, 30],
      expected: 'i10i12,i20i22,i30'
    },
    {
      name: '不连续索引',
      indices: [1, 3, 5, 7, 9],
      expected: 'i1,i3,i5,i7,i9'
    },
    {
      name: '混合情况',
      indices: [0, 1, 2, 5, 10, 11, 12, 13, 20],
      expected: 'i0i2,i5,i10i13,i20'
    }
  ]
  
  let passedTests = 0
  
  testCases.forEach(testCase => {
    const result = identifier.compressConsecutiveIndices(testCase.indices)
    const passed = result === testCase.expected
    
    console.log(`  ${testCase.name}: ${passed ? '✅' : '❌'}`)
    console.log(`    输入: [${testCase.indices.join(', ')}]`)
    console.log(`    期望: ${testCase.expected}`)
    console.log(`    实际: ${result}`)
    
    if (passed) passedTests++
  })
  
  console.log(`  压缩测试通过: ${passedTests}/${testCases.length}`)
  return passedTests === testCases.length
}

/**
 * 测试压缩解压一致性
 */
function testCompressionConsistency() {
  console.log('\n🔄 测试压缩解压一致性...')
  
  const identifier = new VertexBasedIdentifier()
  
  const testCases = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [100, 101, 102, 105, 106, 107, 110],
    [1, 3, 5, 7, 9, 11, 13, 15],
    [50, 51, 52, 100, 101, 102, 103, 200]
  ]
  
  let passedTests = 0
  
  testCases.forEach((indices, index) => {
    const compressed = identifier.compressConsecutiveIndices(indices)
    const decompressed = identifier.decompressIndices(compressed)
    
    // 比较原始和解压后的数组
    const consistent = JSON.stringify(indices) === JSON.stringify(decompressed)
    
    console.log(`  测试 ${index + 1}: ${consistent ? '✅' : '❌'}`)
    console.log(`    原始: [${indices.join(', ')}]`)
    console.log(`    压缩: ${compressed}`)
    console.log(`    解压: [${decompressed.join(', ')}]`)
    
    if (consistent) passedTests++
  })
  
  console.log(`  一致性测试通过: ${passedTests}/${testCases.length}`)
  return passedTests === testCases.length
}

/**
 * 测试稳定性：相同圆柱多次检测
 */
async function testNamingStability() {
  console.log('\n🎯 测试命名稳定性...')
  
  // 创建测试圆柱
  const cylinder = createTestCylinder(2.0, 5.0, 16, new THREE.Vector3(0, 0, 0))
  
  const names = []
  const iterations = 5
  
  for (let i = 0; i < iterations; i++) {
    // 每次重新创建系统，模拟重新加载
    const featureNaming = new FeatureBasedNaming()
    const features = featureNaming.detectAndNameFeatures(cylinder, `stability_test_${i}`)
    
    const cylinderFeatures = features.filter(f => f.name.includes('cylinder'))
    if (cylinderFeatures.length > 0) {
      names.push(cylinderFeatures[0].name)
    }
  }
  
  // 分析稳定性
  const uniqueNames = [...new Set(names)]
  const stability = uniqueNames.length === 1 ? 100 : (1 / uniqueNames.length * 100)
  
  console.log(`  检测次数: ${iterations}`)
  console.log(`  唯一名字数: ${uniqueNames.length}`)
  console.log(`  稳定性: ${stability.toFixed(1)}%`)
  
  if (names.length > 0) {
    console.log(`  示例名字: ${names[0]}`)
  }
  
  if (uniqueNames.length > 1) {
    console.log(`  不同名字:`)
    uniqueNames.forEach((name, index) => {
      const count = names.filter(n => n === name).length
      console.log(`    ${index + 1}. ${name} (${count}次)`)
    })
  }
  
  return stability === 100
}

/**
 * 测试区分性：不同圆柱应该有不同名字
 */
async function testNamingDistinctiveness() {
  console.log('\n🔍 测试命名区分性...')
  
  const featureNaming = new FeatureBasedNaming()
  
  // 创建不同的圆柱
  const cylinders = [
    { mesh: createTestCylinder(1.0, 3.0, 8, new THREE.Vector3(0, 0, 0)), desc: '小圆柱(8边)' },
    { mesh: createTestCylinder(2.0, 5.0, 16, new THREE.Vector3(5, 0, 0)), desc: '中圆柱(16边)' },
    { mesh: createTestCylinder(3.0, 7.0, 32, new THREE.Vector3(10, 0, 0)), desc: '大圆柱(32边)' }
  ]
  
  const allNames = []
  
  cylinders.forEach((cyl, index) => {
    const features = featureNaming.detectAndNameFeatures(cyl.mesh, `distinct_test_${index}`)
    const cylinderFeatures = features.filter(f => f.name.includes('cylinder'))
    
    if (cylinderFeatures.length > 0) {
      const name = cylinderFeatures[0].name
      allNames.push({ name, desc: cyl.desc })
      console.log(`  ${cyl.desc}: ${name}`)
    }
  })
  
  // 检查唯一性
  const uniqueNames = [...new Set(allNames.map(item => item.name))]
  const distinctiveness = (uniqueNames.length / allNames.length) * 100
  
  console.log(`  总圆柱数: ${allNames.length}`)
  console.log(`  唯一名字数: ${uniqueNames.length}`)
  console.log(`  区分性: ${distinctiveness.toFixed(1)}%`)
  
  return distinctiveness === 100
}

/**
 * 测试压缩效率
 */
function testCompressionEfficiency() {
  console.log('\n📊 测试压缩效率...')
  
  const identifier = new VertexBasedIdentifier()
  
  // 模拟不同复杂度的特征
  const testCases = [
    {
      name: '简单圆柱(8边)',
      indices: Array.from({length: 16}, (_, i) => i + 100) // 连续16个索引
    },
    {
      name: '复杂圆柱(32边)',
      indices: Array.from({length: 64}, (_, i) => i + 200) // 连续64个索引
    },
    {
      name: '不规则面',
      indices: [10, 11, 12, 20, 21, 30, 31, 32, 33, 40, 50, 51, 52] // 混合情况
    }
  ]
  
  testCases.forEach(testCase => {
    const stats = identifier.calculateCompressionStats(testCase.indices, 
      identifier.compressConsecutiveIndices(testCase.indices))
    
    console.log(`  ${testCase.name}:`)
    console.log(`    原始索引数: ${stats.originalCount}`)
    console.log(`    原始大小: ${stats.originalSize} 字节`)
    console.log(`    压缩大小: ${stats.compressedSize} 字节`)
    console.log(`    压缩率: ${stats.compressionRatio}`)
    console.log(`    压缩结果: ${stats.compressed}`)
  })
  
  return true
}

/**
 * 主测试函数
 */
async function runAllTests() {
  console.log('🚀 基于顶点索引的稳定命名测试')
  console.log('=' .repeat(50))
  
  const results = []
  
  try {
    // 1. 顶点索引压缩测试
    results.push(testVertexIndexCompression())
    
    // 2. 压缩解压一致性测试
    results.push(testCompressionConsistency())
    
    // 3. 命名稳定性测试
    results.push(await testNamingStability())
    
    // 4. 命名区分性测试
    results.push(await testNamingDistinctiveness())
    
    // 5. 压缩效率测试
    results.push(testCompressionEfficiency())
    
    // 总结
    const passedTests = results.filter(r => r).length
    const totalTests = results.length
    
    console.log('\n📊 测试总结')
    console.log('=' .repeat(30))
    console.log(`通过测试: ${passedTests}/${totalTests}`)
    console.log(`成功率: ${(passedTests / totalTests * 100).toFixed(1)}%`)
    
    if (passedTests === totalTests) {
      console.log('🎉 所有测试通过！基于顶点索引的稳定命名系统工作正常。')
    } else {
      console.log('⚠️ 部分测试失败，需要进一步检查。')
    }
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error)
  }
}

// 如果直接运行此文件，执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
}

export {
  testVertexIndexCompression,
  testCompressionConsistency,
  testNamingStability,
  testNamingDistinctiveness,
  testCompressionEfficiency,
  runAllTests
}