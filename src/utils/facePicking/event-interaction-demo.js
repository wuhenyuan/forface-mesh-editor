/**
 * 事件交互演示和测试
 * 展示完整的用户交互功能
 */

import * as THREE from 'three'
import { FacePicker } from './FacePicker.js'

/**
 * 创建交互演示
 */
export function createInteractionDemo() {
  console.log('🎮 创建事件交互演示...')
  
  // 创建场景
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf0f0f0)
  
  // 创建相机
  const camera = new THREE.PerspectiveCamera(75, 800/600, 0.1, 1000)
  camera.position.set(3, 3, 5)
  camera.lookAt(0, 0, 0)
  
  // 创建渲染器
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(800, 600)
  
  // 创建DOM容器
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  container.style.position = 'relative'
  container.style.border = '1px solid #ccc'
  container.appendChild(renderer.domElement)
  
  // 添加光照
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
  scene.add(ambientLight)
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(5, 10, 5)
  scene.add(directionalLight)
  
  // 创建测试网格
  const testMeshes = createInteractiveTestMeshes()
  testMeshes.forEach(mesh => scene.add(mesh))
  
  // 创建面拾取器
  const facePicker = new FacePicker(scene, camera, renderer, container)
  facePicker.setMeshes(testMeshes)
  
  // 设置事件监听器
  setupEventListeners(facePicker)
  
  // 启用面拾取
  facePicker.enable()
  
  // 创建信息面板
  const infoPanel = createInfoPanel()
  container.appendChild(infoPanel)
  
  // 渲染循环
  function animate() {
    requestAnimationFrame(animate)
    renderer.render(scene, camera)
    
    // 更新信息面板
    updateInfoPanel(infoPanel, facePicker)
  }
  
  animate()
  
  return {
    container,
    scene,
    camera,
    renderer,
    facePicker,
    testMeshes,
    
    // 清理资源
    dispose() {
      facePicker.destroy()
      testMeshes.forEach(mesh => {
        mesh.geometry.dispose()
        mesh.material.dispose()
      })
      renderer.dispose()
      if (container.parentNode) {
        container.parentNode.removeChild(container)
      }
    }
  }
}

/**
 * 创建交互测试网格
 */
function createInteractiveTestMeshes() {
  const meshes = []
  
  // 立方体 - 基础交互
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  const boxMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x409eff,
    name: 'BoxMaterial'
  })
  const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial)
  boxMesh.position.set(-2, 0, 0)
  boxMesh.name = 'InteractiveBox'
  meshes.push(boxMesh)
  
  // 球体 - 复杂几何体
  const sphereGeometry = new THREE.SphereGeometry(0.8, 16, 12)
  const sphereMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x67c23a,
    name: 'SphereMaterial'
  })
  const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial)
  sphereMesh.position.set(0, 0, 0)
  sphereMesh.name = 'InteractiveSphere'
  meshes.push(sphereMesh)
  
  // 圆环 - 复杂拓扑
  const torusGeometry = new THREE.TorusGeometry(0.6, 0.2, 8, 16)
  const torusMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xe6a23c,
    name: 'TorusMaterial'
  })
  const torusMesh = new THREE.Mesh(torusGeometry, torusMaterial)
  torusMesh.position.set(2, 0, 0)
  torusMesh.name = 'InteractiveTorus'
  meshes.push(torusMesh)
  
  return meshes
}

/**
 * 设置事件监听器
 */
function setupEventListeners(facePicker) {
  console.log('🔗 设置事件监听器...')
  
  // 面选择事件
  facePicker.on('faceSelected', (faceInfo) => {
    console.log('✅ 面被选中:', {
      mesh: faceInfo.mesh.name,
      faceIndex: faceInfo.faceIndex,
      center: faceInfo.center
    })
  })
  
  facePicker.on('faceDeselected', (faceInfo) => {
    console.log('❌ 面被取消选择:', {
      mesh: faceInfo.mesh.name,
      faceIndex: faceInfo.faceIndex
    })
  })
  
  facePicker.on('selectionCleared', () => {
    console.log('🧹 选择已清除')
  })
  
  // 悬停事件
  facePicker.on('faceHover', (faceInfo) => {
    console.log('👆 悬停在面上:', {
      mesh: faceInfo.mesh.name,
      faceIndex: faceInfo.faceIndex
    })
  })
  
  facePicker.on('faceHoverEnd', () => {
    console.log('👋 悬停结束')
  })
  
  // 鼠标事件
  facePicker.on('click', (eventData) => {
    console.log('🖱️ 点击:', {
      position: eventData.position.normalized,
      modifiers: eventData.modifiers
    })
  })
  
  facePicker.on('doubleClick', (eventData) => {
    console.log('🖱️🖱️ 双击:', {
      position: eventData.position.normalized
    })
  })
  
  facePicker.on('contextMenu', (eventData) => {
    console.log('🖱️➡️ 右键:', {
      position: eventData.position.normalized
    })
  })
  
  // 拖拽事件
  facePicker.on('dragStart', (eventData) => {
    console.log('🔄 开始拖拽:', {
      startPosition: eventData.startPosition
    })
  })
  
  facePicker.on('drag', (eventData) => {
    console.log('🔄 拖拽中:', {
      delta: eventData.delta
    })
  })
  
  // 键盘事件
  facePicker.on('keyDown', (eventData) => {
    console.log('⌨️ 按键:', {
      key: eventData.key,
      modifiers: eventData.modifiers
    })
  })
  
  // 历史操作事件
  facePicker.on('undoPerformed', () => {
    console.log('↶ 撤销操作')
  })
  
  facePicker.on('redoPerformed', () => {
    console.log('↷ 重做操作')
  })
  
  // 选择模式变化
  facePicker.on('selectionModeChanged', (mode) => {
    console.log('🔄 选择模式变化:', mode)
  })
}

