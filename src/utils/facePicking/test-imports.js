/**
 * 简单的导入测试
 * 验证所有模块是否可以正确导入
 */

console.log('开始测试模块导入...')

try {
  // 测试核心组件导入
  console.log('测试 FacePicker 导入...')
  const { FacePicker } = await import('./FacePicker.js')
  console.log('✓ FacePicker 导入成功')
  
  console.log('测试 RaycastManager 导入...')
  const { RaycastManager } = await import('./RaycastManager.js')
  console.log('✓ RaycastManager 导入成功')
  
  console.log('测试 SelectionManager 导入...')
  const { SelectionManager } = await import('./SelectionManager.js')
  console.log('✓ SelectionManager 导入成功')
  
  console.log('测试 HighlightRenderer 导入...')
  const { HighlightRenderer } = await import('./HighlightRenderer.js')
  console.log('✓ HighlightRenderer 导入成功')
  
  console.log('测试 EventHandler 导入...')
  const { EventHandler } = await import('./EventHandler.js')
  console.log('✓ EventHandler 导入成功')
  
  // 测试调试工具导入
  console.log('测试 DebugLogger 导入...')
  const { DebugLogger, debugLogger } = await import('./DebugLogger.js')
  console.log('✓ DebugLogger 导入成功')
  
  // 测试主入口导入
  console.log('测试主入口模块导入...')
  const { FacePickingUtils } = await import('./index.js')
  console.log('✓ 主入口模块导入成功')
  
  console.log('\n🎉 所有模块导入测试通过！')
  
  // 基本功能测试
  console.log('\n开始基本功能测试...')
  
  // 测试调试器
  debugLogger.info('调试器测试', { test: true })
  console.log('✓ 调试器工作正常')
  
  // 测试工具函数
  const testMesh = {
    geometry: {
      isBufferGeometry: true,
      getAttribute: () => ({ count: 100 }),
      getIndex: () => null
    },
    visible: true
  }
  
  const isValid = RaycastManager.validateMesh(testMesh)
  console.log(`✓ 网格验证功能: ${isValid ? '通过' : '失败'}`)
  
  console.log('\n✅ 所有测试完成！面拾取功能已准备就绪。')
  
} catch (error) {
  console.error('❌ 导入测试失败:', error.message)
  console.error(error.stack)
}