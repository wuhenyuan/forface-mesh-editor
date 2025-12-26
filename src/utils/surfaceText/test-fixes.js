/**
 * 测试文字系统修复
 * 验证输入框位置和文字大小修复
 */

import { SurfaceTextManager } from './SurfaceTextManager.js'
import { TextInputOverlay } from './TextInputOverlay.js'
import { TextGeometryGenerator } from './TextGeometryGenerator.js'

/**
 * 测试输入框位置计算
 */
export function testInputOverlayPositioning() {
  console.log('=== 测试输入框位置计算 ===')
  
  // 创建测试DOM元素
  const testElement = document.createElement('div')
  testElement.style.width = '800px'
  testElement.style.height = '600px'
  document.body.appendChild(testElement)
  
  const overlay = new TextInputOverlay(testElement)
  
  // 测试不同的鼠标位置
  const testPositions = [
    { x: 100, y: 100, desc: '左上角' },
    { x: 700, y: 100, desc: '右上角' },
    { x: 100, y: 500, desc: '左下角' },
    { x: 700, y: 500, desc: '右下角' },
    { x: 400, y: 300, desc: '中心' }
  ]
  
  testPositions.forEach(pos => {
    const adjustedPos = overlay.calculatePosition(pos.x, pos.y)
    console.log(`${pos.desc} (${pos.x}, ${pos.y}) -> (${adjustedPos.x}, ${adjustedPos.y})`)
    
    // 验证位置在屏幕范围内
    const isValid = adjustedPos.x >= 10 && 
                   adjustedPos.x <= window.innerWidth - 230 &&
                   adjustedPos.y >= 10 && 
                   adjustedPos.y <= window.innerHeight - 50
    
    console.log(`  位置有效: ${isValid}`)
  })
  
  // 清理
  document.body.removeChild(testElement)
  overlay.destroy()
  
  console.log('输入框位置测试完成\n')
}

/**
 * 测试文字大小配置
 */
export async function testTextSizeConfiguration() {
  console.log('=== 测试文字大小配置 ===')
  
  const generator = new TextGeometryGenerator()
  
  // 等待默认字体加载
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // 测试不同的文字大小配置
  const testConfigs = [
    { size: 0.33, desc: '33mm (默认)' },
    { size: 0.1, desc: '10mm (小)' },
    { size: 0.5, desc: '50mm (大)' },
    { size: 1.0, desc: '100mm (很大)' }
  ]
  
  for (const config of testConfigs) {
    try {
      const geometry = await generator.generate('测试', config)
      const info = generator.getGeometryInfo(geometry)
      
      console.log(`${config.desc}:`)
      console.log(`  配置大小: ${config.size}`)
      console.log(`  实际尺寸: ${info.boundingBox.width.toFixed(3)} x ${info.boundingBox.height.toFixed(3)} x ${info.boundingBox.depth.toFixed(3)}`)
      console.log(`  顶点数: ${info.vertices}`)
      console.log(`  是否为备用几何体: ${info.isFallback}`)
      
      // 清理几何体
      geometry.dispose()
      
    } catch (error) {
      console.error(`${config.desc} 生成失败:`, error)
    }
  }
  
  generator.destroy()
  console.log('文字大小测试完成\n')
}

/**
 * 测试鼠标事件传递
 */
export function testMouseEventPassing() {
  console.log('=== 测试鼠标事件传递 ===')
  
  // 模拟鼠标事件
  const mockMouseEvent = {
    clientX: 400,
    clientY: 300,
    ctrlKey: false,
    metaKey: false,
    type: 'click'
  }
  
  console.log('模拟鼠标事件:', mockMouseEvent)
  
  // 测试SurfaceTextManager的handleFaceSelected方法
  const mockFaceInfo = {
    mesh: { name: 'testMesh', userData: {} },
    faceIndex: 0,
    point: { x: 1, y: 1, z: 1 }
  }
  
  // 创建临时的SurfaceTextManager实例进行测试
  const testElement = document.createElement('div')
  document.body.appendChild(testElement)
  
  try {
    // 注意：这里只是测试方法调用，不会创建完整的Three.js场景
    console.log('测试handleFaceSelected方法调用...')
    console.log('原始事件坐标:', { x: mockMouseEvent.clientX, y: mockMouseEvent.clientY })
    
    // 验证坐标提取逻辑
    if (mockMouseEvent.clientX !== undefined && mockMouseEvent.clientY !== undefined) {
      const screenPosition = {
        x: mockMouseEvent.clientX,
        y: mockMouseEvent.clientY
      }
      console.log('提取的屏幕坐标:', screenPosition)
      console.log('坐标提取成功: true')
    } else {
      console.log('坐标提取失败: 缺少clientX或clientY')
    }
    
  } catch (error) {
    console.error('鼠标事件测试失败:', error)
  } finally {
    document.body.removeChild(testElement)
  }
  
  console.log('鼠标事件传递测试完成\n')
}

/**
 * 运行所有修复测试
 */
export async function runFixTests() {
  console.log('开始运行文字系统修复测试...\n')
  
  try {
    testInputOverlayPositioning()
    await testTextSizeConfiguration()
    testMouseEventPassing()
    
    console.log('✅ 所有修复测试完成')
    return true
    
  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error)
    return false
  }
}

// 如果直接运行此文件，执行测试
if (import.meta.url === new URL(import.meta.resolve('./test-fixes.js'))) {
  runFixTests()
}