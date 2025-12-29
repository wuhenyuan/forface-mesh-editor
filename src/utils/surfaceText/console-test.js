/**
 * 浏览器控制台测试脚本
 * 用于在浏览器中快速测试圆柱面文字拟合功能
 */

/**
 * 在浏览器控制台中运行的测试函数
 * 使用方法：
 * 1. 打开浏览器开发者工具
 * 2. 在控制台中粘贴并运行这个函数
 */
window.testCylinderText = async function() {
  console.log('🧪 开始圆柱面文字拟合测试')
  
  try {
    // 检查必要的模块是否存在
    if (!window.THREE) {
      console.error('❌ Three.js 未加载')
      return
    }

    // 创建测试圆柱
    const cylinderGeometry = new THREE.CylinderGeometry(2, 2, 4, 16)
    const cylinderMaterial = new THREE.MeshStandardMaterial({ color: 0x409eff })
    const cylinderMesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial)
    cylinderMesh.name = 'TestCylinder'

    console.log('✅ 测试圆柱创建成功')

    // 模拟点击事件
    const clickPoint = new THREE.Vector3(2, 0, 0)
    const faceInfo = {
      mesh: cylinderMesh,
      point: clickPoint,
      faceIndex: 0,
      face: { normal: new THREE.Vector3(1, 0, 0) }
    }

    console.log('✅ 模拟点击事件创建成功')

    // 检查是否有SurfaceTextManager实例
    if (window.textManager) {
      console.log('✅ 找到 textManager 实例')
      
      // 测试表面分析
      const surfaceInfo = window.textManager.analyzeSurface(faceInfo)
      
      if (surfaceInfo.surfaceType === 'cylinder') {
        console.log('🎉 圆柱面检测成功！')
        console.log('圆柱面信息:', surfaceInfo.cylinderInfo)
        
        // 尝试创建文字
        if (window.textManager.isTextMode) {
          console.log('✅ 文字模式已启用，可以添加文字')
        } else {
          console.log('⚠️ 文字模式未启用，请先启用文字模式')
          console.log('运行: textManager.enableTextMode()')
        }
        
      } else {
        console.log('❌ 圆柱面检测失败，检测为:', surfaceInfo.surfaceType)
      }
      
    } else {
      console.log('❌ 未找到 textManager 实例')
      console.log('请确保应用已正确初始化')
    }

  } catch (error) {
    console.error('❌ 测试失败:', error)
  }
}

/**
 * 检查圆柱面检测置信度
 */
window.checkCylinderConfidence = function() {
  console.log('🔍 检查圆柱面检测置信度')
  
  if (!window.THREE) {
    console.error('❌ Three.js 未加载')
    return
  }

  // 创建不同类型的圆柱进行测试
  const testCases = [
    { name: '标准圆柱', geometry: new THREE.CylinderGeometry(2, 2, 4, 16) },
    { name: '高分辨率圆柱', geometry: new THREE.CylinderGeometry(2, 2, 4, 32) },
    { name: '低分辨率圆柱', geometry: new THREE.CylinderGeometry(2, 2, 4, 8) }
  ]

  // 检查是否有cylinderSurfaceHelper
  if (window.cylinderSurfaceHelper) {
    console.log('✅ 找到 cylinderSurfaceHelper')
    
    testCases.forEach(testCase => {
      const info = window.cylinderSurfaceHelper.detectCylinder(testCase.geometry)
      console.log(`${testCase.name}:`, {
        detected: !!info,
        confidence: info ? (info.confidence * 100).toFixed(1) + '%' : 'N/A'
      })
    })
    
  } else {
    console.log('❌ 未找到 cylinderSurfaceHelper')
  }
}

/**
 * 启用调试模式
 */
window.enableCylinderDebug = function() {
  console.log('🔧 启用圆柱面调试模式')
  
  // 保存原始的console.log
  const originalLog = console.log
  
  // 创建带时间戳的日志函数
  window.debugLog = function(...args) {
    const timestamp = new Date().toLocaleTimeString()
    originalLog(`[${timestamp}]`, ...args)
  }
  
  console.log('✅ 调试模式已启用')
  console.log('现在所有圆柱面相关的日志都会显示时间戳')
}

// 自动运行基本检查
console.log('🚀 圆柱面文字拟合控制台测试工具已加载')
console.log('可用函数:')
console.log('  - testCylinderText(): 完整功能测试')
console.log('  - checkCylinderConfidence(): 检查检测置信度')
console.log('  - enableCylinderDebug(): 启用调试模式')
console.log('')
console.log('💡 建议先运行: testCylinderText()')

// 导出到全局作用域
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    testCylinderText: window.testCylinderText,
    checkCylinderConfidence: window.checkCylinderConfidence,
    enableCylinderDebug: window.enableCylinderDebug
  }
}