/**
 * 创建信息面板
 */
function createInfoPanel() {
  const panel = document.createElement('div')
  panel.style.position = 'absolute'
  panel.style.top = '10px'
  panel.style.left = '10px'
  panel.style.background = 'rgba(0, 0, 0, 0.8)'
  panel.style.color = 'white'
  panel.style.padding = '10px'
  panel.style.borderRadius = '5px'
  panel.style.fontFamily = 'monospace'
  panel.style.fontSize = '12px'
  panel.style.lineHeight = '1.4'
  panel.style.pointerEvents = 'none'
  panel.style.maxWidth = '300px'
  
  return panel
}

/**
 * 更新信息面板
 */
function updateInfoPanel(panel, facePicker) {
  const state = facePicker.getFullState()
  const selectedFaces = facePicker.getSelectedFaces()
  const hoverFace = facePicker.getCurrentHoverFace()
  
  const info = [
    '🎯 面拾取状态',
    `启用: ${state.enabled ? '✅' : '❌'}`,
    `网格数量: ${state.meshCount}`,
    `选择模式: ${facePicker.getSelectionMode()}`,
    '',
    '📊 选择信息',
    `选中面数: ${selectedFaces.length}`,
    `悬停面: ${hoverFace ? `${hoverFace.mesh.name}[${hoverFace.faceIndex}]` : '无'}`,
    '',
    '🎨 高亮统计',
    `选择高亮: ${state.highlight.selectionHighlights}`,
    `悬停高亮: ${state.highlight.hoverHighlights}`,
    `缓存材质: ${state.highlight.cachedMaterials}`,
    '',
    '⌨️ 快捷键',
    'Escape: 清除选择',
    'Ctrl+Z: 撤销',
    'Ctrl+Y: 重做',
    'Ctrl+Shift+I: 显示详细信息',
    '',
    '🖱️ 鼠标操作',
    '左键: 选择面',
    'Ctrl+左键: 多选',
    '右键: 上下文菜单',
    '双击: 特殊操作'
  ]
  
  panel.innerHTML = info.join('<br>')
}

/**
 * 测试事件处理功能
 */
export function testEventHandling() {
  console.log('🧪 测试事件处理功能...')
  
  const results = {
    eventHandler: testEventHandlerCreation(),
    eventBinding: testEventBinding(),
    keyboardHandling: testKeyboardHandling(),
    mouseHandling: testMouseHandling()
  }
  
  const allPassed = Object.values(results).every(result => result.passed)
  
  console.log('📊 事件处理测试结果:')
  Object.entries(results).forEach(([test, result]) => {
    console.log(`  ${result.passed ? '✅' : '❌'} ${test}: ${result.message}`)
  })
  
  return { allPassed, results }
}

/**
 * 测试事件处理器创建
 */
function testEventHandlerCreation() {
  try {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = new THREE.WebGLRenderer()
    const domElement = document.createElement('div')
    
    const facePicker = new FacePicker(scene, camera, renderer, domElement)
    
    // 检查事件处理器是否正确创建
    if (facePicker.eventHandler && typeof facePicker.eventHandler.enable === 'function') {
      console.log('  ✅ 事件处理器创建正常')
      facePicker.destroy()
      return { passed: true, message: '事件处理器创建成功' }
    } else {
      throw new Error('事件处理器创建失败')
    }
  } catch (error) {
    return { passed: false, message: error.message }
  }
}

/**
 * 测试事件绑定
 */
function testEventBinding() {
  try {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = new THREE.WebGLRenderer()
    const domElement = document.createElement('div')
    
    const facePicker = new FacePicker(scene, camera, renderer, domElement)
    
    // 测试事件监听器添加
    let eventFired = false
    facePicker.on('test', () => { eventFired = true })
    facePicker.emit('test')
    
    if (eventFired) {
      console.log('  ✅ 事件绑定正常')
      facePicker.destroy()
      return { passed: true, message: '事件绑定成功' }
    } else {
      throw new Error('事件绑定失败')
    }
  } catch (error) {
    return { passed: false, message: error.message }
  }
}

/**
 * 测试键盘处理
 */
function testKeyboardHandling() {
  try {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = new THREE.WebGLRenderer()
    const domElement = document.createElement('div')
    
    const facePicker = new FacePicker(scene, camera, renderer, domElement)
    
    // 模拟键盘事件
    const mockKeyEvent = {
      key: 'Escape',
      code: 'Escape',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: () => {}
    }
    
    // 测试键盘事件处理
    facePicker.handleKeyDown(mockKeyEvent)
    
    console.log('  ✅ 键盘处理正常')
    facePicker.destroy()
    return { passed: true, message: '键盘处理成功' }
  } catch (error) {
    return { passed: false, message: error.message }
  }
}

/**
 * 测试鼠标处理
 */
function testMouseHandling() {
  try {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = new THREE.WebGLRenderer()
    const domElement = document.createElement('div')
    
    // 设置DOM元素尺寸
    domElement.style.width = '800px'
    domElement.style.height = '600px'
    
    const facePicker = new FacePicker(scene, camera, renderer, domElement)
    
    // 模拟鼠标事件
    const mockMouseEvent = {
      clientX: 400,
      clientY: 300,
      button: 0,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: () => {}
    }
    
    // 测试鼠标事件处理
    facePicker.handleClick(mockMouseEvent)
    facePicker.handleMouseMove(mockMouseEvent)
    
    console.log('  ✅ 鼠标处理正常')
    facePicker.destroy()
    return { passed: true, message: '鼠标处理成功' }
  } catch (error) {
    return { passed: false, message: error.message }
  }
}